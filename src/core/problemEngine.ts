import {BoardState} from './board';
import {
  commentResultTag,
  firstMoveOfNode,
  inferUserColorFromRoot,
  nodeComment,
  repairMissingNodeAfterOpenParen,
  SgfNode,
  SgfParser,
} from './sgf';
import type {Coord} from '../types';

type BranchCandidate = {node: SgfNode; seenRight: boolean; seenFail: boolean};
type Transition = {
  color: 'B' | 'W';
  rc: Coord | null;
  path: SgfNode[];
  base: BranchCandidate;
};

export type EngineSnapshot = {
  board: BoardState;
  lastMove: Coord | null;
  currentCandidates: BranchCandidate[];
};

export class ProblemEngine {
  root: SgfNode;

  size: number;

  userColor: 'B' | 'W';

  board: BoardState;

  lastMove: Coord | null = null;

  currentCandidates: BranchCandidate[];

  constructor(sgfText: string, userColor?: 'B' | 'W') {
    this.root = new SgfParser(repairMissingNodeAfterOpenParen(sgfText)).parse();
    this.size = Number.parseInt(this.root.get('SZ') ?? '19', 10) || 19;
    this.userColor = userColor ?? inferUserColorFromRoot(this.root);
    this.board = new BoardState(this.size);
    this.currentCandidates = [
      {node: this.root, seenRight: false, seenFail: false},
    ];
    this.applyRootSetup();
    this.advanceAutoUntilUserTurn();
  }

  private nodeFlags(node: SgfNode): {right: boolean; fail: boolean} {
    const tag = commentResultTag(nodeComment(node));
    return {right: tag === 'RIGHT', fail: tag === 'FAIL'};
  }

  private dedupCandidates(cands: BranchCandidate[]): BranchCandidate[] {
    return cands;
  }

  private firstMovePaths(node: SgfNode): Array<{
    color: 'B' | 'W';
    rc: Coord | null;
    path: SgfNode[];
  }> {
    const m = firstMoveOfNode(node);
    if (m.color) {
      return [{color: m.color, rc: m.coord, path: [node]}];
    }
    const out: Array<{color: 'B' | 'W'; rc: Coord | null; path: SgfNode[]}> =
      [];
    for (const ch of node.children) {
      for (const sub of this.firstMovePaths(ch)) {
        out.push({color: sub.color, rc: sub.rc, path: [node, ...sub.path]});
      }
    }
    return out;
  }

  private collectTransitions(): Transition[] {
    const out: Transition[] = [];
    for (const cand of this.currentCandidates) {
      for (const child of cand.node.children) {
        for (const move of this.firstMovePaths(child)) {
          out.push({...move, base: cand});
        }
      }
    }
    return out;
  }

  private setCurrentCandidates(cands: BranchCandidate[]): void {
    this.currentCandidates = this.dedupCandidates(cands);
  }

  private nextPlayerGuess(): 'B' | 'W' | null {
    const ts = this.collectTransitions();
    if (ts.length > 0) {
      return ts[0].color;
    }
    const pl = this.root.get('PL');
    if (pl === 'B' || pl === 'W') return pl;
    return null;
  }

  private transitionWouldFail(t: Transition): boolean {
    let seenFail = t.base.seenFail;
    for (const node of t.path) {
      seenFail = seenFail || this.nodeFlags(node).fail;
    }
    return seenFail;
  }

  private applyMatches(matches: Transition[], color: 'B' | 'W', rc: Coord | null): void {
    if (!this.board.play(color, rc)) {
      throw new Error(`Illegal move: ${color}`);
    }
    this.lastMove = rc;
    const newCands: BranchCandidate[] = [];
    for (const m of matches) {
      let sr = m.base.seenRight;
      let sf = m.base.seenFail;
      for (const n of m.path) {
        const f = this.nodeFlags(n);
        sr = sr || f.right;
        sf = sf || f.fail;
      }
      newCands.push({node: m.path[m.path.length - 1], seenRight: sr, seenFail: sf});
    }
    this.setCurrentCandidates(newCands);
  }

  private applyRootSetup(): void {
    for (const s of this.root.getAll('AB')) {
      const rc = s ? {row: s.charCodeAt(1) - 97, col: s.charCodeAt(0) - 97} : null;
      if (rc) this.board.setAt(rc, 'B');
    }
    for (const s of this.root.getAll('AW')) {
      const rc = s ? {row: s.charCodeAt(1) - 97, col: s.charCodeAt(0) - 97} : null;
      if (rc) this.board.setAt(rc, 'W');
    }
  }

  private advanceAutoUntilUserTurn(capturedAutoMoves?: Coord[]): void {
    while (true) {
      const nxt = this.nextPlayerGuess();
      if (!nxt || nxt === this.userColor) break;
      const ts = this.collectTransitions().filter(t => t.color === nxt);
      if (ts.length === 0) break;
      const preferred = ts.filter(t => !this.transitionWouldFail(t));
      const pool = preferred.length > 0 ? preferred : ts;
      const chosen = pool[0];
      const same = pool.filter(
        e => e.rc?.row === chosen.rc?.row && e.rc?.col === chosen.rc?.col,
      );
      this.applyMatches(same, same[0].color, chosen.rc);
      if (capturedAutoMoves && chosen.rc) {
        capturedAutoMoves.push(chosen.rc);
      }
    }
  }

  private allActiveFail(): boolean {
    return (
      this.currentCandidates.length > 0 &&
      this.currentCandidates.every(c => c.seenFail)
    );
  }

  private isTerminal(): boolean {
    return this.collectTransitions().length === 0;
  }

  private evaluateResult(): {ok: boolean; status: string} {
    if (this.allActiveFail() && this.isTerminal()) {
      return {ok: false, status: 'reset_incorrect'};
    }
    if (this.isSuccess()) {
      return {ok: true, status: 'success'};
    }
    return {ok: true, status: 'ok'};
  }

  snapshot(): EngineSnapshot {
    return {
      board: this.board.copy(),
      lastMove: this.lastMove,
      currentCandidates: this.currentCandidates.map(c => ({...c})),
    };
  }

  restoreSnapshot(snap: EngineSnapshot): void {
    this.board = snap.board.copy();
    this.lastMove = snap.lastMove;
    this.currentCandidates = snap.currentCandidates.map(c => ({...c}));
  }

  userPlay(rc: Coord, autoAdvance = true): {ok: boolean; status: string} {
    const ts = this.collectTransitions();
    const matches = ts.filter(
      t =>
        t.color === this.userColor &&
        t.rc !== null &&
        t.rc.row === rc.row &&
        t.rc.col === rc.col,
    );
    if (matches.length === 0) {
      return {ok: false, status: '정답 수순이 아닙니다.'};
    }
    const test = this.board.copy();
    if (!test.play(this.userColor, rc)) {
      return {ok: false, status: '그 자리는 둘 수 없습니다.'};
    }
    this.applyMatches(matches, this.userColor, rc);
    if (autoAdvance) {
      this.advanceAutoUntilUserTurn();
    }
    return this.evaluateResult();
  }

  finalizeAutoTurn(): {ok: boolean; status: string; autoMoves: Coord[]} {
    const autoMoves: Coord[] = [];
    this.advanceAutoUntilUserTurn(autoMoves);
    const result = this.evaluateResult();
    return {...result, autoMoves};
  }

  isSuccess(): boolean {
    if (this.currentCandidates.length === 0 || this.allActiveFail()) return false;
    for (const c of this.currentCandidates) {
      if (c.seenFail) continue;
      const tag = commentResultTag(nodeComment(c.node));
      if (tag === 'RIGHT') return true;
      if (c.node.children.length === 0 && c.seenRight) return true;
    }
    return false;
  }

  candidateUserMoves(): Coord[] {
    const ts = this.collectTransitions().filter(t => t.color === this.userColor);
    const map = new Map<string, Coord>();
    for (const t of ts) {
      if (!t.rc || this.transitionWouldFail(t)) continue;
      map.set(`${t.rc.row},${t.rc.col}`, t.rc);
    }
    return [...map.values()].sort((a, b) =>
      a.row === b.row ? a.col - b.col : a.row - b.row,
    );
  }
}
