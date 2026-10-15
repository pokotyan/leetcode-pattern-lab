import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

type Input = { name: string; body: string; collect?: boolean }
type StepState = { label: string; state: CellState; out?: string }
type View = { steps: StepState[]; failedAt: number | null; carried: string; errors: string[] }

const STEPS = ['parseJson', 'validateEmail', 'validateAge', 'save', 'notify']

const CODE_CHAIN = `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
// 失敗していれば f を呼ばずに、そのまま次へ流す
const andThen = (r, f) => (r.ok ? f(r.value) : r)

function register(body: string): Result<User, RegisterError> {
  let r = parseJson(body)
  r = andThen(r, validateEmail)
  r = andThen(r, validateAge)
  r = andThen(r, save)
  r = andThen(r, notify)
  return r
}`

const CODE_COLLECT = `// 入力の検査は互いに独立しているので、止めずに全部の誤りを集める
function validateAll(input: SignUp): Result<SignUp, string[]> {
  const errors = [
    ...(isEmail(input.email) ? [] : ['メールの形式が正しくない']),
    ...(input.age >= 18       ? [] : ['18 歳以上が対象']),
  ]
  return errors.length > 0 ? err(errors) : ok(input)
}
// 保存や通知のように、前の結果に依存する処理は andThen でつなぐ`

/** 各段の成否を本当に判定する。失敗の理由は段ごとの型付きの誤りとして返す */
function run(body: string): { outs: string[]; failedAt: number | null; error: string } {
  const outs: string[] = []
  let v: { email?: unknown; age?: unknown }
  try {
    v = JSON.parse(body)
  } catch {
    return { outs, failedAt: 0, error: "{ kind: 'InvalidJson' }" }
  }
  outs.push(`{ email: ${JSON.stringify(v.email)}, age: ${v.age} }`)
  if (typeof v.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return { outs, failedAt: 1, error: "{ kind: 'InvalidEmail' }" }
  outs.push(`Email('${v.email}')`)
  if (typeof v.age !== 'number' || v.age < 18) return { outs, failedAt: 2, error: "{ kind: 'TooYoung', age: " + v.age + ' }' }
  outs.push(`SignUp（検査済み）`)
  if (v.email === 'taken@example.com') return { outs, failedAt: 3, error: "{ kind: 'EmailTaken' }" }
  outs.push(`User { id: 42 }`)
  outs.push(`User { id: 42 }（通知済み）`)
  return { outs, failedAt: null, error: '' }
}

function trace(input: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  if (input.collect) {
    const v = JSON.parse(input.body) as { email: string; age: number }
    const okEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)
    const okAge = v.age >= 18
    const errs = [...(okEmail ? [] : ['メールの形式が正しくない']), ...(okAge ? [] : ['18 歳以上が対象'])]
    const checked: CellState[] = [okEmail ? 'good' : 'bad', okAge ? 'good' : 'bad']
    const steps = (st: CellState[]): StepState[] => ['validateEmail', 'validateAge'].map((l, i) => ({ label: l, state: st[i]! }))
    frames.push({ line: [2, 3], note: `入力 ${input.body}。andThen でつなぐと最初の誤りで止まり、利用者は誤りを 1 つずつしか知れない。検査どうしが独立なら、全部を走らせて集めればよい`, view: { steps: steps(['active', 'active']), failedAt: null, carried: input.body, errors: [] } })
    frames.push({ line: [3, 4, 5, 6], note: `2 つの検査を両方とも実行し、誤りを配列に集める。${errs.length} 件`, view: { steps: steps(checked), failedAt: errs.length ? 0 : null, carried: input.body, errors: errs } })
    frames.push({ line: [7, 9], note: errs.length ? `誤りの一覧をまとめて返す。画面には ${errs.length} つの誤りを一度に出せる。後ろの保存・通知は、検査が全部通ったときだけ andThen でつなぐ` : `誤りなし。後ろの保存・通知へ andThen でつなぐ`, view: { steps: steps(checked), failedAt: errs.length ? 0 : null, carried: errs.length ? `err([${errs.map((e) => `'${e}'`).join(', ')}])` : 'ok(input)', errors: errs }, done: true })
    return frames
  }
  const { outs, failedAt, error } = run(input.body)
  const mk = (upTo: number): StepState[] =>
    STEPS.map((label, i) => ({
      label,
      state: i < upTo ? (failedAt !== null && i === failedAt ? 'bad' : failedAt !== null && i > failedAt ? 'dim' : 'good') : i === upTo ? 'active' : 'idle',
      out: i < upTo && (failedAt === null || i < failedAt) ? outs[i] : undefined,
    }))
  frames.push({ line: [5, 6], note: `入力 ${input.body}。成功の線路（上）から始まる`, view: { steps: mk(0), failedAt: null, carried: `'${input.body}'`, errors: [] }, vars: { 線路: '成功' } })
  for (let i = 0; i < STEPS.length; i++) {
    const failedNow = failedAt === i
    const skipped = failedAt !== null && i > failedAt
    const note = skipped
      ? `${STEPS[i]} は呼ばれない。andThen は、失敗の値を受け取ると関数を呼ばずにそのまま返す。失敗の線路に乗った値は、最後まで素通りする`
      : failedNow
        ? `${STEPS[i]} が失敗を返す: ${error}。ここで下の失敗の線路へ切り替わる。例外を投げるのではなく、失敗も戻り値の 1 つとして返す`
        : `${STEPS[i]} が成功。結果 ${outs[i]} を次の段へ渡す`
    frames.push({
      line: 6 + i,
      note,
      view: { steps: mk(i + 1), failedAt: failedAt !== null && i >= failedAt ? failedAt : null, carried: failedAt !== null && i >= failedAt ? `err(${error})` : `ok(${outs[i]})`, errors: [] },
      vars: { 線路: failedAt !== null && i >= failedAt ? '失敗' : '成功' },
    })
  }
  frames.push({
    line: 11,
    note: failedAt === null ? `最後まで成功の線路を通った。呼び出し側は ok か err かを見て分岐する` : `呼び出し側には err(${error}) が届く。どの段で、どんな理由で失敗したかが型として残るので、画面の表示や HTTP の状態コードへの対応を漏れなく書ける`,
    view: { steps: mk(STEPS.length), failedAt, carried: failedAt === null ? `ok(${outs[outs.length - 1]})` : `err(${error})`, errors: [] },
    vars: { 線路: failedAt === null ? '成功' : '失敗' },
    done: true,
  })
  return frames
}

function Tracks({ v }: { v: View }) {
  const n = v.steps.length
  const w = 120
  const width = n * w + 20
  const top = 34
  const bottom = 110
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} 140`} width={width} style={{ maxWidth: '100%', height: 'auto' }} role="img">
        <line x1={10} y1={top} x2={width - 10} y2={top} stroke="var(--ok)" strokeWidth={3} />
        <line x1={10} y1={bottom} x2={width - 10} y2={bottom} stroke="var(--danger)" strokeWidth={3} />
        <text x={12} y={top - 22} fontSize="10" fill="var(--ok)">成功の線路</text>
        <text x={12} y={bottom + 20} fontSize="10" fill="var(--danger)">失敗の線路</text>
        {v.steps.map((s, i) => {
          const x = 10 + i * w + 10
          const st = cellStyle[s.state]
          return (
            <g key={s.label}>
              {/* 各段は成功から失敗へ分岐できる。失敗から成功へは戻らない */}
              <line x1={x + w / 2} y1={top} x2={x + w - 10} y2={bottom} stroke={s.state === 'bad' ? 'var(--danger)' : 'var(--border)'} strokeWidth={s.state === 'bad' ? 3 : 1.2} strokeDasharray={s.state === 'bad' ? undefined : '3 3'} />
              <rect x={x} y={top - 16} width={w - 20} height={32} rx={6} fill={st.background} stroke={st.borderColor} strokeWidth={1.5} opacity={s.state === 'dim' ? 0.45 : 1} />
              <text x={x + (w - 20) / 2} y={top} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill={st.color} fontFamily="ui-monospace, monospace">
                {s.label}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="m-0 font-mono text-[11.5px]">
        <span style={{ color: 'var(--fg-muted)' }}>いま運ばれている値: </span>
        <b style={{ color: v.carried.startsWith('err') ? 'var(--danger)' : 'var(--fg)' }}>{v.carried}</b>
      </p>
      {v.errors.length > 0 && (
        <ul className="m-0 list-disc pl-5 text-[12px]" style={{ color: 'var(--danger)' }}>
          {v.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

const PRESETS: { name: string; value: Input }[] = [
  { name: '正しい入力', value: { name: 'ok', body: '{"email":"a@example.com","age":30}' } },
  { name: 'JSON が壊れている', value: { name: 'json', body: '{"email":' } },
  { name: 'メールが不正', value: { name: 'email', body: '{"email":"abc","age":30}' } },
  { name: '年齢が足りない', value: { name: 'age', body: '{"email":"a@example.com","age":15}' } },
  { name: '登録済みのメール', value: { name: 'taken', body: '{"email":"taken@example.com","age":30}' } },
  { name: '誤りを全部集める', value: { name: 'collect', body: '{"email":"abc","age":15}', collect: true } },
]

export default function Railway() {
  const [input, setInput] = useState<Input>(PRESETS[2]!.value)
  const frames = useMemo(() => trace(input), [input])
  return (
    <SimShell
      title="Railway Oriented Programming（成功と失敗の 2 本の線路）"
      subtitle="会員登録の処理を、Result を返す小さな関数の連なりとして組む。入力を変えて、どこで失敗の線路に移るかを見る"
      code={input.collect ? CODE_COLLECT : CODE_CHAIN}
      lang="ts"
      frames={frames}
      controls={<PresetControl label="入力" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="good">成功した段</LegendItem>
          <LegendItem state="bad">失敗した段</LegendItem>
          <LegendItem state="dim">呼ばれずに素通りした段</LegendItem>
          <LegendItem state="active">次に呼ぶ段</LegendItem>
        </>
      }
    >
      {(f) => <Tracks v={f.view} />}
    </SimShell>
  )
}
