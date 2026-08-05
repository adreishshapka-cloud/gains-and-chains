"""
Нарезает монеты второго бонуса из макетов «монеты - 1» и «монеты 2».

    python tools/prep_oil_rush.py

    coin-v1.png … coin-v500.png   пятнадцать номиналов
    coin-bronze.png … coin-diamond.png   пустые монеты ступеней, запас
    coin-fist.png     coin-pump.png     coin-mult.png

## Номинал теперь запечён в картинку

Раньше лицо монеты чистилось, а число писал движок: на старом макете крупно
были нарисованы восемь монет из пятнадцати, и растянутые из таблицы остальные
мылились. На новом листе нарисованы все пятнадцать, каждая со своим номером,
фактурой и свечением — движку такое не повторить.

Поэтому монета приходит в игру со своим номиналом, а движок не пишет поверх
ничего. Условие тут одно, и оно выполняется: номиналы монет — это множители
ОБЩЕЙ ставки (×1…×500 из COIN_VALUES), они не зависят от её размера. Тем
и отличаются от цепей базовой игры, где число обязано считаться на лету.

Значение монеты меняет только качок, и на этот случай движок рисует не число,
а отдельный значок прибавки — см. CoinField. Лицо чистить больше незачем.

## Пустые монеты ступеней

Остаются как запас: если номинал в мат-модели появится, а картинки для него
не будет, игра возьмёт пустую монету нужного металла и напишет число сама,
вместо того чтобы упасть. Чистятся заливкой цвета, снятого с пояска под
кольцом, — на запасном варианте фактура лица не так важна.

## Алмаз

Пустой алмаз делается из пустого серебра сдвигом в синеву: серебро
нейтрально-серое, и покраска на нём работает честно (золото бы позеленело).
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC_VALUES = ROOT / "вторая бонуска - oil rush" / "монеты - 1.png"
SRC_SPECIAL = ROOT / "вторая бонуска - oil rush" / "монеты 2.png"
OUT = ROOT / "src" / "assets" / "ui"

# ── Лист номиналов ───────────────────────────────────────────────
# Сетка 4×4, последняя строка неполная. Центры и радиус сняты по профилю
# яркости: фон панели тёмный (сумма каналов ~20), монета начинается там,
# где профиль уходит выше 48.
VALUE_COLS = (206, 336, 467, 598)
VALUE_ROWS = (102, 206, 310, 408)
# Ряды листа = ступени монет, порядок тот же, что в COIN_VALUES.
VALUE_GRID = (
    (1, 2, 3, 4),
    (5, 10, 15, 20),
    (25, 50, 100, 150),
    (200, 300, 500),
)
# Монета на листе — 97 пикселей в поперечнике. Вырез чуть шире, чтобы
# не срезать внешнюю кромку и её свечение.
R_VALUE = 50

# С какой монеты снимается пустое лицо ступени: берётся самая узкая цифра,
# у неё под кольцом больше всего чистого пояска.
BLANK_FROM = {"bronze": 1, "silver": 5, "gold": 25}

# ── Лист особых монет ────────────────────────────────────────────
# Нарисованы крупнее номинальных, поэтому у каждой свой радиус: в игре все
# монеты приводятся к одному размеру, и важно, чтобы монета занимала в вырезе
# одинаковую долю — иначе кулак окажется мельче бронзы.
SPECIALS = {
    "coin-fist.png": ((102, 145), 77),
    "coin-pump.png": ((297, 147), 78),
    "coin-mult.png": ((478, 150), 75),
}

# Доля радиуса, за которой начинается кольцо с заклёпками. Внутри — лицо,
# и его можно чистить; кольцо трогать нельзя, на нём вся фактура монеты.
FACE = 0.70


def cut(im: Image.Image, center: tuple[int, int], radius: int) -> Image.Image:
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
    for src in (SRC_VALUES, SRC_SPECIAL):
        if not src.exists():
            print(f"  Не найден макет: {src}")
            return 1

    values_im = Image.open(SRC_VALUES).convert("RGB")
    special_im = Image.open(SRC_SPECIAL).convert("RGB")

    coins: dict[str, Image.Image] = {}

    # Номиналы: строка листа — ступень, столбец — место в ступени.
    by_value: dict[int, Image.Image] = {}
    for row, values in zip(VALUE_ROWS, VALUE_GRID):
        for col, value in zip(VALUE_COLS, values):
            coin = cut(values_im, (col, row), R_VALUE)
            by_value[value] = coin
            coins[f"coin-v{value}.png"] = coin

    # Пустые ступени — запас на случай номинала без своей картинки.
    for tier, value in BLANK_FROM.items():
        coins[f"coin-{tier}.png"] = blank_face(by_value[value])
    coins["coin-diamond.png"] = to_diamond(coins["coin-silver.png"])

    for name, (center, radius) in SPECIALS.items():
        # Особые идут как есть: у них не номинал, а рисунок.
        coins[name] = cut(special_im, center, radius)

    OUT.mkdir(parents=True, exist_ok=True)
    for name, image in sorted(coins.items()):
        image.save(OUT / name)
    print(f"  Готово: {len(coins)} монет в {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
