import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {BoardState} from '../core/board';
import type {Coord, Viewport} from '../types';

type Props = {
  board: BoardState;
  viewport: Viewport;
  lastMove: Coord | null;
  pendingMove: Coord | null;
  hintMove: Coord | null;
  moveNumbers?: Record<string, number>;
  onTapCoord: (rc: Coord) => void;
  boardSize?: number;
  rotate90?: boolean;
};

const PAD = 24;
const SGF_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function toSgfLabel(i: number): string {
  if (i >= 0 && i < SGF_LETTERS.length) {
    return SGF_LETTERS[i].toUpperCase();
  }
  return '?';
}

function isSame(a: Coord | null, b: Coord | null): boolean {
  if (!a || !b) return false;
  return a.row === b.row && a.col === b.col;
}

export function GoBoard({
  board,
  viewport,
  lastMove,
  pendingMove,
  hintMove,
  moveNumbers,
  onTapCoord,
  boardSize = 300,
  rotate90 = false,
}: Props): React.JSX.Element {
  void lastMove;
  const rows = viewport.maxRow - viewport.minRow + 1;
  const cols = viewport.maxCol - viewport.minCol + 1;
  const dx = Math.max(1, cols - 1);
  const dy = Math.max(1, rows - 1);
  const initialCell = Math.min((boardSize - PAD * 2) / dx, (boardSize - PAD * 2) / dy);
  const initialStone = Math.max(14, initialCell * 0.94);
  const coordFontSize = Math.max(11, Math.min(15, initialCell * 0.24));
  const coordLineHeight = Math.round(coordFontSize + 2);
  const topLabelSpace = Math.ceil(initialStone * 0.5 + coordLineHeight + 8);
  const rightLabelSpace = Math.ceil(initialStone * 0.5 + coordFontSize + 10);

  const usableW = boardSize - PAD * 2 - rightLabelSpace;
  const usableH = boardSize - PAD * 2 - topLabelSpace;
  const cell = Math.min(usableW / dx, usableH / dy);
  const boardW = dx * cell;
  const boardH = dy * cell;
  const left = PAD + (usableW - boardW) / 2;
  const top = PAD + topLabelSpace + (usableH - boardH) / 2;
  const stone = Math.max(14, cell * 0.94);
  const moveFontSize = Math.max(8, Math.min(16, stone * 0.34));
  const moveLineHeight = Math.round(moveFontSize + 1);
  const hit = Math.max(26, cell * 1.1);
  const ext = Math.max(8, cell * 0.45);

  const vLines = Array.from({length: cols}, (_, i) => {
    const x = left + i * cell;
    return (
      <View
        key={`v-${i}`}
        style={[styles.gridLine, {left: x, top, height: boardH, width: 1}]}
      />
    );
  });
  const hLines = Array.from({length: rows}, (_, i) => {
    const y = top + i * cell;
    return (
      <View
        key={`h-${i}`}
        style={[styles.gridLine, {left, top: y, width: boardW, height: 1}]}
      />
    );
  });
  const edgeExts: React.JSX.Element[] = [];
  if (viewport.minRow > 0 || viewport.maxRow < board.size - 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = left + i * cell;
      if (viewport.minRow > 0) {
        edgeExts.push(
          <View
            key={`ext-t-${i}`}
            style={[
              styles.gridLine,
              {left: x, top: top - ext, height: ext, width: 1},
            ]}
          />,
        );
      }
      if (viewport.maxRow < board.size - 1) {
        edgeExts.push(
          <View
            key={`ext-b-${i}`}
            style={[
              styles.gridLine,
              {left: x, top: top + boardH, height: ext, width: 1},
            ]}
          />,
        );
      }
    }
  }
  if (viewport.minCol > 0 || viewport.maxCol < board.size - 1) {
    for (let i = 0; i < rows; i += 1) {
      const y = top + i * cell;
      if (viewport.minCol > 0) {
        edgeExts.push(
          <View
            key={`ext-l-${i}`}
            style={[
              styles.gridLine,
              {left: left - ext, top: y, width: ext, height: 1},
            ]}
          />,
        );
      }
      if (viewport.maxCol < board.size - 1) {
        edgeExts.push(
          <View
            key={`ext-r-${i}`}
            style={[
              styles.gridLine,
              {left: left + boardW, top: y, width: ext, height: 1},
            ]}
          />,
        );
      }
    }
  }

  const touches: React.JSX.Element[] = [];
  const stones: React.JSX.Element[] = [];
  const labels: React.JSX.Element[] = [];
  for (let r = viewport.minRow; r <= viewport.maxRow; r += 1) {
    for (let c = viewport.minCol; c <= viewport.maxCol; c += 1) {
      const rc = {row: r, col: c};
      const x = left + (c - viewport.minCol) * cell;
      const y = top + (r - viewport.minRow) * cell;
      touches.push(
        <Pressable
          key={`t-${r}-${c}`}
          onPress={() => onTapCoord(rc)}
          style={{
            position: 'absolute',
            left: x - hit / 2,
            top: y - hit / 2,
            width: hit,
            height: hit,
          }}
        />,
      );
      const v = board.getAt(rc);
      if (v === '.') {
        if (isSame(pendingMove, rc)) {
          stones.push(
            <View
              key={`p-${r}-${c}`}
              style={[
                styles.pending,
                {
                  left: x - stone * 0.32,
                  top: y - stone * 0.32,
                  width: stone * 0.64,
                  height: stone * 0.64,
                  borderRadius: stone * 0.32,
                },
              ]}
            />,
          );
        }
        if (isSame(hintMove, rc)) {
          stones.push(
            <View
              key={`h-${r}-${c}`}
              style={[
                styles.hint,
                {
                  left: x - stone * 0.46,
                  top: y - stone * 0.46,
                  width: stone * 0.92,
                  height: stone * 0.92,
                  borderRadius: stone * 0.46,
                },
              ]}
            />,
          );
        }
        continue;
      }
      stones.push(
        <View
          key={`s-${r}-${c}`}
          style={[
            styles.stone,
            v === 'B' ? styles.blackStone : styles.whiteStone,
            {
              left: x - stone / 2,
              top: y - stone / 2,
              width: stone,
              height: stone,
              borderRadius: stone / 2,
            },
          ]}>
          {moveNumbers?.[`${r},${c}`] ? (
            <Text
              style={[
                styles.moveNumber,
                {fontSize: moveFontSize, lineHeight: moveLineHeight},
                v === 'B' ? styles.moveNumberOnBlack : styles.moveNumberOnWhite,
              ]}>
              {moveNumbers[`${r},${c}`]}
            </Text>
          ) : null}
        </View>,
      );
    }
  }

  for (let c = viewport.minCol; c <= viewport.maxCol; c += 1) {
    const x = left + (c - viewport.minCol) * cell;
    labels.push(
      <Text
        key={`cx-${c}`}
        style={[
          styles.coordText,
          {
            left: x - Math.max(7, coordFontSize * 0.58),
            top: top - (stone * 0.5 + coordLineHeight + 4),
            fontSize: coordFontSize,
            lineHeight: coordLineHeight,
          },
        ]}>
        {c + 1}
      </Text>,
    );
  }
  for (let r = viewport.minRow; r <= viewport.maxRow; r += 1) {
    const y = top + (r - viewport.minRow) * cell;
    labels.push(
      <Text
        key={`ry-${r}`}
        style={[
          styles.coordText,
          {
            left: left + boardW + stone * 0.5 + 4,
            top: y - coordLineHeight / 2,
            fontSize: coordFontSize,
            lineHeight: coordLineHeight,
          },
        ]}>
        {toSgfLabel(r)}
      </Text>,
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.boardRotateWrap, rotate90 && styles.boardRotate90]}>
        <View style={[styles.board, {width: boardSize, height: boardSize}]}>
          {vLines}
          {hLines}
          {edgeExts}
          {stones}
          {touches}
          {labels}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  boardRotateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardRotate90: {
    transform: [{rotate: '90deg'}],
  },
  board: {
    backgroundColor: '#C7AE73',
    borderRadius: 8,
    overflow: 'visible',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: '#4d3b20',
  },
  stone: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blackStone: {
    backgroundColor: '#111111',
  },
  whiteStone: {
    backgroundColor: '#f2f2f2',
    borderWidth: 1,
    borderColor: '#7b7b7b',
  },
  pending: {
    position: 'absolute',
    backgroundColor: 'rgba(69,160,73,0.6)',
  },
  hint: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#2ebd59',
  },
  coordText: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: '600',
    color: '#2b2b2b',
  },
  moveNumber: {
    fontSize: 16,
    fontWeight: '700',
  },
  moveNumberOnBlack: {color: '#f5f5f5'},
  moveNumberOnWhite: {color: '#222222'},
});
