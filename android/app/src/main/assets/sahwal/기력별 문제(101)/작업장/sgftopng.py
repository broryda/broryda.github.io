import os, math
from typing import List, Tuple
from PIL import Image, ImageDraw, ImageFont
from sgfmill import sgf, sgf_moves, boards

# ===== 렌더링 옵션 =====
CELL   = 44
MARGIN = 70
BOARD_COLOR = (214, 163, 92)
GRID_COLOR  = (40, 25, 10)
STAR_COLOR  = (30, 18, 8)
COORD_COLOR = (20, 20, 20)

# 잘라낼 영역: 전체 보드의 "우하 11x11"
CROP_SIZE = 11

# ---- 폰트 로드 ----
def load_font(size: int):
    cands = [
        "C:/Windows/Fonts/malgun.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    ]
    for p in cands:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

# ---- 좌표 라벨(A.., I 생략) ----
def go_labels(n: int) -> List[str]:
    letters, ch = [], ord('A')
    while len(letters) < n:
        c = chr(ch)
        if c != 'I':
            letters.append(c)
        ch += 1
    return letters

# ---- 전형적 성림 (글로벌 좌표) ----
def star_points_global(n: int) -> List[Tuple[int,int]]:
    if n == 19:
        pts = [3, 9, 15]
    elif n == 13:
        pts = [3, 6, 9]
    elif n == 9:
        pts = [2, 4, 6]
    else:
        return []
    return [(r, c) for r in pts for c in pts]

# ---- 돌 그리기(간단 하이라이트) ----
def draw_stone(draw, center, radius, color):
    cx, cy = center
    if color == 'b':
        base, hi = (30, 30, 30), (160, 160, 160)
    else:
        base, hi = (235, 235, 235), (255, 255, 255)
    draw.ellipse([cx-radius, cy-radius, cx+radius, cy+radius], fill=base, outline=(0,0,0))
    draw.ellipse([cx-radius//2, cy-radius//2, cx-radius//4, cy-radius//4], fill=hi)

# ---- 부분보 렌더링: 우하 11x11 ----
def render_subset(board: boards.Board, out_path: str, size: int = CROP_SIZE):
    n = board.side
    if size > n:
        size = n

    # 우하(anchor) 시작점 (글로벌 행/열 인덱스)
    start_r = n - size
    start_c = n - size

    # 캔버스 크기(부분보 기준)
    W = MARGIN*2 + CELL*(size-1)
    H = MARGIN*2 + CELL*(size-1)
    img = Image.new("RGB", (W, H), BOARD_COLOR)
    draw = ImageDraw.Draw(img)

    x0, y0 = MARGIN, MARGIN
    x1, y1 = W - MARGIN, H - MARGIN

    # 격자
    for i in range(size):
        y = y0 + i*CELL
        draw.line([(x0, y), (x1, y)], fill=GRID_COLOR, width=2)
        x = x0 + i*CELL
        draw.line([(x, y0), (x, y1)], fill=GRID_COLOR, width=2)

    # 성림: 전체 보드의 성림 중, 부분보 안에 들어오는 것만
    for (gr, gc) in star_points_global(n):
        if start_r <= gr < start_r+size and start_c <= gc < start_c+size:
            lr = gr - start_r
            lc = gc - start_c
            sx = x0 + lc*CELL
            sy = y0 + lr*CELL
            draw.ellipse([sx-5, sy-5, sx+5, sy+5], fill=STAR_COLOR)

    # 좌표 라벨(전체판 기준으로 절편 표시)
    font = load_font(20)
    letters = go_labels(n)

    # 열 라벨(아래쪽): 글로벌 열 인덱스 = start_c .. start_c+size-1
    for i in range(size):
        gc = start_c + i
        lx = x0 + i*CELL
        draw.text((lx-6, y1+12), letters[gc], fill=COORD_COLOR, font=font)

    # 행 라벨(왼쪽): 아래쪽이 1인 표기 → 라벨 = n - 글로벌행
    # 로컬 i = 0..size-1 (위→아래), 글로벌 행 gr = start_r + i
    for i in range(size):
        gr = start_r + i
        # y좌표는 위에서부터 내려옴
        ly = y0 + (size-1 - i)*CELL
        label_num = n - gr
        draw.text((x0-36, ly-10), str(label_num), fill=COORD_COLOR, font=font)

    # 돌 배치: 부분보에 해당하는 좌표만 찍기
    for gr in range(start_r, start_r+size):
        for gc in range(start_c, start_c+size):
            stone = board.get(gr, gc)
            if not stone:
                continue
            lr = gr - start_r
            lc = gc - start_c
            cx = x0 + lc*CELL
            cy = y0 + lr*CELL
            draw_stone(draw, (cx, cy), int(CELL*0.45), stone)

    img.save(out_path)

def sgf_to_png_setup_subset(sgf_path: str, out_path: str, subset_size: int = CROP_SIZE):
    with open(sgf_path, "rb") as f:
        game = sgf.Sgf_game.from_bytes(f.read())
    # AB/AW만 반영된 보드
    board, plays = sgf_moves.get_setup_and_moves(game)
    # 수순은 무시 → setup만 렌더링
    render_subset(board, out_path, size=subset_size)

def convert_all(folder="."):
    files = [f for f in os.listdir(folder) if f.lower().endswith(".sgf")]
    files.sort()
    if not files:
        print("⚠️ SGF 없음")
        return
    for f in files:
        out = os.path.splitext(f)[0] + ".png"
        try:
            sgf_to_png_setup_subset(f, out, subset_size=CROP_SIZE)
            print(f"✅ {f} → {out}")
        except Exception as e:
            print(f"❌ {f}: {e}")

if __name__ == "__main__":
    convert_all(".")
