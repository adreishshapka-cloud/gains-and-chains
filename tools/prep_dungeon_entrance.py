"""
Готовит сцену входа в подземелье из папки «новые ассеты вход в бонусную комнату».

    python tools/prep_dungeon_entrance.py

На вход идут два файла. «enter the dungeon.png» — сама комната: четверо
у стены, факелы, дверь с надписью. «enter the dungeon 2.png» — раскадровка
открывания на шестнадцать кадров, но комната там ДРУГАЯ: без персонажей,
дверь на другом месте и в другом ракурсе. Поэтому вторая картинка не режется
на кадры, а служит образцом движения: по ней видно, как створка уходит,
как темнеет её лицо и что остаётся в проёме.

На выходе:

    dungeon-entrance.png   комната с тёмным проёмом (створки нет)
    dungeon-door.png       лист 4x4: шестнадцать кадров створки с альфой

Створка на всех кадрах умещается в один и тот же прямоугольник — тот, который
она занимает закрытой. Поэтому движку не нужно ни считать координаты, ни
двигать спрайт: он кладёт лист в неизменный прямоугольник и меняет кадр.

## Куда открывается дверь

Внутрь, петлями справа. Обе стороны выбраны не на глаз:

* Ручка нарисована СЛЕВА (x около 745, на высоте пояса) — значит петли
  справа, иначе дверь не открылась бы вовсе.
* Наружу, как в раскадровке, открывать нельзя: там пустая комната, а здесь
  вплотную к косякам стоят двое, и распахнутая створка проехала бы прямо
  по ним. Пришлось бы вырезать фигуры в отдельный слой переднего плана
  и вести створку под ними — то есть выковыривать из общего рисунка две
  фигуры на тёмной стене ради того, чтобы дверь заслонила одну из них.
  Открытая внутрь створка остаётся в габаритах проёма и не задевает никого.

Читается это ровно так же: проём чернеет, створка уходит в темноту.

## Как считается кадр

Створка вращается вокруг вертикальной оси у правого края. Точка на
расстоянии u от оси уходит вглубь на u·sin θ и приближается к оси по
горизонтали до u·cos θ; дальше обычная перспектива с центром в середине
кадра. Отсюда четырёхугольник, в который вписывается лицо створки,
а сама картинка створки натягивается на него проективным преобразованием.

Расстояние до камеры (FOCAL) взято около ширины кадра — при таком фокусе
дальний край створки на распахнутых кадрах теряет около десятой доли
высоты. Это заметно ровно настолько, чтобы дверь не выглядела плоской
картонкой, и не настолько, чтобы спорить с нарисованной перспективой
комнаты: она сама нарисована почти фронтально.

Лицо створки при этом гаснет: она отворачивается от факелов и уходит
в тёмный проём. Гаснет неравномерно — дальний край темнее ближнего,
иначе уходящая в темноту доска остаётся одинаково освещённой по всей
ширине и выдаёт подделку.
"""

import sys
from math import cos, radians, sin
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "новые ассеты вход в бонусную комнату" / "enter the dungeon.png"
OUT = ROOT / "src" / "assets" / "ui"

STAGE_W, STAGE_H = 1609, 918

# Створка на исходнике: x 742..947, y 152..599.
#
# Границы сняты по профилям яркости, а не на глаз: слева на 742 столбец
# светлеет с 11 до 19 (кромка створки выходит из тени косяка), справа на 946
# уходит в 0 (щель у петель), сверху на 156 начинается освещённое дерево
# под притолокой, снизу на 599 кончается полотно и начинается камень порога.
#
# Сверху взято на четыре строки выше кромки: там тень от притолоки, она
# и так чёрная, и лишние строки в подвижном спрайте ничего не портят.
DOOR_L, DOOR_T, DOOR_R, DOOR_B = 742, 152, 947, 599

# Ось петель — правый край створки.
HINGE_X = DOOR_R

FRAMES = 16
OPEN_MAX = 74.0  # градусов на последнем кадре
# Дверь тяжёлая: трогается медленно и разгоняется. Показатель степени —
# ровно это, линейный ход дубовой створки читается как раздвижная дверь.
EASE = 1.35

FOCAL = 1700.0

# Насколько гаснет лицо створки: общий множитель на распахнутом кадре
# и добавка к разнице между ближним и дальним краем.
DARK_TOTAL = 0.62
DARK_EDGE = 0.34


def solve(matrix: list[list[float]], rhs: list[float]) -> list[float]:
    """Решает СЛАУ методом Гаусса с выбором главного элемента.

    Восемь уравнений на восемь коэффициентов проективного преобразования —
    единственная математика во всём наборе скриптов, ради которой иначе
    пришлось бы тащить numpy в требования. Он тут не нужен.
    """
    n = len(rhs)
    a = [row[:] + [rhs[i]] for i, row in enumerate(matrix)]

    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        a[col], a[pivot] = a[pivot], a[col]
        head = a[col][col]
        for j in range(col, n + 1):
            a[col][j] /= head
        for row in range(n):
            if row == col:
                continue
            factor = a[row][col]
            if factor == 0:
                continue
            for j in range(col, n + 1):
                a[row][j] -= factor * a[col][j]

    return [a[i][n] for i in range(n)]


def perspective_coeffs(
    dest: list[tuple[float, float]], src: list[tuple[float, float]]
) -> list[float]:
    """Коэффициенты для Image.transform(PERSPECTIVE).

    PIL идёт от точки НАЗНАЧЕНИЯ к точке источника, поэтому и система
    составляется в эту сторону: где брать пиксель для каждой точки кадра.
    """
    matrix = []
    rhs = []
    for (dx, dy), (sx, sy) in zip(dest, src):
        matrix.append([dx, dy, 1, 0, 0, 0, -dx * sx, -dy * sx])
        rhs.append(sx)
        matrix.append([0, 0, 0, dx, dy, 1, -dx * sy, -dy * sy])
        rhs.append(sy)
    return solve(matrix, rhs)


def doorway(width: int, height: int, floor: tuple[int, int, int]) -> Image.Image:
    """Темнота за дверью.

    Не заливка чёрным: ровный чёрный прямоугольник в тёплой комнате читается
    дырой в текстуре, а не глубиной. Поэтому сверху почти чёрное, книзу чуть
    теплее, и у самого порога — слабый отсвет на полу: свет факелов
    из комнаты достаёт за проём ровно на шаг.
    """
    im = Image.new("RGB", (width, height))
    px = im.load()

    for y in range(height):
        t = y / (height - 1)
        # Глубина: верх проёма уходит в потолок, туда свет не попадает вовсе.
        base = 4 + 7 * t * t
        for x in range(width):
            # Края проёма прижаты к косякам и темнее середины.
            edge = min(x, width - 1 - x) / (width * 0.35)
            k = base * min(1.0, 0.45 + 0.55 * edge)
            px[x, y] = (int(k * 1.15), int(k), int(k * 0.85))

    # Отсвет на полу у порога.
    glow_h = int(height * 0.16)
    for i in range(glow_h):
        y = height - 1 - i
        fade = (1 - i / glow_h) ** 1.7
        for x in range(width):
            across = 1 - abs(x - width / 2) / (width / 2)
            k = fade * max(0.0, across) ** 1.4
            r, g, b = px[x, y]
            px[x, y] = (
                min(255, int(r + floor[0] * k)),
                min(255, int(g + floor[1] * k)),
                min(255, int(b + floor[2] * k)),
            )

    return im


def door_frame(leaf: Image.Image, angle: float) -> Image.Image:
    """Створка, повёрнутая на angle градусов внутрь. Прозрачный фон."""
    w, h = leaf.size
    box_w, box_h = DOOR_R - DOOR_L, DOOR_B - DOOR_T

    if angle <= 0:
        face = leaf.convert("RGBA")
        out = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
        out.paste(face, (0, 0))
        return out

    theta = radians(angle)
    depth = w * sin(theta)
    near = HINGE_X - w * cos(theta)

    cx, cy = 1672 / 2, 941 / 2
    k = FOCAL / (FOCAL + depth)
    free_x = cx + (near - cx) * k
    free_top = cy + (DOOR_T - cy) * k
    free_bot = cy + (DOOR_B - cy) * k

    # Локальные координаты внутри прямоугольника закрытой створки.
    dest = [
        (free_x - DOOR_L, free_top - DOOR_T),   # дальний верхний угол
        (float(box_w), 0.0),                    # петли, верх
        (float(box_w), float(box_h)),           # петли, низ
        (free_x - DOOR_L, free_bot - DOOR_T),   # дальний нижний угол
    ]
    src = [(0.0, 0.0), (float(w), 0.0), (float(w), float(h)), (0.0, float(h))]

    shaded = shade(leaf, theta)
    coeffs = perspective_coeffs(dest, src)
    warped = shaded.transform(
        (box_w, box_h), Image.PERSPECTIVE, coeffs, Image.BICUBIC
    )

    # Всё, что вне четырёхугольника, преобразование тянет краевыми пикселями —
    # обрезаем по маске самой створки, иначе слева от неё останется размазанный
    # хвост доски вместо чёрного проёма.
    mask = Image.new("L", (w, h), 255)
    mask = mask.transform((box_w, box_h), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
    warped.putalpha(mask)
    return warped


def shade(leaf: Image.Image, theta: float) -> Image.Image:
    """Гасит лицо створки: она отворачивается от факелов и уходит в проём."""
    total = 1 - DARK_TOTAL * sin(theta)
    w, h = leaf.size
    out = leaf.convert("RGBA")
    px = out.load()
    for x in range(w):
        # 0 у дальнего края (он же свободный, слева), 1 у петель.
        along = x / (w - 1)
        k = total * (1 - DARK_EDGE * sin(theta) * (1 - along))
        for y in range(h):
            r, g, b, a = px[x, y]
            px[x, y] = (int(r * k), int(g * k), int(b * k), a)
    return out


def to_stage(box: tuple[int, int, int, int], scale: float, dx: int) -> tuple[int, ...]:
    x1, y1, x2, y2 = box
    return (
        round(x1 * scale) - dx,
        round(y1 * scale),
        round(x2 * scale) - dx,
        round(y2 * scale),
    )


def main() -> int:
    if not SRC.exists():
        print(f"  Не найден исходник: {SRC}")
        return 1

    room = Image.open(SRC).convert("RGB")
    leaf = room.crop((DOOR_L, DOOR_T, DOOR_R, DOOR_B))

    # Цвет отсвета берётся с самого пола перед порогом, а не назначается:
    # у комнаты свой оттенок факелов, и придуманный тёплый цвет в ней чужой.
    floor = room.crop((DOOR_L + 40, DOOR_B + 12, DOOR_R - 40, DOOR_B + 28))
    floor = floor.resize((1, 1), Image.LANCZOS).getpixel((0, 0))

    # Проём вычерняется НЕ во весь прямоугольник створки, а на три пикселя
    # у́же с каждой стороны. Иначе на закрытом кадре по контуру двери идёт
    # тёмный волосок: комната и створка уменьшаются до размера сцены порознь,
    # и на границе фильтр подмешивает в косяк не дерево, а темноту проёма.
    # Оставленная кромка заодно работает притвором — на распахнутых кадрах
    # вдоль чёрного проёма светится полоска дерева, как и должно быть.
    empty = room.copy()
    inset = 3
    empty.paste(
        doorway(DOOR_R - DOOR_L - 2 * inset, DOOR_B - DOOR_T - 2 * inset, floor),
        (DOOR_L + inset, DOOR_T + inset),
    )

    # Комната приводится к сцене: подгон по большей стороне и симметричный
    # срез по ширине. Пропорции макета (1.753) и картинки (1.777) расходятся
    # на пару процентов — режется по одиннадцать столбцов с каждого края.
    scale = max(STAGE_W / room.width, STAGE_H / room.height)
    full_w, full_h = round(room.width * scale), round(room.height * scale)
    dx, dy = (full_w - STAGE_W) // 2, (full_h - STAGE_H) // 2

    stage_room = empty.resize((full_w, full_h), Image.LANCZOS).crop(
        (dx, dy, dx + STAGE_W, dy + STAGE_H)
    )

    OUT.mkdir(parents=True, exist_ok=True)
    stage_room.save(OUT / "dungeon-entrance.png")

    box = to_stage((DOOR_L, DOOR_T, DOOR_R, DOOR_B), scale, dx)
    cell_w, cell_h = box[2] - box[0], box[3] - box[1]

    sheet = Image.new("RGBA", (cell_w * 4, cell_h * 4), (0, 0, 0, 0))
    for i in range(FRAMES):
        t = i / (FRAMES - 1)
        angle = OPEN_MAX * (t**EASE)
        frame = door_frame(leaf, angle).resize((cell_w, cell_h), Image.LANCZOS)
        sheet.paste(frame, (i % 4 * cell_w, i // 4 * cell_h))
    sheet.save(OUT / "dungeon-door.png")

    print(f"  dungeon-entrance.png  {stage_room.size[0]}x{stage_room.size[1]}")
    print(f"  dungeon-door.png      {sheet.size[0]}x{sheet.size[1]}  ({FRAMES} кадров)")
    print("\n  Для layout.ts:")
    print(f"    DOOR_AT = {{ x: {box[0]}, y: {box[1]}, w: {cell_w}, h: {cell_h} }}")
    print(f"    кадр листа: {cell_w}x{cell_h}, сетка 4x4")
    return 0


if __name__ == "__main__":
    sys.exit(main())
