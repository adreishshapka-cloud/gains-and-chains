"""
Собирает рамку поля 5×5 для монетного бонуса.

    python tools/prep_coin_field.py

Рисовать её заново неоткуда: в наборе такой рамки нет, а поле бонуса должно
выглядеть частью той же машины, что и барабаны. Поэтому она пересобирается
из рамки барабанов основного фона: берутся её углы и кромки, растягивается
середина, а внутрь кладётся сетка на 25 клеток вместо 20.

Почему клетка мельче барабанной. Барабанное поле — 5×4 по 136 пикселей, оно
занимает по высоте 105..649. Пятому ряду там взяться неоткуда: 5×136 = 680
упирается в нижнюю полосу интерфейса. Клетка монетного поля — 107 пикселей:
5×107 плюс две кромки по 34 дают 603 — ровно высота рамки барабанов (80..682),
так что поле встаёт в тот же вырез комнаты. По ширине оно у́же барабанного
(603 против 756), и это к лучшему: две разные игры и выглядеть должны
по-разному.
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
UI = ROOT / "src" / "assets" / "ui"

# Рамка барабанов на основном фоне: x 436..1192, y 80..682 (обмерено
# по профилям яркости, см. tools/prep_bonus_room.py).
FRAME = (436, 80, 1192, 682)

# Толщина кромки рамки: до неё идёт металл, дальше — ячейки.
EDGE = 34

# Поле 5×5 по 111 пикселей плюс кромка с каждой стороны.
CELL = 107
COLS = ROWS = 5


def build_frame(src: Image.Image) -> Image.Image:
    """Растягивает рамку под новый размер, не растягивая её углы.

    Углы копируются как есть, кромки размножаются вдоль своей стороны —
    иначе заклёпки на них расплываются в овалы, и рамка сразу читается
    растянутой картинкой.
    """
    frame = src.crop(FRAME)
    fw, fh = frame.size
    out_w, out_h = COLS * CELL + EDGE * 2, ROWS * CELL + EDGE * 2
    out = Image.new("RGB", (out_w, out_h))

    # Углы.
    parts = {
        "tl": (0, 0, EDGE, EDGE),
        "tr": (fw - EDGE, 0, fw, EDGE),
        "bl": (0, fh - EDGE, EDGE, fh),
        "br": (fw - EDGE, fh - EDGE, fw, fh),
    }
    corners = {k: frame.crop(v) for k, v in parts.items()}

    # Кромки: узкая полоса середины стороны, размноженная по длине.
    top = frame.crop((EDGE, 0, fw - EDGE, EDGE)).resize((out_w - EDGE * 2, EDGE), Image.LANCZOS)
    bottom = frame.crop((EDGE, fh - EDGE, fw - EDGE, fh)).resize(
        (out_w - EDGE * 2, EDGE), Image.LANCZOS
    )
    left = frame.crop((0, EDGE, EDGE, fh - EDGE)).resize((EDGE, out_h - EDGE * 2), Image.LANCZOS)
    right = frame.crop((fw - EDGE, EDGE, fw, fh - EDGE)).resize(
        (EDGE, out_h - EDGE * 2), Image.LANCZOS
    )

    # Нутро: ровный тёмный кусок из середины поля, размноженный по площади.
    # Брать его надо именно из пустого места, а не откуда придётся: в ячейках
    # основного фона нарисована таблица выплат, и первый заход размножил
    # по всему полю ряды гантелей.
    #
    # Ровная заливка, а не перенос куска: любой кусок поля несёт на себе
    # разделитель ячеек, и размноженный по площади он даёт полосатую сетку
    # не там, где надо. Цвет — медиана чистого участка, плюс лёгкое зерно,
    # чтобы большая площадь не читалась пластиком. Сетку клеток поверх рисует
    # движок (ReelDividers), коробки заполняют монеты.
    sample = [src.getpixel((715 + dx, 335 + dy)) for dy in range(0, 60, 3) for dx in range(0, 60, 3)]
    base = tuple(sorted(c[i] for c in sample)[len(sample) // 2] for i in range(3))
    inner = Image.new("RGB", (out_w - EDGE * 2, out_h - EDGE * 2), base)
    grain = inner.load()
    seed = 1
    for y in range(inner.height):
        for x in range(inner.width):
            seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
            n = (seed >> 16) % 5 - 2
            grain[x, y] = tuple(max(0, min(255, c + n)) for c in base)
    out.paste(inner, (EDGE, EDGE))

    out.paste(top, (EDGE, 0))
    out.paste(bottom, (EDGE, out_h - EDGE))
    out.paste(left, (0, EDGE))
    out.paste(right, (out_w - EDGE, EDGE))
    out.paste(corners["tl"], (0, 0))
    out.paste(corners["tr"], (out_w - EDGE, 0))
    out.paste(corners["bl"], (0, out_h - EDGE))
    out.paste(corners["br"], (out_w - EDGE, out_h - EDGE))
    return out


def main() -> int:
    src_path = UI / "background.png"
    if not src_path.exists():
        print(f"  Не найден фон: {src_path}")
        return 1

    src = Image.open(src_path).convert("RGB")
    frame = build_frame(src)
    UI.mkdir(parents=True, exist_ok=True)
    frame.save(UI / "coin-field.png")

    print(f"  coin-field.png  {frame.size[0]}x{frame.size[1]}")
    print("\n  Для layout.ts:")
    print(f"    COIN_FIELD = {{ cell: {CELL}, edge: {EDGE} }}  // поле {COLS}x{ROWS}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
