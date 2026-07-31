"""
Накладывает координатную сетку на изображение — чтобы снимать позиции
элементов макета числами, а не прикидывать на глаз.

    python tools/grid_overlay.py фон.png [шаг]
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent


def main(src: Path, step: int):
    im = Image.open(src).convert("RGB")
    d = ImageDraw.Draw(im)
    w, h = im.size

    for x in range(0, w, step):
        major = x % (step * 2) == 0
        d.line([(x, 0), (x, h)], fill=(255, 0, 128) if major else (0, 200, 255), width=1)
        if major:
            d.text((x + 3, 3), str(x), fill=(255, 255, 0))

    for y in range(0, h, step):
        major = y % (step * 2) == 0
        d.line([(0, y), (w, y)], fill=(255, 0, 128) if major else (0, 200, 255), width=1)
        if major:
            d.text((3, y + 3), str(y), fill=(255, 255, 0))

    out = ROOT / "art" / f"grid-{src.stem}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    print(f"  {w}×{h}, шаг {step} → {out}")


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "фон.png"
    step = int(sys.argv[2]) if len(sys.argv) > 2 else 50
    main(src if src.is_absolute() else ROOT / src, step)
