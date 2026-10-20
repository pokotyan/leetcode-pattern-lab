import { useMemo, useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'

const N = 10
const K = 3
const OUT = N - K + 1

const IMAGES: { name: string; rows: string[] }[] = [
  {
    name: '数字の 7',
    rows: [
      '..........',
      '.#######..',
      '.......#..',
      '......#...',
      '......#...',
      '.....#....',
      '.....#....',
      '....#.....',
      '....#.....',
      '..........',
    ],
  },
  {
    name: '四角',
    rows: [
      '..........',
      '..........',
      '..######..',
      '..#....#..',
      '..#....#..',
      '..#....#..',
      '..#....#..',
      '..######..',
      '..........',
      '..........',
    ],
  },
  {
    name: '十字',
    rows: [
      '..........',
      '....##....',
      '....##....',
      '....##....',
      '.########.',
      '.########.',
      '....##....',
      '....##....',
      '....##....',
      '..........',
    ],
  },
]

const FILTERS: { name: string; w: number[] }[] = [
  { name: '縦の境目', w: [-1, 0, 1, -1, 0, 1, -1, 0, 1] },
  { name: '横の境目', w: [-1, -1, -1, 0, 0, 0, 1, 1, 1] },
  { name: 'ぼかし', w: [1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9] },
  { name: '右下がりの斜め', w: [1, -1, -1, -1, 1, -1, -1, -1, 1] },
]

const parse = (rows: string[]) => rows.map((r) => [...r].map((c) => (c === '#' ? 1 : 0)))

function shiftRight(img: number[][], s: number) {
  return img.map((row) => row.map((_, x) => (x - s >= 0 ? row[x - s]! : 0)))
}

function convolve(img: number[][], w: number[]) {
  const out: number[][] = []
  for (let y = 0; y < OUT; y++) {
    const row: number[] = []
    for (let x = 0; x < OUT; x++) {
      let s = 0
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) s += img[y + i]![x + j]! * w[i * K + j]!
      row.push(s)
    }
    out.push(row)
  }
  return out
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2))

const CELL = 22
const GAP = 40

export default function ConvFilter() {
  const [imgIdx, setImgIdx] = useState(0)
  const [w, setW] = useState<number[]>(FILTERS[0]!.w)
  const [shift, setShift] = useState(0)
  const [pos, setPos] = useState(OUT + 1)
  const [relu, setRelu] = useState(false)

  const img = useMemo(() => shiftRight(parse(IMAGES[imgIdx]!.rows), shift), [imgIdx, shift])
  const raw = useMemo(() => convolve(img, w), [img, w])
  const out = relu ? raw.map((r) => r.map((v) => Math.max(0, v))) : raw
  const maxAbs = Math.max(1e-9, ...out.flat().map(Math.abs))

  const py = Math.floor(pos / OUT)
  const px = pos % OUT
  const terms = Array.from({ length: K * K }, (_, k) => {
    const i = Math.floor(k / K)
    const j = k % K
    return { x: img[py + i]![px + j]!, w: w[k]! }
  })
  const sum = terms.reduce((s, t) => s + t.x * t.w, 0)

  const inW = N * CELL
  const outX = inW + GAP
  const outW = OUT * CELL
  const height = N * CELL

  const setWeight = (k: number, v: number) => setW((prev) => prev.map((p, i) => (i === k ? v : p)))

  const btn = (active: boolean) => ({
    border: '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? 'var(--bg)' : 'var(--fg)',
    borderRadius: 6,
    padding: '2px 8px',
    cursor: 'pointer',
  })

  return (
    <VizShell
      title="3×3 のフィルタを画像の上でずらす"
      subtitle="フィルタの 9 個の値と画像の 9 画素を掛けて足す。それを全部の位置で繰り返すと、右の特徴マップになる"
      controls={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span style={{ color: 'var(--fg-muted)' }}>画像</span>
            {IMAGES.map((im, i) => (
              <button key={im.name} type="button" style={btn(i === imgIdx)} onClick={() => setImgIdx(i)}>
                {im.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span style={{ color: 'var(--fg-muted)' }}>フィルタ</span>
            {FILTERS.map((f) => (
              <button
                key={f.name}
                type="button"
                style={btn(f.w.every((v, i) => v === w[i]))}
                onClick={() => setW(f.w)}
              >
                {f.name}
              </button>
            ))}
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(3, auto)' }}>
            {w.map((v, k) => (
              <input
                key={k}
                type="range"
                min={-2}
                max={2}
                step={0.1}
                value={v}
                aria-label={`フィルタの ${Math.floor(k / K) + 1} 行 ${(k % K) + 1} 列`}
                onChange={(e) => setWeight(k, Number(e.target.value))}
                style={{ accentColor: 'var(--accent)', width: 70 }}
              />
            ))}
          </div>
          <Slider
            label="見る位置"
            value={pos}
            min={0}
            max={OUT * OUT - 1}
            step={1}
            onChange={setPos}
            format={(v) => `${Math.floor(v / OUT) + 1},${(v % OUT) + 1}`}
          />
          <Slider label="画像を右へ" value={shift} min={0} max={3} step={1} onChange={setShift} format={(v) => `${v} 画素`} />
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={relu} onChange={(e) => setRelu(e.target.checked)} />
            <span>ReLU（負を 0 にする）</span>
          </label>
        </>
      }
      readout={
        <>
          <div>
            位置 ({py + 1}, {px + 1}) の値 = {terms.map((t) => `${t.x}×${fmt(t.w)}`).join(' + ')} ={' '}
            <span style={{ color: 'var(--fg)' }}>{fmt(sum)}</span>
            {relu && sum < 0 ? ' → ReLU で 0' : ''}
          </div>
          <div>
            フィルタの値:{' '}
            {[0, 1, 2].map((i) => `[${w.slice(i * K, i * K + K).map(fmt).join(', ')}]`).join(' ')}
          </div>
        </>
      }
    >
      <svg
        viewBox={`0 0 ${outX + outW} ${height + 20}`}
        width="100%"
        style={{ maxWidth: outX + outW, display: 'block' }}
        role="img"
        aria-label="入力画像と特徴マップ"
      >
        <text x={0} y={height + 16} fontSize={11} fill="var(--fg-muted)">
          入力（{N}×{N}）
        </text>
        <text x={outX} y={height + 16} fontSize={11} fill="var(--fg-muted)">
          特徴マップ（{OUT}×{OUT}）
        </text>
        {img.map((row, y) =>
          row.map((v, x) => (
            <rect
              key={`i${y}-${x}`}
              x={x * CELL}
              y={y * CELL}
              width={CELL - 1}
              height={CELL - 1}
              fill={v ? 'var(--fg)' : 'var(--bg)'}
              stroke="var(--border)"
            />
          )),
        )}
        <rect
          x={px * CELL - 1}
          y={py * CELL - 1}
          width={K * CELL + 1}
          height={K * CELL + 1}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={3}
        />
        {out.map((row, y) =>
          row.map((v, x) => (
            <g key={`o${y}-${x}`}>
              <rect x={outX + x * CELL} y={y * CELL} width={CELL - 1} height={CELL - 1} fill="var(--bg)" stroke="var(--border)" />
              <rect
                x={outX + x * CELL}
                y={y * CELL}
                width={CELL - 1}
                height={CELL - 1}
                fill={v >= 0 ? 'var(--accent)' : 'var(--danger)'}
                opacity={Math.abs(v) / maxAbs}
              />
            </g>
          )),
        )}
        <rect
          x={outX + px * CELL - 1}
          y={py * CELL - 1}
          width={CELL + 1}
          height={CELL + 1}
          fill="none"
          stroke="var(--warn)"
          strokeWidth={3}
        />
      </svg>
    </VizShell>
  )
}
