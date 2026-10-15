const KEYWORDS = new Set([
  'def', 'return', 'if', 'elif', 'else', 'while', 'for', 'in', 'not', 'and', 'or',
  'break', 'continue', 'None', 'True', 'False', 'import', 'from', 'class', 'pass',
  'yield', 'lambda', 'global', 'nonlocal', 'with', 'as', 'try', 'except',
])
const BUILTINS = new Set([
  'len', 'range', 'max', 'min', 'abs', 'sum', 'sorted', 'set', 'dict', 'list',
  'enumerate', 'zip', 'int', 'str', 'deque', 'defaultdict', 'Counter', 'heappush',
  'heappop', 'append', 'pop', 'popleft', 'add', 'ord', 'reversed',
])
// TypeScript を載せる回のため。Python のコードで識別子に使われても、色が付くだけで害はない
const TS_KEYWORDS = new Set([
  'const', 'let', 'function', 'type', 'interface', 'export', 'async', 'await', 'switch',
  'case', 'throw', 'new', 'extends', 'implements', 'readonly', 'of', 'never', 'undefined',
  'null', 'true', 'false', 'this', 'default',
])
// SQL を載せる回のため。大文字だけを拾うので Python の識別子とは衝突しない
const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'AS', 'ON', 'JOIN',
  'WITH', 'RECURSIVE', 'UNION', 'ALL', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
  'DELETE', 'LIKE', 'BETWEEN', 'GROUP', 'BY', 'ORDER', 'HAVING', 'ALTER', 'TABLE',
  'ADD', 'COLUMN', 'CROSS', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'FILTER',
  'DISTINCT', 'BEGIN', 'COMMIT', 'CYCLE', 'USING', 'LIMIT',
])

type Lang = 'py' | 'ts'

type Tok = { t: string; k: 'kw' | 'fn' | 'num' | 'str' | 'cm' | 'txt' }

/** 表示用の軽量トークナイザ。厳密な構文解析はしない */
function tokenize(line: string, lang: Lang): Tok[] {
  const out: Tok[] = []
  // Python の // は床除算なので、TypeScript のときだけ行コメントとして扱う
  const cm = lang === 'ts' ? line.search(/\/\/(?=[^"']*$)/) : -1
  if (cm >= 0) return [...tokenize(line.slice(0, cm), lang), { t: line.slice(cm), k: 'cm' }]
  const re = /(#.*$|--.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([^\sA-Za-z0-9_])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    if (m[1]) out.push({ t: m[1], k: 'cm' })
    else if (m[2]) out.push({ t: m[2], k: 'str' })
    else if (m[3]) out.push({ t: m[3], k: 'num' })
    else if (m[4]) {
      const w = m[4]
      out.push({ t: w, k: KEYWORDS.has(w) || SQL_KEYWORDS.has(w) || TS_KEYWORDS.has(w) ? 'kw' : BUILTINS.has(w) ? 'fn' : 'txt' })
    } else out.push({ t: m[0], k: 'txt' })
  }
  return out
}

const TONE: Record<Tok['k'], string> = {
  kw: 'text-[#ff7b72]',
  fn: 'text-[#d2a8ff]',
  num: 'text-[#79c0ff]',
  str: 'text-[#a5d6ff]',
  cm: 'text-[#8b949e] italic',
  txt: 'text-[#c9d1d9]',
}

export function CodePanel({
  code,
  active,
  lang = 'py',
}: {
  code: string
  active: number | number[]
  lang?: Lang
}) {
  const lines = code.replace(/\n$/, '').split('\n')
  const hot = new Set(Array.isArray(active) ? active : [active])

  return (
    <pre
      className="overflow-x-auto rounded-lg border text-[12.5px] leading-[1.75]"
      style={{ background: 'var(--bg-code)', borderColor: 'var(--border)' }}
    >
      <code className="block py-2 font-mono">
        {lines.map((ln, i) => {
          const n = i + 1
          const on = hot.has(n)
          return (
            <span
              key={n}
              className="flex px-1"
              style={{
                background: on ? 'rgba(120,160,255,0.16)' : undefined,
                boxShadow: on ? 'inset 3px 0 0 var(--accent)' : undefined,
              }}
            >
              <span className="w-8 shrink-0 select-none pr-3 text-right text-[#6e7681]">
                {n}
              </span>
              <span
                className="whitespace-pre-wrap break-words"
                style={{ textIndent: '-2ch', paddingLeft: '2ch' }}
              >
                {tokenize(ln, lang).map((tk, j) => (
                  <span key={j} className={TONE[tk.k]}>
                    {tk.t}
                  </span>
                ))}
              </span>
            </span>
          )
        })}
      </code>
    </pre>
  )
}
