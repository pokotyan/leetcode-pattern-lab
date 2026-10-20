import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

type Scenario = 'sms' | 'push' | 'pushNumber' | 'fatigue' | 'webauthn'
type Actor = 'user' | 'fake' | 'real' | 'carrier'
type Outcome = 'running' | 'stolen' | 'blocked'

type Msg = { from: Actor; to: Actor; label: string }
type View = { log: Msg[]; outcome: Outcome; actors: Actor[] }

const ACTOR_NAME: Record<Actor, string> = {
  user: '利用者（ブラウザと電話）',
  fake: '偽サイト bank-login.example',
  real: '本物のサイト bank.example',
  carrier: '携帯網 / プッシュ基盤',
}

const CODE: Record<Scenario, string> = {
  sms: `def login(user, password):
    check_password(user, password)
    code = random_digits(6)
    send_sms(user.phone, code)        # 携帯網に渡す
    return pending(tx)

def finish(tx, entered):
    if entered != tx.code:
        return fail()
    return issue_session()            # この Cookie を受け取った者がログイン済み`,
  push: `def login(user, password):
    check_password(user, password)
    send_push(user.device, "承認しますか")
    return pending(tx)

def on_push_answer(tx, approved):
    tx.approved = approved

def finish(tx):
    if not tx.approved:
        return waiting()
    return issue_session()`,
  pushNumber: `def login(user, password):
    check_password(user, password)
    tx.number = random_digits(2)
    send_push(user.device, "画面の数字を入力")
    return pending(tx, show=tx.number)   # ログインを始めた画面に出す

def on_push_answer(tx, number):
    tx.approved = (number == tx.number)

def finish(tx):
    if not tx.approved:
        return waiting()
    return issue_session()`,
  fatigue: `def login(user, password):
    check_password(user, password)
    if user.pushes_since_success >= LIMIT:
        return refuse()                 # 上限を設けないと、何十回でも送れる
    user.pushes_since_success += 1
    send_push(user.device, "承認しますか")
    return pending(tx)

def on_push_answer(tx, approved):
    tx.approved = approved

def finish(tx):
    if not tx.approved:
        return waiting()
    return issue_session()`,
  webauthn: `def login(user, password):
    check_password(user, password)
    tx.challenge = random_bytes(16)
    return pending(tx, challenge=tx.challenge, rpId="bank.example")

# ブラウザの側
def get(page_origin, rpId, challenge):
    if not origin_may_claim(page_origin, rpId):
        raise SecurityError              # ページのオリジンが rpId を名乗れない
    client_data = {challenge, origin: page_origin}
    return authenticator.sign(rpId, client_data)

def finish(tx, client_data, sig):
    assert client_data.origin == "https://bank.example"
    verify(user.public_key, sig)
    return issue_session()`,
}

type Step = { msg?: Msg; line: number | number[]; note: string; outcome?: Outcome }

const STEPS: Record<Scenario, Step[]> = {
  sms: [
    { msg: { from: 'user', to: 'fake', label: 'ID とパスワード' }, line: 1, note: '利用者は本物だと思って偽サイトにパスワードを入れる' },
    { msg: { from: 'fake', to: 'real', label: 'ID とパスワード（そのまま転送）' }, line: [1, 2], note: '偽サイトは受け取ったものをそのまま本物へ送る。本物から見れば正しいパスワードが届いただけ' },
    { msg: { from: 'real', to: 'carrier', label: 'SMS「確認コード 287979」' }, line: [3, 4], note: '本物のサイトは登録された電話番号へコードを送る' },
    { msg: { from: 'carrier', to: 'user', label: 'SMS「確認コード 287979」' }, line: 4, note: 'コードは本物の利用者の電話に届く。ここまでは正常' },
    { msg: { from: 'user', to: 'fake', label: '287979' }, line: 7, note: '利用者は、いま開いている画面（偽サイト）にコードを打ち込む。コードはどのサイトに入力されたかを知らない' },
    { msg: { from: 'fake', to: 'real', label: '287979（そのまま転送）' }, line: [7, 8], note: '30 秒もかからず本物へ届く。コードは正しい' },
    { msg: { from: 'real', to: 'fake', label: 'Set-Cookie: sid=...' }, line: 10, note: '本物のサイトはログインを完了させ、セッション Cookie を「リクエストしてきた相手」に渡す。それは偽サイト', outcome: 'stolen' },
  ],
  push: [
    { msg: { from: 'user', to: 'fake', label: 'ID とパスワード' }, line: 1, note: '利用者は偽サイトにパスワードを入れる' },
    { msg: { from: 'fake', to: 'real', label: 'ID とパスワード（そのまま転送）' }, line: [1, 2], note: '偽サイトがそのまま本物へ送る' },
    { msg: { from: 'real', to: 'carrier', label: 'プッシュ「承認しますか」' }, line: 3, note: '本物のサイトが、登録済みの端末に承認の通知を送る' },
    { msg: { from: 'carrier', to: 'user', label: 'プッシュ「承認しますか」' }, line: 3, note: '利用者はちょうど自分でログインしようとしているので、自分の操作だと思う' },
    { msg: { from: 'user', to: 'real', label: '承認' }, line: [6, 7], note: '承認はアプリから本物のサイトへ直接届く。何を承認したのか、どの画面のログインなのかは通知に含まれていない' },
    { msg: { from: 'fake', to: 'real', label: '終わった？' }, line: [9, 10], note: '偽サイトが完了を問い合わせる' },
    { msg: { from: 'real', to: 'fake', label: 'Set-Cookie: sid=...' }, line: 12, note: 'ログインを始めたのは偽サイトなので、セッションも偽サイトに渡る', outcome: 'stolen' },
  ],
  pushNumber: [
    { msg: { from: 'user', to: 'fake', label: 'ID とパスワード' }, line: 1, note: '利用者は偽サイトにパスワードを入れる' },
    { msg: { from: 'fake', to: 'real', label: 'ID とパスワード（そのまま転送）' }, line: [1, 2], note: '偽サイトがそのまま本物へ送る' },
    { msg: { from: 'real', to: 'fake', label: '画面に「22」を表示して' }, line: [3, 5], note: '番号照合では、ログインを始めた画面に数字を出す。その画面は偽サイト' },
    { msg: { from: 'fake', to: 'user', label: '「22」と表示（そのまま中継）' }, line: 5, note: '偽サイトは受け取った数字をそのまま利用者に見せる' },
    { msg: { from: 'real', to: 'carrier', label: 'プッシュ「画面の数字を入力」' }, line: 4, note: '通知には接続元の地域を添えられる。ここに偽サイトのサーバの場所が出る' },
    { msg: { from: 'carrier', to: 'user', label: '「画面の数字を入力」接続元: 203.0.113.50' }, line: 4, note: '利用者が接続元の違いに気づけば止まる。気づかなければ先へ進む' },
    { msg: { from: 'user', to: 'real', label: '22' }, line: [7, 8], note: '画面に出ていた数字なので一致する。番号照合は「画面を見ている人」と「電話を持つ人」が同じであることを確かめるが、画面が偽物かどうかは確かめない' },
    { msg: { from: 'fake', to: 'real', label: '終わった？' }, line: [10, 11], note: '偽サイトが完了を問い合わせる' },
    { msg: { from: 'real', to: 'fake', label: 'Set-Cookie: sid=...' }, line: 13, note: '中継型のフィッシングは、番号照合でも止まらない', outcome: 'stolen' },
  ],
  fatigue: [
    { msg: { from: 'fake', to: 'real', label: 'ID とパスワード（漏洩したもの）' }, line: [1, 2], note: '攻撃者は別の経路でパスワードを手に入れている。利用者は何もしていない' },
    { msg: { from: 'real', to: 'user', label: 'プッシュ「承認しますか」 1 回目' }, line: [5, 6], note: '身に覚えがないので、利用者は拒否する' },
    { msg: { from: 'fake', to: 'real', label: 'ログインし直す（2〜4 回目）' }, line: [3, 5], note: '攻撃者は何度でもログインをやり直せる' },
    { msg: { from: 'real', to: 'user', label: 'プッシュ 5 回目' }, line: [5, 6], note: '夜中に通知が鳴り続ける' },
    { msg: { from: 'fake', to: 'real', label: 'ログインし直す（6 回目）' }, line: [3, 4], note: '送信回数の上限（LIMIT = 5）があれば、ここで送らない。上限がなければ通知は続く' },
    { msg: { from: 'real', to: 'user', label: 'プッシュ 6 回目、7 回目' }, line: [5, 6], note: '上限のないサーバでは送り続ける' },
    { msg: { from: 'user', to: 'real', label: '承認（止めたくて）' }, line: [10, 15], note: '承認だけの通知では、うるさいから押した 1 回で通ってしまう', outcome: 'stolen' },
  ],
  webauthn: [
    { msg: { from: 'user', to: 'fake', label: 'ID とパスワード' }, line: 1, note: '利用者は偽サイトにパスワードを入れる' },
    { msg: { from: 'fake', to: 'real', label: 'ID とパスワード（そのまま転送）' }, line: [1, 2], note: '偽サイトがそのまま本物へ送る' },
    { msg: { from: 'real', to: 'fake', label: 'challenge と rpId=bank.example' }, line: [3, 4], note: '本物のサイトは署名してほしい challenge を返す' },
    { msg: { from: 'fake', to: 'user', label: 'challenge と rpId（そのまま中継）' }, line: 7, note: '偽サイトは利用者のブラウザに署名を頼む' },
    { line: [8, 9], note: 'ブラウザは、いま開いているページのオリジン https://bank-login.example が rpId bank.example を名乗れないので拒否する。利用者が偽サイトに気づいていなくても止まる', outcome: 'blocked' },
  ],
}

function trace(s: Scenario): Frame<View>[] {
  const log: Msg[] = []
  const actors: Actor[] = s === 'fatigue' ? ['fake', 'real', 'user'] : ['user', 'fake', 'real', 'carrier']
  const frames: Frame<View>[] = [
    {
      line: 1,
      note: s === 'fatigue' ? '攻撃者がパスワードを知っている状態から始める' : '利用者は、本物そっくりの偽サイトのログイン画面を開いている',
      view: { log: [], outcome: 'running', actors },
    },
  ]
  for (const st of STEPS[s]) {
    if (st.msg) log.push(st.msg)
    const outcome = st.outcome ?? 'running'
    frames.push({
      line: st.line,
      note: st.note,
      vars: { 'メッセージ数': log.length, 結果: outcome === 'stolen' ? 'セッションを奪われた' : outcome === 'blocked' ? '止まった' : '進行中' },
      view: { log: [...log], outcome, actors },
      done: outcome !== 'running',
    })
  }
  return frames
}

const PRESETS: { name: string; value: Scenario }[] = [
  { name: 'SMS のコード', value: 'sms' },
  { name: 'プッシュで承認', value: 'push' },
  { name: '番号照合付きプッシュ', value: 'pushNumber' },
  { name: '承認疲れ', value: 'fatigue' },
  { name: 'WebAuthn', value: 'webauthn' },
]

const OUTCOME: Record<Outcome, { label: string; state: CellState }> = {
  running: { label: '進行中', state: 'idle' },
  stolen: { label: '攻撃者がセッションを得た', state: 'bad' },
  blocked: { label: 'ブラウザが署名を拒否し、攻撃が止まった', state: 'good' },
}

function stateOf(m: Msg, last: boolean): CellState {
  if (last) return 'window'
  return m.from === 'fake' || m.to === 'fake' ? 'active' : 'idle'
}

export default function MfaRelay() {
  const [s, setS] = useState<Scenario>('sms')
  const frames = useMemo(() => trace(s), [s])
  return (
    <SimShell
      title="中継されるログイン"
      subtitle="利用者・偽サイト・本物のサイト・携帯網のあいだを流れるメッセージを 1 通ずつ追い、どこで止まるか（止まらないか）を見る"
      code={CODE[s]}
      frames={frames}
      controls={<PresetControl label="2 つ目の要素" presets={PRESETS} onPick={setS} />}
      legend={
        <>
          <LegendItem state="window">いま流れたメッセージ</LegendItem>
          <LegendItem state="active">偽サイトを通ったメッセージ</LegendItem>
          <LegendItem state="bad">セッションを奪われた</LegendItem>
          <LegendItem state="good">止まった</LegendItem>
        </>
      }
    >
      {(f) => {
        const o = OUTCOME[f.view.outcome]
        const os = cellStyle[o.state]
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {f.view.actors.map((a) => (
                <span
                  key={a}
                  className="rounded border px-2 py-0.5 text-[11px]"
                  style={{ borderColor: a === 'fake' ? 'var(--danger)' : 'var(--border)', color: 'var(--fg-muted)' }}
                >
                  {ACTOR_NAME[a]}
                </span>
              ))}
            </div>
            <ol className="m-0 list-none space-y-1 p-0">
              {f.view.log.length === 0 && (
                <li className="font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
                  （まだ何も送られていない）
                </li>
              )}
              {f.view.log.map((m, i) => {
                const cs = cellStyle[stateOf(m, i === f.view.log.length - 1)]
                return (
                  <li
                    key={i}
                    className="grid grid-cols-[minmax(0,9rem)_auto_minmax(0,9rem)_minmax(0,1fr)] items-center gap-2 rounded border px-2 py-1 font-mono text-[11px]"
                    style={{ background: cs.background, borderColor: cs.borderColor, color: cs.color }}
                  >
                    <span className="truncate">{ACTOR_NAME[m.from].split(' ')[0]}</span>
                    <span aria-hidden>→</span>
                    <span className="truncate">{ACTOR_NAME[m.to].split(' ')[0]}</span>
                    <span className="truncate" style={{ color: 'var(--fg)' }}>{m.label}</span>
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
