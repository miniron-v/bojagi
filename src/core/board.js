// 8x8 board stored as a flat array. A cell holds null, a color string, or 'knot'.
export const N = 8;

export const idx = (r, c) => r * N + c;

export function emptyBoard() {
  return new Array(N * N).fill(null);
}

export function canPlace(board, shape, r0, c0) {
  for (const [dr, dc] of shape.cells) {
    const r = r0 + dr;
    const c = c0 + dc;
    if (r < 0 || c < 0 || r >= N || c >= N) return false;
    if (board[idx(r, c)] !== null) return false;
  }
  return true;
}

export function fitsAnywhere(board, shape) {
  for (let r = 0; r <= N - shape.h; r++) {
    for (let c = 0; c <= N - shape.w; c++) {
      if (canPlace(board, shape, r, c)) return true;
    }
  }
  return false;
}

/** Returns a new board with the shape painted in color. Caller must check canPlace first. */
export function paint(board, shape, r0, c0, color) {
  const b = board.slice();
  for (const [dr, dc] of shape.cells) b[idx(r0 + dr, c0 + dc)] = color;
  return b;
}

/**
 * Lines that are completely filled. Each line lists its cells and whether it is a
 * single-color seam (knots break mono-ness).
 */
export function fullLines(board) {
  const lines = [];
  for (let r = 0; r < N; r++) {
    let full = true;
    for (let c = 0; c < N; c++) if (board[idx(r, c)] === null) { full = false; break; }
    if (full) lines.push(describe(board, 'row', r));
  }
  for (let c = 0; c < N; c++) {
    let full = true;
    for (let r = 0; r < N; r++) if (board[idx(r, c)] === null) { full = false; break; }
    if (full) lines.push(describe(board, 'col', c));
  }
  return lines;
}

function describe(board, type, i) {
  const cells = [];
  for (let k = 0; k < N; k++) {
    const r = type === 'row' ? i : k;
    const c = type === 'row' ? k : i;
    cells.push({ r, c, color: board[idx(r, c)] });
  }
  const first = cells[0].color;
  const mono = first !== 'knot' && cells.every((x) => x.color === first) ? first : null;
  return { type, index: i, cells, mono };
}

/** Removes the given lines; returns { board, cleared } where cleared is the unique cell list. */
export function clearLines(board, lines) {
  const b = board.slice();
  const seen = new Set();
  const cleared = [];
  for (const line of lines) {
    for (const cell of line.cells) {
      const k = idx(cell.r, cell.c);
      if (seen.has(k)) continue;
      seen.add(k);
      cleared.push(cell);
      b[k] = null;
    }
  }
  return { board: b, cleared };
}

export function filledCount(board) {
  let n = 0;
  for (const v of board) if (v !== null) n++;
  return n;
}
