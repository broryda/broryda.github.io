(function () {
  const BOARD_SIZE = 19;
  const VIEW_SIZE = 13;
  const CROP_START_X = BOARD_SIZE - VIEW_SIZE;
  const DEFAULT_SHEET_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbzndB43SFtON7niqqURyUHH8ZQeShB7mVSISA7EGBEYV2dhaMs4NJ6Xm1RWwupHMYvq/exec";

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
    sheetEndpointInput: document.getElementById("sheetEndpointInput"),
    loadSheetBtn: document.getElementById("loadSheetBtn"),
    saveEntryBtn: document.getElementById("saveEntryBtn"),
    uploadAllBtn: document.getElementById("uploadAllBtn"),
    newJosekiBtn: document.getElementById("newJosekiBtn"),
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
  const STORAGE_KEYS = {
    endpoint: "josekiSheetEndpoint",
  };

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
      return;
    }
    dom.editorTitle.textContent = `${entry.order || activeIndex + 1}번 정석`;
    dom.editorMeta.textContent = entry.path || entry.filename || "";
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
    setStatus(`${entry.order || activeIndex + 1}번 정석을 브라우저 메모리에 임시 저장했습니다. 시트 저장은 아직 하지 않았습니다.`);
    renderAll();
  }

  function cleanEntry(entry) {
    const clean = { ...entry };
    delete clean.__displayNormalized;
    clean.sgf = buildEntrySgf(clean);
    return clean;
  }

  function makeCleanData() {
    persistCommentsToEntry();
    const cleanEntries = entries.map(cleanEntry);
    return {
      ...data,
      version: data.version || 1,
      name: data.name || "기본정석 SGF 데이터",
      entries: cleanEntries,
    };
  }

  function endpointUrl() {
    return dom.sheetEndpointInput.value.trim();
  }

  function saveSheetSettings() {
    localStorage.setItem(STORAGE_KEYS.endpoint, endpointUrl());
  }

  function loadSheetSettings() {
    const savedEndpoint = localStorage.getItem(STORAGE_KEYS.endpoint) || "";
    dom.sheetEndpointInput.value = savedEndpoint === DEFAULT_SHEET_ENDPOINT ? savedEndpoint : DEFAULT_SHEET_ENDPOINT;
    saveSheetSettings();
  }

  function jsonpRequest(url) {
    return new Promise((resolve, reject) => {
      const callbackName = `__josekiSheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      const cleanup = () => {
        delete window[callbackName];
        script.remove();
      };
      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("Apps Script 응답을 불러오지 못했습니다."));
      };
      const separator = url.includes("?") ? "&" : "?";
      script.src = `${url}${separator}callback=${encodeURIComponent(callbackName)}&t=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

  async function sheetGet(action, params = {}) {
    const base = endpointUrl();
    if (!base) {
      setStatus("Apps Script Web App URL을 입력하세요.");
      return null;
    }
    if (!base) return null;
    saveSheetSettings();
    const query = new URLSearchParams({ action, ...params });
    const payload = await jsonpRequest(`${base}?${query.toString()}`);
    if (!payload || payload.ok === false) throw new Error((payload && payload.error) || "시트 요청 실패");
    return payload;
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function normalizedMove(move) {
    return {
      color: String((move && move.color) || "B"),
      x: Number(move && move.x),
      y: Number(move && move.y),
      comment: String((move && move.comment) || ""),
    };
  }

  function entrySignature(entry) {
    const clean = cleanEntry(entry || {});
    return JSON.stringify({
      id: String(clean.id || ""),
      order: Number(clean.order) || 0,
      title: String(clean.title || ""),
      category: String(clean.category || ""),
      filename: String(clean.filename || ""),
      path: String(clean.path || ""),
      boardSize: Number(clean.boardSize) || BOARD_SIZE,
      rootComment: String(clean.rootComment || ""),
      sgf: String(clean.sgf || ""),
      moves: (clean.moves || []).map(normalizedMove),
    });
  }

  function entriesMatch(actual, expected) {
    return !!actual && entrySignature(actual) === entrySignature(expected);
  }

  function sheetDataMatchesWrite(sheetData, action, payload) {
    const sheetEntries = (sheetData && sheetData.entries) || [];
    if (action === "saveEntry") {
      const expected = payload.entry;
      const actual = sheetEntries.find((entry) => String(entry.id || "") === String(expected.id || ""));
      return entriesMatch(actual, expected);
    }

    if (action === "replaceAll") {
      const expectedEntries = (payload.data && payload.data.entries) || [];
      if (sheetEntries.length !== expectedEntries.length) return false;
      const sheetById = new Map(sheetEntries.map((entry) => [String(entry.id || ""), entry]));
      return expectedEntries.every((expected) => entriesMatch(sheetById.get(String(expected.id || "")), expected));
    }

    return false;
  }

  async function waitForSheetWrite(action, payload) {
    let lastError = "";
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      if (attempt > 1) await sleep(3000);
      try {
        const result = await sheetGet("data");
        if (result && sheetDataMatchesWrite(result.data, action, payload)) {
          return result;
        }
        lastError = "저장 요청은 보냈지만 아직 시트 데이터가 갱신되지 않았습니다.";
      } catch (error) {
        lastError = error.message;
      }
    }
    throw new Error(`시트 저장 확인 시간이 초과되었습니다. ${lastError}`);
  }

  async function sheetPost(action, payload) {
    const payloadText = JSON.stringify(payload);
    if (payloadText.length > 30000) {
      throw new Error("저장 데이터가 너무 커서 브라우저 JSONP 저장 한도를 넘었습니다. 현재 정석 단위로 나눠 저장하세요.");
    }

    await sheetGet(action, { payload: payloadText });
    setStatus("시트에 저장 요청을 보냈습니다. 반영 여부를 확인하는 중...");
    return waitForSheetWrite(action, payload);
  }

  async function loadFromSheet() {
    dom.loadSheetBtn.disabled = true;
    try {
      setStatus("스프레드시트에서 정석 데이터를 불러오는 중...");
      const payload = await sheetGet("data");
      if (!payload) return;
      data = payload.data || { version: 1, name: "Google Sheets 정석 데이터", skipped: [], entries: [] };
      entries = data.entries || [];
      activeIndex = entries.length ? 0 : -1;
      editMove = 0;
      setStatus(`시트에서 ${entries.length}개 정석을 불러왔습니다.`);
      renderAll();
    } catch (error) {
      setStatus(`시트 불러오기 실패: ${error.message}`);
    } finally {
      dom.loadSheetBtn.disabled = false;
    }
  }

  async function saveCurrentToSheet() {
    persistCommentsToEntry();
    const entry = activeEntry();
    if (!entry) return;
    dom.saveEntryBtn.disabled = true;
    try {
      const clean = cleanEntry(entry);
      setStatus(`${clean.order || activeIndex + 1}번 정석을 스프레드시트에 저장하는 중...`);
      await sheetPost("saveEntry", { entry: clean });
      setStatus(`${clean.order || activeIndex + 1}번 정석을 스프레드시트에 저장했습니다.`);
    } catch (error) {
      setStatus(`시트 저장 실패: ${error.message}`);
    } finally {
      dom.saveEntryBtn.disabled = false;
    }
  }

  async function uploadAllToSheet() {
    if (!window.confirm("현재 브라우저에 로드된 전체 정석 데이터로 스프레드시트를 교체할까요? 최초 1회 이관 또는 전체 덮어쓰기 때만 사용하세요.")) return;
    dom.uploadAllBtn.disabled = true;
    try {
      const cleanData = makeCleanData();
      setStatus(`전체 ${cleanData.entries.length}개 정석을 스프레드시트에 업로드하는 중...`);
      await sheetPost("replaceAll", { data: cleanData });
      setStatus(`전체 ${cleanData.entries.length}개 정석을 스프레드시트에 업로드했습니다.`);
    } catch (error) {
      setStatus(`전체 업로드 실패: ${error.message}`);
    } finally {
      dom.uploadAllBtn.disabled = false;
    }
  }

  function nextOrder() {
    return entries.reduce((max, entry) => Math.max(max, Number(entry.order) || 0), 0) + 1;
  }

  function addNewJoseki() {
    persistCommentsToEntry();
    const order = nextOrder();
    const selectedCategory = dom.categorySelect.value && dom.categorySelect.value !== "all" ? dom.categorySelect.value : "unknown";
    const entry = {
      id: `sheet-${Date.now()}`,
      order,
      title: `${order}번 정석`,
      category: selectedCategory,
      filename: `${String(order).padStart(3, "0")}.sgf`,
      path: `sheet/${String(order).padStart(3, "0")}.sgf`,
      boardSize: BOARD_SIZE,
      rootComment: "",
      moves: [],
      __displayNormalized: true,
    };
    entry.sgf = buildEntrySgf(entry);
    entries.push(entry);
    data = { ...data, entries };
    activeIndex = entries.length - 1;
    editMove = 0;
    dom.categorySelect.value = "all";
    setStatus("새 정석을 추가했습니다. 바둑판에 수순을 놓고 현재 정석 저장을 누르세요.");
    renderAll();
  }

  function init() {
    loadSheetSettings();
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
    dom.loadSheetBtn.addEventListener("click", loadFromSheet);
    dom.saveEntryBtn.addEventListener("click", saveCurrentToSheet);
    dom.uploadAllBtn.addEventListener("click", uploadAllToSheet);
    dom.newJosekiBtn.addEventListener("click", addNewJoseki);
    dom.sheetEndpointInput.addEventListener("change", saveSheetSettings);
  }

  init();
})();
