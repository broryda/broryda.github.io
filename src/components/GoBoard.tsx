import React, {useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {BoardState} from '../core/board';
import type {Coord, Viewport} from '../types';

type Props = {
  board: BoardState;
  viewport: Viewport;
  lastMove: Coord | null;
  pendingMove: Coord | null;
  previewMove?: Coord | null;
  previewColor?: 'B' | 'W';
  hintMoves: Coord[];
  moveNumbers?: Record<string, number>;
  onPreviewCoord?: (rc: Coord | null) => void;
  onTapCoord: (rc: Coord) => void;
  boardSize?: number;
  boardMaxHeight?: number;
  rotate90?: boolean;
};

const PAD = 20;
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

function hasCoord(list: Coord[], rc: Coord): boolean {
  return list.some(v => v.row === rc.row && v.col === rc.col);
}

function getTouchDistance(t1: {pageX: number; pageY: number}, t2: {pageX: number; pageY: number}): number {
  const dx = t1.pageX - t2.pageX;
  const dy = t1.pageY - t2.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function expandedViewport(viewport: Viewport, boardSize: number): Viewport {
  let minRow = viewport.minRow;
  let maxRow = viewport.maxRow;
  let minCol = viewport.minCol;
  let maxCol = viewport.maxCol;

  if (minCol === 1) minCol = 0; // 2媛 蹂댁씠硫?1???쒖떆
  if (maxCol === boardSize - 2) maxCol = boardSize - 1; // 18??蹂댁씠硫?19???쒖떆(19x19)
  if (minRow === 1) minRow = 0; // B媛 蹂댁씠硫?A???쒖떆
  if (maxRow === boardSize - 2) maxRow = boardSize - 1; // R??蹂댁씠硫?S???쒖떆(19x19)

  return {minRow, maxRow, minCol, maxCol};
}

export function GoBoard({
  board,
  viewport,
  lastMove,
  pendingMove,
  previewMove = null,
  previewColor = 'B',
  hintMoves,
  moveNumbers,
  onPreviewCoord,
  onTapCoord,
  boardSize = 300,
  boardMaxHeight,
  rotate90 = false,
}: Props): React.JSX.Element {
  void lastMove;
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomOffset, setZoomOffset] = useState({x: 0, y: 0});
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const pinchStartOffset = useRef({x: 0, y: 0});
  const pinchStartFocal = useRef<{x: number; y: number} | null>(null);
  const pinchStartMidPage = useRef<{x: number; y: number} | null>(null);
  const zoomWrapRef = useRef<View | null>(null);
  const zoomWrapWindow = useRef<{x: number; y: number; width: number; height: number}>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const isPinching = useRef(false);
  const suppressTapUntil = useRef(0);
  const drawViewport = expandedViewport(viewport, board.size);
  const rows = drawViewport.maxRow - drawViewport.minRow + 1;
  const cols = drawViewport.maxCol - drawViewport.minCol + 1;
  const dx = Math.max(1, cols - 1);
  const dy = Math.max(1, rows - 1);
  const initialCell = Math.max(18, (boardSize - PAD * 2) / dx);
  const initialStone = Math.max(14, initialCell * 0.94);
  const coordFontSize = Math.max(11, Math.min(15, initialCell * 0.24));
  const coordLineHeight = Math.round(coordFontSize + 2);
  const topLabelSpace = Math.ceil(initialStone * 0.46 + coordLineHeight + 6);
  const rightLabelSpace = Math.ceil(initialStone * 0.42 + coordFontSize + 8);

  const usableW = boardSize - PAD * 2 - rightLabelSpace;
  const maxH = boardMaxHeight ?? boardSize;
  const cellByWidth = usableW / dx;
  const cellByHeight = (maxH - (PAD * 2 + topLabelSpace + 14)) / dy;
  const cell = Math.max(12, Math.min(cellByWidth, cellByHeight));
  const boardW = dx * cell;
  const boardH = dy * cell;
  // When the viewport is narrow, keep the board centered in the drawable width
  // so it does not stick to the left while row labels stay far on the right.
  const left = PAD + Math.max(0, (usableW - boardW) / 2);
  const top = PAD + topLabelSpace;
  const stone = Math.max(14, cell * 0.94);
  const moveFontSize = Math.max(8, Math.min(16, stone * 0.34));
  const moveLineHeight = Math.round(moveFontSize + 1);
  const hit = Math.max(26, cell * 1.1);
  const ext = Math.max(8, Math.min(cell * 0.45, PAD - 2));
  const boardOuterH =
    top + boardH + PAD + (drawViewport.maxRow < board.size - 1 ? ext : 0);
  const boardCenterX = boardSize / 2;
  const boardCenterY = boardOuterH / 2;

  const updateZoomWrapWindow = (): void => {
    zoomWrapRef.current?.measureInWindow((x, y, width, height) => {
      zoomWrapWindow.current = {x, y, width, height};
    });
  };

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
  const hoshiDots: React.JSX.Element[] = [];
  if (drawViewport.minRow > 0 || drawViewport.maxRow < board.size - 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = left + i * cell;
      if (drawViewport.minRow > 0) {
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
      if (drawViewport.maxRow < board.size - 1) {
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
  if (drawViewport.minCol > 0 || drawViewport.maxCol < board.size - 1) {
    for (let i = 0; i < rows; i += 1) {
      const y = top + i * cell;
      if (drawViewport.minCol > 0) {
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
      if (drawViewport.maxCol < board.size - 1) {
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

  const hoshiAxis =
    board.size >= 19
      ? [3, 9, 15]
      : board.size >= 13
        ? [3, Math.floor(board.size / 2), board.size - 4]
        : board.size >= 9
          ? [2, Math.floor(board.size / 2), board.size - 3]
          : [];
  const hoshiSize = Math.max(4, Math.min(8, cell * 0.16));
  for (const r of hoshiAxis) {
    for (const c of hoshiAxis) {
      if (
        r < drawViewport.minRow ||
        r > drawViewport.maxRow ||
        c < drawViewport.minCol ||
        c > drawViewport.maxCol
      ) {
        continue;
      }
      const x = left + (c - drawViewport.minCol) * cell;
      const y = top + (r - drawViewport.minRow) * cell;
      hoshiDots.push(
        <View
          key={`hoshi-${r}-${c}`}
          style={{
            position: 'absolute',
            left: x - hoshiSize / 2,
            top: y - hoshiSize / 2,
            width: hoshiSize,
            height: hoshiSize,
            borderRadius: hoshiSize / 2,
            backgroundColor: '#3f3119',
          }}
        />,
      );
    }
  }

  const touches: React.JSX.Element[] = [];
  const stones: React.JSX.Element[] = [];
  const labels: React.JSX.Element[] = [];
  for (let r = drawViewport.minRow; r <= drawViewport.maxRow; r += 1) {
    for (let c = drawViewport.minCol; c <= drawViewport.maxCol; c += 1) {
      const rc = {row: r, col: c};
      const x = left + (c - drawViewport.minCol) * cell;
      const y = top + (r - drawViewport.minRow) * cell;
      touches.push(
        <Pressable
          key={`t-${r}-${c}`}
          onPressIn={() => {
            const now = Date.now();
            if (isPinching.current || now < suppressTapUntil.current) return;
            onPreviewCoord?.(rc);
          }}
          onPressOut={() => {
            onPreviewCoord?.(null);
          }}
          onPress={() => {
            const now = Date.now();
            if (isPinching.current || now < suppressTapUntil.current) return;
            onTapCoord(rc);
          }}
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
        if (hasCoord(hintMoves, rc)) {
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

  for (let c = drawViewport.minCol; c <= drawViewport.maxCol; c += 1) {
    const x = left + (c - drawViewport.minCol) * cell;
    labels.push(
      <Text
        key={`cx-${c}`}
        style={[
          styles.coordText,
          {
            left: x - Math.max(7, coordFontSize * 0.58),
            top: PAD + 1,
            fontSize: coordFontSize,
            lineHeight: coordLineHeight,
          },
        ]}>
        {c + 1}
      </Text>,
    );
  }
  for (let r = drawViewport.minRow; r <= drawViewport.maxRow; r += 1) {
    const y = top + (r - drawViewport.minRow) * cell;
    labels.push(
      <Text
        key={`ry-${r}`}
        style={[
          styles.coordText,
          {
            left: boardSize - PAD - Math.max(coordFontSize + 1, 12),
            top: y - coordLineHeight / 2,
            fontSize: coordFontSize,
            lineHeight: coordLineHeight,
          },
        ]}>
        {toSgfLabel(r)}
      </Text>,
    );
  }

  const handleTouchStart = (event: {
    nativeEvent: {
      touches: Array<{
        pageX: number;
        pageY: number;
        locationX?: number;
        locationY?: number;
      }>;
    };
  }): void => {
    const touches = event.nativeEvent.touches;
    if (touches.length < 2) return;
    updateZoomWrapWindow();
    pinchStartDistance.current = getTouchDistance(touches[0], touches[1]);
    pinchStartScale.current = zoomScale;
    pinchStartOffset.current = zoomOffset;
    const startMidPageX = (touches[0].pageX + touches[1].pageX) / 2;
    const startMidPageY = (touches[0].pageY + touches[1].pageY) / 2;
    const localStartX = startMidPageX - zoomWrapWindow.current.x;
    const localStartY = startMidPageY - zoomWrapWindow.current.y;
    pinchStartFocal.current = {
      x: localStartX - boardCenterX,
      y: localStartY - boardCenterY,
    };
    pinchStartMidPage.current = {x: startMidPageX, y: startMidPageY};
    isPinching.current = true;
    suppressTapUntil.current = Date.now() + 180;
    onPreviewCoord?.(null);
  };

  const handleTouchMove = (event: {
    nativeEvent: {
      touches: Array<{
        pageX: number;
        pageY: number;
        locationX?: number;
        locationY?: number;
      }>;
    };
  }): void => {
    const touches = event.nativeEvent.touches;
    if (
      touches.length < 2 ||
      pinchStartDistance.current == null ||
      !pinchStartFocal.current ||
      !pinchStartMidPage.current
    ) {
      return;
    }
    const currentDistance = getTouchDistance(touches[0], touches[1]);
    if (currentDistance <= 0) return;
    const ratio = currentDistance / pinchStartDistance.current;
    const rawScale = pinchStartScale.current * ratio;
    const next = Math.max(0.9, Math.min(1.8, rawScale));
    if (Math.abs(next - zoomScale) < 0.005) return;
    const midPageX = (touches[0].pageX + touches[1].pageX) / 2;
    const midPageY = (touches[0].pageY + touches[1].pageY) / 2;
    const localNowX = midPageX - zoomWrapWindow.current.x;
    const localNowY = midPageY - zoomWrapWindow.current.y;
    const startScale = Math.max(0.0001, pinchStartScale.current);
    const startOffset = pinchStartOffset.current;
    const startFocal = pinchStartFocal.current;
    // Keep the touched board point under the fingers while pinching.
    const qx = (startFocal.x - startOffset.x) / startScale;
    const qy = (startFocal.y - startOffset.y) / startScale;
    const focalNowX = localNowX - boardCenterX;
    const focalNowY = localNowY - boardCenterY;
    const targetOffsetX = focalNowX - next * qx;
    const targetOffsetY = focalNowY - next * qy;
    const maxPanX = Math.max(0, (boardSize * (next - 1)) / 2 + 24);
    const maxPanY = Math.max(0, (boardOuterH * (next - 1)) / 2 + 24);
    const clampedX = Math.max(-maxPanX, Math.min(maxPanX, targetOffsetX));
    const clampedY = Math.max(-maxPanY, Math.min(maxPanY, targetOffsetY));
    // Follow finger focal point directly; clamp handles jitter sufficiently.
    const smooth = 1;
    setZoomOffset(prev => ({
      x: prev.x + (clampedX - prev.x) * smooth,
      y: prev.y + (clampedY - prev.y) * smooth,
    }));
    setZoomScale(next);
  };

  const handleTouchEnd = (event: {
    nativeEvent: {touches: Array<{pageX: number; pageY: number}>};
  }): void => {
    if (event.nativeEvent.touches.length >= 2) return;
    pinchStartDistance.current = null;
    pinchStartScale.current = zoomScale;
    pinchStartFocal.current = null;
    pinchStartMidPage.current = null;
    isPinching.current = false;
    suppressTapUntil.current = Date.now() + 260;
    onPreviewCoord?.(null);
    if (zoomScale <= 1.02) {
      setZoomScale(1);
      setZoomOffset({x: 0, y: 0});
    }
  };

  const previewInViewport =
    !!previewMove &&
    previewMove.row >= drawViewport.minRow &&
    previewMove.row <= drawViewport.maxRow &&
    previewMove.col >= drawViewport.minCol &&
    previewMove.col <= drawViewport.maxCol;
  const previewCellEmpty = previewMove ? board.getAt(previewMove) === '.' : false;
  const previewX =
    previewMove && previewInViewport
      ? left + (previewMove.col - drawViewport.minCol) * cell
      : 0;
  const previewY =
    previewMove && previewInViewport
      ? top + (previewMove.row - drawViewport.minRow) * cell
      : 0;

  return (
    <View style={styles.wrap}>
      <View
        ref={zoomWrapRef}
        style={styles.zoomWrap}
        onLayout={updateZoomWrapWindow}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}>
        <View
          style={[
            styles.boardRotateWrap,
            {
              transform: [
                {translateX: zoomOffset.x},
                {translateY: zoomOffset.y},
                {scale: zoomScale},
                ...(rotate90 ? [{rotate: '90deg'} as const] : []),
              ],
            },
          ]}>
        <View style={[styles.board, {width: boardSize, height: boardOuterH}]}>
          {vLines}
          {hLines}
          {previewMove && previewInViewport && !isPinching.current ? (
            <>
              <View
                style={[
                  styles.previewLine,
                  {left: previewX, top: top - ext, width: 2, height: boardH + ext * 2},
                ]}
              />
              <View
                style={[
                  styles.previewLine,
                  {left: left - ext, top: previewY, width: boardW + ext * 2, height: 2},
                ]}
              />
            </>
          ) : null}
          {edgeExts}
          {hoshiDots}
          {previewMove && previewInViewport && previewCellEmpty && !isPinching.current ? (
            <View
              style={[
                styles.previewStone,
                previewColor === 'B' ? styles.previewStoneBlack : styles.previewStoneWhite,
                {
                  left: previewX - stone / 2,
                  top: previewY - stone / 2,
                  width: stone,
                  height: stone,
                  borderRadius: stone / 2,
                },
              ]}
            />
          ) : null}
          {stones}
          {touches}
          {labels}
        </View>
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  zoomWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardRotateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  board: {
    backgroundColor: '#D8B56B',
    borderRadius: 8,
    overflow: 'visible',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: '#4d3b20',
  },
  previewLine: {
    position: 'absolute',
    backgroundColor: '#E44444',
    zIndex: 7,
  },
  previewStone: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(70,50,20,0.45)',
    zIndex: 8,
  },
  previewStoneBlack: {
    backgroundColor: 'rgba(10, 10, 10, 0.35)',
  },
  previewStoneWhite: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
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

