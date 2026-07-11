from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/pet-story/preview-assets/gpt-v18-quick-play-compact-controller-panel.png"
OUTPUT = ROOT / "apps/desktop/public/quick-play-v18"

# Pixel boxes are measured from the normative 1086x1448 v18 design. They crop
# only the approved icon/illustration pixels, never the neighboring UI labels.
CROPS = {
    "header-paw": (226, 145, 298, 216),
    "walk-round-trip": (232, 292, 354, 397),
    "token-snack": (442, 292, 578, 399),
    "play-cursor": (654, 286, 841, 399),
    "drag-dangle": (230, 500, 355, 611),
    "toss-yarn": (438, 498, 586, 613),
    "nap-here": (658, 507, 833, 619),
    "wake-up": (233, 724, 393, 839),
    "summon-to-pointer": (438, 705, 582, 847),
    "capture-moment": (663, 722, 833, 839),
    "control-pin": (226, 996, 291, 1059),
    "control-lock": (226, 1060, 292, 1125),
    "control-mute": (217, 1132, 298, 1206),
}


def remove_card_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, _ = pixels[x, y]
            minimum = min(red, green, blue)
            maximum = max(red, green, blue)
            if minimum >= 246 and maximum - minimum <= 9:
                alpha = 0
            elif minimum >= 232 and maximum - minimum <= 12:
                alpha = round(255 * (246 - minimum) / 14)
            else:
                alpha = 255
            pixels[x, y] = (red, green, blue, alpha)
    return rgba


def trim_transparency(image: Image.Image, padding: int = 4) -> Image.Image:
    bounds = image.getbbox()
    if not bounds:
        return image
    left, top, right, bottom = bounds
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    return image.crop((left, top, right, bottom))


def main() -> None:
    source = Image.open(SOURCE)
    if source.size != (1086, 1448):
        raise RuntimeError(f"unexpected v18 reference size: {source.size}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, box in CROPS.items():
        icon = trim_transparency(remove_card_background(source.crop(box)))
        icon.save(OUTPUT / f"{name}.png")
    print(f"extracted {len(CROPS)} normative Quick Play assets into {OUTPUT}")


if __name__ == "__main__":
    main()
