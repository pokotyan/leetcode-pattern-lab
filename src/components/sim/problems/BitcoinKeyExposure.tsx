import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

type Kind = 'p2pk' | 'p2pkh' | 'p2pkhReuse' | 'p2wpkh' | 'p2tr' | 'p2mr'
type Stage = 'receive' | 'hold' | 'mempool' | 'confirmed' | 'leftover'
type Window = 'none' | 'long' | 'short'

type View = {
  stage: Stage
  chain: string
  pubkey: 'hidden' | 'visible'
  window: Window
  coinAtRisk: string
}

const STAGES: { id: Stage; label: string }[] = [
  { id: 'receive', label: '受け取る' },
  { id: 'hold', label: '保管する' },
  { id: 'mempool', label: '使う（未確定）' },
  { id: 'confirmed', label: '確定' },
  { id: 'leftover', label: '残りの出力' },
]

const CODE: Record<Kind, string> = {
  p2pk: `# 出力に書くロック（scriptPubKey）
<公開鍵 33B> OP_CHECKSIG

# 使うときに出すもの（scriptSig）
<署名>

# 検証: 署名が出力の公開鍵で確かめられるか`,
  p2pkh: `# 出力に書くロック（scriptPubKey）。アドレスは 1 で始まる
OP_DUP OP_HASH160 <公開鍵のハッシュ 20B> OP_EQUALVERIFY OP_CHECKSIG

# 使うときに出すもの（scriptSig）
<署名> <公開鍵 33B>

# 検証: 出した公開鍵のハッシュが一致し、署名がその公開鍵で確かめられるか`,
  p2pkhReuse: `# 同じアドレス（同じ公開鍵のハッシュ）に 2 回受け取る
出力 A: OP_DUP OP_HASH160 <ハッシュ H> OP_EQUALVERIFY OP_CHECKSIG
出力 B: OP_DUP OP_HASH160 <ハッシュ H> OP_EQUALVERIFY OP_CHECKSIG

# 出力 A だけを使う
<署名> <公開鍵 33B>

# 出力 B はまだ使っていない`,
  p2wpkh: `# 出力に書くロック。アドレスは bc1q で始まる
OP_0 <公開鍵のハッシュ 20B>

# 使うときに出すもの（witness）
<署名> <公開鍵 33B>

# 検証の中身は P2PKH と同じ。置き場所が witness に移っただけ`,
  p2tr: `# 出力に書くロック。アドレスは bc1p で始まる
OP_1 <出力の公開鍵 Q 32B>      # Q = P + tG（BIP-341）

# 鍵で使うときに出すもの（witness）
<Schnorr 署名 64B>

# 検証: 署名が Q で確かめられるか`,
  p2mr: `# 提案段階（BIP-360, Draft）。アドレスは bc1z で始まる
OP_2 <スクリプトの木の根 32B>

# 使うときに出すもの（witness）
<署名> <葉のスクリプト（中に公開鍵）> <制御ブロック>

# 鍵だけで使う経路は無い。木の根はハッシュなので公開鍵を含まない`,
}

const TEXT: Record<Kind, Record<Stage, { chain: string; pubkey: View['pubkey']; window: Window; line: number[]; note: string } | null>> = {
  p2pk: {
    receive: { chain: '出力そのものに公開鍵', pubkey: 'visible', window: 'long', line: [2], note: 'P2PK は出力に公開鍵をそのまま書く。受け取った瞬間から、誰でもチェーンの上で公開鍵を読める' },
    hold: { chain: '出力そのものに公開鍵', pubkey: 'visible', window: 'long', line: [2], note: '保管している間ずっと公開鍵が見えている。量子計算機を持つ攻撃者は、何年かけて秘密鍵を計算してもよい（長期露出攻撃）' },
    mempool: { chain: '公開鍵 + 署名', pubkey: 'visible', window: 'short', line: [5], note: '使う取引を送ると、署名も出る。すでに公開鍵は見えていたので、状況は変わらない' },
    confirmed: { chain: '公開鍵 + 署名', pubkey: 'visible', window: 'none', line: [7], note: 'ブロックに入って確定した。この出力はもう使われたので、ここから盗めるものは無い' },
    leftover: null,
  },
  p2pkh: {
    receive: { chain: '公開鍵のハッシュ（20B）だけ', pubkey: 'hidden', window: 'none', line: [2], note: 'チェーンに載るのは公開鍵のハッシュだけ。ハッシュから公開鍵には戻せないので、Shor の出番が無い' },
    hold: { chain: '公開鍵のハッシュ（20B）だけ', pubkey: 'hidden', window: 'none', line: [2], note: '保管中も見えるのはハッシュだけ。ハッシュの逆算には Grover が使えるが、160 ビットでも 2^80 回ほどの評価を順に回す必要があり、Shor のような近道にはならない' },
    mempool: { chain: 'ハッシュ + 公開鍵 + 署名（未確定）', pubkey: 'visible', window: 'short', line: [5], note: '使うには公開鍵を出すしかない。取引がブロックに入るまで（ブロックは平均 10 分ごと）、公開鍵が見える。この間に秘密鍵を求めて別の取引を割り込ませるのが短期露出攻撃' },
    confirmed: { chain: 'ハッシュ + 公開鍵 + 署名', pubkey: 'visible', window: 'none', line: [7], note: '確定した。公開鍵はチェーンに残るが、その鍵で守っていた出力はもう無い' },
    leftover: null,
  },
  p2pkhReuse: {
    receive: { chain: 'ハッシュ H の出力が 2 つ', pubkey: 'hidden', window: 'none', line: [2, 3], note: '同じアドレスに 2 回受け取った。2 つの出力は同じ公開鍵で守られている' },
    hold: { chain: 'ハッシュ H の出力が 2 つ', pubkey: 'hidden', window: 'none', line: [2, 3], note: 'まだどちらも使っていないので、公開鍵は見えていない' },
    mempool: { chain: '出力 A を使う取引に公開鍵', pubkey: 'visible', window: 'short', line: [6], note: '出力 A を使うために公開鍵を出した。出力 A は短期露出の窓に入る' },
    confirmed: { chain: '公開鍵がチェーンに残る', pubkey: 'visible', window: 'long', line: [6], note: '出力 A は確定した。しかし同じ公開鍵で守られた出力 B がまだ残っている' },
    leftover: { chain: '出力 B（公開鍵は既知）', pubkey: 'visible', window: 'long', line: [8], note: 'アドレスを使い回すと、ハッシュで隠していた意味が消える。出力 B は、公開鍵が公開された状態で何年でも狙える（長期露出攻撃）' },
  },
  p2wpkh: {
    receive: { chain: '公開鍵のハッシュ（20B）だけ', pubkey: 'hidden', window: 'none', line: [2], note: 'SegWit の P2WPKH。ロックの書き方は短くなったが、載るのはやはり公開鍵のハッシュ' },
    hold: { chain: '公開鍵のハッシュ（20B）だけ', pubkey: 'hidden', window: 'none', line: [2], note: '保管中は P2PKH と同じく、公開鍵は見えない' },
    mempool: { chain: 'witness に公開鍵 + 署名（未確定）', pubkey: 'visible', window: 'short', line: [5], note: '使うときに witness へ公開鍵を出す。短期露出の窓が開く' },
    confirmed: { chain: 'witness に公開鍵 + 署名', pubkey: 'visible', window: 'none', line: [7], note: '確定。アドレスを使い回していなければ、この公開鍵で守られたものはもう無い' },
    leftover: null,
  },
  p2tr: {
    receive: { chain: '出力の公開鍵 Q（32B）', pubkey: 'visible', window: 'long', line: [2], note: 'Taproot の出力には、調整を加えた公開鍵 Q そのものが載る。アドレスの中身が公開鍵なので、受け取った瞬間から見えている' },
    hold: { chain: '出力の公開鍵 Q（32B）', pubkey: 'visible', window: 'long', line: [2], note: 'Q から秘密鍵 q = d + t を計算できれば、鍵の経路で使える。P2PK と同じく長期露出攻撃の対象になる' },
    mempool: { chain: 'Q + Schnorr 署名（未確定）', pubkey: 'visible', window: 'short', line: [5], note: '使う取引を送った。公開鍵はもともと見えていたので、状況は変わらない' },
    confirmed: { chain: 'Q + Schnorr 署名', pubkey: 'visible', window: 'none', line: [7], note: '確定。Taproot は署名が 64 バイトで小さく、スクリプトの木も隠せる。その代わり出力に公開鍵を置く設計になっている' },
    leftover: null,
  },
  p2mr: {
    receive: { chain: 'スクリプトの木の根（32B のハッシュ）', pubkey: 'hidden', window: 'none', line: [2], note: 'BIP-360 の提案。Taproot から鍵の経路を取り除き、木の根（ハッシュ）だけを載せる。公開鍵は載らない' },
    hold: { chain: 'スクリプトの木の根（32B のハッシュ）', pubkey: 'hidden', window: 'none', line: [2], note: '保管中は公開鍵が見えないので、長期露出攻撃を受けない' },
    mempool: { chain: '葉のスクリプト（公開鍵入り）+ 署名（未確定）', pubkey: 'visible', window: 'short', line: [5], note: '使うときは葉のスクリプトを明かすので、中の公開鍵が見える。BIP-360 自身が、短期露出攻撃には耐量子署名が要ると書いている' },
    confirmed: { chain: '葉のスクリプト + 署名', pubkey: 'visible', window: 'none', line: [7], note: '確定。葉のスクリプトの中身を耐量子署名に替えれば、短期露出の窓も閉じられる。その署名方式はまだ提案されていない' },
    leftover: null,
  },
}

function trace(kind: Kind): Frame<View>[] {
  const frames: Frame<View>[] = []
  for (const s of STAGES) {
    const t = TEXT[kind][s.id]
    if (!t) continue
    frames.push({
      line: t.line,
      note: t.note,
      vars: {
        段階: s.label,
        公開鍵: t.pubkey === 'visible' ? '見えている' : '見えていない',
        狙える攻撃: t.window === 'long' ? '長期露出' : t.window === 'short' ? '短期露出' : 'なし',
      },
      view: {
        stage: s.id,
        chain: t.chain,
        pubkey: t.pubkey,
        window: t.window,
        coinAtRisk: t.window === 'none' ? '' : t.window === 'long' ? '時間の制限なしに狙える' : '確定するまでの間だけ狙える',
      },
    })
  }
  frames[frames.length - 1]!.done = true
  return frames
}

const PRESETS: { name: string; value: Kind }[] = [
  { name: 'P2PK', value: 'p2pk' },
  { name: 'P2PKH', value: 'p2pkh' },
  { name: 'P2PKH を使い回す', value: 'p2pkhReuse' },
  { name: 'P2WPKH', value: 'p2wpkh' },
  { name: 'P2TR', value: 'p2tr' },
  { name: 'P2MR（提案）', value: 'p2mr' },
]

const WINDOW_STATE: Record<Window, CellState> = { none: 'good', short: 'window', long: 'bad' }

export default function BitcoinKeyExposure() {
  const [kind, setKind] = useState<Kind>('p2pkh')
  const frames = useMemo(() => trace(kind), [kind])

  return (
    <SimShell
      title="公開鍵はいつ見えるか"
      subtitle="出力の種類ごとに、受け取ってから使い終わるまでの各段階で、チェーンに何が載り、量子計算機を持つ攻撃者がどの窓で狙えるかを追う"
      code={CODE[kind]}
      frames={frames}
      controls={<PresetControl label="出力の種類" presets={PRESETS} onPick={setKind} />}
      legend={
        <>
          <LegendItem state="good">狙えない</LegendItem>
          <LegendItem state="window">短期露出（確定までの間）</LegendItem>
          <LegendItem state="bad">長期露出（時間の制限なし）</LegendItem>
        </>
      }
    >
      {(f) => {
        const visible = frames.map((x) => x.view.stage)
        const ws = cellStyle[WINDOW_STATE[f.view.window]]
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {STAGES.filter((s) => visible.includes(s.id)).map((s) => {
                const cur = s.id === f.view.stage
                const st = cellStyle[cur ? 'active' : 'idle']
                return (
                  <span
                    key={s.id}
                    className="rounded border px-2 py-1 text-[11px] font-bold"
                    style={{ background: st.background, borderColor: cur ? 'var(--accent)' : st.borderColor, color: st.color }}
                  >
                    {s.label}
                  </span>
                )
              })}
            </div>
            <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
              <p className="m-0 text-[11px] font-bold" style={{ color: 'var(--fg-muted)' }}>チェーンの上で誰でも読めるもの</p>
              <p className="m-0 font-mono text-sm" style={{ color: 'var(--fg)' }}>{f.view.chain}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span
                className="rounded border px-2 py-0.5"
                style={{
                  background: cellStyle[f.view.pubkey === 'visible' ? 'bad' : 'good'].background,
                  borderColor: cellStyle[f.view.pubkey === 'visible' ? 'bad' : 'good'].borderColor,
                  color: cellStyle[f.view.pubkey === 'visible' ? 'bad' : 'good'].color,
                }}
              >
                公開鍵: {f.view.pubkey === 'visible' ? '見えている' : '見えていない'}
              </span>
              <span className="rounded border px-2 py-0.5" style={{ background: ws.background, borderColor: ws.borderColor, color: ws.color }}>
                {f.view.window === 'none' ? '量子計算機で狙える窓: なし' : `量子計算機で狙える窓: ${f.view.coinAtRisk}`}
              </span>
            </div>
          </div>
        )
      }}
    </SimShell>
  )
}
