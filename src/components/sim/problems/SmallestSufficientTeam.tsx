import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def smallest_sufficient_team(req_skills, people):
    idx = {s: i for i, s in enumerate(req_skills)}
    full = (1 << len(req_skills)) - 1
    dp = {0: []}                       # 達成済みスキル集合 -> そのときのチーム
    for i, p in enumerate(people):
        mask = 0
        for s in p:
            mask |= 1 << idx[s]        # その人が持つスキルを1つの整数にまとめる
        if mask == 0:
            continue
        for have, team in list(dp.items()):
            merged = have | mask       # この人を入れたときの集合
            if merged == have:
                continue               # 増えないなら入れる意味がない
            if merged not in dp or len(dp[merged]) > len(team) + 1:
                dp[merged] = team + [i]
    return dp[full]`

type Case = { skills: string[]; people: string[][] }
type View = { cells: Cell[]; personMask: Cell[]; who: string; result: string }

function trace({ skills, people }: Case): Frame<View>[] {
  const k = skills.length
  const full = (1 << k) - 1
  const dp = new Map<number, number[]>([[0, []]])
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { person?: number; pmask?: number; updated?: number; from?: number; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = Array.from({ length: 1 << k }, (_, m) => {
      const team = dp.get(m)
      let state: Cell['state'] = team ? 'window' : 'idle'
      if (m === opts.from) state = 'active'
      if (m === opts.updated) state = 'good'
      if (m === full && team) state = 'good'
      return {
        value: team ? team.length : '·',
        state,
        note: m.toString(2).padStart(k, '0'),
      }
    })
    const personMask: Cell[] = skills.map((s, i) => ({
      value: opts.pmask !== undefined ? ((opts.pmask >> i) & 1) : 0,
      note: s.slice(0, 5),
      state: opts.pmask !== undefined && (opts.pmask >> i) & 1 ? 'good' : 'idle',
    }))
    const best = dp.get(full)
    frames.push({
      line,
      note,
      vars: {
        人: opts.person !== undefined ? `${opts.person}` : '−',
        到達した集合: dp.size,
        完成: best ? `[${best.join(',')}]` : '未',
      },
      view: {
        cells,
        personMask,
        who: opts.person !== undefined ? `${opts.person}: ${people[opts.person]!.join(', ')}` : '',
        result: best ? `[${best.join(', ')}]` : '',
      },
      done: opts.finished,
    })
  }

  snap([2, 3, 4], `スキル ${skills.join(' / ')} にビットを1つずつ割り当てる。dp[集合] は「その集合を達成できる最小のチーム」。まだ 000（空集合）だけが埋まっている`)

  people.forEach((p, i) => {
    let mask = 0
    for (const s of p) mask |= 1 << skills.indexOf(s)
    snap([6, 7, 8], `${i} 番の人は ${p.join(', ')} を持つ。ビット列にすると ${mask.toString(2).padStart(k, '0')}`, {
      person: i,
      pmask: mask,
    })
    for (const [have, team] of [...dp.entries()]) {
      const merged = have | mask
      if (merged === have) continue
      const cur = dp.get(merged)
      if (!cur || cur.length > team.length + 1) {
        dp.set(merged, [...team, i])
        snap([12, 15, 16], `集合 ${have.toString(2).padStart(k, '0')} のチーム [${team.join(',')}] にこの人を足すと ${merged.toString(2).padStart(k, '0')} になる。${cur ? `いまの ${cur.length} 人より少ない ${team.length + 1} 人なので更新` : `初めて到達したので記録（${team.length + 1} 人）`}`, {
          person: i,
          pmask: mask,
          from: have,
          updated: merged,
        })
      }
    }
  })

  const best = dp.get(full)!
  snap(17, `完了。全スキルを満たす最小のチームは [${best.join(', ')}]（${best.length} 人）`, { finished: true })
  return frames
}

const CASES: { name: string; value: Case }[] = [
  {
    name: 'LC1125の例',
    value: {
      skills: ['java', 'nodejs', 'reactjs'],
      people: [['java'], ['nodejs'], ['nodejs', 'reactjs']],
    },
  },
  {
    name: '1人で足りる',
    value: {
      skills: ['a', 'b'],
      people: [['a'], ['a', 'b'], ['b']],
    },
  },
  {
    name: '4スキル',
    value: {
      skills: ['a', 'b', 'c', 'd'],
      people: [['a', 'b'], ['c'], ['b', 'c', 'd'], ['a', 'd']],
    },
  },
]

export default function SmallestSufficientTeam() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="Smallest Sufficient Team（集合を整数の添字にする DP）"
      subtitle="スキルの集合を1つの整数にして、dp の添字に使う。集合の合成は OR 1回で済む"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="入力" presets={CASES} onPick={setC} />}
      legend={
        <>
          <LegendItem state="active">元にした集合</LegendItem>
          <LegendItem state="good">更新した集合 / 完成</LegendItem>
          <LegendItem state="window">到達済みの集合</LegendItem>
          <LegendItem state="idle">まだ作れていない集合</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          {f.view.who && (
            <p className="m-0 font-mono text-xs" style={{ color: 'var(--accent)' }}>
              いま見ている人 — {f.view.who}
            </p>
          )}
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              この人が持つスキル
            </p>
            <ArrayView cells={f.view.personMask} showIndex={false} size={52} />
          </div>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              dp（下の2進数が集合、中の数字がチームの人数）
            </p>
            <ArrayView cells={f.view.cells} showIndex={false} size={44} />
          </div>
        </div>
      )}
    </SimShell>
  )
}
