import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { Field, PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { RowTable, type RowTableData } from '../views/RowTable'
import type { CellState, Frame } from '../core/types'

type Scheme = 'poly' | 'arc' | 'super'
type Op = 'ok' | 'missing' | 'typo' | 'delete'
type Target = { type: 'Issue' | 'PullRequest' | 'Isue'; id: number }
type Comment = { id: number; to: Target; body: string }

const ISSUES = [{ id: 1, title: 'ログインできない' }]
const PRS = [{ id: 1, title: 'ログインを直す' }]
const BASE: Comment[] = [
  { id: 1, to: { type: 'Issue', id: 1 }, body: '再現した' },
  { id: 2, to: { type: 'PullRequest', id: 1 }, body: 'LGTM' },
]
// 共通の親を使う方式では、Issue と PR が同じ id 空間を共有する
const SUPER_ID = (t: Target) => (t.type === 'PullRequest' ? 101 : t.id)

const CODE: Record<Scheme, Record<Op, string>> = {
  poly: {
    ok: `INSERT INTO comment (id, commentable_type, commentable_id, body)
VALUES (3, 'Issue', 1, '直りました');`,
    missing: `INSERT INTO comment VALUES (3, 'Issue', 999, '宛先がない');
-- commentable_id はどの表を指すか行ごとに違うので、外部キーを張れない`,
    typo: `INSERT INTO comment VALUES (3, 'Isue', 1, '型名の打ち間違い');`,
    delete: `DELETE FROM issue WHERE id = 1;`,
  },
  arc: {
    ok: `INSERT INTO comment (id, issue_id, pr_id, body)
VALUES (3, 1, NULL, '直りました');
-- CHECK (num_nonnulls(issue_id, pr_id) = 1)`,
    missing: `INSERT INTO comment VALUES (3, 999, NULL, '宛先がない');
-- issue_id は issue(id) への外部キー`,
    typo: `INSERT INTO comment VALUES (3, 1, 1, '両方を埋めた');
-- 型名の列がないので打ち間違いは起きない。代わりに「両方埋める」を CHECK で止める`,
    delete: `DELETE FROM issue WHERE id = 1;
-- コメントが参照しているので外部キーが拒否する（ON DELETE CASCADE なら一緒に消える）`,
  },
  super: {
    ok: `INSERT INTO comment (id, commentable_id, body)
VALUES (3, 1, '直りました');
-- commentable_id は commentable(id) への外部キー`,
    missing: `INSERT INTO comment VALUES (3, 999, '宛先がない');`,
    typo: `-- 型名を書く列がない。Issue も PR も commentable の 1 行として
-- 先に作られ、その id を自分の主キーにしている
INSERT INTO commentable VALUES (102);
INSERT INTO issue (id, title) VALUES (102, '新しい課題');`,
    delete: `DELETE FROM commentable WHERE id = 1;
-- コメントが参照しているので拒否される（CASCADE なら Issue とコメントも消える）`,
  },
}

function tables(s: Scheme, comments: Comment[], st: Record<string, CellState> = {}, issues = ISSUES): RowTableData[] {
  const issueT: RowTableData = {
    title: 'issue',
    columns: ['id', 'title'],
    rows: issues.map((i) => ({ key: String(i.id), cells: [s === 'super' ? SUPER_ID({ type: 'Issue', id: i.id }) : i.id, i.title], state: st[`issue:${i.id}`] })),
  }
  const prT: RowTableData = {
    title: 'pull_request',
    columns: ['id', 'title'],
    rows: PRS.map((p) => ({ key: String(p.id), cells: [s === 'super' ? SUPER_ID({ type: 'PullRequest', id: p.id }) : p.id, p.title] })),
  }
  const cs = (c: Comment) => st[`comment:${c.id}`]
  if (s === 'poly')
    return [
      issueT,
      prT,
      {
        title: 'comment',
        columns: ['id', 'commentable_type', 'commentable_id', 'body'],
        rows: comments.map((c) => ({ key: String(c.id), cells: [c.id, c.to.type, c.to.id, c.body], state: cs(c) })),
      },
    ]
  if (s === 'arc')
    return [
      issueT,
      prT,
      {
        title: 'comment',
        columns: ['id', 'issue_id', 'pr_id', 'body'],
        rows: comments.map((c) => ({
          key: String(c.id),
          cells: [c.id, c.to.type !== 'PullRequest' ? c.to.id : null, c.to.type === 'PullRequest' ? c.to.id : null, c.body],
          state: cs(c),
        })),
      },
    ]
  const ids = [...issues.map((i) => SUPER_ID({ type: 'Issue', id: i.id })), 101]
  return [
    { title: 'commentable（共通の親）', columns: ['id'], rows: ids.map((id) => ({ key: String(id), cells: [id], state: st[`super:${id}`] })) },
    issueT,
    prT,
    {
      title: 'comment',
      columns: ['id', 'commentable_id', 'body'],
      rows: comments.map((c) => ({ key: String(c.id), cells: [c.id, SUPER_ID(c.to), c.body], state: cs(c) })),
    },
  ]
}

function trace(s: Scheme, op: Op): Frame<RowTableData[]>[] {
  const frames: Frame<RowTableData[]>[] = []
  const snap = (line: number | number[], note: string, view: RowTableData[], done = false) => frames.push({ line, note, view, done })
  const intro = {
    poly: '1 つのコメント表が、Issue にも Pull Request にも付く。どちらを指すかを型名の列と id の列の 2 つで表す（Rails の polymorphic: true がこの形）',
    arc: '指す先の種類ごとに外部キーの列を分け、どれか 1 つだけを埋める',
    super: 'Issue と Pull Request の上に共通の親 commentable を置き、コメントは親を指す',
  }[s]
  snap(1, intro, tables(s, BASE))

  const add = (c: Comment, state: CellState) => tables(s, [...BASE, c], { [`comment:${c.id}`]: state })
  if (op === 'ok') {
    snap([1, 2, 3], `正しい宛先なら、どの方式でも入る`, add({ id: 3, to: { type: 'Issue', id: 1 }, body: '直りました' }, 'good'), true)
    return frames
  }
  if (op === 'missing') {
    const c: Comment = { id: 3, to: { type: 'Issue', id: 999 }, body: '宛先がない' }
    if (s === 'poly') snap([1, 2], `存在しない Issue 999 を指すコメントが入ってしまう。commentable_id は行によって issue を指したり pull_request を指したりするので、1 本の外部キーで表せない`, add(c, 'bad'), true)
    else snap([1, 2], `外部キーが拒否する。指す先の表が列ごと（排他的アーク）または 1 つ（共通の親）に決まっているので、普通の外部キーが使える`, tables(s, BASE), true)
    return frames
  }
  if (op === 'typo') {
    if (s === 'poly') snap(1, `型名 'Isue' は、どの表の名前でもない。文字列なので DB は受け付け、結合しても何にも当たらない。CHECK で許す型名を列挙すれば防げるが、種類が増えるたびに直す`, add({ id: 3, to: { type: 'Isue', id: 1 }, body: '型名の打ち間違い' }, 'bad'), true)
    if (s === 'arc') snap([1, 2, 3], `排他的アークでは、両方の列を埋めた行を CHECK 制約が拒否する。種類が増えるたびに列と CHECK を足す必要がある`, tables(s, BASE), true)
    if (s === 'super') snap([1, 2, 3, 4], `新しい Issue は、まず commentable に id を取ってから作る。型名の文字列がどこにもないので、打ち間違えようがない`, tables(s, BASE, { 'super:102': 'good', 'issue:102': 'good' }, [...ISSUES, { id: 102, title: '新しい課題' }]), true)
    return frames
  }
  if (s === 'poly') {
    snap(1, `Issue 1 を消す。コメントの側に外部キーがないので、DB は止めない`, tables(s, BASE, { 'issue:1': 'bad' }))
    snap(1, `コメント 1 は消えた Issue を指したまま残る。アプリの before_destroy などで消す必要があり、別の経路（SQL を直接流すなど）で消すと取り残される`, tables(s, BASE, { 'comment:1': 'bad' }, []), true)
  } else snap([1, 2], `参照しているコメントがあるので外部キーが拒否する。ON DELETE CASCADE を付ければ、コメントも DB が一緒に消す`, tables(s, BASE, { 'issue:1': 'active', 'super:1': 'active', 'comment:1': 'window' }), true)
  return frames
}

const OPS: { name: string; value: Op }[] = [
  { name: '正しく付ける', value: 'ok' },
  { name: '存在しない宛先', value: 'missing' },
  { name: '型の取り違え', value: 'typo' },
  { name: '宛先を消す', value: 'delete' },
]
const SCHEMES: { label: string; value: Scheme }[] = [
  { label: 'ポリモーフィック関連', value: 'poly' },
  { label: '排他的アーク', value: 'arc' },
  { label: '共通の親（スーパータイプ）', value: 'super' },
]

export default function PolymorphicAssoc() {
  const [scheme, setScheme] = useState<Scheme>('poly')
  const [op, setOp] = useState<Op>('missing')
  const frames = useMemo(() => trace(scheme, op), [scheme, op])
  return (
    <SimShell
      title="ポリモーフィック関連と、その代わり"
      subtitle="Issue にも Pull Request にも付くコメントを、どう指すか。外部キーが張れるかどうかで、守れるものが変わる"
      code={CODE[scheme][op]}
      frames={frames}
      controls={
        <>
          <Field label="方式">
            <select
              value={scheme}
              onChange={(e) => setScheme(e.target.value as Scheme)}
              className="rounded border px-1.5 py-1 font-mono text-xs"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
            >
              {SCHEMES.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </Field>
          <PresetControl label="操作" presets={OPS} onPick={setOp} />
        </>
      }
      legend={
        <>
          <LegendItem state="good">入った行</LegendItem>
          <LegendItem state="active">消そうとした行</LegendItem>
          <LegendItem state="window">それを参照している行</LegendItem>
          <LegendItem state="bad">壊れた参照</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="grid gap-3 sm:grid-cols-2">
          {f.view.map((t) => (
            <div key={t.title} className={t.title === 'comment' ? 'sm:col-span-2' : undefined}>
              <RowTable {...t} />
            </div>
          ))}
        </div>
      )}
    </SimShell>
  )
}
