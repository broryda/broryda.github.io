(function () {
  const VIEW_SIZE = 13;
  const CATEGORIES = [
    { key: "star", label: "화점 정석" },
    { key: "komoku", label: "소목 정석" },
    { key: "takamoku", label: "고목정석" },
    { key: "mokuhazushi", label: "외목정석" },
    { key: "sansan", label: "33정석" },
  ];
  const screens = {
    home: document.getElementById("homeScreen"),
    category: document.getElementById("categoryScreen"),
    list: document.getElementById("listScreen"),
    study: document.getElementById("studyScreen"),
  };
  const dom = {
    findJosekiBtn: document.getElementById("findJosekiBtn"),
    categoryJosekiBtn: document.getElementById("categoryJosekiBtn"),
    categoryButtons: document.getElementById("categoryButtons"),
    backToCategoriesBtn: document.getElementById("backToCategoriesBtn"),
    josekiList: document.getElementById("josekiList"),
    listTitle: document.getElementById("listTitle"),
    listMeta: document.getElementById("listMeta"),
    studyTitle: document.getElementById("studyTitle"),
    board: document.getElementById("board"),
    entryMeta: document.getElementById("entryMeta"),
    moveNumber: document.getElementById("moveNumber"),
    moveSlider: document.getElementById("moveSlider"),
    firstMoveBtn: document.getElementById("firstMoveBtn"),
    prevMoveBtn: document.getElementById("prevMoveBtn"),
    nextMoveBtn: document.getElementById("nextMoveBtn"),
    lastMoveBtn: document.getElementById("lastMoveBtn"),
    moveComment: document.getElementById("moveComment"),
    memoryBtn: document.getElementById("memoryBtn"),
    josekiListBtn: document.getElementById("josekiListBtn"),
    prevJosekiBtn: document.getElementById("prevJosekiBtn"),
    nextJosekiBtn: document.getElementById("nextJosekiBtn"),
    completeModal: document.getElementById("completeModal"),
    completeOkBtn: document.getElementById("completeOkBtn"),
  };

  const tree = window.JOSEKI_TREE;
  const root = tree && tree.root;
  const cropStartX = window.JosekiSgf.BOARD_SIZE - VIEW_SIZE;
  const lines = ((window.JOSEKI_DATA && window.JOSEKI_DATA.entries) || []).map((entry) => {
    const oriented = window.JosekiSgf.orientEntry(entry, VIEW_SIZE);
    return {
      entry,
      title: entry.title,
      source: entry.path || entry.filename,
      moves: oriented.orientedMoves,
      categoryKey: classifyFirstMove(oriented.orientedMoves[0]),
    };
  });

  const state = {
    mode: "tree",
    nodes: [],
    move: 0,
    singleLine: null,
    currentCategory: null,
    currentIndex: -1,
    memory: null,
  };

  function showScreen(name) {
    for (const [key, screen] of Object.entries(screens)) {
      screen.classList.toggle("hidden", key !== name);
    }
  }

  function coordKey(move) {
    return `${move.x19},${move.y19}`;
  }

  function classifyFirstMove(move) {
    if (!move) return "unknown";
    const key = coordKey(move);
    if (key === "15,3") return "star"; // Q16, 4-4
    if (key === "16,3" || key === "15,2") return "komoku"; // R16 / Q17
    if (key === "15,4" || key === "14,3") return "takamoku"; // Q15 / P16
    if (key === "16,4" || key === "14,2") return "mokuhazushi"; // R15 / P17
    if (key === "16,2") return "sansan"; // R17
    return "unknown";
  }

  function categoryLines(key) {
    return lines.filter((line) => line.categoryKey === key);
  }

  function renderCategories() {
    dom.categoryButtons.innerHTML = "";
    for (const category of CATEGORIES) {
      const count = categoryLines(category.key).length;
      const button = document.createElement("button");
      button.type = "button";
      button.className = count ? "" : "secondary";
      button.textContent = `${category.label} (${count})`;
      button.addEventListener("click", () => renderList(category));
      dom.categoryButtons.appendChild(button);
    }
  }

  function renderList(category) {
    const items = categoryLines(category.key);
    dom.listTitle.textContent = category.label;
    dom.listMeta.textContent = items.length ? `${items.length}개 정석` : "아직 데이터가 없습니다.";
    dom.josekiList.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "card muted";
      empty.textContent = "아직 해당 분류의 정석이 없습니다.";
      dom.josekiList.appendChild(empty);
    }
    items.forEach((line, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<strong>${index + 1}번 정석</strong>`;
      button.addEventListener("click", () => startSingle(line, index, category));
      dom.josekiList.appendChild(button);
    });
    showScreen("list");
  }

  function startTree() {
    state.mode = "tree";
    state.nodes = [];
    state.move = 0;
    state.singleLine = null;
    state.currentCategory = null;
    state.currentIndex = -1;
    state.memory = null;
    hideCompleteModal();
    dom.studyTitle.textContent = "정석 찾기";
    showScreen("study");
    renderStudy();
  }

  function startSingle(line, index, category) {
    state.mode = "single";
    state.nodes = [];
    state.move = 0;
    state.singleLine = { ...line, number: index + 1 };
    state.currentCategory = category;
    state.currentIndex = index;
    state.memory = null;
    hideCompleteModal();
    dom.studyTitle.textContent = `${index + 1}번 정석`;
    showScreen("study");
    renderStudy();
  }

  function currentCategoryItems() {
    return state.currentCategory ? categoryLines(state.currentCategory.key) : [];
  }

  function goCurrentList() {
    if (!state.currentCategory) return;
    state.memory = null;
    hideCompleteModal();
    renderList(state.currentCategory);
  }

  function goAdjacent(delta) {
    const items = currentCategoryItems();
    const nextIndex = state.currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    startSingle(items[nextIndex], nextIndex, state.currentCategory);
  }

  function currentTreeNode() {
    return state.move === 0 ? root : state.nodes[state.move - 1] || root;
  }

  function treePathMoves() {
    return state.nodes.slice(0, state.move).map((node) => ({
      color: node.move.color,
      x19: node.move.x19,
      y19: node.move.y19,
      comment: (node.comments || []).join("\n\n"),
    }));
  }

  function treeCandidates() {
    const node = currentTreeNode();
    return ((node && node.children) || []).map((child) => ({
      color: child.move.color,
      x19: child.move.x19,
      y19: child.move.y19,
      count: child.leafCount || 1,
      node: child,
    }));
  }

  function singleMoves() {
    return state.singleLine ? state.singleLine.moves : [];
  }

  function currentSequence() {
    return state.mode === "single"
      ? singleMoves()
      : state.nodes.map((node) => ({ color: node.move.color, x19: node.move.x19, y19: node.move.y19 }));
  }

  function visibleMoves() {
    if (state.memory) return state.memory.sequence.slice(0, state.memory.index);
    if (state.mode === "single") return singleMoves().slice(0, state.move);
    return treePathMoves();
  }

  function currentCandidates() {
    if (state.memory) return [];
    if (state.mode === "single") {
      const next = singleMoves()[state.move];
      return next ? [{ ...next, count: 1, line: state.singleLine }] : [];
    }
    return treeCandidates();
  }

  function maxSliderMove() {
    if (state.memory) return state.memory.sequence.length;
    if (state.mode === "single") return singleMoves().length;
    return state.nodes.length;
  }

  function isAtEnd() {
    return !state.memory && currentSequence().length > 0 && currentCandidates().length === 0;
  }

  function setMove(nextMove) {
    state.move = Math.max(0, Math.min(nextMove, maxSliderMove()));
  }

  function moveToStart() {
    if (state.memory) return;
    setMove(0);
    renderStudy();
  }

  function moveBackward() {
    if (state.memory) return;
    setMove(state.move - 1);
    renderStudy();
  }

  function moveForward() {
    if (state.memory) return;
    if (state.mode === "single" || state.move < state.nodes.length) {
      setMove(state.move + 1);
      renderStudy();
      return;
    }
    const next = currentCandidates();
    if (next.length === 1) chooseCandidate(next[0]);
  }

  function moveToEnd() {
    if (state.memory) return;
    setMove(maxSliderMove());
    renderStudy();
  }

  function chooseCandidate(candidate) {
    if (state.mode === "single") {
      state.move = Math.min(state.move + 1, singleMoves().length);
    } else {
      state.nodes = state.nodes.slice(0, state.move);
      state.nodes.push(candidate.node);
      state.move = state.nodes.length;
    }
    renderStudy();
  }

  function commentText() {
    if (state.memory) return state.memory.wrong ? "다음 수가 희미하게 표시됩니다." : "";
    if (state.mode === "single") {
      const move = singleMoves()[state.move - 1];
      return move && move.comment ? move.comment : "";
    }
    const node = state.move > 0 ? state.nodes[state.move - 1] : null;
    return node && node.comments ? node.comments.join("\n\n") : "";
  }

  function boardEntry() {
    return {
      title: "정석 공부",
      viewSize: VIEW_SIZE,
      cropStartX,
      orientedMoves: visibleMoves(),
    };
  }

  function startMemory() {
    const sequence = currentSequence();
    if (!sequence.length || !isAtEnd()) return;
    state.memory = {
      sequence,
      index: 0,
      wrong: false,
    };
    state.move = 0;
    renderStudy();
  }

  function exitMemory() {
    state.memory = null;
    state.move = maxSliderMove();
    renderStudy();
  }

  function showCompleteModal() {
    dom.completeModal.classList.remove("hidden");
  }

  function hideCompleteModal() {
    dom.completeModal.classList.add("hidden");
  }

  function handleMemoryPoint(point) {
    const memory = state.memory;
    if (!memory) return;
    const expected = memory.sequence[memory.index];
    if (!expected) return;
    if (expected.x19 === point.x19 && expected.y19 === point.y19) {
      memory.index += 1;
      memory.wrong = false;
      state.move = memory.index;
      renderStudy();
      if (memory.index === memory.sequence.length) {
        window.setTimeout(() => {
          state.memory = null;
          renderStudy();
          showCompleteModal();
        }, 30);
      }
    } else {
      memory.wrong = true;
      renderStudy();
    }
  }

  function renderStudy() {
    const candidates = currentCandidates();
    const memory = state.memory;
    const isSingle = state.mode === "single";
    const hintMove = memory && memory.wrong ? memory.sequence[memory.index] : null;
    window.JosekiBoard.drawBoard(dom.board, boardEntry(), state.move, {
      candidates,
      hintMove,
      onCandidateClick: chooseCandidate,
      onPointClick: memory ? handleMemoryPoint : null,
    });

    const maxMove = maxSliderMove();
    dom.moveSlider.disabled = !!memory;
    dom.moveSlider.max = String(maxMove);
    dom.moveSlider.value = String(memory ? memory.index : state.move);
    dom.moveNumber.textContent =
      maxMove > 0 ? `수순 ${memory ? memory.index : state.move} / ${maxMove}` : "수순 0";
    dom.firstMoveBtn.disabled = !!memory || state.move <= 0;
    dom.prevMoveBtn.disabled = !!memory || state.move <= 0;
    dom.nextMoveBtn.disabled =
      !!memory ||
      (state.mode === "single" ? state.move >= maxMove : state.move >= maxMove && currentCandidates().length !== 1);
    dom.lastMoveBtn.disabled = !!memory || state.move >= maxMove;

    const text = commentText();
    dom.moveComment.textContent = text;
    dom.moveComment.classList.toggle("muted", !text);

    if (memory) {
      dom.entryMeta.textContent = "암기모드 · 후보수 없이 다음 수를 직접 클릭하세요.";
      dom.memoryBtn.textContent = "암기 종료";
      dom.memoryBtn.classList.remove("hidden");
      dom.josekiListBtn.classList.add("hidden");
      dom.prevJosekiBtn.classList.add("hidden");
      dom.nextJosekiBtn.classList.add("hidden");
      return;
    }

    if (state.mode === "single") {
      dom.entryMeta.textContent = "";
    } else {
      dom.entryMeta.textContent = "초록색 수를 선택하세요.";
    }

    dom.memoryBtn.textContent = "암기모드";
    dom.memoryBtn.classList.toggle("hidden", !isAtEnd());
    dom.josekiListBtn.classList.toggle("hidden", !isSingle || !!memory);
    dom.prevJosekiBtn.classList.toggle("hidden", !isSingle || !!memory);
    dom.nextJosekiBtn.classList.toggle("hidden", !isSingle || !!memory);
    dom.prevJosekiBtn.disabled = !isSingle || state.currentIndex <= 0;
    dom.nextJosekiBtn.disabled = !isSingle || state.currentIndex >= currentCategoryItems().length - 1;
  }

  dom.findJosekiBtn.addEventListener("click", startTree);
  dom.categoryJosekiBtn.addEventListener("click", () => {
    renderCategories();
    showScreen("category");
  });
  dom.backToCategoriesBtn.addEventListener("click", () => {
    renderCategories();
    showScreen("category");
  });
  for (const button of document.querySelectorAll("[data-home]")) {
    button.addEventListener("click", () => {
      state.memory = null;
      hideCompleteModal();
      showScreen("home");
    });
  }
  dom.completeOkBtn.addEventListener("click", hideCompleteModal);
  dom.memoryBtn.addEventListener("click", () => {
    if (state.memory) exitMemory();
    else startMemory();
  });
  dom.josekiListBtn.addEventListener("click", goCurrentList);
  dom.prevJosekiBtn.addEventListener("click", () => goAdjacent(-1));
  dom.nextJosekiBtn.addEventListener("click", () => goAdjacent(1));
  dom.moveSlider.addEventListener("input", () => {
    if (state.memory) return;
    setMove(Number.parseInt(dom.moveSlider.value, 10) || 0);
    renderStudy();
  });
  dom.firstMoveBtn.addEventListener("click", moveToStart);
  dom.prevMoveBtn.addEventListener("click", moveBackward);
  dom.nextMoveBtn.addEventListener("click", moveForward);
  dom.lastMoveBtn.addEventListener("click", moveToEnd);

  window.addEventListener("keydown", (event) => {
    if (screens.study.classList.contains("hidden") || state.memory) return;
    if (event.key === "ArrowLeft") {
      setMove(state.move - 1);
      renderStudy();
    } else if (event.key === "ArrowRight") {
      const next = currentCandidates();
      if (next.length === 1) chooseCandidate(next[0]);
    }
  });

  showScreen("home");
})();
