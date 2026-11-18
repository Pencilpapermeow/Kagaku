// The marking table (Correct / Wrong per row), shared by "Create your own test" (one row per
// format) and "Test from paper" (one row per section of the paper).

import type { SchemeRule } from '../content/schema'

export interface SchemeRow {
  key: string
  label: string
  rule: SchemeRule
  /** Show the JA partial-marking switch (multiple correct). */
  partial?: boolean
}

export function SchemeTable({ rows, onChange, head = 'Format' }: { rows: SchemeRow[]; onChange: (key: string, patch: Partial<SchemeRule>) => void; head?: string }) {
  const showPartial = rows.some((r) => r.partial)
  return (
    <div className="table-wrap">
      <table className="rtable scheme-table">
        <thead>
          <tr>
            <th>{head}</th>
            <th>Correct</th>
            <th>Wrong</th>
            {showPartial && <th>Partial</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                {r.label}
                {!showPartial && r.rule.partial && <span className="muted small"> (partial)</span>}
              </td>
              <td>
                <input type="number" aria-label={`${r.label}: marks if correct`} value={r.rule.correct} onChange={(e) => onChange(r.key, { correct: Number(e.target.value) })} />
              </td>
              <td>
                <input type="number" aria-label={`${r.label}: marks if wrong`} value={r.rule.wrong} onChange={(e) => onChange(r.key, { wrong: Number(e.target.value) })} />
              </td>
              {showPartial && (
                <td>{r.partial ? <input type="checkbox" aria-label={`${r.label}: partial marking`} checked={r.rule.partial} onChange={(e) => onChange(r.key, { partial: e.target.checked })} /> : null}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
