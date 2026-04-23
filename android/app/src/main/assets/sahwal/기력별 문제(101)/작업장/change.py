# -*- coding: utf-8 -*-
import os
import sys
import traceback
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional

# ─────────────────────────────
# SGF 병합 로직
# ─────────────────────────────

@dataclass
class Node:
    props: Dict[str, List[str]] = field(default_factory=dict)
    order: List[str] = field(default_factory=list)

@dataclass
class GameTree:
    sequence: List[Node] = field(default_factory=list)
    children: List['GameTree'] = field(default_factory=list)

class SGFTokenizer:
    def __init__(self, data: str):
        self.s = data; self.i = 0; self.n = len(data)
    def peek(self): return self.s[self.i] if self.i < self.n else ''
    def get(self):
        if self.i >= self.n: return ''
        ch = self.s[self.i]; self.i += 1; return ch
    def skip_ws(self):
        while self.i < self.n and self.s[self.i] in ' \t\r\n': self.i += 1
    def read_prop_ident(self):
        ident = []
        while self.i < self.n and 'A' <= self.s[self.i] <= 'Z':
            ident.append(self.s[self.i]); self.i += 1
        return ''.join(ident)
    def read_prop_value(self):
        if self.get() != '[': return ''
        val = []
        while self.i < self.n:
            ch = self.get()
            if ch == '\\':
                nxt = self.get()
                if nxt == '': val.append('\\'); break
                val.append('\\' + nxt)
            elif ch == ']': break
            else: val.append(ch)
        return ''.join(val)

class SGFParser:
    def __init__(self, data): self.tok = SGFTokenizer(data)
    def parse(self) -> GameTree:
        self.tok.skip_ws(); trees=[]
        while self.tok.i < self.tok.n:
            self.tok.skip_ws()
            ch = self.tok.peek()
            if ch == '(':
                trees.append(self.parse_gametree())
            elif ch == '': break
            else: self.tok.get()
        if not trees: return GameTree()
        if len(trees)==1: return trees[0]
        return GameTree(children=trees)
    def parse_gametree(self):
        assert self.tok.get() == '('
        gt = GameTree()
        while True:
            self.tok.skip_ws()
            p = self.tok.peek()
            if p == ';': gt.sequence.extend(self.parse_sequence())
            elif p == '(':
                gt.children.append(self.parse_gametree())
            elif p == ')': self.tok.get(); break
            elif p == '': break
            else: self.tok.get()
        return gt
    def parse_sequence(self):
        nodes = []
        while self.tok.peek() == ';':
            self.tok.get()
            node = Node()
            self.tok.skip_ws()
            while True:
                self.tok.skip_ws()
                ident = self.tok.read_prop_ident()
                if not ident: break
                while True:
                    self.tok.skip_ws()
                    if self.tok.peek() != '[': break
                    val = self.tok.read_prop_value()
                    if ident not in node.props:
                        node.props[ident] = []; node.order.append(ident)
                    node.props[ident].append(val)
            nodes.append(node)
        return nodes

def escape_value(v:str): return ''.join('\\]' if ch == ']' else ch for ch in v)

def serialize_node(node:Node)->str:
    s=[';']
    seen=set()
    for k in node.order + [x for x in node.props if x not in node.order]:
        if k in seen: continue
        seen.add(k)
        s.append(k + ''.join(f'[{escape_value(v)}]' for v in node.props[k]))
    return ''.join(s)

def is_empty_tree(gt): return len(gt.sequence)==0 and len(gt.children)==0

def serialize_gametree(gt:GameTree)->str:
    s=['(']
    for n in gt.sequence: s.append(serialize_node(n))
    for c in gt.children:
        if not is_empty_tree(c): s.append(serialize_gametree(c))
    s.append(')')
    return ''.join(s)

def clone_tree(gt:GameTree)->GameTree:
    def clone_node(n): return Node(props={k:list(v) for k,v in n.props.items()}, order=list(n.order))
    return GameTree(sequence=[clone_node(n) for n in gt.sequence],
                    children=[clone_tree(c) for c in gt.children])

def first_move_key(gt:GameTree):
    if not gt.sequence: return None
    n0=gt.sequence[0]
    if 'B' in n0.props and len(n0.props['B'])==1: return ('B',n0.props['B'][0])
    if 'W' in n0.props and len(n0.props['W'])==1: return ('W',n0.props['W'][0])
    return None

def strip_first_node(gt:GameTree)->GameTree:
    new_seq = gt.sequence[1:] if len(gt.sequence)>=1 else []
    return GameTree(sequence=new_seq, children=[clone_tree(c) for c in gt.children])

def merge_same_first_moves(gt:GameTree)->GameTree:
    gt.children=[merge_same_first_moves(c) for c in gt.children]
    groups={}; others=[]
    for c in gt.children:
        key=first_move_key(c)
        if key is None: others.append(c)
        else: groups.setdefault(key,[]).append(c)
    merged=[]
    for key,trees in groups.items():
        if len(trees)==1:
            merged.append(trees[0]); continue
        color,coord=key
        n=Node(props={color:[coord]},order=[color])
        new_tree=GameTree(sequence=[n],children=[])
        for t in trees:
            rest=strip_first_node(t)
            if not is_empty_tree(rest): new_tree.children.append(rest)
        if not new_tree.children:
            merged.append(new_tree)
        else:
            merged.append(merge_same_first_moves(new_tree))
    gt.children=others+merged
    return gt

def run_merge_text(data:str)->str:
    tree=SGFParser(data).parse()
    merged=merge_same_first_moves(tree)
    return serialize_gametree(merged)

# ─────────────────────────────
# 폴더 내 모든 SGF 처리
# ─────────────────────────────
def main():
    cur_dir = os.getcwd()
    sgf_files = [f for f in os.listdir(cur_dir) if f.lower().endswith(".sgf")]

    if not sgf_files:
        print("[!] 현재 폴더에 .sgf 파일이 없습니다.")
        return

    print(f"[+] {len(sgf_files)}개 SGF 파일 처리 시작\n")

    success, fail = 0, 0
    for fname in sgf_files:
        try:
            path = os.path.join(cur_dir, fname)
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                data = f.read()
            merged = run_merge_text(data)
            with open(path, "w", encoding="utf-8") as f:
                f.write(merged)
            print(f"✔ {fname}")
            success += 1
        except Exception as e:
            print(f"✖ {fname} 오류: {e}")
            traceback.print_exc()
            fail += 1

    print(f"\n=== 완료 ===")
    print(f"성공: {success}개, 실패: {fail}개")

if __name__ == "__main__":
    main()
