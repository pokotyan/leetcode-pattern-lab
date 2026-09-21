import { useState } from 'react'

type Bit = 0 | 1

let calls = 0
const nand = (a: Bit, b: Bit): Bit => {
  calls++
  return a === 1 && b === 1 ? 0 : 1
}

const not = (a: Bit): Bit => nand(a, a)
const and = (a: Bit, b: Bit): Bit => not(nand(a, b))
const or = (a: Bit, b: Bit): Bit => nand(not(a), not(b))
const xor = (a: Bit, b: Bit): Bit => {
  const c = nand(a, b)
  return nand(nand(a, c), nand(b, c))
}

type Gate = { name: string; body: string; fn: (a: Bit, b: Bit) => Bit; unary?: boolean }

const GATES: Gate[] = [
  { name: 'NAND', body: '与えられている', fn: nand },
  { name: 'NOT', body: 'nand(a, a)', fn: (a) => not(a), unary: true },
  { name: 'AND', body: 'not(nand(a, b))', fn: and },
  { name: 'OR', body: 'nand(not(a), not(b))', fn: or },
  { name: 'XOR', body: 'c = nand(a, b); nand(nand(a, c), nand(b, c))', fn: xor },
]

const ROWS: [Bit, Bit][] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
]

/** 入力を切り替えて、NAND だけで組んだ各ゲートの出力と、消費した NAND の個数を見る */
function evaluate(gate: Gate, a: Bit, b: Bit) {
  calls = 0
  const out = gate.fn(a, b)
  return { out, cost: calls }
}

function BitCell({ value, on }: { value: Bit; on: boolean }) {
  return (
    <span
      className="inline-block w-6 rounded text-center font-mono text-xs font-bold"
      style={{
        color: value === 1 ? 'var(--ok)' : 'var(--fg-muted)',
        background: value === 1 ? 'var(--ok-soft)' : 'transparent',
        opacity: on ? 1 : 0.55,
      }}
    >
      {value}
    </span>
  )
}

export default function GateLab() {
  const [a, setA] = useState<Bit>(0)
  const [b, setB] = useState<Bit>(0)

  const toggle = (v: Bit) => (v === 1 ? 0 : 1)

  return (
    <section
      className="not-prose my-8 rounded-xl border"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}
    >
      <header className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
        <h4 className="m-0 text-sm font-bold tracking-wide">NAND だけで組んだゲート</h4>
        <p className="m-0 mt-1 text-xs" style={{ color: 'var(--fg-muted)' }}>
          入力を切り替えると、出力と「その出力を出すために NAND を何個通ったか」が変わります
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs">
        {(
          [
            ['a', a, () => setA(toggle(a))],
            ['b', b, () => setB(toggle(b))],
          ] as const
        ).map(([label, value, onClick]) => (
          <button
            key={label}
            onClick={onClick}
            className="rounded border px-3 py-1.5 font-mono font-bold"
            style={{
              borderColor: value === 1 ? 'var(--ok)' : 'var(--border)',
              background: value === 1 ? 'var(--ok-soft)' : 'var(--bg)',
              color: value === 1 ? 'var(--ok)' : 'var(--fg-muted)',
            }}
          >
            {label} = {value}
          </button>
        ))}
        <span style={{ color: 'var(--fg-muted)' }}>クリックで 0 / 1 が入れ替わります</span>
      </div>

      <div className="overflow-x-auto px-4 pb-4">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr style={{ color: 'var(--fg-muted)' }}>
              <th className="py-1.5 pr-3 text-left font-bold">ゲート</th>
              <th className="py-1.5 pr-3 text-left font-bold">NAND による定義</th>
              <th className="py-1.5 pr-3 text-left font-bold">いまの出力</th>
              <th className="py-1.5 pr-3 text-left font-bold">通った NAND</th>
              <th className="py-1.5 text-left font-bold">
                真理値表（ab = {ROWS.map(([x, y]) => `${x}${y}`).join(' ')}）
              </th>
            </tr>
          </thead>
          <tbody>
            {GATES.map((g) => {
              const now = evaluate(g, a, b)
              return (
                <tr key={g.name} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="py-2 pr-3 font-mono font-bold">{g.name}</td>
                  <td className="py-2 pr-3 font-mono" style={{ color: 'var(--fg-muted)' }}>
                    {g.body}
                  </td>
                  <td className="py-2 pr-3">
                    <BitCell value={now.out} on />
                  </td>
                  <td className="py-2 pr-3 font-mono" style={{ color: 'var(--fg-muted)' }}>
                    {now.cost}
                  </td>
                  <td className="py-2">
                    <span className="flex gap-1.5">
                      {ROWS.map(([x, y]) => (
                        <BitCell
                          key={`${x}${y}`}
                          value={evaluate(g, x, y).out}
                          on={x === a && (g.unary ? true : y === b)}
                        />
                      ))}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="m-0 mt-3 text-xs leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
          NOT は b を使いません。真理値表の 4 列のうち、a が同じ 2 列は必ず同じ値になります。
        </p>
      </div>
    </section>
  )
}
