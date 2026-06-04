(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const BOARD_SIZE = 19;
  const COORD_LABELS = "ABCDEFGHJKLMNOPQRST";

  function el(name, attrs = {}, text = "") {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
  }

  function pointKey(x, y) {
    return `${x},${y}`;
  }

  function neighbors(x, y) {
    return [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ].filter(([nx, ny]) => nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE);
  }

  function collectGroup(grid, x, y) {
    const start = grid.get(pointKey(x, y));
    if (!start) return { stones: [], liberties: 0 };
    const color = start.color;
    const seen = new Set();
    const liberties = new Set();
    const stack = [[x, y]];

    while (stack.length) {
      const [cx, cy] = stack.pop();
      const key = pointKey(cx, cy);
      if (seen.has(key)) continue;
      seen.add(key);
      for (const [nx, ny] of neighbors(cx, cy)) {
        const nkey = pointKey(nx, ny);
        const stone = grid.get(nkey);
        if (!stone) {
          liberties.add(nkey);
        } else if (stone.color === color && !seen.has(nkey)) {
          stack.push([nx, ny]);
        }
      }
    }
    return { stones: Array.from(seen), liberties: liberties.size };
  }

  function buildPosition(moves, moveCount) {
    const grid = new Map();
    const limit = Math.max(0, Math.min(moveCount, moves.length));

    for (let i = 0; i < limit; i += 1) {
      const move = moves[i];
      const x = move.x19;
      const y = move.y19;
      if (x == null || y == null || x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
        continue;
      }

      const key = pointKey(x, y);
      grid.set(key, { color: move.color, number: i + 1 });
      const opponent = move.color === "B" ? "W" : "B";

      for (const [nx, ny] of neighbors(x, y)) {
        const nkey = pointKey(nx, ny);
        const stone = grid.get(nkey);
        if (!stone || stone.color !== opponent) continue;
        const group = collectGroup(grid, nx, ny);
        if (group.liberties === 0) {
          for (const dead of group.stones) grid.delete(dead);
        }
      }

      const own = collectGroup(grid, x, y);
      if (own.liberties === 0) {
        for (const dead of own.stones) grid.delete(dead);
      }
    }

    return grid;
  }

  function drawBoard(svg, orientedEntry, moveCount, options = {}) {
    const viewSize = orientedEntry.viewSize || window.JosekiSgf.DEFAULT_VIEW_SIZE;
    const cropStartX = orientedEntry.cropStartX ?? BOARD_SIZE - viewSize;
    const size = 720;
    const pad = 54;
    const boardPx = size - pad * 2;
    const gap = boardPx / (viewSize - 1);
    const pos = (n) => pad + n * gap;
    const moves = orientedEntry.orientedMoves || [];
    const grid = buildPosition(moves, moveCount);
    const lastMove = moveCount > 0 ? moves[moveCount - 1] : null;

    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${orientedEntry.title} 우상귀 정석도`);
    svg.appendChild(el("rect", { x: 0, y: 0, width: size, height: size, rx: 28, fill: "#dcb36e" }));

    for (let i = 0; i < viewSize; i += 1) {
      const p = pos(i);
      svg.appendChild(
        el("line", {
          x1: pad,
          y1: p,
          x2: size - pad,
          y2: p,
          stroke: "#3d2614",
          "stroke-width": i === 0 || i === viewSize - 1 ? 2.2 : 1.4,
        })
      );
      svg.appendChild(
        el("line", {
          x1: p,
          y1: pad,
          x2: p,
          y2: size - pad,
          stroke: "#3d2614",
          "stroke-width": i === 0 || i === viewSize - 1 ? 2.2 : 1.4,
        })
      );
    }

    const starPoints = [3, 9, 15];
    for (const x of starPoints) {
      for (const y of starPoints) {
        if (x >= cropStartX && x < BOARD_SIZE && y >= 0 && y < viewSize) {
          svg.appendChild(
            el("circle", {
              cx: pos(x - cropStartX),
              cy: pos(y),
              r: 5.4,
              fill: "#3d2614",
            })
          );
        }
      }
    }

    for (let i = 0; i < viewSize; i += 1) {
      const x = cropStartX + i;
      svg.appendChild(
        el(
          "text",
          {
            x: pos(i),
            y: 32,
            "text-anchor": "middle",
            class: "coord",
          },
          COORD_LABELS[x] || String(x + 1)
        )
      );
      svg.appendChild(
        el(
          "text",
          {
            x: 30,
            y: pos(i) + 5,
            "text-anchor": "middle",
            class: "coord",
          },
          String(BOARD_SIZE - i)
        )
      );
    }

    for (const [key, stone] of grid.entries()) {
      const [x, y] = key.split(",").map(Number);
      if (x < cropStartX || x >= BOARD_SIZE || y < 0 || y >= viewSize) continue;
      const cx = pos(x - cropStartX);
      const cy = pos(y);
      svg.appendChild(
        el("circle", {
          cx,
          cy,
          r: gap * 0.42,
          fill: stone.color === "B" ? "#101010" : "#f6f1df",
          stroke: stone.color === "B" ? "#000" : "#66543a",
          "stroke-width": 2,
          filter: "drop-shadow(0 3px 2px rgba(0,0,0,.25))",
        })
      );
      svg.appendChild(
        el(
          "text",
          {
            x: cx,
            y: cy + 6,
            "text-anchor": "middle",
            class: stone.color === "B" ? "stone-label light" : "stone-label dark",
          },
          String(stone.number)
        )
      );
    }

    if (options.onPointClick) {
      for (let localX = 0; localX < viewSize; localX += 1) {
        for (let y = 0; y < viewSize; y += 1) {
          const x19 = cropStartX + localX;
          const target = el("circle", {
            cx: pos(localX),
            cy: pos(y),
            r: gap * 0.48,
            fill: "transparent",
            class: "point-target",
          });
          target.addEventListener("click", () => options.onPointClick({ x19, y19: y }));
          svg.appendChild(target);
        }
      }
    }

    if (
      options.hintMove &&
      options.hintMove.x19 >= cropStartX &&
      options.hintMove.x19 < BOARD_SIZE &&
      options.hintMove.y19 >= 0 &&
      options.hintMove.y19 < viewSize
    ) {
      const cx = pos(options.hintMove.x19 - cropStartX);
      const cy = pos(options.hintMove.y19);
      svg.appendChild(
        el("circle", {
          cx,
          cy,
          r: gap * 0.4,
          fill: options.hintMove.color === "B" ? "#111" : "#f6f1df",
          stroke: "#29d670",
          "stroke-width": 4,
          opacity: 0.32,
          "pointer-events": "none",
        })
      );
    }

    for (const candidate of options.candidates || []) {
      if (
        candidate.x19 == null ||
        candidate.y19 == null ||
        candidate.x19 < cropStartX ||
        candidate.x19 >= BOARD_SIZE ||
        candidate.y19 < 0 ||
        candidate.y19 >= viewSize
      ) {
        continue;
      }

      const group = el("g", {
        class: "candidate-move",
        role: "button",
        tabindex: 0,
        "aria-label": `${candidate.count || 1}개 정석의 다음 가능 수`,
      });
      const cx = pos(candidate.x19 - cropStartX);
      const cy = pos(candidate.y19);
      group.appendChild(
        el("circle", {
          cx,
          cy,
          r: gap * 0.38,
          fill: "rgba(41, 214, 112, .86)",
          stroke: "#082a15",
          "stroke-width": 3,
          filter: "drop-shadow(0 3px 3px rgba(0,0,0,.35))",
        })
      );
      if (options.onCandidateClick) {
        group.addEventListener("click", () => options.onCandidateClick(candidate));
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            options.onCandidateClick(candidate);
          }
        });
      }
      svg.appendChild(group);
    }

    if (
      lastMove &&
      lastMove.x19 >= cropStartX &&
      lastMove.x19 < BOARD_SIZE &&
      lastMove.y19 >= 0 &&
      lastMove.y19 < viewSize
    ) {
      svg.appendChild(
        el("circle", {
          cx: pos(lastMove.x19 - cropStartX),
          cy: pos(lastMove.y19),
          r: gap * 0.5,
          fill: "none",
          stroke: "#e54747",
          "stroke-width": 5,
        })
      );
    }
  }

  window.JosekiBoard = {
    drawBoard,
    buildPosition,
  };
})();
