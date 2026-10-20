import { useMemo, useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

/* ---------- 前半: 比較 1 件ずつで点数を学ぶ ---------- */

const NAMES = ['A', 'B', 'C', 'D']
// 評価者の頭の中にある本当の点数。モデルからは見えない
const TRUE_SCORE = [1.5, 0.5, 0, -1]
const LR = 0.5
const N_CMP = 24

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Cmp = { a: number; b: number; winner: number }
type Step = { cmp: Cmp | null; before: number[]; after: number[]; pWin: number }

function buildSteps(seed: number): Step[] {
  const rand = mulberry32(seed)
  const steps: Step[] = []
  let s = [0, 0, 0, 0]
  steps.push({ cmp: null, before: s, after: s, pWin: 0.5 })
  for (let i = 0; i < N_CMP; i++) {
    const a = Math.floor(rand() * 4)
    let b = Math.floor(rand() * 3)
    if (b >= a) b += 1
    // 評価者は本当の点数の差で決まる確率で a を選ぶ（Bradley–Terry）。揺れがあるので逆を選ぶこともある
    const aWins = rand() < sigmoid(TRUE_SCORE[a]! - TRUE_SCORE[b]!)
    const w = aWins ? a : b
    const l = aWins ? b : a
    const pWin = sigmoid(s[w]! - s[l]!)
    const next = [...s]
    next[w] = next[w]! + LR * (1 - pWin)
    next[l] = next[l]! - LR * (1 - pWin)
    steps.push({ cmp: { a, b, winner: w }, before: s, after: next, pWin })
    s = next
  }
  return steps
}

/* ---------- 後半: KL の罰則と、報酬モデルの誤り ---------- */

type Answer = { name: string; ref: number; proxy: number; truth: number; note: string }
// ref: 元のモデルがその回答を出す確率。proxy: 報酬モデルの点。truth: 評価者の本当の好み
const ANSWERS: Answer[] = [
  { name: '短く正確', ref: 0.3, proxy: 1.0, truth: 1.1, note: 'よく出る。報酬モデルの点はほぼ正しい' },
  { name: '丁寧', ref: 0.25, proxy: 1.6, truth: 1.7, note: 'よく出る' },
  { name: '普通', ref: 0.2, proxy: 0.6, truth: 0.6, note: 'よく出る' },
  { name: '少し長い', ref: 0.12, proxy: 2.0, truth: 2.0, note: '比較データにも出てくる' },
  { name: 'そっけない', ref: 0.07, proxy: -0.5, truth: -0.4, note: '元のモデルがときどき出す' },
  { name: '詳しく的確', ref: 0.035, proxy: 2.5, truth: 2.4, note: '比較データにまれに出る。点はほぼ正しい' },
  { name: 'とても長い', ref: 0.02, proxy: 2.9, truth: 0.2, note: '比較データにほぼ出ない。報酬モデルは「長いほど良い」を延長して高い点を付ける' },
  { name: '的外れ', ref: 0.005, proxy: 3.3, truth: -2.0, note: '比較データに出ない。報酬モデルの誤りがいちばん大きい' },
]

function optimal(beta: number) {
  // KL 罰則つきの最適解: π(y) ∝ π_ref(y) · exp(r(y) / β)
  const lg = ANSWERS.map((a) => Math.log(a.ref) + a.proxy / beta)
  const m = Math.max(...lg)
  const e = lg.map((v) => Math.exp(v - m))
  const s = e.reduce((x, y) => x + y, 0)
  return e.map((v) => v / s)
}

function summarize(p: number[]) {
  const proxy = p.reduce((s, v, i) => s + v * ANSWERS[i]!.proxy, 0)
  const truth = p.reduce((s, v, i) => s + v * ANSWERS[i]!.truth, 0)
  const kl = p.reduce((s, v, i) => s + (v > 0 ? v * Math.log(v / ANSWERS[i]!.ref) : 0), 0)
  return { proxy, truth, kl }
}

const btn = (active: boolean) => ({
  borderColor: active ? 'var(--accent)' : 'var(--border)',
  background: active ? 'var(--accent-soft)' : 'var(--bg)',
  color: active ? 'var(--accent)' : 'var(--fg)',
})

function ScoreBars({ scores }: { scores: number[] }) {
  const W = 420
  const H = 150
  const mid = H / 2
  const scale = 28
  const bw = 46
  const gap = (W - bw * 2 * NAMES.length) / (NAMES.length + 1)
  // 点数は差だけが意味を持つので、平均が 0 になるようにずらして並べる
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const tmean = TRUE_SCORE.reduce((a, b) => a + b, 0) / TRUE_SCORE.length
  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full max-w-[420px]">
      <line x1={0} x2={W} y1={mid} y2={mid} stroke="var(--border)" />
      {NAMES.map((n, i) => {
        const x = gap + i * (bw * 2 + gap)
        const est = (scores[i]! - mean) * scale
        const tru = (TRUE_SCORE[i]! - tmean) * scale
        return (
          <g key={n}>
            <rect x={x} y={Math.min(mid, mid - est)} width={bw - 4} height={Math.abs(est)} fill="var(--accent)" />
            <rect
              x={x + bw}
              y={Math.min(mid, mid - tru)}
              width={bw - 4}
              height={Math.abs(tru)}
              fill="none"
              stroke="var(--fg-muted)"
              strokeDasharray="3 2"
            />
            <text x={x + bw - 2} y={H + 14} textAnchor="middle" fontSize={12} fill="var(--fg)">
              {n}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function PolicyBars({ p }: { p: number[] }) {
  const W = 460
  const rowH = 22
  const labelW = 86
  const barMax = W - labelW - 60
  return (
    <svg viewBox={`0 0 ${W} ${ANSWERS.length * rowH + 6}`} className="w-full max-w-[460px]">
      {ANSWERS.map((a, i) => {
        const y = i * rowH + 3
        const bad = a.truth < a.proxy - 0.5
        return (
          <g key={a.name}>
            <title>{`${a.note}（報酬モデル ${a.proxy}、本当の好み ${a.truth}）`}</title>
            <text x={0} y={y + 14} fontSize={11} fill={bad ? 'var(--danger)' : 'var(--fg)'}>
              {a.name}
            </text>
            <rect x={labelW} y={y + 2} width={a.ref * barMax} height={7} fill="var(--fg-muted)" opacity={0.5} />
            <rect x={labelW} y={y + 10} width={p[i]! * barMax} height={9} fill={bad ? 'var(--danger)' : 'var(--accent)'} />
            <text x={labelW + Math.max(a.ref, p[i]!) * barMax + 4} y={y + 18} fontSize={10} fill="var(--fg-muted)">
              {(p[i]! * 100).toFixed(1)}%
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function PreferenceReward() {
  const [mode, setMode] = useState<'learn' | 'kl'>('learn')
  const [seed, setSeed] = useState(7)
  const steps = useMemo(() => buildSteps(seed), [seed])
  const [i, setI] = useState(0)
  const [logBeta, setLogBeta] = useState(0)

  const beta = Math.pow(10, logBeta)
  const p = useMemo(() => optimal(beta), [beta])
  const sum = summarize(p)
  const ref = summarize(ANSWERS.map((a) => a.ref))
  const st = steps[Math.min(i, steps.length - 1)]!

  const controls = (
    <>
      <span className="flex items-center gap-1">
        <button className="rounded border px-2 py-1 text-[11px]" style={btn(mode === 'learn')} onClick={() => setMode('learn')}>
          比較から点数を学ぶ
        </button>
        <button className="rounded border px-2 py-1 text-[11px]" style={btn(mode === 'kl')} onClick={() => setMode('kl')}>
          KL の罰則で最適化する
        </button>
      </span>
      {mode === 'learn' ? (
        <span className="flex items-center gap-1">
          <button className="rounded border px-2 py-1 text-[11px]" style={btn(false)} onClick={() => setI(0)}>
            最初へ
          </button>
          <button className="rounded border px-2 py-1 text-[11px]" style={btn(false)} onClick={() => setI((v) => Math.max(0, v - 1))}>
            ← 1 件戻る
          </button>
          <button
            className="rounded border px-2 py-1 text-[11px]"
            style={btn(false)}
            onClick={() => setI((v) => Math.min(steps.length - 1, v + 1))}
          >
            1 件進む →
          </button>
          <button className="rounded border px-2 py-1 text-[11px]" style={btn(false)} onClick={() => setI(steps.length - 1)}>
            最後へ
          </button>
          <button
            className="rounded border px-2 py-1 text-[11px]"
            style={btn(false)}
            onClick={() => {
              setSeed((s) => s + 1)
              setI(0)
            }}
          >
            別の比較データ
          </button>
        </span>
      ) : (
        <Slider
          label="β（罰則の強さ）"
          value={logBeta}
          min={-1.6}
          max={1}
          step={0.01}
          onChange={setLogBeta}
          format={(v) => Math.pow(10, v).toFixed(Math.pow(10, v) < 0.1 ? 3 : 2)}
        />
      )}
    </>
  )

  if (mode === 'learn') {
    const c = st.cmp
    return (
      <VizShell
        title="人の好みから報酬を学ぶ（Bradley–Terry）"
        subtitle="2 つの回答のどちらが良いかという比較を 1 件ずつ与え、各回答の点数を直していく"
        controls={controls}
        readout={
          c ? (
            <>
              比較 {i} / {N_CMP}：{NAMES[c.a]} と {NAMES[c.b]} のうち、評価者は <b style={{ color: 'var(--fg)' }}>{NAMES[c.winner]}</b> を選んだ。
              <br />
              直す前のモデルが「{NAMES[c.winner]} が選ばれる」と見ていた確率 σ(差) = {st.pWin.toFixed(3)}。外れていたぶん（1 − {st.pWin.toFixed(3)}）× 学習率{' '}
              {LR} = {(LR * (1 - st.pWin)).toFixed(3)} だけ、選ばれた方を上げ、選ばれなかった方を下げる。
              {TRUE_SCORE[c.winner]! < TRUE_SCORE[c.winner === c.a ? c.b : c.a]! && (
                <span style={{ color: 'var(--warn)' }}> 本当の点数が低い方が選ばれた。評価者の判断の揺れ。</span>
              )}
            </>
          ) : (
            <>どの回答の点数もまだ 0。塗りの棒がモデルの点数、破線の枠が評価者の本当の点数（どちらも平均を 0 にそろえて表示）。</>
          )
        }
      >
        <ScoreBars scores={st.after} />
      </VizShell>
    )
  }

  return (
    <VizShell
      title="報酬を上げることと、元のモデルから離れないこと"
      subtitle="β を小さくするほど報酬モデルの点を追いかける。灰色が元のモデル、色の付いた棒が最適化した後の確率。赤い名前は報酬モデルが点を高く付けすぎている回答"
      controls={controls}
      readout={
        <>
          β = {beta.toFixed(3)}：KL = {sum.kl.toFixed(3)} nats ／ 報酬モデルの点の平均 {sum.proxy.toFixed(2)}（元のモデル {ref.proxy.toFixed(2)}）／{' '}
          <b style={{ color: sum.truth < ref.truth ? 'var(--danger)' : 'var(--fg)' }}>評価者の本当の好みの平均 {sum.truth.toFixed(2)}</b>（元のモデル{' '}
          {ref.truth.toFixed(2)}）
        </>
      }
    >
      <PolicyBars p={p} />
    </VizShell>
  )
}
