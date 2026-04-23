import type {Coord, Viewport} from '../types';

export function sgfCoordToCoord(s: string): Coord | null {
  if (!s) return null;
  if (s.length !== 2) {
    throw new Error(`Invalid SGF coordinate: ${s}`);
  }
  return {row: s.charCodeAt(1) - 97, col: s.charCodeAt(0) - 97};
}

export function rcToLabel(c: Coord | null, size: number): string {
  if (c === null) return 'pass';
  const letters = Array.from({length: size}, (_, i) =>
    String.fromCharCode(65 + i),
  );
  return `${letters[c.col]}${size - c.row}`;
}

export function repairMissingNodeAfterOpenParen(text: string): string {
  let out = '';
  let i = 0;
  let inValue = false;
  let escaped = false;
  while (i < text.length) {
    const ch = text[i];
    if (inValue) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === ']') {
        inValue = false;
      }
      i += 1;
      continue;
    }
    if (ch === '[') {
      inValue = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '(') {
      out += ch;
      i += 1;
      while (i < text.length && text[i].trim() === '') {
        out += text[i];
        i += 1;
      }
      if (i < text.length && isAlpha(text[i])) {
        let k = i;
        while (k < text.length && isAlpha(text[k])) {
          k += 1;
        }
        if (k < text.length && text[k] === '[') {
          out += ';';
        }
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function isAlpha(s: string): boolean {
  const c = s.charCodeAt(0);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

export function nodeComment(node: SgfNode): string {
  return node.get('C') ?? '';
}

export function commentResultTag(comment: string): 'FAIL' | 'RIGHT' | null {
  const c = comment.toUpperCase();
  if (c.includes('FAIL') || c.includes('WRONG')) return 'FAIL';
  if (c.includes('RIGHT') || c.includes('CORRECT') || c.includes('ALT')) {
    return 'RIGHT';
  }
  return null;
}

export function firstMoveOfNode(node: SgfNode): {
  color: 'B' | 'W' | null;
  coord: Coord | null;
} {
  if (node.props.has('B')) {
    return {color: 'B', coord: sgfCoordToCoord(node.get('B') ?? '')};
  }
  if (node.props.has('W')) {
    return {color: 'W', coord: sgfCoordToCoord(node.get('W') ?? '')};
  }
  return {color: null, coord: null};
}

export function inferUserColorFromRoot(root: SgfNode): 'B' | 'W' {
  const pl = (root.get('PL') ?? '').toUpperCase();
  if (pl === 'B' || pl === 'W') {
    return pl;
  }
  const dfs = (n: SgfNode): 'B' | 'W' | null => {
    const m = firstMoveOfNode(n).color;
    if (m) return m;
    for (const ch of n.children) {
      const found = dfs(ch);
      if (found) return found;
    }
    return null;
  };
  for (const child of root.children) {
    const first = dfs(child);
    if (first) return first;
  }
  return 'B';
}

export function collectAllSgfCoords(root: SgfNode): Coord[] {
  const coords = new Map<string, Coord>();
  const put = (rc: Coord | null): void => {
    if (!rc) return;
    coords.set(`${rc.row},${rc.col}`, rc);
  };
  const walk = (n: SgfNode): void => {
    for (const k of ['AB', 'AW']) {
      for (const s of n.getAll(k)) {
        put(sgfCoordToCoord(s));
      }
    }
    for (const k of ['B', 'W']) {
      if (n.props.has(k)) {
        put(sgfCoordToCoord(n.get(k) ?? ''));
      }
    }
    for (const ch of n.children) {
      walk(ch);
    }
  };
  walk(root);
  return [...coords.values()];
}

export function viewportFromCoords(
  coords: Coord[],
  size: number,
  padding = 1,
): Viewport {
  if (coords.length === 0) {
    const span = Math.min(9, size);
    return {minRow: 0, maxRow: span - 1, minCol: 0, maxCol: span - 1};
  }
  const rows = coords.map(c => c.row).sort((a, b) => a - b);
  const cols = coords.map(c => c.col).sort((a, b) => a - b);
  return {
    minRow: Math.max(0, rows[0] - padding),
    maxRow: Math.min(size - 1, rows[rows.length - 1] + padding),
    minCol: Math.max(0, cols[0] - padding),
    maxCol: Math.min(size - 1, cols[cols.length - 1] + padding),
  };
}

export class SgfNode {
  props: Map<string, string[]> = new Map();

  children: SgfNode[] = [];

  addProp(key: string, value: string): void {
    const current = this.props.get(key) ?? [];
    current.push(value);
    this.props.set(key, current);
  }

  get(key: string): string | null {
    const vals = this.props.get(key);
    if (!vals || vals.length === 0) return null;
    return vals[0];
  }

  getAll(key: string): string[] {
    return this.props.get(key) ?? [];
  }
}

export class SgfParser {
  text: string;

  i = 0;

  constructor(text: string) {
    this.text = text;
  }

  private peek(): string {
    return this.i < this.text.length ? this.text[this.i] : '';
  }

  private skipWs(): void {
    while (this.i < this.text.length && this.text[this.i].trim() === '') {
      this.i += 1;
    }
  }

  private consume(ch: string): void {
    if (this.peek() !== ch) {
      throw new Error(`Expected '${ch}' at ${this.i}, got '${this.peek()}'`);
    }
    this.i += 1;
  }

  parse(): SgfNode {
    this.skipWs();
    while (this.i < this.text.length && this.peek() !== '(') {
      this.i += 1;
    }
    while (this.i < this.text.length) {
      const start = this.i;
      try {
        const node = this.parseGameTree();
        this.skipWs();
        return node;
      } catch {
        this.i = Math.max(this.i, start + 1);
        this.skipWs();
        while (this.i < this.text.length && this.peek() !== '(') {
          this.i += 1;
        }
      }
    }
    throw new Error('No valid SGF gametree found.');
  }

  private parseGameTree(): SgfNode {
    this.skipWs();
    this.consume('(');
    this.skipWs();
    const seq = this.parseSequence();
    if (seq.length === 0) {
      throw new Error('Empty sequence');
    }
    const root = seq[0];
    for (let i = 0; i < seq.length - 1; i += 1) {
      seq[i].children.push(seq[i + 1]);
    }
    let tail = seq[seq.length - 1];
    this.skipWs();
    while (this.peek() === '(') {
      try {
        const childRoot = this.parseGameTree();
        tail.children.push(childRoot);
      } catch {
        // ignore broken branch
      }
      this.skipWs();
    }
    this.consume(')');
    return root;
  }

  private parseSequence(): SgfNode[] {
    const nodes: SgfNode[] = [];
    this.skipWs();
    while (this.peek() === ';') {
      nodes.push(this.parseNode());
      this.skipWs();
    }
    return nodes;
  }

  private parseNode(): SgfNode {
    this.consume(';');
    const node = new SgfNode();
    this.skipWs();
    while (true) {
      this.skipWs();
      if (!isAlpha(this.peek())) break;
      const key = this.parsePropIdent();
      this.skipWs();
      if (this.peek() !== '[') {
        throw new Error(`Property ${key} without value`);
      }
      while (this.peek() === '[') {
        node.addProp(key, this.parsePropValue());
        this.skipWs();
      }
    }
    return node;
  }

  private parsePropIdent(): string {
    const start = this.i;
    while (this.i < this.text.length && isAlpha(this.text[this.i])) {
      this.i += 1;
    }
    return this.text.slice(start, this.i);
  }

  private parsePropValue(): string {
    this.consume('[');
    let out = '';
    while (this.i < this.text.length) {
      const ch = this.text[this.i];
      if (ch === ']') {
        this.i += 1;
        return out;
      }
      if (ch === '\\') {
        this.i += 1;
        if (this.i >= this.text.length) break;
        const next = this.text[this.i];
        if (next === '\n' || next === '\r') {
          this.i += 1;
          if (
            this.i < this.text.length &&
            this.text[this.i] === '\n' &&
            next === '\r'
          ) {
            this.i += 1;
          }
          continue;
        }
        out += next;
        this.i += 1;
        continue;
      }
      out += ch;
      this.i += 1;
    }
    throw new Error('Unclosed SGF property value');
  }
}
