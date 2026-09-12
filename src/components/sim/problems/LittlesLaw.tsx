import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `# L = λ × W
#   L: 系の中にいる平均の件数
#   λ: 到着率（件/秒）
#   W: 1件あたりの平均滞在時間（秒）

def queue_state(arrival_rate, service_time, servers):
    rho = arrival_rate * service_time / servers        # 使用率
    if rho >= 1:
        return float('inf'), float('inf')              # 処理が追いつかない
    wait = service_time * rho / (1 - rho)              # 待ち行列での待ち時間
    W = wait + service_time                            # 滞在時間 = 待ち + 処理
    return W, arrival_rate * W                         # L = λW`

const CAP = 24

type Input = { serviceTime: number; servers: number; rates: number[] }
type View = { cells: Cell[]; rho: number; wait: number; W: number; L: number; rate: number }

function trace({ serviceTime, servers, rates }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { rate: number; finished?: boolean },
  ) => {
    const rho = (opts.rate * serviceTime) / servers
    const ok = rho < 1
    const wait = ok ? (serviceTime * rho) / (1 - rho) : Infinity
    const W = ok ? wait + serviceTime : Infinity
    const L = ok ? opts.rate * W : Infinity
    const filled = ok ? Math.min(Math.round(L), CAP) : CAP
    const cells: Cell[] = Array.from({ length: CAP }, (_, i) => ({
      value: i < filled ? '●' : '',
      state: i < filled ? (rho > 0.9 ? 'bad' : rho > 0.7 ? 'window' : 'good') : 'idle',
    }))
    frames.push({
      line,
      note,
      vars: {
        到着率: `${opts.rate}/s`,
        使用率: ok ? `${(rho * 100).toFixed(0)}%` : '100%超',
        待ち時間: ok ? `${(wait * 1000).toFixed(0)}ms` : '∞',
        滞在時間: ok ? `${(W * 1000).toFixed(0)}ms` : '∞',
        系の中の件数: ok ? L.toFixed(1) : '∞',
      },
      view: { cells, rho, wait, W, L, rate: opts.rate },
      done: opts.finished,
    })
  }

  snap(7, `1件の処理に ${serviceTime * 1000}ms かかるサーバーが ${servers} 台。理論上の上限は毎秒 ${(servers / serviceTime).toFixed(1)} 件。そこへ到着率を上げていく`, {
    rate: rates[0]!,
  })

  rates.forEach((r, i) => {
    const rho = (r * serviceTime) / servers
    const ok = rho < 1
    const wait = ok ? (serviceTime * rho) / (1 - rho) : Infinity
    const W = ok ? wait + serviceTime : Infinity
    snap([7, 10, 11], ok
      ? `到着率 ${r}/s のとき使用率は ${(rho * 100).toFixed(0)}%。待ち時間は ${(wait * 1000).toFixed(0)}ms、滞在時間は ${(W * 1000).toFixed(0)}ms。系の中には平均 ${(r * W).toFixed(1)} 件`
      : `到着率 ${r}/s は処理能力を超えている。行列は際限なく伸び続け、待ち時間は発散する`, {
      rate: r,
      finished: i === rates.length - 1,
    })
  })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  {
    name: '1台・処理50ms',
    value: { serviceTime: 0.05, servers: 1, rates: [4, 8, 12, 14, 16, 18, 19, 19.5, 20] },
  },
  {
    name: '4台・処理50ms',
    value: { serviceTime: 0.05, servers: 4, rates: [20, 40, 60, 70, 76, 78, 79, 80] },
  },
  {
    name: '1台・処理10ms',
    value: { serviceTime: 0.01, servers: 1, rates: [20, 50, 80, 90, 95, 98, 100] },
  },
]

export default function LittlesLaw() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="使用率を上げると、待ち時間はどうなるか"
      subtitle="処理能力の限界に近づくほど、待ち時間は急激に伸びる。80% を超えたあたりから跳ね上がる"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="構成" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="good">余裕がある（使用率 70% 未満）</LegendItem>
          <LegendItem state="window">詰まり始め（70〜90%）</LegendItem>
          <LegendItem state="bad">危険域（90% 以上）</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            系の中にいるリクエスト（処理中 + 待ち）
          </p>
          <ArrayView cells={f.view.cells} showIndex={false} size={22} />
          <div className="flex flex-wrap gap-4 font-mono text-xs">
            <span style={{ color: 'var(--fg-muted)' }}>
              使用率{' '}
              <span
                style={{
                  color:
                    f.view.rho >= 1
                      ? 'var(--danger)'
                      : f.view.rho > 0.9
                        ? 'var(--danger)'
                        : f.view.rho > 0.7
                          ? 'var(--warn)'
                          : 'var(--ok)',
                }}
              >
                {f.view.rho >= 1 ? '100%超' : `${(f.view.rho * 100).toFixed(0)}%`}
              </span>
            </span>
            <span style={{ color: 'var(--fg-muted)' }}>
              滞在時間{' '}
              <span style={{ color: 'var(--accent)' }}>
                {Number.isFinite(f.view.W) ? `${(f.view.W * 1000).toFixed(0)}ms` : '∞'}
              </span>
            </span>
            <span style={{ color: 'var(--fg-muted)' }}>
              L = λW{' '}
              <span style={{ color: 'var(--ok)' }}>
                {Number.isFinite(f.view.L) ? f.view.L.toFixed(1) : '∞'}
              </span>
            </span>
          </div>
        </div>
      )}
    </SimShell>
  )
}
