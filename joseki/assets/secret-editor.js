(function () {
  const OWNER = "broryda";
  const REPO = "broryda.github.io";
  const DATA_PATH = "joseki/data/joseki-data.js";
  const TREE_PATH = "joseki/data/merged-joseki-tree.js";
  const BOARD_SIZE = 19;
  const VIEW_SIZE = 13;

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
    titleInput: document.getElementById("titleInput"),
    filenameInput: document.getElementById("filenameInput"),
    folderInput: document.getElementById("folderInput"),
    boardSizeInput: document.getElementById("boardSizeInput"),
    rootCommentInput: document.getElementById("rootCommentInput"),
    sgfInput: document.getElementById("sgfInput"),
    parseSgfBtn: document.getElementById("parseSgfBtn"),
    saveLocalBtn: document.getElementById("saveLocalBtn"),
    moveComments: document.getElementById("moveComments"),
  };

  const sourceData = window.JOSEKI_DATA || { version: 1, name: "기본정석 SGF 데이터", skipped: [], entries: [] };
  let data = JSON.parse(JSON.stringify(sourceData));
  let entries = data.entries || [];
  let activeIndex = entries.length ? 0 : -1;
  let lastParsedSgf = "";

  function setStatus(message) {
    dom.statusBox.textContent = message;
  }

  function sgfEscape(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\]/g, "\\]")
      .replace(/\r?\n/g, "\\n");
  }

  function sgfCoord(move) {
    if (move.x == null || move.y == null) return "";
    return String.fromCharCode(97 + Number(move.x)) + String.fromCharCode(97 + Number(move.y));
  }

  function sgfCoord19(x, y) {
    return String.fromCharCode(97 + Number(x)) + String.fromCharCode(97 + Number(y));
  }

  function buildEntrySgf(entry) {
    const boardSize = Number.parseInt(entry.boardSize || 19, 10) || 19;
    let sgf = `(;FF[4]GM[1]CA[UTF-8]SZ[${boardSize}]AP[JosekiStudy:web-editor]`;
    if (entry.title) sgf += `GN[${sgfEscape(entry.title)}]`;
    if (entry.rootComment) sgf += `C[${sgfEscape(entry.rootComment)}]`;
    for (const move of entry.moves || []) {
      const coord = sgfCoord(move);
      if (!coord) continue;
      sgf += `;${move.color || "B"}[${coord}]`;
      if (move.comment) sgf += `C[${sgfEscape(move.comment)}]`;
    }
    return `${sgf})`;
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
        saveCurrent({ silent: true });
        activeIndex = index;
        renderEditor();
        renderList();
      });
      dom.josekiList.appendChild(button);
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function activeEntry() {
    return entries[activeIndex] || null;
  }

  function renderMoveComments(moves) {
    dom.moveComments.innerHTML = "";
    if (!moves || !moves.length) {
      dom.moveComments.innerHTML = `<p class="muted">SGF를 파싱하면 수순별 코멘트 입력칸이 표시됩니다.</p>`;
      return;
    }
    moves.forEach((move, index) => {
      const row = document.createElement("label");
      row.className = "comment-row";
      const color = move.color === "W" ? "백" : "흑";
      row.innerHTML = `<span>${index + 1}수<br>${color} ${sgfCoord(move).toUpperCase()}</span>`;
      const textarea = document.createElement("textarea");
      textarea.dataset.moveIndex = String(index);
      textarea.value = move.comment || "";
      textarea.placeholder = `${index + 1}수 코멘트`;
      row.appendChild(textarea);
      dom.moveComments.appendChild(row);
    });
  }

  function renderEditor() {
    const entry = activeEntry();
    if (!entry) {
      dom.editorTitle.textContent = "정석 데이터가 없습니다";
      return;
    }
    dom.editorTitle.textContent = `${entry.order || activeIndex + 1}번 정석`;
    dom.editorMeta.textContent = entry.path || entry.filename || "";
    dom.titleInput.value = entry.title || "";
    dom.filenameInput.value = entry.filename || "";
    dom.folderInput.value = entry.category || (entry.path ? entry.path.split("/")[0] : "");
    dom.boardSizeInput.value = String(entry.boardSize || 19);
    dom.rootCommentInput.value = entry.rootComment || "";
    dom.sgfInput.value = entry.sgf || buildEntrySgf(entry);
    lastParsedSgf = dom.sgfInput.value;
    renderMoveComments(entry.moves || []);
    dom.commitMessageInput.value = `Update joseki ${entry.order || activeIndex + 1} SGF/comment`;
  }

  function readMoveComments() {
    const comments = [];
    dom.moveComments.querySelectorAll("textarea[data-move-index]").forEach((textarea) => {
      comments[Number(textarea.dataset.moveIndex)] = textarea.value;
    });
    return comments;
  }

  function parsedFromSgfInput() {
    const title = dom.titleInput.value.trim() || "정석";
    const parsed = window.JosekiSgf.parseSgfText(dom.sgfInput.value || "", title);
    return parsed;
  }

  function saveCurrent(options = {}) {
    const entry = activeEntry();
    if (!entry) return null;
    let parsed;
    try {
      parsed = parsedFromSgfInput();
    } catch (error) {
      if (!options.silent) setStatus(`SGF 파싱 실패: ${error.message}`);
      return null;
    }

    const useTextareaComments = dom.sgfInput.value === lastParsedSgf;
    const comments = useTextareaComments ? readMoveComments() : [];
    const moves = parsed.moves.map((move, index) => ({
      color: move.color,
      x: move.x,
      y: move.y,
      comment: useTextareaComments ? comments[index] ?? move.comment ?? "" : move.comment ?? "",
    }));
    const folder = dom.folderInput.value.trim() || entry.category || "직접 입력";
    const filename = dom.filenameInput.value.trim() || entry.filename || `${entry.id || "joseki"}.sgf`;
    const next = {
      ...entry,
      title: dom.titleInput.value.trim() || parsed.title || entry.title || filename,
      category: folder,
      filename,
      path: `${folder}/${filename}`,
      boardSize: Number.parseInt(dom.boardSizeInput.value || parsed.boardSize || 19, 10) || 19,
      rootComment: dom.rootCommentInput.value,
      moves,
    };
    next.sgf = buildEntrySgf(next);
    entries[activeIndex] = next;
    data = { ...data, entries };
    dom.sgfInput.value = next.sgf;
    lastParsedSgf = next.sgf;
    renderMoveComments(next.moves);
    renderCategorySelect();
    renderList();
    renderEditorHeaderOnly(next);
    if (!options.silent) setStatus(`${next.order || activeIndex + 1}번 정석을 브라우저 메모리에 저장했습니다. 아직 GitHub에는 커밋되지 않았습니다.`);
    return next;
  }

  function renderEditorHeaderOnly(entry) {
    dom.editorTitle.textContent = `${entry.order || activeIndex + 1}번 정석`;
    dom.editorMeta.textContent = entry.path || entry.filename || "";
  }

  function parseSgfIntoEditor() {
    let parsed;
    try {
      parsed = parsedFromSgfInput();
    } catch (error) {
      setStatus(`SGF 파싱 실패: ${error.message}`);
      return;
    }
    dom.boardSizeInput.value = String(parsed.boardSize || 19);
    if (!dom.titleInput.value.trim()) dom.titleInput.value = parsed.title || "";
    if (!dom.rootCommentInput.value) dom.rootCommentInput.value = parsed.rootComment || "";
    renderMoveComments(parsed.moves || []);
    lastParsedSgf = dom.sgfInput.value;
    setStatus(`SGF 파싱 완료: ${parsed.moves.length}수`);
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

  function buildMergedTreePayload() {
    const root = {
      move: null,
      comments: new Set(),
      terminalSources: new Set(),
      children: new Map(),
    };
    const included = [];
    const orientationCounts = {};
    let totalInputMoves = 0;

    for (const entry of entries) {
      const oriented = window.JosekiSgf.orientEntry(entry, VIEW_SIZE);
      const moves = oriented.orientedMoves || [];
      if (!moves.length) continue;
      orientationCounts[oriented.orientationKey] = (orientationCounts[oriented.orientationKey] || 0) + 1;
      totalInputMoves += moves.length;
      const source = entry.path || entry.filename || entry.id || `joseki-${included.length + 1}`;
      addLine(root, moves, source, entry.rootComment || "");
      included.push(source);
    }

    const rawSgf = `(;FF[4]GM[1]CA[UTF-8]SZ[19]AP[JosekiStudy:web-editor]GN[통합 정석 트리]${childrenToSgf(root)})\n`;
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
    data = { ...data, version: data.version || 1, name: data.name || "기본정석 SGF 데이터", entries };
    const tree = buildMergedTreePayload();
    return [
      {
        path: DATA_PATH,
        content: `window.JOSEKI_DATA = ${JSON.stringify(data, null, 2)};\n`,
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

  async function commitFilesToGithub() {
    const token = dom.tokenInput.value.trim();
    if (!token) {
      setStatus("GitHub token을 입력하세요. fine-grained token에는 broryda.github.io Contents read/write 권한이 필요합니다.");
      return;
    }
    const branch = dom.branchInput.value.trim() || "main";
    const message = dom.commitMessageInput.value.trim() || "Update joseki SGF/comment";
    const current = saveCurrent({ silent: true });
    if (!current) return;
    const files = makeDataFiles();

    dom.commitBtn.disabled = true;
    try {
      setStatus("GitHub 현재 브랜치 정보를 가져오는 중...");
      const ref = await githubRequest(token, `git/ref/heads/${encodeURIComponent(branch)}`);
      const headSha = ref.object.sha;
      const baseCommit = await githubRequest(token, `git/commits/${headSha}`);

      setStatus("변경 파일 blob 생성 중...");
      const tree = [];
      for (const file of files) {
        const blob = await githubRequest(token, "git/blobs", {
          method: "POST",
          body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
        });
        tree.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
      }

      setStatus("커밋 트리 생성 중...");
      const nextTree = await githubRequest(token, "git/trees", {
        method: "POST",
        body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
      });
      const nextCommit = await githubRequest(token, "git/commits", {
        method: "POST",
        body: JSON.stringify({ message, tree: nextTree.sha, parents: [headSha] }),
      });

      setStatus("브랜치 ref 업데이트 중...");
      await githubRequest(token, `git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: nextCommit.sha }),
      });

      setStatus(`커밋 완료!\n${nextCommit.html_url}\n\nGitHub Pages 반영에는 잠시 시간이 걸릴 수 있습니다.`);
    } catch (error) {
      setStatus(`커밋 실패: ${error.message}\n\n토큰 권한(Contents read/write), 브랜치명, 저장소 권한을 확인하세요.`);
    } finally {
      dom.commitBtn.disabled = false;
    }
  }

  function init() {
    renderCategorySelect();
    renderList();
    renderEditor();
    dom.categorySelect.addEventListener("change", renderList);
    dom.searchInput.addEventListener("input", renderList);
    dom.parseSgfBtn.addEventListener("click", parseSgfIntoEditor);
    dom.saveLocalBtn.addEventListener("click", () => saveCurrent());
    dom.commitBtn.addEventListener("click", commitFilesToGithub);
  }

  init();
})();
