import { useMemo, useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'

/*
 * 記事の実測（numpy で書いた skip-gram + 負例サンプリング、16 次元、自作コーパス 6,000 文）で
 * 学習した埋め込みのうち 31 語を、小数 3 桁に丸めて埋め込んだもの。
 * x, y はこの 31 語だけで計算した主成分分析の第 1・第 2 成分。16 次元の分散のうち 30% しか残らない。
 */
const DATA: [string, number, number, number[]][] = [
  ['王', 0.046, -0.584, [-0.243, 0.022, -0.201, -0.144, -0.01, -0.033, 0.525, -0.183, -0.185, 0.092, -0.036, -0.458, 0.001, 0.021, 0.342, 0.445]],
  ['女王', -0.156, -0.367, [-0.106, 0.061, -0.05, -0.221, 0.034, 0.021, 0.452, -0.486, -0.184, 0.199, -0.085, 0.025, -0.119, -0.485, 0.23, 0.329]],
  ['王子', -0.121, -0.553, [-0.04, -0.153, -0.061, 0.096, 0.352, -0.148, 0.42, -0.186, 0.054, 0.034, 0.278, -0.408, 0.189, 0.092, -0.023, 0.559]],
  ['王女', -0.311, -0.312, [0.102, -0.128, 0.093, 0.018, 0.393, -0.092, 0.346, -0.492, 0.107, 0.111, 0.253, 0.05, 0.061, -0.38, -0.126, 0.431]],
  ['父', -0.324, 0.005, [-0.244, -0.078, 0.008, -0.013, 0.162, -0.317, 0.206, -0.049, -0.499, -0.51, -0.035, -0.057, 0.343, 0.248, 0.263, 0.025]],
  ['母', -0.506, 0.252, [-0.112, -0.045, 0.149, -0.095, 0.183, -0.242, 0.15, -0.38, -0.445, -0.451, -0.088, 0.381, 0.231, -0.238, 0.143, -0.104]],
  ['息子', -0.421, -0.091, [-0.04, -0.248, -0.171, 0.264, 0.221, -0.023, 0.034, -0.015, -0.264, -0.384, 0.33, -0.291, 0.526, -0.014, 0.087, 0.302]],
  ['娘', -0.615, 0.141, [0.094, -0.202, -0.039, 0.188, 0.252, 0.047, -0.015, -0.324, -0.255, -0.304, 0.325, 0.182, 0.404, -0.502, -0.001, 0.177]],
  ['男', -0.178, -0.122, [0.099, -0.13, -0.205, 0.291, 0.109, -0.175, 0.531, -0.113, -0.339, -0.204, -0.223, -0.065, 0.255, 0.373, -0.095, 0.293]],
  ['女', -0.382, 0.117, [0.253, -0.107, -0.056, 0.208, 0.133, -0.152, 0.482, -0.419, -0.314, -0.129, -0.244, 0.411, 0.119, -0.124, -0.162, 0.172]],
  ['日本', 0.3, 0.121, [-0.085, 0.167, -0.38, 0.425, 0.091, -0.051, 0.283, -0.593, 0.132, 0.071, 0.199, -0.211, -0.216, -0.088, 0.139, -0.132]],
  ['東京', 0.474, -0.056, [0.131, 0.515, -0.111, 0.265, -0.117, 0.005, 0.155, -0.5, 0.262, -0.044, 0.151, -0.269, 0.276, 0.03, 0.091, 0.309]],
  ['フランス', -0.065, 0.341, [0.076, 0.025, -0.248, 0.139, 0.243, -0.259, 0.127, -0.192, -0.218, -0.341, 0.194, -0.37, -0.149, -0.552, 0.053, -0.255]],
  ['パリ', 0.085, 0.105, [0.279, 0.335, 0.027, -0.049, 0.114, -0.197, 0.035, -0.102, -0.034, -0.418, 0.143, -0.454, 0.285, -0.463, -0.002, 0.214]],
  ['イタリア', -0.0, 0.519, [0.034, 0.005, -0.198, 0.38, 0.128, -0.182, 0.098, -0.446, -0.173, -0.43, 0.451, -0.01, -0.12, 0.057, -0.186, -0.294]],
  ['ローマ', 0.154, 0.252, [0.28, 0.286, 0.082, 0.193, 0.001, -0.127, 0.048, -0.361, 0.02, -0.478, 0.427, -0.106, 0.275, 0.165, -0.27, 0.22]],
  ['ドイツ', 0.273, 0.255, [-0.101, 0.284, -0.345, 0.178, -0.14, -0.156, 0.443, -0.236, -0.382, -0.079, 0.128, -0.256, -0.012, -0.121, 0.032, -0.462]],
  ['ベルリン', 0.361, 0.031, [0.093, 0.601, -0.034, -0.073, -0.274, -0.064, 0.356, -0.08, -0.284, -0.202, 0.037, -0.299, 0.444, -0.04, -0.001, -0.009]],
  ['エジプト', 0.093, 0.518, [0.07, 0.124, -0.234, 0.371, 0.12, -0.228, 0.2, -0.384, -0.183, -0.485, -0.181, -0.095, -0.271, 0.006, 0.295, -0.249]],
  ['カイロ', 0.257, 0.34, [0.301, 0.471, 0.012, 0.184, -0.017, -0.146, 0.116, -0.314, -0.032, -0.566, -0.271, -0.152, 0.147, 0.053, 0.217, 0.171]],
  ['イギリス', 0.196, 0.389, [0.38, 0.017, -0.102, -0.026, 0.12, -0.23, 0.375, -0.559, -0.172, -0.06, 0.125, -0.164, -0.365, 0.017, -0.038, -0.337]],
  ['ロンドン', 0.361, 0.189, [0.589, 0.346, 0.178, -0.22, -0.029, -0.163, 0.245, -0.476, -0.036, -0.178, 0.044, -0.266, 0.064, 0.112, -0.054, 0.121]],
  ['りんご', 0.337, -0.387, [-0.229, 0.37, -0.0, 0.193, 0.176, -0.479, 0.173, -0.359, -0.424, 0.138, 0.145, -0.282, 0.048, 0.015, -0.012, 0.228]],
  ['みかん', 0.361, -0.386, [-0.197, 0.377, -0.015, 0.181, 0.142, -0.503, 0.206, -0.326, -0.434, 0.15, 0.095, -0.304, 0.052, 0.025, -0.001, 0.222]],
  ['ぶどう', 0.35, -0.395, [-0.22, 0.39, 0.0, 0.185, 0.176, -0.484, 0.195, -0.337, -0.423, 0.141, 0.114, -0.284, 0.043, 0.022, -0.003, 0.231]],
  ['パン', 0.331, -0.396, [-0.262, 0.388, 0.025, 0.195, 0.22, -0.451, 0.14, -0.356, -0.418, 0.126, 0.162, -0.265, 0.02, 0.026, 0.005, 0.237]],
  ['はし', 0.023, 0.032, [0.162, 0.016, -0.171, -0.055, -0.378, -0.555, 0.222, -0.319, -0.393, -0.068, 0.326, -0.018, 0.194, -0.111, -0.092, 0.128]],
  ['川', -0.044, 0.326, [0.436, -0.257, -0.219, 0.195, -0.239, -0.358, 0.088, -0.384, -0.217, -0.157, -0.029, -0.298, 0.215, -0.111, 0.309, -0.039]],
  ['茶碗', 0.102, 0.04, [0.056, -0.094, 0.11, -0.006, -0.234, -0.323, -0.136, -0.713, -0.406, 0.086, 0.149, -0.233, 0.088, -0.169, 0.068, 0.021]],
  ['城', -0.495, -0.178, [0.194, -0.348, 0.056, -0.294, 0.303, -0.192, 0.407, -0.084, -0.446, -0.205, 0.119, -0.156, -0.129, -0.219, 0.147, 0.291]],
  ['家族', -0.484, -0.145, [-0.462, -0.163, -0.354, 0.109, 0.041, -0.158, 0.406, -0.194, -0.073, -0.139, 0.272, 0.222, 0.391, -0.213, 0.217, 0.026]],
]

type Group = 'male' | 'female' | 'country' | 'capital' | 'food' | 'other'
const GROUP: Record<string, Group> = {
  王: 'male', 王子: 'male', 父: 'male', 息子: 'male', 男: 'male',
  女王: 'female', 王女: 'female', 母: 'female', 娘: 'female', 女: 'female',
  日本: 'country', フランス: 'country', イタリア: 'country', ドイツ: 'country', エジプト: 'country', イギリス: 'country',
  東京: 'capital', パリ: 'capital', ローマ: 'capital', ベルリン: 'capital', カイロ: 'capital', ロンドン: 'capital',
  りんご: 'food', みかん: 'food', ぶどう: 'food', パン: 'food',
}
const COLOR: Record<Group, string> = {
  male: 'var(--accent)',
  female: 'var(--danger)',
  country: 'var(--ok)',
  capital: 'var(--warn)',
  food: 'var(--fg-muted)',
  other: 'var(--fg)',
}
const LABEL: Record<Group, string> = {
  male: '男性の語', female: '女性の語', country: '国', capital: '首都', food: '食べ物', other: 'その他',
}

const WORDS = DATA.map((d) => d[0])
const XY = DATA.map((d) => [d[1], d[2]] as const)
const VEC = DATA.map((d) => d[3])

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0)
const norm = (a: number[]) => Math.sqrt(dot(a, a))
const cos = (a: number[], b: number[]) => dot(a, b) / (norm(a) * norm(b))

function nearest(v: number[], exclude: Set<number>, k: number) {
  return VEC.map((u, i) => ({ i, s: cos(v, u) }))
    .filter((x) => !exclude.has(x.i))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
}

const PRESETS: [string, string, string][] = [
  ['王', '男', '女'],
  ['東京', '日本', 'フランス'],
  ['父', '男', '女'],
  ['パリ', 'フランス', 'イタリア'],
  ['王', '城', '家族'],
]

const W = 520
const H = 360
const PAD = 28
const xs = XY.map((p) => p[0])
const ys = XY.map((p) => p[1])
const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
const sx = (x: number) => PAD + ((x - x0) / (x1 - x0)) * (W - 2 * PAD)
const sy = (y: number) => H - PAD - ((y - y0) / (y1 - y0)) * (H - 2 * PAD)

export default function EmbeddingSpace() {
  const [mode, setMode] = useState<'near' | 'analogy'>('analogy')
  const [focus, setFocus] = useState(WORDS.indexOf('はし'))
  const [k, setK] = useState(3)
  const [abc, setAbc] = useState<[number, number, number]>(PRESETS[0]!.map((w) => WORDS.indexOf(w)) as [number, number, number])
  const [exclude, setExclude] = useState(true)

  const near = useMemo(() => nearest(VEC[focus]!, new Set([focus]), k), [focus, k])
  const analogy = useMemo(() => {
    const [a, b, c] = abc
    const v = VEC[a]!.map((x, i) => x - VEC[b]![i]! + VEC[c]![i]!)
    // 主成分分析は平均を引いて線形に写すだけなので、a - b + c の写像は写像どうしの a - b + c に等しい
    const p = [XY[a]![0] - XY[b]![0] + XY[c]![0], XY[a]![1] - XY[b]![1] + XY[c]![1]] as const
    return { p, top: nearest(v, exclude ? new Set(abc) : new Set(), k) }
  }, [abc, exclude, k])

  const selectCls = 'rounded border px-1 py-0.5 font-mono text-xs'
  const selectStyle = { borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }
  const wordSelect = (slot: 0 | 1 | 2) => (
    <select
      value={abc[slot]}
      onChange={(e) => {
        const next = [...abc] as [number, number, number]
        next[slot] = Number(e.target.value)
        setAbc(next)
      }}
      className={selectCls}
      style={selectStyle}
    >
      {WORDS.map((w, i) => (
        <option key={w} value={i}>{w}</option>
      ))}
    </select>
  )

  const [a, b, c] = abc
  const best = analogy.top[0]

  return (
    <VizShell
      title="単語の埋め込みを 2 次元に写す"
      subtitle="記事の実験で学習した 16 次元のベクトルのうち 31 語。近さは 16 次元のコサイン類似度で計算し、図は主成分分析で 2 次元に写したもの"
      controls={
        <>
          <label className="flex items-center gap-2">
            <span style={{ color: 'var(--fg-muted)' }}>表示</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as 'near' | 'analogy')} className={selectCls} style={selectStyle}>
              <option value="analogy">類推 a − b + c</option>
              <option value="near">近い語</option>
            </select>
          </label>
          {mode === 'analogy' ? (
            <>
              <span className="flex items-center gap-1 font-mono">
                {wordSelect(0)} − {wordSelect(1)} + {wordSelect(2)}
              </span>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={exclude} onChange={(e) => setExclude(e.target.checked)} />
                <span style={{ color: 'var(--fg-muted)' }}>a, b, c を答えの候補から外す</span>
              </label>
              <span className="flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.join()}
                    type="button"
                    onClick={() => setAbc(p.map((w) => WORDS.indexOf(w)) as [number, number, number])}
                    className="rounded border px-1.5 py-0.5 text-xs"
                    style={{ borderColor: 'var(--border)', color: 'var(--fg)' }}
                  >
                    {p[0]}−{p[1]}+{p[2]}
                  </button>
                ))}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--fg-muted)' }}>点をクリックして語を選ぶ</span>
          )}
          <Slider label="上位" value={k} min={1} max={5} step={1} onChange={setK} format={(v) => `${v} 語`} />
        </>
      }
      readout={
        mode === 'analogy' ? (
          <>
            {WORDS[a]} − {WORDS[b]} + {WORDS[c]} に近い語:{' '}
            {analogy.top.map((t) => `${WORDS[t.i]}（${t.s.toFixed(3)}）`).join('、')}
          </>
        ) : (
          <>
            {WORDS[focus]} に近い語: {near.map((t) => `${WORDS[t.i]}（${t.s.toFixed(3)}）`).join('、')}
          </>
        )
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ maxWidth: W }} role="img" aria-label="単語の埋め込みの散布図">
        <defs>
          <marker id="emb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
          </marker>
        </defs>
        {mode === 'near' &&
          near.map((t) => (
            <line
              key={t.i}
              x1={sx(XY[focus]![0])}
              y1={sy(XY[focus]![1])}
              x2={sx(XY[t.i]![0])}
              y2={sy(XY[t.i]![1])}
              stroke="var(--accent)"
              strokeWidth={1 + 2 * Math.max(0, t.s)}
              opacity={0.6}
            />
          ))}
        {mode === 'analogy' && (
          <g>
            <line x1={sx(XY[b]![0])} y1={sy(XY[b]![1])} x2={sx(XY[a]![0])} y2={sy(XY[a]![1])} stroke="var(--accent)" strokeWidth={2} markerEnd="url(#emb-arrow)" />
            <line x1={sx(XY[c]![0])} y1={sy(XY[c]![1])} x2={sx(analogy.p[0])} y2={sy(analogy.p[1])} stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 3" markerEnd="url(#emb-arrow)" />
            <circle cx={sx(analogy.p[0])} cy={sy(analogy.p[1])} r={6} fill="none" stroke="var(--accent)" strokeWidth={2} />
            {best && (
              <line x1={sx(analogy.p[0])} y1={sy(analogy.p[1])} x2={sx(XY[best.i]![0])} y2={sy(XY[best.i]![1])} stroke="var(--ok)" strokeWidth={1.5} strokeDasharray="2 3" />
            )}
          </g>
        )}
        {WORDS.map((w, i) => {
          const g = GROUP[w] ?? 'other'
          const on = mode === 'near' ? i === focus || near.some((t) => t.i === i) : abc.includes(i) || analogy.top.some((t) => t.i === i)
          return (
            <g key={w} onClick={() => { setMode('near'); setFocus(i) }} style={{ cursor: 'pointer' }}>
              <circle cx={sx(XY[i]![0])} cy={sy(XY[i]![1])} r={on ? 5 : 3.5} fill={COLOR[g]} opacity={on ? 1 : 0.55} />
              <text x={sx(XY[i]![0]) + 6} y={sy(XY[i]![1]) + 4} fontSize={on ? 12 : 10} fill={on ? 'var(--fg)' : 'var(--fg-muted)'} fontWeight={on ? 700 : 400}>
                {w}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="m-0 mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
        {(Object.keys(LABEL) as Group[]).map((g) => (
          <span key={g} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR[g] }} />
            {LABEL[g]}
          </span>
        ))}
        <span>実線の矢印: b → a、破線の矢印: c から同じだけ進んだ先（○）</span>
      </p>
    </VizShell>
  )
}
