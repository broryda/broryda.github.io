(function () {
  const OWNER = "broryda";
  const REPO = "broryda.github.io";
  const DATA_PATH = "joseki/data/joseki-data.js";
  const TREE_PATH = "joseki/data/merged-joseki-tree.js";
  const BOARD_SIZE = 19;
  const VIEW_SIZE = 13;
  const CROP_START_X = BOARD_SIZE - VIEW_SIZE;

  const CATEGORIES = [
    { key: "all", label: "전체" },
    { key: "star", label: "화점 정석" },
    { key: "komoku", label: "소목 정석" },
    { key: "takamoku", label: "고목정석" },
    { key: "mokuhazushi", label: "외목정석" },
    { key: "sansan", label: "33정석" },
    { key: "unknown", label: "미분류" },
  ];

  const dom = {
    categorySelect: document.getElementById("categorySelect"),
    searchInput: document.getElementById("searchInput"),
    josekiList: document.getElementById("josekiList"),
    tokenInput: document.getElementById("tokenInput"),
    branchInput: document.getElementById("branchInput"),
    commitMessageInput: document.getElementById("commitMessageInput"),
    commitBtn: document.getElementById("commitBtn"),
    statusBox: document.getElementById("statusBox"),
    editorTitle: document.getElementById("editorTitle"),
    editorMeta: document.getElementById("editorMeta"),
    editBoard: document.getElementById("editBoard"),
    moveNumber: document.getElementById("moveNumber"),
    moveSlider: document.getElementById("moveSlider"),
    undoMoveBtn: document.getElementById("undoMoveBtn"),
    clearMovesBtn: document.getElementById("clearMovesBtn"),
    saveLocalBtn: document.getElementById("saveLocalBtn"),
    rootCommentInput: document.getElementById("rootCommentInput"),
    currentCommentInput: document.getElementById("currentCommentInput"),
    selectedMoveText: document.getElementById("selectedMoveText"),
    moveComments: document.getElementById("moveComments"),
  };

  const sourceData = window.JOSEKI_DATA || { version: 1, name: "기본정석 SGF 데이터", skipped: [], entries: [] };
  let data = JSON.parse(JSON.stringify(sourceData));
  let entries = data.entries || [];
  let activeIndex = entries.length ? 0 : -1;
  let editMove = 0;

  function setStatus(message) {
    dom.statusBox.textContent = message;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sgfEscape(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\]/g, "\\]")
      .replace(/\r?\n/g, "\\n");
  }

  function sgfCoordFromRaw(move) {
    if (move.x == null || move.y == null) return "";
    return String.fromCharCode(97 + Number(move.x)) + String.fromCharCode(97 + Number(move.y));
  }

  function sgfCoord19(x, y) {
    return String.fromCharCode(97 + Number(x)) + String.fromCharCode(97 + Number(y));
  }

  function rawCoordLabel(move) {
    return sgfCoordFromRaw(move).toUpperCase();
  }

  function displayCoordLabel(move) {
    const x = move.x19 ?? move.x;
    const y = move.y19 ?? move.y;
    const col = String.fromCharCode(65 + Math.max(0, BOARD_SIZE - 1 - x));
    return `${col}${y + 1}`;
  }

  function activeEntry() {
    return entries[activeIndex] || null;
  }

  function buildEntrySgf(entry) {
    const boardSize = Number.parseInt(entry.boardSize || 19, 10) || 19;
    let sgf = `(;FF[4]GM[1]CA[UTF-8]SZ[${boardSize}]AP[JosekiStudy:secret-board-editor]`;
    if (entry.title) sgf += `GN[${sgfEscape(entry.title)}]`;
    if (entry.rootComment) sgf += `C[${sgfEscape(entry.rootComment)}]`;
    for (const move of entry.moves || []) {
      const coord = sgfCoordFromRaw(move);
      if (!coord) continue;
      sgf += `;${move.color || "B"}[${coord}]`;
      if (move.comment) sgf += `C[${sgfEscape(move.comment)}]`;
    }
    return `${sgf})`;
  }

  function displayMoves(entry) {
    if (!entry) return [];
    if (entry.__displayNormalized) {
      return (entry.moves || []).map((move) => ({
        ...move,
        x19: move.x,
        y19: move.y,
      }));
    }
    const oriented = window.JosekiSgf.orientEntry(entry, VIEW_SIZE);
    return oriented.orientedMoves || [];
  }

  function normalizeActiveToDisplay() {
    const entry = activeEntry();
    if (!entry || entry.__displayNormalized) return entry;
    const oriented = displayMoves(entry);
    entry.boardSize = BOARD_SIZE;
    entry.moves = oriented.map((move) => ({
      color: move.color,
      x: move.x19,
      y: move.y19,
      comment: move.comment || "",
    }));
    entry.__displayNormalized = true;
    entry.sgf = buildEntrySgf(entry);
    return entry;
  }

  function persistCommentsToEntry() {
    const entry = activeEntry();
    if (!entry) return;
    entry.rootComment = dom.rootCommentInput.value;
    const currentIndex = editMove > 0 ? editMove - 1 : -1;
    if (currentIndex >= 0 && entry.moves && entry.moves[currentIndex]) {
      entry.moves[currentIndex].comment = dom.currentCommentInput.value;
    }
    entry.sgf = buildEntrySgf(entry);
  }

  function coordKey(move) {
    return `${move.x19},${move.y19}`;
  }

  function classifyFirstMove(entry) {
    const oriented = window.JosekiSgf.orientEntry(entry, VIEW_SIZE);
    const move = oriented.orientedMoves && oriented.orientedMoves[0];
    if (!move) return "unknown";
    const key = coordKey(move);
    if (key === "15,3") return "star";
    if (key === "16,3" || key === "15,2") return "komoku";
    if (key === "15,4" || key === "14,3") return "takamoku";
    if (key === "16,4" || key === "14,2") return "mokuhazushi";
    if (key === "16,2") return "sansan";
    return "unknown";
  }

  function categoryEntries(categoryKey) {
    return entries
      .map((entry, index) => ({ entry, index, categoryKey: classifyFirstMove(entry) }))
      .filter((item) => categoryKey === "all" || item.categoryKey === categoryKey);
  }

  function renderCategorySelect() {
    const current = dom.categorySelect.value || "all";
    dom.categorySelect.innerHTML = "";
    for (const category of CATEGORIES) {
      const count = categoryEntries(category.key).length;
      if (category.key !== "all" && count === 0) continue;
      const option = document.createElement("option");
      option.value = category.key;
      option.textContent = `${category.label} (${count})`;
      dom.categorySelect.appendChild(option);
    }
    dom.categorySelect.value = [...dom.categorySelect.options].some((option) => option.value === current) ? current : "all";
  }

  function renderList() {
    const categoryKey = dom.categorySelect.value || "all";
    const q = dom.searchInput.value.trim().toLowerCase();
    const items = categoryEntries(categoryKey).filter(({ entry }) => {
      const haystack = [entry.order, entry.title, entry.filename, entry.path].filter(Boolean).join(" ").toLowerCase();
      return !q || haystack.includes(q);
    });

    dom.josekiList.innerHTML = "";
    for (const { entry, index } of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = index === activeIndex ? "active" : "";
      button.innerHTML = `<strong>${entry.order || index + 1}번 정석</strong><br><span class="muted small">${escapeHtml(
        entry.title || entry.filename || ""
      )}</span>`;
      button.addEventListener("click", () => {
        persistCommentsToEntry();
        activeIndex = index;
        editMove = 0;
        renderAll();
      });
      dom.josekiList.appendChild(button);
    }
  }

  function renderBoard() {
    const entry = activeEntry();
    const moves = displayMoves(entry);
    const boardEntry = {
      title: entry ? entry.title || "정석" : "정석",
      viewSize: VIEW_SIZE,
      cropStartX: CROP_START_X,
      orientedMoves: moves,
    };
    window.JosekiBoard.drawBoard(dom.editBoard, boardEntry, editMove, {
      onPointClick: handleBoardClick,
    });
  }

  function renderMoveTools() {
    const entry = activeEntry();
    const moves = displayMoves(entry);
    editMove = Math.max(0, Math.min(editMove, moves.length));
    dom.moveSlider.max = String(moves.length);
    dom.moveSlider.value = String(editMove);
    dom.moveNumber.textContent = moves.length ? `수순 ${editMove} / ${moves.length}` : "수순 0";

    const current = editMove > 0 ? moves[editMove - 1] : null;
    if (!current) {
      dom.selectedMoveText.textContent = "수순을 선택하세요.";
      dom.currentCommentInput.value = "";
      dom.currentCommentInput.disabled = true;
    } else {
      dom.selectedMoveText.textContent = `${editMove}수 ${current.color === "W" ? "백" : "흑"} · ${displayCoordLabel(current)}`;
      dom.currentCommentInput.disabled = false;
      dom.currentCommentInput.value = current.comment || "";
    }
  }

  function renderComments() {
    const entry = activeEntry();
    const moves = displayMoves(entry);
    dom.rootCommentInput.value = entry ? entry.rootComment || "" : "";
    dom.moveComments.innerHTML = "";
    if (!moves.length) {
      dom.moveComments.innerHTML = `<p class="muted small">아직 수순이 없습니다. 바둑판을 클릭해서 첫 수를 놓으세요.</p>`;
      return;
    }

    moves.forEach((move, index) => {
      const item = document.createElement("div");
      item.className = `comment-item${editMove === index + 1 ? " active" : ""}`;

      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "secondary";
      jump.textContent = `${index + 1}수 ${move.color === "W" ? "백" : "흑"} · ${displayCoordLabel(move)}`;
      jump.addEventListener("click", () => {
        persistCommentsToEntry();
        editMove = index + 1;
        renderAll();
      });

      const textarea = document.createElement("textarea");
      textarea.value = move.comment || "";
      textarea.placeholder = `${index + 1}수 코멘트`;
      textarea.addEventListener("input", () => {
        const entryToUpdate = activeEntry();
        if (!entryToUpdate.moves[index]) return;
        entryToUpdate.moves[index].comment = textarea.value;
        if (editMove === index + 1) dom.currentCommentInput.value = textarea.value;
        entryToUpdate.sgf = buildEntrySgf(entryToUpdate);
      });

      item.appendChild(jump);
      item.appendChild(textarea);
      dom.moveComments.appendChild(item);
    });
  }

  function renderEditorHeader() {
    const entry = activeEntry();
    if (!entry) {
      dom.editorTitle.textContent = "정석 데이터가 없습니다";
      dom.editorMeta.textContent = "";
      dom.commitMessageInput.value = "Update joseki SGF/comment";
      return;
    }
    dom.editorTitle.textContent = `${entry.order || activeIndex + 1}번 정석`;
    dom.editorMeta.textContent = entry.path || entry.filename || "";
    dom.commitMessageInput.value = `Update joseki ${entry.order || activeIndex + 1} board/comment`;
  }

  function renderAll() {
    renderCategorySelect();
    renderList();
    renderEditorHeader();
    renderBoard();
    renderMoveTools();
    renderComments();
  }

  function handleBoardClick(point) {
    persistCommentsToEntry();
    const entry = normalizeActiveToDisplay();
    if (!entry) return;

    const prefix = (entry.moves || []).slice(0, editMove);
    const occupied = prefix.some((move) => move.x === point.x19 && move.y === point.y19);
    if (occupied) {
      setStatus("이미 현재 수순에 돌이 있는 자리입니다.");
      return;
    }

    const nextColor = prefix.length % 2 === 0 ? "B" : "W";
    prefix.push({
      color: nextColor,
      x: point.x19,
      y: point.y19,
      comment: "",
    });
    entry.moves = prefix;
    editMove = entry.moves.length;
    entry.sgf = buildEntrySgf(entry);
    setStatus(`${editMove}수 ${nextColor === "W" ? "백" : "흑"}을 추가했습니다.`);
    renderAll();
  }

  function undoLastMove() {
    persistCommentsToEntry();
    const entry = normalizeActiveToDisplay();
    if (!entry || !entry.moves.length) return;
    entry.moves = entry.moves.slice(0, -1);
    editMove = Math.min(editMove, entry.moves.length);
    entry.sgf = buildEntrySgf(entry);
    setStatus("마지막 수를 삭제했습니다.");
    renderAll();
  }

  function clearMoves() {
    if (!window.confirm("이 정석의 모든 수순을 삭제할까요?")) return;
    const entry = normalizeActiveToDisplay();
    if (!entry) return;
    entry.moves = [];
    editMove = 0;
    entry.sgf = buildEntrySgf(entry);
    setStatus("수순을 모두 삭제했습니다.");
    renderAll();
  }

  function saveCurrentLocal() {
    persistCommentsToEntry();
    const entry = activeEntry();
    if (!entry) return;
    entry.sgf = buildEntrySgf(entry);
    data = { ...data, entries };
    setStatus(`${entry.order || activeIndex + 1}번 정석을 브라우저 메모리에 저장했습니다. GitHub 커밋은 아직 하지 않았습니다.`);
    renderAll();
  }

  function leafCount(node) {
    if (!node.children.size) return Math.max(1, node.terminalSources.size);
    let total = 0;
    for (const child of node.children.values()) total += leafCount(child);
    return total;
  }

  function countNodes(node) {
    let total = 0;
    for (const child of node.children.values()) total += 1 + countNodes(child);
    return total;
  }

  function maxDepth(node) {
    if (!node.children.size) return 0;
    let max = 0;
    for (const child of node.children.values()) max = Math.max(max, 1 + maxDepth(child));
    return max;
  }

  function moveKey(move) {
    return `${move.color}:${move.x19}:${move.y19}`;
  }

  function addLine(root, moves, source, rootComment) {
    let node = root;
    for (const move of moves) {
      if (move.x19 == null || move.y19 == null) continue;
      const key = moveKey(move);
      if (!node.children.has(key)) {
        node.children.set(key, {
          move: { color: move.color, x19: move.x19, y19: move.y19 },
          comments: new Set(),
          terminalSources: new Set(),
          children: new Map(),
        });
      }
      node = node.children.get(key);
      if (move.comment) node.comments.add(move.comment);
    }
    if (rootComment) node.comments.add(rootComment);
    node.terminalSources.add(source);
  }

  function nodeToSgf(node) {
    const move = node.move;
    let props = `;${move.color}[${sgfCoord19(move.x19, move.y19)}]`;
    if (node.comments.size) {
      props += `C[${sgfEscape([...node.comments].sort().join("\n\n"))}]`;
    }
    return props;
  }

  function sortedChildren(node) {
    return [...node.children.values()].sort((a, b) => {
      if (a.move.color !== b.move.color) return a.move.color.localeCompare(b.move.color);
      if (a.move.x19 !== b.move.x19) return a.move.x19 - b.move.x19;
      return a.move.y19 - b.move.y19;
    });
  }

  function childrenToSgf(node) {
    const children = sortedChildren(node);
    if (!children.length) return "";
    if (children.length === 1) {
      const child = children[0];
      return nodeToSgf(child) + childrenToSgf(child);
    }
    return children.map((child) => `(${nodeToSgf(child)}${childrenToSgf(child)})`).join("");
  }

  function treeToData(node) {
    return {
      move: node.move ? { color: node.move.color, x19: node.move.x19, y19: node.move.y19 } : null,
      comments: [...node.comments].sort(),
      terminalSources: [...node.terminalSources].sort(),
      leafCount: leafCount(node),
      children: sortedChildren(node).map(treeToData),
    };
  }

  function entryForCommit(entry) {
    const clean = { ...entry };
    delete clean.__displayNormalized;
    clean.sgf = buildEntrySgf(clean);
    return clean;
  }

  function buildMergedTreePayload(cleanEntries) {
    const root = {
      move: null,
      comments: new Set(),
      terminalSources: new Set(),
      children: new Map(),
    };
    const included = [];
    const orientationCounts = {};
    let totalInputMoves = 0;

    for (const entry of cleanEntries) {
      const oriented = window.JosekiSgf.orientEntry(entry, VIEW_SIZE);
      const moves = oriented.orientedMoves || [];
      if (!moves.length) continue;
      orientationCounts[oriented.orientationKey] = (orientationCounts[oriented.orientationKey] || 0) + 1;
      totalInputMoves += moves.length;
      const source = entry.path || entry.filename || entry.id || `joseki-${included.length + 1}`;
      addLine(root, moves, source, entry.rootComment || "");
      included.push(source);
    }

    const rawSgf = `(;FF[4]GM[1]CA[UTF-8]SZ[19]AP[JosekiStudy:secret-board-editor]GN[통합 정석 트리]${childrenToSgf(root)})\n`;
    const report = {
      output: "merged_joseki.sgf",
      included_count: included.length,
      skipped_count: (data.skipped || []).length,
      skipped: data.skipped || [],
      total_input_moves: totalInputMoves,
      merged_tree_nodes: countNodes(root),
      max_depth: maxDepth(root),
      orientation_counts: orientationCounts,
      included,
    };
    return {
      version: 1,
      name: "통합 정석 트리",
      boardSize: BOARD_SIZE,
      viewSize: VIEW_SIZE,
      rawSgf,
      report,
      root: treeToData(root),
    };
  }

  function makeDataFiles() {
    persistCommentsToEntry();
    const cleanEntries = entries.map(entryForCommit);
    const cleanData = {
      ...data,
      version: data.version || 1,
      name: data.name || "기본정석 SGF 데이터",
      entries: cleanEntries,
    };
    const tree = buildMergedTreePayload(cleanEntries);
    return [
      {
        path: DATA_PATH,
        content: `window.JOSEKI_DATA = ${JSON.stringify(cleanData, null, 2)};\n`,
      },
      {
        path: TREE_PATH,
        content: `window.JOSEKI_TREE = ${JSON.stringify(tree, null, 2)};\n`,
      },
    ];
  }

  async function githubRequest(token, path, options = {}) {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
    if (!response.ok) {
      const message = payload && payload.message ? payload.message : response.statusText;
      throw new Error(`${response.status} ${message}`);
    }
    return payload;
  }

  function encodeContentPath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function base64EncodeUtf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async function updateFileWithContentsApi(token, file, branch, message) {
    const encodedPath = encodeContentPath(file.path);
    const current = await githubRequest(token, `contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);
    return githubRequest(token, `contents/${encodedPath}`, {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: base64EncodeUtf8(file.content),
        sha: current.sha,
        branch,
      }),
    });
  }

  async function commitFilesToGithub() {
    const token = dom.tokenInput.value.trim();
    if (!token) {
      setStatus("GitHub token을 입력하세요. fine-grained token에는 broryda.github.io Contents read/write 권한이 필요합니다.");
      return;
    }

    const branch = dom.branchInput.value.trim() || "main";
    const message = dom.commitMessageInput.value.trim() || "Update joseki board/comment";
    const files = makeDataFiles();

    dom.commitBtn.disabled = true;
    try {
      const updated = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setStatus(`GitHub에 ${file.path} 업데이트 중... (${i + 1}/${files.length})`);
        const suffix = files.length > 1 ? ` [${i + 1}/${files.length}]` : "";
        const result = await updateFileWithContentsApi(token, file, branch, `${message}${suffix}`);
        updated.push(result.commit && result.commit.html_url ? result.commit.html_url : "");
      }

      setStatus(
        `커밋 완료!\n${updated.filter(Boolean).join("\n")}\n\nGitHub Pages 반영에는 잠시 시간이 걸릴 수 있습니다.`
      );
    } catch (error) {
      setStatus(
        `커밋 실패: ${error.message}\n\n` +
          "토큰 설정을 확인하세요:\n" +
          "- Repository access: broryda/broryda.github.io 선택\n" +
          "- Repository permissions > Contents: Read and write\n" +
          "- 만료되지 않은 fine-grained token\n" +
          "- 브랜치명: main"
      );
    } finally {
      dom.commitBtn.disabled = false;
    }
  }

  function init() {
    renderAll();
    dom.categorySelect.addEventListener("change", renderList);
    dom.searchInput.addEventListener("input", renderList);
    dom.moveSlider.addEventListener("input", () => {
      persistCommentsToEntry();
      editMove = Number.parseInt(dom.moveSlider.value, 10) || 0;
      renderAll();
    });
    dom.currentCommentInput.addEventListener("input", persistCommentsToEntry);
    dom.rootCommentInput.addEventListener("input", persistCommentsToEntry);
    dom.undoMoveBtn.addEventListener("click", undoLastMove);
    dom.clearMovesBtn.addEventListener("click", clearMoves);
    dom.saveLocalBtn.addEventListener("click", saveCurrentLocal);
    dom.commitBtn.addEventListener("click", commitFilesToGithub);
  }

  init();
})();
