"""
Собирает иконку приложения из символа DUKE.

    python tools/make_icon.py

ICO хранит несколько размеров сразу: Windows берёт из него то 16×16 для панели
задач, то 256×256 для крупной плитки. Масштабируем NEAREST — это пиксель-арт,
любое сглаживание превратит его в кашу как раз на мелких размерах.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "assets" / "symbols" / "duke.png"
OUT = ROOT / "build" / "icon.ico"

SIZES = [16, 24, 32, 48, 64, 128, 256]


def main():
    src = Image.open(SRC).convert("RGBA")

    # Подложка: на тёмной панели задач прозрачный силуэт теряется.
    side = max(src.size)
    canvas = Image.new("RGBA", (side, side), (26, 14, 36, 255))
    canvas.paste(src, ((side - src.width) // 2, (side - src.height) // 2), src)

    big = canvas.resize((256, 256), Image.NEAREST)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    big.save(OUT, sizes=[(s, s) for s in SIZES])
    print(f"  {OUT}  размеры: {', '.join(str(s) for s in SIZES)}")


if __name__ == "__main__":
    main()
