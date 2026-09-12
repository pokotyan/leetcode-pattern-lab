import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `def on_election_timeout(self):
    self.term += 1                       # 任期を1つ進める
    self.state = 'candidate'
    self.voted_for = self.id
    votes = 1                            # まず自分の1票
    for peer in self.peers:
        if peer.request_vote(self.term, self.id):
            votes += 1
    if votes > self.cluster_size // 2:   # 過半数を取れたか
        self.state = 'leader'

def request_vote(self, term, candidate_id):
    if term < self.term:
        return False                     # 古い任期からの依頼は拒否
    if term > self.term:
        self.term = term
        self.voted_for = None            # 新しい任期なので投票権が戻る
    if self.voted_for is None:
        self.voted_for = candidate_id
        return True                      # 1つの任期で投票できるのは1回だけ
    return False`

type Scenario = 'normal' | 'split' | 'downNode'
type NodeState = { term: number; votedFor: number | null; role: 'follower' | 'candidate' | 'leader'; alive: boolean }
type View = { nodes: GNode[]; edges: GEdge[]; votes: string; log: string[] }

const N = 5
const POS: [number, number][] = [
  [230, 40],
  [390, 130],
  [330, 230],
  [130, 230],
  [70, 130],
]

function trace(scenario: Scenario): Frame<View>[] {
  const frames: Frame<View>[] = []
  const st: NodeState[] = Array.from({ length: N }, () => ({
    term: 0,
    votedFor: null,
    role: 'follower',
    alive: true,
  }))
  // split では4番が応答しない（遅延）ことにして、票が 2 対 2 で割れる状況を作る
  const silent = scenario === 'split' ? new Set([4]) : new Set<number>()
  if (scenario === 'downNode') {
    st[2]!.alive = false
    st[3]!.alive = false
    st[4]!.alive = false
  }
  const log: string[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: number; target?: number; granted?: boolean; votes?: number; finished?: boolean } = {},
  ) => {
    const nodes: GNode[] = st.map((s, i) => ({
      id: i,
      label: String(i),
      x: POS[i]![0],
      y: POS[i]![1],
      badge: s.alive ? `t${s.term}` : '×',
      state: !s.alive
        ? 'dim'
        : s.role === 'leader'
          ? 'good'
          : i === opts.cur
            ? 'active'
            : i === opts.target
              ? opts.granted
                ? 'good'
                : 'bad'
              : s.role === 'candidate'
                ? 'window'
                : 'idle',
    }))
    const edges: GEdge[] = []
    if (opts.cur !== undefined && opts.target !== undefined) {
      edges.push({ from: opts.cur, to: opts.target, state: opts.granted ? 'good' : 'bad' })
    }
    frames.push({
      line,
      note,
      vars: {
        過半数: Math.floor(N / 2) + 1,
        獲得票: opts.votes ?? '−',
        任期: Math.max(...st.map((s) => s.term)),
      },
      view: {
        nodes,
        edges,
        votes: st.map((s, i) => `${i}:t${s.term}${s.votedFor !== null ? `→${s.votedFor}` : ''}`).join(' '),
        log: [...log],
      },
      done: opts.finished,
    })
  }

  const requestVote = (from: number, to: number, term: number): boolean => {
    const s = st[to]!
    if (!s.alive || silent.has(to)) return false
    if (term < s.term) return false
    if (term > s.term) {
      s.term = term
      s.votedFor = null
      s.role = 'follower'
    }
    if (s.votedFor === null) {
      s.votedFor = from
      return true
    }
    return false
  }

  snap([2, 3], `${N} ノードのクラスタ。全員が follower で、任期（term）は 0。過半数は ${Math.floor(N / 2) + 1} 票`)

  const runElection = (cands: number[]): number | null => {
    // 候補者が自分の任期を上げて立候補する
    for (const c of cands) {
      st[c]!.term += 1
      st[c]!.role = 'candidate'
      st[c]!.votedFor = c
      log.push(`ノード ${c} が任期 ${st[c]!.term} で立候補`)
      snap([2, 3, 4, 5], `ノード ${c} は leader からの連絡が途絶えたので、任期を ${st[c]!.term} に上げて立候補する。まず自分に1票入れる`, {
        cur: c,
        votes: 1,
      })
    }

    const counts = new Map(cands.map((c) => [c, 1]))
    // 候補者が交互に投票を依頼する（split の再現）
    const order: [number, number][] = []
    for (let step = 0; step < N; step++) {
      for (const c of cands) {
        const to = (c + 1 + step) % N
        if (to === c || cands.includes(to)) continue
        order.push([c, to])
      }
    }
    for (const [c, to] of order) {
      const term = st[c]!.term
      const granted = requestVote(c, to, term)
      if (granted) counts.set(c, counts.get(c)! + 1)
      const reason = !st[to]!.alive
        ? '停止している'
        : silent.has(to)
          ? '応答が返ってこない'
          : `この任期ですでに ${st[to]!.votedFor} に投票済み`
      log.push(`${c} → ${to}（任期 ${term}）: ${granted ? '投票する' : '断る'}`)
      snap(granted ? [18, 19, 20] : 21, granted
        ? `ノード ${c} がノード ${to} に投票を依頼。${to} はこの任期でまだ投票していないので、${c} に入れる。${c} の得票は ${counts.get(c)}`
        : `ノード ${c} がノード ${to} に投票を依頼。${to} は${reason}ので、票は得られない`, {
        cur: c,
        target: to,
        granted,
        votes: counts.get(c),
      })
      if (counts.get(c)! > Math.floor(N / 2)) {
        st[c]!.role = 'leader'
        log.push(`ノード ${c} が任期 ${term} の leader になった`)
        snap([9, 10], `ノード ${c} が ${counts.get(c)} 票で過半数（${Math.floor(N / 2) + 1} 票）に達した。任期 ${term} の leader になる`, {
          cur: c,
          votes: counts.get(c),
        })
        return c
      }
    }
    return null
  }

  if (scenario === 'split') {
    silent.add(4)
    const leader = runElection([0, 2])
    if (leader === null) {
      snap(9, `2人が同時に立候補したため票が割れ、どちらも過半数に届かなかった。誰も leader になれない（split vote）`, {})
      for (const s of st) s.role = 'follower'
      silent.clear()
      log.push('票が割れたので、待ち時間をずらして再挑戦')
      const l2 = runElection([1])
      snap(10, l2 !== null
        ? `待ち時間をずらして1人だけが立候補し直したので、今度は決まった。leader はノード ${l2}`
        : `再挑戦でも決まらなかった`, { finished: true })
      return frames
    }
  } else {
    const leader = runElection([0])
    snap(10, leader !== null
      ? `leader はノード ${leader}。以後、このノードだけが書き込みを受け付け、ほかへ複製する`
      : `過半数に届かなかったので leader は決まらない。生きているノードが ${st.filter((s) => s.alive).length} 台では、${Math.floor(N / 2) + 1} 票を集められない`, {
      finished: true,
    })
    return frames
  }
  return frames
}

const PRESETS: { name: string; value: Scenario }[] = [
  { name: '普通に決まる', value: 'normal' },
  { name: '票が割れる', value: 'split' },
  { name: '3台停止で決まらない', value: 'downNode' },
]

export default function RaftElection() {
  const [s, setS] = useState<Scenario>('normal')
  const frames = useMemo(() => trace(s), [s])

  return (
    <SimShell
      title="Raft の leader 選挙"
      subtitle="任期を上げて立候補し、過半数の票を集めたら leader。1つの任期で投票できるのは1回だけ"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="状況" presets={PRESETS} onPick={setS} />}
      legend={
        <>
          <LegendItem state="window">立候補中（candidate）</LegendItem>
          <LegendItem state="active">いま依頼を出しているノード</LegendItem>
          <LegendItem state="good">投票した / leader になった</LegendItem>
          <LegendItem state="bad">投票を断った</LegendItem>
          <LegendItem state="dim">停止中</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-2">
          <GraphView nodes={f.view.nodes} edges={f.view.edges} width={460} height={270} />
          <p className="m-0 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            {f.view.votes}
          </p>
          <ul className="m-0 list-none space-y-0.5 p-0 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            {f.view.log.slice(-5).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </SimShell>
  )
}
