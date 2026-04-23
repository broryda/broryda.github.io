import type {Coord} from '../types';

export class BoardState {
  size: number;

  board: string[][];

  constructor(size: number) {
    this.size = size;
    this.board = Array.from({length: size}, () => Array(size).fill('.'));
  }

  copy(): BoardState {
    const b = new BoardState(this.size);
    for (let r = 0; r < this.size; r += 1) {
      b.board[r] = [...this.board[r]];
    }
    return b;
  }

  getAt(rc: Coord): string {
    return this.board[rc.row][rc.col];
  }

  setAt(rc: Coord, color: string): void {
    this.board[rc.row][rc.col] = color;
  }

  neighbors(rc: Coord): Coord[] {
    const out: Coord[] = [];
    if (rc.row > 0) out.push({row: rc.row - 1, col: rc.col});
    if (rc.row + 1 < this.size) out.push({row: rc.row + 1, col: rc.col});
    if (rc.col > 0) out.push({row: rc.row, col: rc.col - 1});
    if (rc.col + 1 < this.size) out.push({row: rc.row, col: rc.col + 1});
    return out;
  }

  groupAndLiberties(start: Coord): {group: Coord[]; liberties: number} {
    const color = this.getAt(start);
    if (color !== 'B' && color !== 'W') {
      return {group: [], liberties: 0};
    }
    const stack: Coord[] = [start];
    const seen = new Set<string>([`${start.row},${start.col}`]);
    const group: Coord[] = [];
    const libs = new Set<string>();

    while (stack.length > 0) {
      const cur = stack.pop() as Coord;
      group.push(cur);
      for (const nb of this.neighbors(cur)) {
        const v = this.getAt(nb);
        if (v === '.') {
          libs.add(`${nb.row},${nb.col}`);
        } else if (v === color) {
          const key = `${nb.row},${nb.col}`;
          if (!seen.has(key)) {
            seen.add(key);
            stack.push(nb);
          }
        }
      }
    }

    return {group, liberties: libs.size};
  }

  removeGroup(group: Coord[]): void {
    for (const rc of group) {
      this.setAt(rc, '.');
    }
  }

  play(color: string, rc: Coord | null): boolean {
    if (rc === null) return true;
    if (this.getAt(rc) !== '.') return false;

    this.setAt(rc, color);
    const opponent = color === 'B' ? 'W' : 'B';
    let capturedAny = false;
    for (const nb of this.neighbors(rc)) {
      if (this.getAt(nb) === opponent) {
        const g = this.groupAndLiberties(nb);
        if (g.liberties === 0) {
          this.removeGroup(g.group);
          capturedAny = true;
        }
      }
    }

    const self = this.groupAndLiberties(rc);
    if (self.liberties === 0 && !capturedAny) {
      this.setAt(rc, '.');
      return false;
    }
    return true;
  }
}
