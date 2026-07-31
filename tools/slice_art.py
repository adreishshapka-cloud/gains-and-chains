"""
Режет лист символов на отдельные PNG для src/assets/symbols/.

    python tools/slice_art.py <лист.png> [--dry]

Координаты карточек не задаются руками: скрипт находит их сам по проекциям.
Ручные числа развалились бы при первой же перегенерации листа, а так достаточно
подложить новый файл — и нарезка повторится.

Что делает с каждой карточкой:
  1. отрезает декоративную рамку (она не должна попасть в игру — рамку ячейки
     рисует движок, две рамки будут спорить);
  2. заливкой от краёв убирает тёмный фон карточки в прозрачность. Именно
     заливкой, а не порогом по яркости: у символов чёрный контур, и порог
     выел бы его вместе с фоном;
  3. приводит к общему квадрату, вписывая символ по центру.
"""

import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "src" / "assets" / "symbols"

# Имена по порядку следования карточек: сверху вниз, в каждой полосе слева направо.
# Первые пять и следующие четыре лежат в одной полосе, поэтому идут подряд.
NAMES = [
    "dumbbell", "wristband", "harness", "oil", "shaker",
    "rookie", "ref", "champion", "duke",
    "wild", "scatter", "chain", "fist",
    "chain-1", "chain-2", "chain-3", "chain-4", "chain-5",
]

# Сколько пикселей рамки срезать внутрь после того, как карточка найдена.
FRAME_INSET = 14
# Насколько цвет считается «тем же фоном» при заливке.
BG_TOLERANCE = 46
# Сторона итогового квадрата.
OUT_SIZE = 128


def brightness(px):
    return (px[0] * 299 + px[1] * 587 + px[2] * 114) // 1000


def find_bands(mask, length, cross, min_run):
    """Ищет полосы, где встречается хоть сколько-то не-фоновых пикселей."""
    runs, start = [], None
    for i in range(length):
        filled = any(mask[i][j] for j in range(cross))
        if filled and start is None:
            start = i
        elif not filled and start is not None:
            if i - start >= min_run:
                runs.append((start, i))
            start = None
    if start is not None and length - start >= min_run:
        runs.append((start, length))
    return runs


def slice_sheet(path: Path, dry: bool):
    sheet = Image.open(path).convert("RGB")
    w, h = sheet.size
    px = sheet.load()

    # Фон листа — самый тёмный тон; берём его из угла.
    bg = px[2, 2]
    bg_lum = brightness(bg)

    # Маска «здесь что-то нарисовано»: заметно светлее фона листа.
    mask = [[brightness(px[x, y]) > bg_lum + 26 for x in range(w)] for y in range(h)]

    rows = find_bands(mask, h, w, 40)
    cards = []
    for top, bottom in rows:
        strip = [[mask[y][x] for x in range(w)] for y in range(top, bottom)]
        cols_mask = [[strip[y][x] for y in range(len(strip))] for x in range(w)]
        cols = find_bands(cols_mask, w, len(strip), 40)
        # Полосы подписей и палитры ниже карточек — они низкие, отсеиваем.
        if bottom - top < 90:
            continue
        for left, right in cols:
            if right - left < 90:
                continue
            cards.append((left, top, right, bottom))

    print(f"  Лист {w}×{h}, найдено карточек: {len(cards)}")
    for i, (l, t, r, b) in enumerate(cards):
        name = NAMES[i] if i < len(NAMES) else f"unknown-{i}"
        print(f"   {i:2d} {name:<10} x {l:4d}..{r:<4d} y {t:4d}..{b:<4d}  {r-l}×{b-t}")

    if len(cards) != len(NAMES):
        print(f"\n  Ожидалось {len(NAMES)} карточек. Нарезка не выполнена.")
        return 1
    if dry:
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, (l, t, r, b) in zip(NAMES, cards):
        cut = sheet.crop((l + FRAME_INSET, t + FRAME_INSET, r - FRAME_INSET, b - FRAME_INSET))
        cut = cut.convert("RGBA")
        drop_background(cut)
        save_square(cut, OUT_DIR / f"{name}.png")
        print(f"   → {name}.png")

    print(f"\n  Готово: {len(NAMES)} файлов в {OUT_DIR}")
    return 0


def drop_background(img: Image.Image):
    """Заливка от краёв: прозрачным становится только фон, связный с границей."""
    w, h = img.size
    px = img.load()
    seed = px[0, 0][:3]
    seen = [[False] * w for _ in range(h)]
    queue = deque()

    for x in range(w):
        queue.append((x, 0))
        queue.append((x, h - 1))
    for y in range(h):
        queue.append((0, y))
        queue.append((w - 1, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]:
            continue
        r, g, b, _ = px[x, y]
        if abs(r - seed[0]) + abs(g - seed[1]) + abs(b - seed[2]) > BG_TOLERANCE:
            continue
        seen[y][x] = True
        px[x, y] = (r, g, b, 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))


def save_square(img: Image.Image, dest: Path):
    """Обрезает по видимому содержимому и вписывает в общий квадрат."""
    box = img.getbbox()
    if box:
        img = img.crop(box)
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    # NEAREST обязателен: это пиксель-арт, любое сглаживание его размоет.
    canvas = canvas.resize((OUT_SIZE, OUT_SIZE), Image.NEAREST)
    canvas.save(dest)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print("  Укажи файл листа: python tools/slice_art.py <лист.png>")
        sys.exit(1)
    sys.exit(slice_sheet(Path(args[0]), "--dry" in sys.argv))
