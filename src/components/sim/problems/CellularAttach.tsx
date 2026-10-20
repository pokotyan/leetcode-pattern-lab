import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

type Scenario = 'full' | 'fake' | 'gsm'
type Node = 'ue' | 'ran' | 'fake' | 'amf' | 'ausf' | 'udm' | 'smf' | 'upf' | 'smsf' | 'sc'
type Phase = '電源投入' | '登録と認証' | 'データの通り道' | 'SMS の着信'
type Outcome = 'running' | 'ok' | 'rejected' | 'hijacked'

type Msg = { from: Node; to: Node; label: string; phase: Phase }
type View = { log: Msg[]; nodes: Node[]; outcome: Outcome }
type Step = { msg?: Msg; line: number | number[]; note: string; outcome?: Outcome; state?: Partial<UeState> }
type UeState = { 登録: string; 識別子: string; 'IP アドレス': string; 鍵: string }

const NODE_NAME: Record<Node, string> = {
  ue: '端末（USIM）',
  ran: '基地局 gNB',
  fake: '偽の基地局',
  amf: 'AMF',
  ausf: 'AUSF',
  udm: 'UDM',
  smf: 'SMF',
  upf: 'UPF',
  smsf: 'SMSF',
  sc: 'SMSC',
}

const CODE: Record<Scenario, string> = {
  full: `def power_on(ue):
    cell = search_cell()                  # 同期信号で時刻と周波数を合わせる
    rrc = random_access(cell)             # 上りの送信枠をもらう
    send(Registration_Request(suci=conceal(ue.supi, HN_PUB)))

def on_authentication_request(rand, autn):
    ak = f5(K, rand)
    sqn = xor(autn.sqn_xor_ak, ak)
    if f1(K, sqn, rand, autn.amf) != autn.mac:
        return reject("MAC failure")      # 網が K を知らない
    if sqn <= ue.sqn_max:
        return reject("Synch failure")    # 古いベクタの再送
    ue.sqn_max = sqn
    send(Authentication_Response(res_star(K, rand, SN_NAME)))

def on_registration_accept(guti):
    ue.guti = guti                        # 以後は SUPI ではなくこの仮の名前で名乗る
    send(PDU_Session_Establishment_Request(dnn="internet"))

def on_paging():
    send(Service_Request(ue.guti))

def on_downlink_nas(sms):
    send(CP_ack()); send(Delivery_Report(sms))`,
  fake: `def power_on(ue):
    cell = search_cell()                  # 電波がいちばん強いセルを選ぶ
    rrc = random_access(cell)
    send(Registration_Request(suci=conceal(ue.supi, HN_PUB)))

def on_authentication_request(rand, autn):
    ak = f5(K, rand)
    sqn = xor(autn.sqn_xor_ak, ak)
    if f1(K, sqn, rand, autn.amf) != autn.mac:
        return reject("MAC failure")      # 網が K を知らない
    if sqn <= ue.sqn_max:
        return reject("Synch failure")
    send(Authentication_Response(res_star(K, rand, SN_NAME)))`,
  gsm: `def on_authentication_request(rand):
    sres = a3(Ki, rand)                   # 答えを計算して返すだけ
    kc = a8(Ki, rand)
    send(Authentication_Response(sres))
    # 網の側が Ki を知っているかは確かめない

def on_cipher_mode_command(algo):
    use_cipher(algo, kc)                  # 「暗号化なし」を指示されても従う`,
}

const P1: Phase = '電源投入'
const P2: Phase = '登録と認証'
const P3: Phase = 'データの通り道'
const P4: Phase = 'SMS の着信'

const STEPS: Record<Scenario, Step[]> = {
  full: [
    { line: 2, note: '電源を入れた端末は、まず周りのセルの同期信号を探し、時刻と周波数を合わせてセルの番号を知る。報知情報からそのセルがどの事業者の網かを読む' },
    { msg: { from: 'ue', to: 'ran', label: 'ランダムアクセス（プリアンブル）', phase: P1 }, line: 3, note: '端末はまだ送信してよい時刻も枠も持っていない。決められた信号を送って基地局に気づいてもらい、上りの枠と送信のタイミングの補正をもらう' },
    { msg: { from: 'ue', to: 'amf', label: 'Registration Request（SUCI）', phase: P2 }, line: 4, note: '基地局を通り越して、コアの AMF に登録を頼む。名乗る識別子は、加入者番号（SUPI）をホームの網の公開鍵で暗号化した SUCI。電波を盗聴しても番号は読めない' },
    { msg: { from: 'amf', to: 'ausf', label: 'Nausf_UEAuthentication_Authenticate（SUCI, 網の名前）', phase: P2 }, line: 4, note: 'AMF は自分では認証の材料を持たない。認証を担う AUSF に、SUCI と自分の網の名前を渡す' },
    { msg: { from: 'ausf', to: 'udm', label: 'Nudm_UEAuthentication_Get（SUCI）', phase: P2 }, line: 4, note: 'UDM は加入者の鍵 K を持つホームの網の機能。SUCI を秘密鍵で復号して SUPI に戻し、K と順序番号 SQN から RAND・AUTN・期待する応答を作る' },
    { msg: { from: 'udm', to: 'ausf', label: '認証ベクタ（RAND, AUTN, XRES*, KAUSF）', phase: P2 }, line: [7, 8], note: 'AUTN には、K を知る者にしか作れない MAC と、隠した SQN が入っている' },
    { msg: { from: 'ausf', to: 'amf', label: 'RAND, AUTN, HXRES*', phase: P2 }, line: [7, 8], note: '訪問先の網（AMF）に渡すのは、期待する応答そのものではなくそのハッシュ。応答の最終確認はホームの AUSF が行う' },
    { msg: { from: 'amf', to: 'ue', label: 'Authentication Request（RAND, AUTN）', phase: P2 }, line: 6, note: '端末に挑戦を送る' },
    { line: [7, 8, 9, 11, 13], note: 'USIM は K で MAC を計算し直して AUTN の MAC と比べる。一致すれば、相手は K を知る網、つまり本物。SQN が前回より新しいことも確かめる', state: { 鍵: 'CK と IK（RAND から導出）' } },
    { msg: { from: 'ue', to: 'amf', label: 'Authentication Response（RES*）', phase: P2 }, line: 14, note: '今度は端末が K を知っていることを示す番。RES* は網の名前も混ぜて作るので、別の網の名を騙った相手には使い回せない' },
    { msg: { from: 'amf', to: 'ausf', label: 'RES*', phase: P2 }, line: 14, note: 'AMF は RES* のハッシュを HXRES* と比べたうえで AUSF へ送り、AUSF が XRES* と比べて成功を確定し、SUPI を AMF に教える' },
    { msg: { from: 'amf', to: 'ue', label: 'Security Mode Command', phase: P2 }, line: 14, note: 'ここから先の NAS メッセージは、認証で揃った鍵から作った鍵で暗号化と完全性保護をかける' },
    { msg: { from: 'amf', to: 'ue', label: 'Registration Accept（5G-GUTI）', phase: P2 }, line: [16, 17], note: '登録完了。以後の端末は、毎回 SUPI を名乗る代わりに、AMF が振った仮の名前 5G-GUTI を使う', state: { 登録: '登録済み', 識別子: '5G-GUTI' } },
    { msg: { from: 'ue', to: 'amf', label: 'PDU Session Establishment Request（DNN=internet）', phase: P3 }, line: 18, note: '登録しただけではまだ通信できない。データ網（DNN）を指定して、通り道を作ってもらう' },
    { msg: { from: 'amf', to: 'smf', label: 'Nsmf_PDUSession_CreateSMContext', phase: P3 }, line: 18, note: 'AMF はセッションの管理を SMF に任せる' },
    { msg: { from: 'smf', to: 'upf', label: 'N4 Session Establishment（転送の規則）', phase: P3 }, line: 18, note: 'SMF は利用者のパケットを実際に運ぶ UPF に、トンネルの識別子（TEID）と転送の規則を設定し、端末の IP アドレスを決める' },
    { msg: { from: 'smf', to: 'ue', label: 'PDU Session Establishment Accept（IP アドレス）', phase: P3 }, line: 18, note: '受け入れの返事は AMF と基地局を経て端末に届く。端末は IP アドレスを受け取る', state: { 'IP アドレス': '10.x.x.x（事業者の内部用）' } },
    { msg: { from: 'ran', to: 'upf', label: 'GTP-U（UDP 2152）で利用者の IP パケットを包む', phase: P3 }, line: 18, note: '端末の IP パケットは、基地局と UPF のあいだを GTP-U のトンネルで運ばれる。インターネットから見た出口は UPF で、多くの場合その先に CGNAT がある' },
    { msg: { from: 'sc', to: 'udm', label: 'Send Routing Info for SM', phase: P4 }, line: 20, note: 'SMS は SMSC（3GPP の文書では SC）がいったん預かる。SMSC は宛先の加入者がいまどの SMSF の配下にいるかを UDM に問い合わせる' },
    { msg: { from: 'sc', to: 'smsf', label: 'Forward MT SM', phase: P4 }, line: 20, note: '教えられた SMSF に本文を渡す' },
    { msg: { from: 'smsf', to: 'amf', label: 'Namf_MT_EnableUEReachability', phase: P4 }, line: 20, note: '端末が通信していない（アイドル）なら、AMF が呼び出す' },
    { msg: { from: 'amf', to: 'ue', label: 'Paging', phase: P4 }, line: [20, 21], note: '端末がいそうな範囲のセルで一斉に名前を呼ぶ' },
    { msg: { from: 'ue', to: 'amf', label: 'Service Request（5G-GUTI）', phase: P4 }, line: 21, note: '端末が応答して、NAS の接続を戻す' },
    { msg: { from: 'amf', to: 'ue', label: 'Downlink NAS Transport（SMS 本文）', phase: P4 }, line: 23, note: 'SMS の本文は、データのセッションではなく、登録と同じ制御用の NAS メッセージに載って届く' },
    { msg: { from: 'ue', to: 'smsf', label: 'CP-ACK と Delivery Report', phase: P4 }, line: 24, note: '端末は受け取ったことを SMSF に返し、SMSF が SMSC へ配達の報告を返す', outcome: 'ok' },
  ],
  fake: [
    { line: 2, note: '偽の基地局は、本物の事業者と同じ網の番号を報知し、本物より強い電波を出す。端末はふつう強いセルを選ぶ' },
    { msg: { from: 'ue', to: 'fake', label: 'ランダムアクセス', phase: P1 }, line: 3, note: '端末は偽の基地局に接続してしまう。ここまでに端末が基地局を確かめる手段はない' },
    { msg: { from: 'ue', to: 'fake', label: 'Registration Request（SUCI）', phase: P2 }, line: 4, note: '端末が名乗るのは暗号化された SUCI なので、偽の基地局は加入者番号を読めない。ホームの網の秘密鍵は UDM にしかない' },
    { msg: { from: 'fake', to: 'ue', label: 'Authentication Request（でたらめな RAND, AUTN）', phase: P2 }, line: 6, note: '偽の基地局は K を知らないので、正しい AUTN を作れない。本物の網から盗聴した古い RAND と AUTN を再送する手もある' },
    { line: [7, 8, 9, 10], note: 'でたらめな AUTN なら、USIM が計算した MAC と一致しない。古い組の再送なら MAC は合うが、SQN が前回より新しくないので拒否される', outcome: 'rejected' },
  ],
  gsm: [
    { line: 1, note: '2G（GSM）の認証は、網が端末を確かめるだけの片方向。網が端末に渡すのは乱数 RAND だけ' },
    { msg: { from: 'ue', to: 'fake', label: '位置登録（IMSI を平文で名乗ることもある）', phase: P1 }, line: 1, note: '偽の基地局に接続し、求められれば加入者番号 IMSI をそのまま送る' },
    { msg: { from: 'fake', to: 'ue', label: 'Authentication Request（RAND）', phase: P2 }, line: 1, note: '偽の基地局は好きな RAND を送れる。正しさを示す必要がない' },
    { msg: { from: 'ue', to: 'fake', label: 'Authentication Response（SRES）', phase: P2 }, line: [2, 4], note: '端末は答えを返す。偽の基地局は答えを確かめる必要がないので、そのまま次へ進める' },
    { msg: { from: 'fake', to: 'ue', label: 'Cipher Mode Command（暗号化なし）', phase: P2 }, line: [7, 8], note: '網が暗号化の方式を指示し、端末は従う。暗号化なしを選べば、以後の通話や SMS は平文で流れる', outcome: 'hijacked' },
  ],
}

const NODES: Record<Scenario, Node[]> = {
  full: ['ue', 'ran', 'amf', 'ausf', 'udm', 'smf', 'upf', 'smsf', 'sc'],
  fake: ['ue', 'fake', 'amf', 'ausf', 'udm'],
  gsm: ['ue', 'fake'],
}

const INITIAL: UeState = { 登録: '未登録', 識別子: 'SUPI（USIM の中だけ）', 'IP アドレス': 'なし', 鍵: 'K（USIM の中だけ）' }

function trace(s: Scenario): Frame<View>[] {
  const log: Msg[] = []
  const ue: UeState = { ...INITIAL }
  if (s === 'gsm') ue.識別子 = 'IMSI'
  const frames: Frame<View>[] = [
    {
      line: 1,
      note: s === 'full' ? '端末の電源を入れたところから、SMS を 1 通受け取るまでを追う' : s === 'fake' ? '本物より強い電波を出す偽の基地局が近くにある' : '同じ偽の基地局を、2G の認証の仕組みで相手にする',
      vars: { ...ue },
      view: { log: [], nodes: NODES[s], outcome: 'running' },
    },
  ]
  for (const st of STEPS[s]) {
    if (st.msg) log.push(st.msg)
    if (st.state) Object.assign(ue, st.state)
    const outcome = st.outcome ?? 'running'
    frames.push({
      line: st.line,
      note: st.note,
      vars: { ...ue },
      view: { log: [...log], nodes: NODES[s], outcome },
      done: outcome !== 'running',
    })
  }
  return frames
}

const PRESETS: { name: string; value: Scenario }[] = [
  { name: '5G：電源投入から SMS 受信まで', value: 'full' },
  { name: '5G：偽の基地局', value: 'fake' },
  { name: '2G：偽の基地局', value: 'gsm' },
]

const OUTCOME: Record<Exclude<Outcome, 'running'>, { label: string; state: CellState }> = {
  ok: { label: 'SMS を受け取った', state: 'good' },
  rejected: { label: '端末が認証を拒否し、偽の基地局から離れた', state: 'good' },
  hijacked: { label: '偽の基地局が通信を握った', state: 'bad' },
}

function nodeState(n: Node, last: Msg | undefined): CellState {
  if (!last) return 'idle'
  if (n === last.from || n === last.to) return 'window'
  return 'dim'
}

export default function CellularAttach() {
  const [s, setS] = useState<Scenario>('full')
  const frames = useMemo(() => trace(s), [s])
  return (
    <SimShell
      title="携帯網に入って SMS を受け取る"
      subtitle="端末・基地局・5G のコアの機能・SMSC のあいだを流れるメッセージを 1 通ずつ追う"
      code={CODE[s]}
      frames={frames}
      controls={<PresetControl label="場面" presets={PRESETS} onPick={setS} />}
      legend={
        <>
          <LegendItem state="window">いまやりとりしている機能</LegendItem>
          <LegendItem state="good">成功 / 攻撃を防いだ</LegendItem>
          <LegendItem state="bad">攻撃が通った</LegendItem>
        </>
      }
    >
      {(f) => {
        const last = f.view.log[f.view.log.length - 1]
        const shown = f.view.log.slice(-8)
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {f.view.nodes.map((n) => {
                const cs = cellStyle[nodeState(n, last)]
                return (
                  <span
                    key={n}
                    className="rounded border px-2 py-0.5 font-mono text-[11px]"
                    style={{
                      background: cs.background,
                      color: cs.color,
                      borderColor: n === 'fake' ? 'var(--danger)' : cs.borderColor,
                    }}
                  >
                    {NODE_NAME[n]}
                  </span>
                )
              })}
            </div>
            <ol className="m-0 list-none space-y-1 p-0">
              {shown.length === 0 && (
                <li className="font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
                  （まだ何も送られていない）
                </li>
              )}
              {shown.map((m, i) => {
                const cs = cellStyle[i === shown.length - 1 ? 'window' : 'idle']
                return (
                  <li
                    key={f.view.log.length - shown.length + i}
                    className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,6.5rem)_auto_minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-2 rounded border px-2 py-1 font-mono text-[11px]"
                    style={{ background: cs.background, borderColor: cs.borderColor, color: cs.color }}
                  >
                    <span className="truncate" style={{ color: 'var(--fg-muted)' }}>{m.phase}</span>
                    <span className="truncate">{NODE_NAME[m.from]}</span>
                    <span aria-hidden>→</span>
                    <span className="truncate">{NODE_NAME[m.to]}</span>
                    <span className="truncate" style={{ color: 'var(--fg)' }}>{m.label}</span>
                  </li>
                )
              })}
            </ol>
            {f.view.outcome !== 'running' && (
              <p
                className="m-0 inline-block rounded border px-2 py-0.5 font-mono text-[11px]"
                style={{
                  background: cellStyle[OUTCOME[f.view.outcome].state].background,
                  color: cellStyle[OUTCOME[f.view.outcome].state].color,
                  borderColor: cellStyle[OUTCOME[f.view.outcome].state].borderColor,
                }}
              >
                {OUTCOME[f.view.outcome].label}
              </p>
            )}
          </div>
        )
      }}
    </SimShell>
  )
}
