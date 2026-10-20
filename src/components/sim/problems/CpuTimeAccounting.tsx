import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const CODE = `def on_tick(cpu):                    # 各 CPU で 1 ティックごとに呼ばれる
    task = cpu.current
    if task is None:
        if cpu.has_io_waiter():
            stat[cpu].iowait += 1
        else:
            stat[cpu].idle += 1
    elif cpu.stolen:
        stat[cpu].steal += 1
    elif task.in_kernel:
        stat[cpu].system += 1
        task.stime += 1
    else:
        stat[cpu].user += 1
        task.utime += 1

def usage(before, after):            # /proc/stat を 2 回読んだ差分
    d = after - before
    busy = d.total - d.idle - d.iowait
    return busy / d.total

def pcpu_irix(task, elapsed):
    return (task.utime + task.stime) / elapsed

def pcpu_solaris(task, elapsed, ncpu):
    return pcpu_irix(task, elapsed) / ncpu`

type Slot = 'user' | 'sys' | 'idle' | 'iowait' | 'steal' | 'other' | 'throttled'
type Scenario = {
  cores: number
  /** timeline[tick][core] */
  timeline: Slot[][]
  explain: string[]
  /** 観測対象のプロセスが、このティックでまだ走っているか */
  alive: boolean[]
}

const SLOT_STYLE: Record<Slot, { bg: string; fg: string; label: string }> = {
  user: { bg: 'var(--accent)', fg: '#fff', label: 'us' },
  sys: { bg: 'var(--warn)', fg: '#fff', label: 'sy' },
  idle: { bg: 'var(--bg)', fg: 'var(--fg-muted)', label: 'id' },
  iowait: { bg: 'var(--warn-soft)', fg: 'var(--warn)', label: 'wa' },
  steal: { bg: 'var(--danger-soft)', fg: 'var(--danger)', label: 'st' },
  other: { bg: 'var(--ok-soft)', fg: 'var(--ok)', label: 'us' },
  throttled: { bg: 'var(--bg-soft)', fg: 'var(--danger)', label: '止' },
}

const T = 10

function fill(cores: number, f: (tick: number, core: number) => Slot): Slot[][] {
  return Array.from({ length: T }, (_, t) => Array.from({ length: cores }, (_, c) => f(t, c)))
}

const SCENARIOS: { name: string; value: Scenario }[] = [
  {
    name: '1 スレッドの計算',
    value: {
      cores: 4,
      timeline: fill(4, (_, c) => (c === 0 ? 'user' : 'idle')),
      alive: Array(T).fill(true),
      explain: ['1 本のスレッドが CPU 0 だけを使い続ける。ほかの 3 コアは暇'],
    },
  },
  {
    name: '4 スレッドの計算',
    value: {
      cores: 4,
      timeline: fill(4, () => 'user'),
      alive: Array(T).fill(true),
      explain: ['4 本のスレッドが 4 コアを同時に使う。1 ティックの間に CPU 時間が 4 ティックぶん進む'],
    },
  },
  {
    name: 'sleep',
    value: {
      cores: 4,
      timeline: fill(4, () => 'idle'),
      alive: Array(T).fill(true),
      explain: ['プロセスは寝ているだけ。経過時間は進むが、CPU 時間は増えない'],
    },
  },
  {
    name: 'I/O 待ち → 横で計算',
    value: {
      cores: 4,
      timeline: fill(4, (t, c) => {
        if (c === 0) {
          if (t % 3 === 0) return 'sys'
          return t < 5 ? 'iowait' : 'other'
        }
        return t < 5 ? 'idle' : 'other'
      }),
      alive: Array(T).fill(true),
      explain: [
        'fsync を繰り返すプロセス。書き込みを頼んでは、完了を待って眠る',
        '5 ティック目から、別の計算が全コアで走り始める。待っている時間は変わらないのに wa は消える',
      ],
    },
  },
  {
    name: '仮想マシンで steal',
    value: {
      cores: 4,
      timeline: fill(4, (t, c) => (c < 2 ? (t % 4 === 3 ? 'steal' : 'user') : 'idle')),
      alive: Array(T).fill(true),
      explain: ['2 スレッドの計算。ハイパーバイザが物理 CPU をほかの VM に渡している間は、st として数えられる'],
    },
  },
  {
    name: 'cgroup 制限（5 ティックに 4 まで）',
    value: {
      cores: 4,
      timeline: fill(4, (t) => (t % 5 === 0 ? 'user' : 'throttled')),
      alive: Array(T).fill(true),
      explain: [
        '1 周期 5 ティックのうち CPU 時間 4 ティックまで、という制限（cpu.max の考え方）で 4 スレッドを動かす。4 コア同時に走ると、周期の最初のティックで割り当てを使い切る',
        'CPU は空いているので、マシン全体の使用率は低い。それでもプロセスは進まない',
      ],
    },
  },
]

type Counts = Record<'user' | 'system' | 'idle' | 'iowait' | 'steal', number>
type View = {
  cores: number
  timeline: Slot[][]
  upto: number
  counts: Counts
  utime: number
  stime: number
}

function trace(s: Scenario): Frame<View>[] {
  const frames: Frame<View>[] = []
  const counts: Counts = { user: 0, system: 0, idle: 0, iowait: 0, steal: 0 }
  let utime = 0
  let stime = 0

  const vars = (elapsed: number) => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    const busy = total - counts.idle - counts.iowait
    const irix = elapsed ? ((utime + stime) / elapsed) * 100 : 0
    return {
      real: elapsed,
      user: utime,
      sys: stime,
      '使用率': total ? `${((busy / total) * 100).toFixed(0)}%` : '−',
      'wa の割合': total ? `${((counts.iowait / total) * 100).toFixed(0)}%` : '−',
      '%CPU (Irix)': `${irix.toFixed(0)}%`,
      '%CPU (Solaris)': `${(irix / s.cores).toFixed(0)}%`,
    }
  }
  const view = (upto: number): View => ({
    cores: s.cores,
    timeline: s.timeline,
    upto,
    counts: { ...counts },
    utime,
    stime,
  })

  frames.push({
    line: [1, 2],
    note: `${s.cores} コアのマシン。${s.explain[0]}`,
    vars: vars(0),
    view: view(0),
  })

  for (let t = 0; t < T; t++) {
    const row = s.timeline[t]!
    const kinds = new Set<string>()
    row.forEach((slot) => {
      if (slot === 'user') {
        counts.user++
        utime++
        kinds.add('user')
      } else if (slot === 'other') {
        counts.user++
        kinds.add('other')
      } else if (slot === 'sys') {
        counts.system++
        stime++
        kinds.add('sys')
      } else if (slot === 'iowait') {
        counts.iowait++
        kinds.add('iowait')
      } else if (slot === 'steal') {
        counts.steal++
        kinds.add('steal')
      } else {
        counts.idle++
        kinds.add('idle')
      }
    })
    const lines: number[] = [2, 3]
    if (kinds.has('iowait')) lines.push(4, 5)
    if (kinds.has('idle')) lines.push(7)
    if (kinds.has('steal')) lines.push(8, 9)
    if (kinds.has('sys')) lines.push(10, 11, 12)
    if (kinds.has('user') || kinds.has('other')) lines.push(14, 15)

    let note = `ティック ${t + 1}。`
    const parts: string[] = []
    if (kinds.has('user')) parts.push('観測中のプロセスがユーザー空間で計算（utime と us が増える）')
    if (kinds.has('other')) parts.push('別のプロセスが計算（us は増えるが、観測中のプロセスの utime は増えない）')
    if (kinds.has('sys')) parts.push('システムコールの中（stime と sy が増える）')
    if (kinds.has('iowait')) parts.push('走るものがなく、I/O を待つタスクがいる CPU は wa')
    if (kinds.has('steal')) parts.push('物理 CPU を取られていた時間は st')
    if (row.includes('throttled')) parts.push('割り当てを使い切ったスレッドは止められ、CPU は idle として数えられる')
    if (s.explain[1] && t === 5) parts.push(s.explain[1])
    note += parts.join('。') || '全コア idle'
    frames.push({ line: lines, note, vars: vars(t + 1), view: view(t + 1) })
  }

  frames.push({
    line: [17, 18, 19, 20, 22, 23, 25, 26],
    note: '終了。使用率は区間の差分から、%CPU はプロセスの CPU 時間を経過時間で割って求める。Solaris モードはさらにコア数で割る',
    vars: vars(T),
    view: view(T),
    done: true,
  })
  return frames
}

export default function CpuTimeAccounting() {
  const [s, setS] = useState<Scenario>(SCENARIOS[0]!.value)
  const frames = useMemo(() => trace(s), [s])

  return (
    <SimShell
      title="CPU 時間の数え方"
      subtitle="各 CPU の 1 ティックを、us / sy / id / wa / st のどれかに振り分ける。使用率も %CPU も、この数え上げの割り算"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="状況" presets={SCENARIOS} onPick={setS} />}
      legend={
        <span className="flex flex-wrap gap-3">
          {(['user', 'other', 'sys', 'iowait', 'steal', 'idle', 'throttled'] as Slot[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm border"
                style={{ background: SLOT_STYLE[k].bg, borderColor: 'var(--border)' }}
              />
              {
                {
                  user: '観測中のプロセス（us）',
                  other: '別のプロセス（us）',
                  sys: 'カーネル内（sy）',
                  iowait: 'I/O 待ち（wa）',
                  steal: '奪われた（st）',
                  idle: '暇（id）',
                  throttled: 'cgroup で停止（id）',
                }[k]
              }
            </span>
          ))}
        </span>
      }
    >
      {(f) => (
        <div className="overflow-x-auto">
          <table className="border-separate font-mono text-[11px]" style={{ borderSpacing: 3 }}>
            <thead>
              <tr>
                <th />
                {Array.from({ length: T }, (_, t) => (
                  <th key={t} className="w-7 text-center font-normal" style={{ color: 'var(--fg-muted)' }}>
                    {t + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: f.view.cores }, (_, c) => (
                <tr key={c}>
                  <td className="pr-2" style={{ color: 'var(--fg-muted)' }}>
                    CPU {c}
                  </td>
                  {Array.from({ length: T }, (_, t) => {
                    const slot = f.view.timeline[t]![c]!
                    const shown = t < f.view.upto
                    const st = SLOT_STYLE[slot]
                    return (
                      <td
                        key={t}
                        className="h-6 w-7 rounded text-center"
                        style={{
                          background: shown ? st.bg : 'transparent',
                          color: shown ? st.fg : 'transparent',
                          border: `1px ${shown ? 'solid' : 'dashed'} var(--border)`,
                        }}
                      >
                        {shown ? st.label : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m-0 mt-2 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            /proc/stat の差分: us {f.view.counts.user} / sy {f.view.counts.system} / id {f.view.counts.idle} / wa{' '}
            {f.view.counts.iowait} / st {f.view.counts.steal}（ティック）
          </p>
        </div>
      )}
    </SimShell>
  )
}
