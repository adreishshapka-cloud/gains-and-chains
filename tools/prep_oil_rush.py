"""
Нарезает монеты второго бонуса из макета «вторая бонуска - oil rush».

    python tools/prep_oil_rush.py

    coin-bronze.png   coin-silver.png   coin-gold.png   coin-diamond.png
    coin-fist.png     coin-pump.png     coin-mult.png

## Почему монеты пустые

На макете у каждой монеты запечён свой номинал: ×1, ×5, ×50. Номиналов
пятнадцать, а крупно нарисованы восемь — остальные есть только в таблице
мелким кеглем, и растянутые они мылятся.

Поэтому лицо монеты чистится, а номинал пишет движок. Ровно то же правило,
что и у цепей в базовой игре: номинал зависит от ставки, и зашитое в картинку
число начнёт врать при первой же её смене.

Чистится лицо не заплаткой, а восстановлением: кольцо с заклёпками у монеты
своё и остаётся как есть, а внутренний диск заливается цветом, снятым с чистого
пояска сразу под кольцом. Лицо там почти ровное, поэтому подделка не видна —
в отличие от попытки замостить его кусками самого лица, где чистого места
попросту нет: цифра занимает почти весь диск.

## Алмаз

Крупной алмазной монеты на макете нет вовсе — она есть только в таблице.
Поэтому алмаз делается из серебра сдвигом в синеву: серебро нейтрально-серое,
и покраска на нём работает честно (золото бы позеленело).
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "вторая бонуска - oil rush" / "оил раш 2.png"
OUT = ROOT / "src" / "assets" / "ui"

# Центры монет на макете (обмерено по координатной сетке).
BRONZE = (555, 290)
SILVER = (685, 160)
GOLD = (950, 290)
FIST = (950, 415)
PUMP = (685, 415)
# Множитель нарисован не на поле, а в легенде справа.
MULT = (1250, 623)

# Радиус выреза: чуть больше самой монеты, чтобы не срезать внешнюю кромку.
R = 58
# Монета множителя в легенде нарисована мельче полевых — вырезается своим радиусом.
R_MULT = 52

# Доля радиуса, за которой начинается кольцо с заклёпками. Внутри — лицо,
# и его можно чистить; кольцо трогать нельзя, на нём вся фактура монеты.
FACE = 0.70


def cut(im: Image.Image, center: tuple[int, int], radius: int = R) -> Image.Image:
    """Вырезает монету кругом, за кругом — прозрачность."""
    cx, cy = center
    coin = im.crop((cx - radius, cy - radius, cx + radius, cy + radius)).convert("RGBA")

    mask = Image.new("L", (radius * 2, radius * 2), 0)
    ImageDraw.Draw(mask).ellipse((1, 1, radius * 2 - 2, radius * 2 - 2), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    coin.putalpha(mask)
    return coin


def blank_face(coin: Image.Image) -> Image.Image:
    """Убирает номинал, оставляя кольцо и чистое лицо.

    Цвет лица снимается с пояска между 0.58 и 0.68 радиуса: он идёт по кругу
    вплотную к кольцу, цифра туда не достаёт, а лицо на макете почти ровное.
    Медиана, а не среднее, — чтобы блик на краю не утянул тон.
    """
    size = coin.size[0]
    c = size / 2
    px = coin.load()

    ring: list[tuple[int, int, int]] = []
    for y in range(size):
        for x in range(size):
            d = ((x - c) ** 2 + (y - c) ** 2) ** 0.5 / c
            if 0.58 <= d <= 0.68 and px[x, y][3] > 200:
                ring.append(px[x, y][:3])

    if not ring:
        return coin
    base = tuple(sorted(v[i] for v in ring)[len(ring) // 2] for i in range(3))

    face = Image.new("RGBA", coin.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(face)
    inner = c * FACE
    # Лёгкое затемнение к центру: у монеты на макете лицо чуть утоплено,
    # и ровная заливка без него читается наклейкой.
    steps = 14
    for i in range(steps):
        t = i / steps
        r = inner * (1 - t * 0.98)
        k = 1 - 0.16 * t
        draw.ellipse(
            (c - r, c - r, c + r, c + r),
            fill=(int(base[0] * k), int(base[1] * k), int(base[2] * k), 255),
        )

    face = face.filter(ImageFilter.GaussianBlur(2.5))
    out = coin.copy()
    out.alpha_composite(face)
    return out


def to_diamond(silver: Image.Image) -> Image.Image:
    """Серебро в алмаз: сдвиг в синеву по каналам."""
    out = silver.copy()
    px = out.load()
    for y in range(out.size[1]):
        for x in range(out.size[0]):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            px[x, y] = (int(r * 0.62), int(g * 0.92), min(255, int(b * 1.35 + 22)), a)
    return out


def main() -> int:
    if not SRC.exists():
        print(f"  Не найден макет: {SRC}")
        return 1

    im = Image.open(SRC).convert("RGB")

    coins = {
        "coin-bronze.png": blank_face(cut(im, BRONZE)),
        "coin-silver.png": blank_face(cut(im, SILVER)),
        "coin-gold.png": blank_face(cut(im, GOLD)),
        # Особые монеты идут как есть: у них не номинал, а рисунок.
        "coin-fist.png": cut(im, FIST),
        "coin-pump.png": cut(im, PUMP),
        "coin-mult.png": cut(im, MULT, R_MULT),
    }
    coins["coin-diamond.png"] = to_diamond(coins["coin-silver.png"])

    OUT.mkdir(parents=True, exist_ok=True)
    for name, image in coins.items():
        image.save(OUT / name)
        print(f"  {name:20s} {image.size[0]}x{image.size[1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
