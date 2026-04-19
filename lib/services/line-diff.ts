export type DiffOp = 'same' | 'add' | 'del'

export interface DiffLine {
  op: DiffOp
  text: string
  oldNo?: number
  newNo?: number
}

/**
 * Minimal LCS-based line diff. O(n*m) memory — fine for .env files which are
 * small. Returns a unified stream of lines labeled same/add/del with original
 * line numbers so the UI can render a classic +/- diff.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.length ? before.split('\n') : []
  const b = after.length ? after.split('\n') : []
  const n = a.length
  const m = b.length

  // Classic LCS table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i], oldNo: i + 1, newNo: j + 1 })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: 'del', text: a[i], oldNo: i + 1 })
      i++
    } else {
      out.push({ op: 'add', text: b[j], newNo: j + 1 })
      j++
    }
  }
  while (i < n) out.push({ op: 'del', text: a[i], oldNo: ++i })
  while (j < m) out.push({ op: 'add', text: b[j], newNo: ++j })
  return out
}
