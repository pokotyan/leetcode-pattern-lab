import { useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'
// lab/ai-diffusion/ddpm.py で学習させた小さな MLP の出力。渦巻きの 240 点、前向きの雑音 ε、ᾱ_t の表、
// 逆向き過程を雑音から走らせたときの途中の点群を、小数 3 桁に丸めて書き出したもの
import DATA from './diffusion2d.json'

type Pt = [number, number]
const data = DATA.data as Pt[]
const eps = DATA.eps as Pt[]
const abar = DATA.abar as number[]
const reverse = DATA.reverse as unknown as Record<string, Pt[]>
const SNAP_TS = Object.keys(reverse)
  .map(Number)
  .sort((a, b) => b - a)
const T = abar.length

const SIZE = 300
const RANGE = 3.2
const TRACKED = 7

const sx = (x: number) => ((x + RANGE) / (2 * RANGE)) * SIZE
const sy = (y: number) => SIZE - ((y + RANGE) / (2 * RANGE)) * SIZE

function noised(t: number): Pt[] {
  const a = Math.sqrt(abar[t]!)
  const b = Math.sqrt(1 - abar[t]!)
  return data.map(([x, y], i) => [a * x + b * eps[i]![0], a * y + b * eps[i]![1]])
}

function Plot({ points, ghost, path }: { points: Pt[]; ghost?: Pt[]; path?: Pt[] }) {
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="2 次元の点群">
      <rect x={0} y={0} width={SIZE} height={SIZE} fill="none" stroke="var(--border)" />
      <line x1={sx(0)} y1={0} x2={sx(0)} y2={SIZE} stroke="var(--border)" strokeDasharray="2 3" />
      <line x1={0} y1={sy(0)} x2={SIZE} y2={sy(0)} stroke="var(--border)" strokeDasharray="2 3" />
      {ghost?.map(([x, y], i) => (
        <circle key={`g${i}`} cx={sx(x)} cy={sy(y)} r={1.6} fill="var(--fg-muted)" opacity={0.25} />
      ))}
      {points.map(([x, y], i) => (
        <circle
          key={i}
          cx={sx(x)}
          cy={sy(y)}
          r={i === TRACKED ? 4 : 2.2}
          fill={i === TRACKED ? 'var(--warn)' : 'var(--accent)'}
          opacity={i === TRACKED ? 1 : 0.75}
        />
      ))}
      {path && (
        <polyline
          points={path.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')}
          fill="none"
          stroke="var(--warn)"
          strokeWidth={1.2}
        />
      )}
    </svg>
  )
}

export default function Diffusion2D() {
  const [mode, setMode] = useState<'forward' | 'reverse'>('forward')
  const [t, setT] = useState(0)
  const [snap, setSnap] = useState(0)

  const btn = (m: typeof mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className="rounded border px-2 py-1"
      style={{
        borderColor: mode === m ? 'var(--accent)' : 'var(--border)',
        color: mode === m ? 'var(--accent)' : 'var(--fg-muted)',
        background: 'transparent',
      }}
    >
      {label}
    </button>
  )

  const fwdPath: Pt[] = []
  if (mode === 'forward') {
    for (let s = 0; s <= t; s += 1) fwdPath.push(noised(s)[TRACKED]!)
  }
  const revT = SNAP_TS[snap]!
  const shownSnaps = SNAP_TS.slice(0, snap + 1)

  return (
    <VizShell
      title="2 次元の点で見る拡散モデル"
      subtitle="前向きは式で一気に雑音を足し、逆向きは学習させたネットワークが雑音を少しずつ引いていく"
      controls={
        <>
          <span className="flex gap-2">
            {btn('forward', '前向き：雑音を足す')}
            {btn('reverse', '逆向き：雑音を引く')}
          </span>
          {mode === 'forward' ? (
            <Slider label="時刻 t" value={t} min={0} max={T - 1} step={1} onChange={setT} format={(v) => String(v)} />
          ) : (
            <Slider
              label="何手目まで"
              value={snap}
              min={0}
              max={SNAP_TS.length - 1}
              step={1}
              onChange={setSnap}
              format={(v) => `${T - SNAP_TS[v]!}/${T}`}
            />
          )}
        </>
      }
      readout={
        mode === 'forward' ? (
          <>
            x_t = {Math.sqrt(abar[t]!).toFixed(3)} × x_0 + {Math.sqrt(1 - abar[t]!).toFixed(3)} × ε　（ᾱ_t ={' '}
            {abar[t]!.toFixed(4)}）。元の点の重みが {Math.sqrt(abar[t]!).toFixed(3)}、雑音の重みが{' '}
            {Math.sqrt(1 - abar[t]!).toFixed(3)}。黄の点は 1 つの点が t=0 から t まで動いた道のり
          </>
        ) : (
          <>
            正規分布の雑音から始め、ネットワークが予測した雑音を引く更新を {T - revT} 手進めた点群（全 {T} 手）。
            灰色は本物のデータ。途中で記録した手数: {shownSnaps.map((s) => T - s).join(' → ')}
          </>
        )
      }
    >
      {mode === 'forward' ? (
        <Plot points={noised(t)} path={fwdPath} />
      ) : (
        <Plot points={reverse[String(revT)]!} ghost={data} />
      )}
    </VizShell>
  )
}
