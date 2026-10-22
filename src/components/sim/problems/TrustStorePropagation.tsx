import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

type Scenario = 'host' | 'image'
type FileId = 'src' | 'pem' | 'jks' | 'certifi' | 'embedded'
type ProgId = 'curl' | 'py' | 'requests' | 'node' | 'nodeSys' | 'go' | 'java'
type Ver = 'old' | 'new'

type View = { files: Record<FileId, Ver>; progs: Record<ProgId, Ver>; changed: string[] }

const FILES: { id: FileId; name: string; path: string }[] = [
  { id: 'src', name: '元の一覧', path: 'ca-certificates の RPM / source/anchors' },
  { id: 'pem', name: 'PEM の束', path: '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem' },
  { id: 'jks', name: 'Java のキーストア', path: '/etc/pki/ca-trust/extracted/java/cacerts' },
  { id: 'certifi', name: 'certifi の束', path: 'site-packages/certifi/cacert.pem' },
  { id: 'embedded', name: 'Node.js の埋め込み', path: 'node のバイナリの中' },
]

const PROGS: { id: ProgId; name: string; reads: string }[] = [
  { id: 'curl', name: 'curl', reads: 'PEM の束を毎回読む' },
  { id: 'py', name: 'Python の ssl', reads: 'PEM の束を、コンテキストを作るたびに読む' },
  { id: 'requests', name: 'Python の requests', reads: 'certifi の束' },
  { id: 'node', name: 'Node.js（公式のバイナリ）', reads: '埋め込みの一覧' },
  { id: 'nodeSys', name: 'Node.js --use-system-ca', reads: '埋め込み + PEM の束（起動時）' },
  { id: 'go', name: 'Go のサーバ（動き続けている）', reads: 'PEM の束（最初の検証で 1 回）' },
  { id: 'java', name: 'Java のサーバ（動き続けている）', reads: 'Java のキーストア（起動時に 1 回）' },
]

const LABEL: Record<Scenario, Record<Ver, string>> = {
  host: { old: '社内ルートなし', new: '社内ルートあり' },
  image: { old: 'G3 を信頼', new: 'G3 を外した' },
}

const CODE: Record<Scenario, string> = {
  host: `# Amazon Linux 2023 のホストで、社内のルート lab.pem を信頼させる
cp lab.pem /etc/pki/ca-trust/source/anchors/
update-ca-trust
systemctl restart my-go-api my-java-api
export REQUESTS_CA_BUNDLE=/etc/pki/tls/certs/ca-bundle.crt
export NODE_EXTRA_CA_CERTS=/path/to/lab.pem`,
  image: `# FROM amazonlinux:2023 のイメージを 9 月 30 日にビルドし、本番で動かしている
# 10 月のある日、Amazon がリポジトリの ca-certificates を更新する
docker build -t api .                        # 同じ Dockerfile のまま
docker build --pull --no-cache -t api .      # ベースもパッケージも取り直す
deploy api                                   # 新しいイメージでタスクを入れ替える
RUN pip install -U certifi                   # Dockerfile に足して、もう一度ビルドとデプロイ
FROM node:24.22.1                            # Node.js の版を上げて、もう一度ビルドとデプロイ`,
}

type Step = {
  line: number | number[]
  note: string
  files?: Partial<Record<FileId, Ver>>
  progs?: Partial<Record<ProgId, Ver>>
}

const STEPS: Record<Scenario, Step[]> = {
  host: [
    {
      line: 2,
      files: { src: 'new' },
      note: '元の一覧の置き場所に証明書を置いた。ただし、プログラムが読むのはここではなく、ここから作られた束なので、どのプログラムの結果も変わらない',
    },
    {
      line: 3,
      files: { pem: 'new', jks: 'new' },
      progs: { curl: 'new', py: 'new', nodeSys: 'new' },
      note: 'update-ca-trust が元の一覧から PEM の束と Java のキーストアを作り直した。起動のたびに束を読む curl や Python の ssl はすぐ通る。一方で、動き続けている Go と Java のプロセスは、読み込み済みの古い一覧を使い続ける',
    },
    {
      line: 4,
      progs: { go: 'new', java: 'new' },
      note: 'プロセスを起動し直すと、作り直した束とキーストアを読み直して通る。ファイルを替えただけでは足りず、読み直させるまでが更新',
    },
    {
      line: 5,
      progs: { requests: 'new' },
      note: 'requests は OS の束ではなく certifi の束を読んでいた。環境変数で OS の束を指すと通る（certifi の束そのものは何も変わっていない）',
    },
    {
      line: 6,
      progs: { node: 'new' },
      note: '公式の Node.js は、バイナリに埋め込んだ一覧を使う。NODE_EXTRA_CA_CERTS で 1 枚足すか、--use-system-ca で OS の束も読ませる',
    },
  ],
  image: [
    {
      line: 2,
      files: { src: 'new' },
      note: 'リポジトリの ca-certificates が新しくなった。動いているコンテナの中のファイルは、ビルドした日のまま変わらない',
    },
    {
      line: 3,
      note: 'Dockerfile が同じなので、ビルドは dnf の層をキャッシュから使い回した（CACHED）。新しいイメージの中身も 9 月 30 日のまま',
    },
    {
      line: 4,
      files: { pem: 'new', jks: 'new' },
      note: '--pull でベースイメージを、--no-cache でパッケージの導入を取り直した。新しいイメージでは、RPM の後処理が update-ca-trust を走らせ、PEM の束と Java のキーストアが G3 なしで作り直された。ただし本番ではまだ古いイメージが動いている',
    },
    {
      line: 5,
      progs: { curl: 'new', py: 'new', nodeSys: 'new', go: 'new', java: 'new' },
      note: 'デプロイでタスクが入れ替わり、プロセスが新しいイメージで起動した。OS の束を読むものはここで G3 を信頼しなくなる。Java の cacerts は OS の束へのリンクなので、一緒に変わる',
    },
    {
      line: 6,
      files: { certifi: 'new' },
      progs: { requests: 'new' },
      note: 'certifi は OS のパッケージではなく Python のパッケージなので、OS を更新しても変わらない。certifi 自体を上げて、もう一度ビルドとデプロイ',
    },
    {
      line: 7,
      files: { embedded: 'new' },
      progs: { node: 'new' },
      note: '公式の Node.js の一覧は、Node.js の版ごとに固定されている。版を上げて、もう一度ビルドとデプロイ',
    },
  ],
}

const allOld = <K extends string>(ids: { id: K }[]) =>
  Object.fromEntries(ids.map((x) => [x.id, 'old'])) as Record<K, Ver>

function trace(s: Scenario): Frame<View>[] {
  let files = allOld(FILES)
  let progs = allOld(PROGS)
  const frames: Frame<View>[] = [
    {
      line: 1,
      note:
        s === 'host'
          ? 'ファイルもプログラムも、まだ社内のルートを知らない'
          : 'ビルドした日のイメージには、emSign ECC Root CA - G3 が入っている',
      view: { files, progs, changed: [] },
    },
  ]
  STEPS[s].forEach((st, i) => {
    files = { ...files, ...st.files }
    progs = { ...progs, ...st.progs }
    const changed = [...Object.keys(st.files ?? {}), ...Object.keys(st.progs ?? {})]
    const done = PROGS.filter((p) => progs[p.id] === 'new').length
    frames.push({
      line: st.line,
      note: st.note,
      vars: { '新しい一覧で検証するプログラム': `${done} / ${PROGS.length}` },
      view: { files, progs, changed },
      done: i === STEPS[s].length - 1,
    })
  })
  return frames
}

const PRESETS: { name: string; value: Scenario }[] = [
  { name: 'ホストに社内のルートを足す', value: 'host' },
  { name: 'コンテナでルートを外す', value: 'image' },
]

function Row({ title, sub, ver, changed, label }: { title: string; sub: string; ver: Ver; changed: boolean; label: string }) {
  const st: CellState = changed ? 'window' : ver === 'new' ? 'good' : 'idle'
  const cs = cellStyle[st]
  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded border px-2 py-1 text-[11px]"
      style={{ background: cs.background, borderColor: cs.borderColor, color: cs.color }}
    >
      <span className="min-w-0">
        <span className="font-bold" style={{ color: 'var(--fg)' }}>{title}</span>
        <span className="block truncate font-mono" style={{ color: 'var(--fg-muted)' }}>{sub}</span>
      </span>
      <span className="font-mono">{label}</span>
    </li>
  )
}

export default function TrustStorePropagation() {
  const [s, setS] = useState<Scenario>('host')
  const frames = useMemo(() => trace(s), [s])
  return (
    <SimShell
      title="一覧の変更が届くまで"
      subtitle="元の一覧を変えてから、各プログラムが新しい一覧で検証するようになるまでを 1 手ずつ追う"
      code={CODE[s]}
      frames={frames}
      controls={<PresetControl label="場面" presets={PRESETS} onPick={setS} />}
      legend={
        <>
          <LegendItem state="window">この手で変わった</LegendItem>
          <LegendItem state="good">新しい一覧</LegendItem>
          <LegendItem state="idle">古い一覧のまま</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="m-0 mb-1 text-[11px] font-bold" style={{ color: 'var(--fg-muted)' }}>ファイル</p>
            <ul className="m-0 list-none space-y-1 p-0">
              {FILES.map((x) => (
                <Row key={x.id} title={x.name} sub={x.path} ver={f.view.files[x.id]} changed={f.view.changed.includes(x.id)} label={LABEL[s][f.view.files[x.id]]} />
              ))}
            </ul>
          </div>
          <div>
            <p className="m-0 mb-1 text-[11px] font-bold" style={{ color: 'var(--fg-muted)' }}>プログラムが検証に使う一覧</p>
            <ul className="m-0 list-none space-y-1 p-0">
              {PROGS.map((x) => (
                <Row key={x.id} title={x.name} sub={x.reads} ver={f.view.progs[x.id]} changed={f.view.changed.includes(x.id)} label={LABEL[s][f.view.progs[x.id]]} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </SimShell>
  )
}
