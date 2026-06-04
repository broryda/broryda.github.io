(function () {
  const BOARD_SIZE = 19;
  const DEFAULT_VIEW_SIZE = 11;

  const TRANSFORMS = [
    { key: "identity", label: "그대로", fn: (x, y, n) => [x, y] },
    { key: "flipY", label: "상하 반전", fn: (x, y, n) => [x, n - 1 - y] },
    { key: "flipX", label: "좌우 반전", fn: (x, y, n) => [n - 1 - x, y] },
    { key: "rot180", label: "180° 회전", fn: (x, y, n) => [n - 1 - x, n - 1 - y] },
    { key: "rot90", label: "90° 회전", fn: (x, y, n) => [n - 1 - y, x] },
    { key: "rot270", label: "270° 회전", fn: (x, y, n) => [y, n - 1 - x] },
    { key: "transpose", label: "대각 반전", fn: (x, y, n) => [y, x] },
    { key: "antiTranspose", label: "반대각 반전", fn: (x, y, n) => [n - 1 - y, n - 1 - x] },
  ];

  function sgfUnescape(value) {
    let out = "";
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === "\\" && i + 1 < value.length) {
        i += 1;
      }
      out += value[i] || "";
    }
    return out;
  }

  function parseSgfNodes(sgf) {
    const nodes = [];
    let node = null;
    let i = 0;
    while (i < sgf.length) {
      const ch = sgf[i];
      if (ch === ";") {
        node = {};
        nodes.push(node);
        i += 1;
        continue;
      }
      if (!/[A-Za-z]/.test(ch)) {
        i += 1;
        continue;
      }

      const start = i;
      while (i < sgf.length && /[A-Za-z]/.test(sgf[i])) i += 1;
      const key = sgf.slice(start, i);
      const values = [];
      while (i < sgf.length && /\s/.test(sgf[i])) i += 1;
      while (i < sgf.length && sgf[i] === "[") {
        i += 1;
        let raw = "";
        while (i < sgf.length) {
          if (sgf[i] === "\\" && i + 1 < sgf.length) {
            raw += sgf[i] + sgf[i + 1];
            i += 2;
            continue;
          }
          if (sgf[i] === "]") {
            i += 1;
            break;
          }
          raw += sgf[i];
          i += 1;
        }
        values.push(sgfUnescape(raw));
        while (i < sgf.length && /\s/.test(sgf[i])) i += 1;
      }
      if (node && values.length) {
        node[key] = (node[key] || []).concat(values);
      }
    }
    return nodes;
  }

  function coordToPoint(coord) {
    if (!coord || coord.length < 2) return { x: null, y: null };
    return {
      x: coord.charCodeAt(0) - 97,
      y: coord.charCodeAt(1) - 97,
    };
  }

  function parseSgfText(sgf, fallbackTitle = "새 정석") {
    const nodes = parseSgfNodes(sgf || "");
    const root = nodes[0] || {};
    const boardSize = Number.parseInt((root.SZ && root.SZ[0]) || "19", 10) || 19;
    const title = (root.GN && root.GN[0]) || fallbackTitle;
    const rootComment = (root.C && root.C[0]) || "";
    const moves = [];

    for (const node of nodes.slice(1)) {
      const color = node.B ? "B" : node.W ? "W" : null;
      if (!color) continue;
      const point = coordToPoint(node[color][0]);
      moves.push({
        color,
        x: point.x,
        y: point.y,
        comment: (node.C && node.C[0]) || "",
      });
    }

    return { boardSize, title, rootComment, moves };
  }

  function sgfCoord(point) {
    if (point.x == null || point.y == null) return "";
    return String.fromCharCode(97 + point.x) + String.fromCharCode(97 + point.y);
  }

  function normalizeEntry(entry) {
    if (entry.moves && entry.moves.length) return entry;
    if (!entry.sgf) return { ...entry, boardSize: entry.boardSize || 19, moves: [] };
    return { ...entry, ...parseSgfText(entry.sgf, entry.title) };
  }

  function mapMove(move, transform, boardSize) {
    if (move.x == null || move.y == null) return { ...move, x19: null, y19: null };
    const [tx, ty] = transform.fn(move.x, move.y, boardSize);
    const offsetX = Math.max(0, BOARD_SIZE - boardSize);
    return {
      ...move,
      x19: tx + offsetX,
      y19: ty,
    };
  }

  function scoreCandidate(mappedMoves, viewSize) {
    const cropStartX = BOARD_SIZE - viewSize;
    let outside = 0;
    let overflow = 0;
    for (const move of mappedMoves) {
      if (move.x19 == null || move.y19 == null) continue;
      const left = Math.max(0, cropStartX - move.x19);
      const right = Math.max(0, move.x19 - (BOARD_SIZE - 1));
      const top = Math.max(0, -move.y19);
      const bottom = Math.max(0, move.y19 - (viewSize - 1));
      const miss = left + right + top + bottom;
      if (miss > 0) outside += 1;
      overflow += miss;
    }

    let shape = 0;
    let cornerPenalty = 0;
    const first = mappedMoves.find((move) => move.x19 != null && move.y19 != null);
    if (first) {
      const rightDistance = BOARD_SIZE - 1 - first.x19;
      const topDistance = first.y19;
      shape = Math.abs(rightDistance - 3) + Math.abs(topDistance - 3);
      cornerPenalty =
        Math.max(0, 14 - first.x19) * 5000 +
        Math.max(0, first.y19 - 4) * 5000;
    }
    return cornerPenalty + outside * 10000 + overflow * 100 + shape;
  }

  function orientEntry(entry, viewSize = DEFAULT_VIEW_SIZE) {
    const normalized = normalizeEntry(entry);
    const boardSize = normalized.boardSize || BOARD_SIZE;
    const candidates = TRANSFORMS.map((transform) => {
      const moves = normalized.moves.map((move) => mapMove(move, transform, boardSize));
      return {
        key: transform.key,
        label: transform.label,
        moves,
        score: scoreCandidate(moves, viewSize),
      };
    }).sort((a, b) => a.score - b.score);

    const best = candidates[0] || {
      key: "identity",
      label: "그대로",
      moves: [],
      score: 0,
    };
    const cropStartX = BOARD_SIZE - viewSize;
    const outsideMoves = best.moves.filter(
      (move) =>
        move.x19 != null &&
        (move.x19 < cropStartX ||
          move.x19 >= BOARD_SIZE ||
          move.y19 < 0 ||
          move.y19 >= viewSize)
    );

    return {
      ...normalized,
      orientedMoves: best.moves,
      orientationKey: best.key,
      orientationLabel: best.label,
      viewSize,
      cropStartX,
      outsideMoves,
    };
  }

  window.JosekiSgf = {
    BOARD_SIZE,
    DEFAULT_VIEW_SIZE,
    parseSgfText,
    sgfCoord,
    orientEntry,
    normalizeEntry,
  };
})();
