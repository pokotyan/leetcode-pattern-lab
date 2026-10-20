import { useMemo, useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'

const COLS = 100
const ROWS = 100
const N = COLS * ROWS
const CELL = 4

type Group = 'sickPos' | 'sickNeg' | 'healthyPos' | 'healthyNeg'

const COLOR: Record<Group, string> = {
  sickPos: 'var(--danger)',
  sickNeg: 'var(--warn)',
  healthyPos: 'var(--accent)',
  healthyNeg: 'var(--border)',
}

const LABEL: Record<Group, string> = {
  sickPos: '病気で陽性',
  sickNeg: '病気なのに陰性（見逃し）',
  healthyPos: '健康なのに陽性（誤報）',
  healthyNeg: '健康で陰性',
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

export default function BayesUpdate() {
  const [prevalence, setPrevalence] = useState(0.01)
  const [sensitivity, setSensitivity] = useState(0.99)
  const [specificity, setSpecificity] = useState(0.95)
  const [onlyPositive, setOnlyPositive] = useState(false)

  const counts = useMemo(() => {
    const sick = Math.round(N * prevalence)
    const sickPos = Math.round(sick * sensitivity)
    const healthy = N - sick
    const healthyPos = Math.round(healthy * (1 - specificity))
    return {
      sickPos,
      sickNeg: sick - sickPos,
      healthyPos,
      healthyNeg: healthy - healthyPos,
    } satisfies Record<Group, number>
  }, [prevalence, sensitivity, specificity])

  // 同じ群の人が列ごとに上から詰まるので、1 万個の点を描かずに、群ごとに数個の矩形へまとめる
  const blocks = useMemo(() => {
    const order: Group[] = ['sickPos', 'sickNeg', 'healthyPos', 'healthyNeg']
    const out: { g: Group; x: number; y: number; w: number; h: number }[] = []
    let start = 0
    for (const g of order) {
      let i = start
      const end = start + counts[g]
      while (i < end) {
        const col = Math.floor(i / ROWS)
        const row = i % ROWS
        if (row === 0 && end - i >= ROWS) {
          const cols = Math.floor((end - i) / ROWS)
          out.push({ g, x: col, y: 0, w: cols, h: ROWS })
          i += cols * ROWS
        } else {
          const h = Math.min(ROWS - row, end - i)
          out.push({ g, x: col, y: row, w: 1, h })
          i += h
        }
      }
      start = end
    }
    return out
  }, [counts])

  const positive = counts.sickPos + counts.healthyPos
  const posterior = positive === 0 ? 0 : counts.sickPos / positive
  const exact =
    (prevalence * sensitivity) / (prevalence * sensitivity + (1 - prevalence) * (1 - specificity))

  return (
    <VizShell
      title="検査の陽性は、どれだけ病気を意味するか"
      subtitle="1 万人を 1 点ずつ並べる。陽性の人だけを見ると、その中で病気の人はどれだけいるか"
      controls={
        <>
          <Slider label="有病率 P(病気)" value={prevalence} min={0.001} max={0.5} step={0.001} onChange={setPrevalence} format={pct} />
          <Slider label="感度 P(陽性|病気)" value={sensitivity} min={0.5} max={1} step={0.005} onChange={setSensitivity} format={pct} />
          <Slider label="特異度 P(陰性|健康)" value={specificity} min={0.5} max={1} step={0.005} onChange={setSpecificity} format={pct} />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={onlyPositive}
              onChange={(e) => setOnlyPositive(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            <span style={{ color: 'var(--fg-muted)' }}>陽性の人だけを見る</span>
          </label>
        </>
      }
      readout={
        <>
          <div>
            陽性 {positive.toLocaleString()} 人 = 病気で陽性 {counts.sickPos.toLocaleString()} 人 + 健康なのに陽性{' '}
            {counts.healthyPos.toLocaleString()} 人
          </div>
          <div style={{ color: 'var(--fg)' }}>
            P(病気|陽性) = {counts.sickPos.toLocaleString()} / {positive.toLocaleString()} ≈ {pct(posterior)}
            （ベイズの定理で計算すると {pct(exact)}）
          </div>
        </>
      }
    >
      <div className="flex flex-wrap items-start gap-6">
        <svg
          width={COLS * CELL}
          height={ROWS * CELL}
          viewBox={`0 0 ${COLS * CELL} ${ROWS * CELL}`}
          role="img"
          aria-label={`1 万人のうち陽性 ${positive} 人、そのうち病気 ${counts.sickPos} 人`}
        >
          <defs>
            <pattern id="bayes-cell" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
              <path d={`M ${CELL} 0 V ${CELL} H 0`} fill="none" stroke="var(--bg-soft)" strokeWidth={0.6} />
            </pattern>
          </defs>
          {blocks.map((b, i) => {
            const isPositive = b.g === 'sickPos' || b.g === 'healthyPos'
            return (
              <rect
                key={i}
                x={b.x * CELL}
                y={b.y * CELL}
                width={b.w * CELL}
                height={b.h * CELL}
                fill={COLOR[b.g]}
                opacity={onlyPositive && !isPositive ? 0.08 : 1}
              />
            )
          })}
          <rect width={COLS * CELL} height={ROWS * CELL} fill="url(#bayes-cell)" />
        </svg>
        <ul className="m-0 list-none space-y-1.5 p-0 text-xs">
          {(Object.keys(LABEL) as Group[]).map((g) => (
            <li key={g} className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: COLOR[g] }} />
              <span>{LABEL[g]}</span>
              <span className="font-mono" style={{ color: 'var(--fg-muted)' }}>
                {counts[g].toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </VizShell>
  )
}
