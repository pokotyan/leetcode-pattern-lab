import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

type Scenario = 'contacts' | 'stranger' | 'everyone' | 'quickshare'
type Side = 'send' | 'recv'
type Outcome = 'running' | 'contact' | 'other' | 'silent'

type Step = {
  from: Side
  medium: string
  label: string
  /** 近くにいる第三者（または受信側を装う者）がこの段で得られるもの */
  exposed?: string
  line: number | number[]
  note: string
  outcome?: Outcome
}
type View = { log: Step[]; outcome: Outcome }

const AIRDROP_CODE = `# 送信側: 共有シートを開いたとき
def open_share_sheet(me):
    ble.advertise([sha256(i)[:2] for i in me.ids])
    awdl0.up()
    for svc in mdns.browse("_airdrop._tcp", iface="awdl0"):
        tls = connect(svc, cert=me.cert)
        r = tls.post("/Discover", me.validation_record)
        show(r.validation_record or svc.device_name)

def send(tls, file):
    if tls.post("/Ask", thumbnail(file)).accepted:
        tls.post("/Upload", file)

# 受信側
def on_ble(adv, mode):
    if mode == "everyone" or matches(adv, my_contacts):
        awdl0.up()
        mdns.announce("_airdrop._tcp")

def on_discover(sender_vr):
    if verify(sender_vr) and matches(sender_vr, my_contacts):
        return ok(my.validation_record)
    return ok()

def on_ask(meta):
    return ask_user(meta)`

const QUICKSHARE_CODE = `# 送信側
def send(file):
    ep = nearby.discover("NearbySharing", P2P_POINT_TO_POINT)
    conn = nearby.request_connection(ep)
    key, token = ukey2(conn)           # ClientInit / ServerInit / ClientFinished
    show(four_digits(token))
    paired_key_verification(conn, sign(token))
    conn.upgrade(["WIFI_DIRECT", "WIFI_HOTSPOT", "WIFI_LAN"])
    if conn.send(introduction(file)).accepted:
        conn.send_payload(file)

# 受信側
def on_connection(conn):
    key, token = ukey2(conn)
    show(four_digits(token))
    paired_key_verification(conn, sign(token))
    return ask_user(conn.introduction)`

const STEPS: Record<Scenario, Step[]> = {
  contacts: [
    { from: 'send', medium: 'BLE 2.4 GHz', label: 'advertising: 識別子ごとの SHA-256 の先頭 2 バイト', exposed: '送信者の電話番号・メールの短いハッシュ', line: [2, 3], note: '共有シートを開くと、送信側は BLE で短いハッシュを撒き始める。暗号化されていないので、近くの誰でも受け取れる' },
    { from: 'recv', medium: '端末の中', label: '連絡先の短いハッシュと照合 → 一致', line: [15, 16], note: '受信側は定期的に BLE を聞いている。連絡先の誰かの短いハッシュと一致したので、Wi-Fi の直接リンクを起こす。2 バイトなので偶然の一致もありうるが、ここは「起こすかどうか」の判定にすぎない' },
    { from: 'recv', medium: 'AWDL（ch 6 / 44 / 149）', label: 'awdl0 を起動、同期の action frame を送る', exposed: 'ランダム化された MAC アドレス', line: [17], note: 'アクセスポイントを介さない直接リンク。決まったチャネルで同期をとり、16 TU ごとの窓で同じチャネルにいる時間を合わせる' },
    { from: 'recv', medium: 'AWDL 上の mDNS', label: '_airdrop._tcp を告知', exposed: 'サービスがあること、端末の名前', line: [18], note: 'DNS-SD のサービスを AWDL に載せる。送信側はこれを browse で見つける' },
    { from: 'send', medium: 'AWDL 上の TLS', label: 'TLS 接続（双方が証明書を出す）', line: [5, 6], note: '見つけたサービスごとに TLS をつなぐ。以後の中身は暗号化され、傍受するだけの第三者には読めない' },
    { from: 'send', medium: 'AWDL 上の HTTPS', label: 'POST /Discover（送信者の検証用レコード）', exposed: '受信側を装った者には、送信者の全識別子の SHA-256', line: [7], note: '送信者は Apple が署名した検証用レコード（識別子ごとの完全な SHA-256 を含む）を、見つかった相手すべてに送る。受信側を装えば、知り合いでなくてもこれを受け取れる' },
    { from: 'recv', medium: 'AWDL 上の HTTPS', label: '200 OK（受信者の検証用レコード）', line: [20, 21, 22], note: '受信側は署名を検証し、ハッシュが連絡先の誰かと一致したので、自分の検証用レコードを返す' },
    { from: 'send', medium: '端末の中', label: '連絡先の名前と写真で表示', line: [8], note: '送信側も受信者のレコードを連絡先と照合できたので、名前と写真で並べる', outcome: 'contact' },
    { from: 'send', medium: 'AWDL 上の HTTPS', label: 'POST /Ask（サムネイル） → 承諾 → POST /Upload', line: [10, 11, 12, 25, 26], note: '受信者が承諾すると本体を送る。速度は普通の Wi-Fi 接続と同じく、両端末の Wi-Fi の性能で決まる', outcome: 'contact' },
  ],
  stranger: [
    { from: 'send', medium: 'BLE 2.4 GHz', label: 'advertising: 識別子ごとの SHA-256 の先頭 2 バイト', exposed: '送信者の電話番号・メールの短いハッシュ', line: [2, 3], note: '同じように短いハッシュを撒く' },
    { from: 'recv', medium: '端末の中', label: '連絡先の短いハッシュと照合 → 一致なし', line: [15, 16], note: '受信側は「連絡先のみ」で、送信者を連絡先に入れていない。どれとも一致しない' },
    { from: 'recv', medium: '（何も送らない）', label: 'awdl0 を起こさない', line: [15], note: '受信側は応答しない。送信側の画面にはそもそも現れない。電池を減らさないための判定でもある', outcome: 'silent' },
  ],
  everyone: [
    { from: 'send', medium: 'BLE 2.4 GHz', label: 'advertising: 識別子ごとの SHA-256 の先頭 2 バイト', exposed: '送信者の電話番号・メールの短いハッシュ', line: [2, 3], note: '同じように短いハッシュを撒く' },
    { from: 'recv', medium: '端末の中', label: 'mode == "everyone" なので照合せずに起動', line: [15, 16], note: '「すべての人（10 分間のみ）」では、一致しなくても応答する。10 分たつと「連絡先のみ」に戻る' },
    { from: 'recv', medium: 'AWDL（ch 6 / 44 / 149）', label: 'awdl0 を起動', exposed: 'ランダム化された MAC アドレス', line: [17], note: '直接リンクを起こす' },
    { from: 'recv', medium: 'AWDL 上の mDNS', label: '_airdrop._tcp を告知', exposed: 'サービスがあること、端末の名前', line: [18], note: 'サービスを告知する。ここで端末の名前が近くの誰にでも見える' },
    { from: 'send', medium: 'AWDL 上の TLS / HTTPS', label: 'TLS 接続 → POST /Discover（送信者の検証用レコード）', exposed: '受信側を装った者には、送信者の全識別子の SHA-256', line: [5, 6, 7], note: '送信側の振る舞いは同じ。相手が知り合いかどうかに関係なく、検証用レコードを送る' },
    { from: 'recv', medium: 'AWDL 上の HTTPS', label: '200 OK（レコードなし）', line: [20, 23], note: '受信側の連絡先に送信者がいないので、自分の識別子は返さない' },
    { from: 'send', medium: '端末の中', label: '「その他の人」に、シルエットと端末名で表示', line: [8], note: '名前と写真の代わりに、受信側が設定した端末名が出る。目の前の相手と端末名を口頭で確かめるのが、ここでの本人確認になる', outcome: 'other' },
  ],
  quickshare: [
    { from: 'recv', medium: 'BLE 2.4 GHz', label: '受信可能であることを advertising', exposed: '近くに Quick Share の受信者がいること', line: [3], note: 'Quick Share は Nearby Connections の上に作られている。サービス ID は NearbySharing、戦略は 1 対 1 の P2P_POINT_TO_POINT' },
    { from: 'send', medium: 'Bluetooth など低速の経路', label: '接続要求', line: [4, 13], note: '最初は低速でも確実な経路でつなぐ' },
    { from: 'send', medium: '同じ経路', label: 'UKEY2: ClientInit → ServerInit → ClientFinished', line: [5, 14], note: 'P-256 の ECDH による鍵交換。ClientInit には ClientFinished のハッシュ（コミットメント）を入れ、後から鍵を差し替えられないようにする' },
    { from: 'recv', medium: '両方の画面', label: '同じ 4 桁の数字を表示', line: [6, 15], note: '鍵交換から得た認証用のトークンを 4 桁に縮めて両方に出す。中間者が割り込むと、両端の数字が一致しなくなる' },
    { from: 'send', medium: '暗号化された接続', label: 'トークンへの署名を交換（連絡先かどうかの確認）', line: [7, 16], note: '事前に配られた証明書でトークンに署名し合い、相手が連絡先の人かどうかを確かめる。確かめられなくても、相手は「連絡先以外」として扱われるだけ' },
    { from: 'send', medium: 'Wi-Fi Direct / ホットスポット / 同じ LAN', label: '帯域の引き上げ（UPGRADE_PATH_AVAILABLE → SAFE_TO_CLOSE_PRIOR_CHANNEL）', line: [8], note: '速い経路の情報を古い経路で渡し、新しい経路に移ってから古い経路を閉じる' },
    { from: 'send', medium: 'Wi-Fi', label: 'ファイルの紹介 → 承諾 → 本体', line: [9, 10, 17], note: '受信者が承諾すると本体を送る', outcome: 'contact' },
  ],
}

const OUTCOME: Record<Outcome, { label: string; state: CellState }> = {
  running: { label: '進行中', state: 'idle' },
  contact: { label: '相手を確かめたうえで送れた', state: 'good' },
  other: { label: '送れるが、相手の確認は端末名だけ', state: 'window' },
  silent: { label: '受信側が応答せず、相手として現れない', state: 'dim' },
}

const SIDE_NAME: Record<Side, string> = { send: '送信側', recv: '受信側' }

function trace(s: Scenario): Frame<View>[] {
  const log: Step[] = []
  const frames: Frame<View>[] = [
    {
      line: s === 'quickshare' ? 2 : [1, 2],
      note:
        s === 'quickshare'
          ? '受信側は Quick Share の受信画面を開いている。送信側が共有先を探し始める'
          : '受信側は画面がついていて AirDrop が有効。送信側が共有シートを開く',
      view: { log: [], outcome: 'running' },
    },
  ]
  for (const st of STEPS[s]) {
    log.push(st)
    const outcome = st.outcome ?? 'running'
    frames.push({
      line: st.line,
      note: st.note,
      vars: { 段: log.length, 経路: st.medium, 結果: OUTCOME[outcome].label },
      view: { log: [...log], outcome },
      done: outcome !== 'running' && st === STEPS[s][STEPS[s].length - 1],
    })
  }
  return frames
}

const PRESETS: { name: string; value: Scenario }[] = [
  { name: 'AirDrop: 連絡先の相手', value: 'contacts' },
  { name: 'AirDrop: 連絡先にない相手（連絡先のみ）', value: 'stranger' },
  { name: 'AirDrop: すべての人（10 分間のみ）', value: 'everyone' },
  { name: 'Quick Share', value: 'quickshare' },
]

export default function AirdropFlow() {
  const [s, setS] = useState<Scenario>('contacts')
  const frames = useMemo(() => trace(s), [s])
  return (
    <SimShell
      title="近くの端末へ送るまで"
      subtitle="見つける（BLE）→ 直接つなぐ（Wi-Fi）→ 守って送る（TLS / UKEY2）の各段で、どの電波を使い、近くの第三者に何が見えるか"
      code={s === 'quickshare' ? QUICKSHARE_CODE : AIRDROP_CODE}
      frames={frames}
      controls={<PresetControl label="場面" presets={PRESETS} onPick={setS} />}
      legend={
        <>
          <LegendItem state="window">いまの段</LegendItem>
          <LegendItem state="bad">近くの第三者に見えるもの</LegendItem>
          <LegendItem state="good">相手を確かめて送れた</LegendItem>
        </>
      }
    >
      {(f) => {
        const o = OUTCOME[f.view.outcome]
        const os = cellStyle[o.state]
        return (
          <div className="space-y-2">
            <ol className="m-0 list-none space-y-1 p-0">
              {f.view.log.length === 0 && (
                <li className="font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
                  （まだ何も送られていない）
                </li>
              )}
              {f.view.log.map((st, i) => {
                const cs = cellStyle[i === f.view.log.length - 1 ? 'window' : 'idle']
                const bad = cellStyle.bad
                return (
                  <li
                    key={i}
                    className="rounded border px-2 py-1 font-mono text-[11px]"
                    style={{ background: cs.background, borderColor: cs.borderColor, color: cs.color }}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span style={{ color: 'var(--fg-muted)' }}>{SIDE_NAME[st.from]}</span>
                      <span style={{ color: 'var(--accent)' }}>[{st.medium}]</span>
                      <span>{st.label}</span>
                    </div>
                    {st.exposed && (
                      <span
                        className="mt-1 inline-block rounded border px-1.5"
                        style={{ background: bad.background, color: bad.color, borderColor: bad.borderColor }}
                      >
                        見える: {st.exposed}
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
            <p
              className="m-0 inline-block rounded border px-2 py-0.5 font-mono text-[11px]"
              style={{ background: os.background, color: os.color, borderColor: os.borderColor }}
            >
              {o.label}
            </p>
          </div>
        )
      }}
    </SimShell>
  )
}
