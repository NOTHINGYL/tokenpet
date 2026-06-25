from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "apps/desktop/public/assets/pets/cat-desktop.png"
OUTPUT = ROOT / "apps/desktop/public/assets/pets/actions/gold-cat"


def save_frame(image: Image.Image, path: Path) -> None:
    image.save(path, optimize=True)


def paste_centered(canvas: Image.Image, image: Image.Image, scale: float, dy: int = 0) -> Image.Image:
    width, height = image.size
    scaled = image.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
    x = round((width - scaled.width) / 2)
    y = round(height - scaled.height + dy)
    canvas.alpha_composite(scaled, (x, y))
    return canvas


def make_idle(source: Image.Image) -> None:
    frames = [(1.0, 0), (1.006, -2), (1.012, -4), (1.006, -2)]
    for index, (scale, dy) in enumerate(frames, start=1):
        canvas = Image.new("RGBA", source.size, (0, 0, 0, 0))
        paste_centered(canvas, source, scale, dy)
        save_frame(canvas, OUTPUT / f"idle-{index:02d}.png")


def paste_eye_lid(frame: Image.Image, source: Image.Image, box: tuple[int, int, int, int], closed: bool) -> None:
    x1, y1, x2, y2 = box
    width = x2 - x1
    height = y2 - y1
    patch_top = max(0, y1 - height - 10)
    patch = source.crop((x1, patch_top, x2, patch_top + height)).resize((width, height), Image.Resampling.BICUBIC)
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    inset_y = 9 if closed else 2
    draw.ellipse((0, inset_y, width, height + 10), fill=235 if closed else 158)
    mask = mask.filter(ImageFilter.GaussianBlur(1.15))
    frame.paste(patch, (x1, y1), mask)

    draw = ImageDraw.Draw(frame, "RGBA")
    if closed:
        draw.arc((x1 + 8, y1 + 29, x2 - 6, y2 - 10), 8, 172, fill=(103, 61, 13, 190), width=5)
    else:
        draw.arc((x1 + 8, y1 + 14, x2 - 6, y2 + 4), 8, 172, fill=(103, 61, 13, 96), width=3)


def make_blink_look(source: Image.Image) -> None:
    frames: list[Image.Image] = []
    frames.append(source.copy())

    look = Image.new("RGBA", source.size, (0, 0, 0, 0))
    paste_centered(look, source, 1.002, -2)
    frames.append(look)

    half = source.copy()
    lid = Image.new("RGBA", source.size, (0, 0, 0, 0))
    lid_draw = ImageDraw.Draw(lid, "RGBA")
    lid_draw.rounded_rectangle((123, 215, 192, 241), radius=13, fill=(246, 181, 66, 82))
    lid_draw.rounded_rectangle((262, 214, 331, 240), radius=13, fill=(246, 181, 66, 82))
    half.alpha_composite(lid.filter(ImageFilter.GaussianBlur(0.55)))
    frames.append(half)

    right = Image.new("RGBA", source.size, (0, 0, 0, 0))
    paste_centered(right, source, 1.001, -1)
    frames.append(right)

    frames.append(source.copy())

    for index, frame in enumerate(frames, start=1):
        save_frame(frame, OUTPUT / f"blink-look-{index:02d}.png")


def paw_mask_from_crop(crop: Image.Image) -> Image.Image:
    alpha = crop.getchannel("A")
    mask = Image.new("L", crop.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((18, 18, crop.width - 10, crop.height - 6), fill=255)
    return Image.composite(alpha, Image.new("L", crop.size, 0), mask).filter(ImageFilter.GaussianBlur(0.5))


def make_wave(source: Image.Image) -> None:
    paw_crop_box = (246, 334, 346, 447)
    paw = source.crop(paw_crop_box)
    paw.putalpha(paw_mask_from_crop(paw))
    frames = [
        (0, 0, 0, 1.0),
        (-12, -24, -12, 1.02),
        (-24, -55, -28, 1.05),
        (-20, -74, -42, 1.05),
        (-2, -68, -24, 1.05),
        (-26, -58, -36, 1.05),
        (-12, -28, -14, 1.03),
        (0, 0, 0, 1.0),
    ]

    for index, (dx, dy, angle, scale) in enumerate(frames, start=1):
        frame = source.copy()
        if index not in (1, len(frames)):
            cover = Image.new("RGBA", source.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(cover, "RGBA")
            draw.ellipse((252, 363, 340, 442), fill=(239, 166, 51, 116))
            cover = cover.filter(ImageFilter.GaussianBlur(3.0))
            frame.alpha_composite(cover)

        moving = paw.resize((round(paw.width * scale), round(paw.height * scale)), Image.Resampling.LANCZOS)
        moving = moving.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        x = paw_crop_box[0] + dx
        y = paw_crop_box[1] + dy
        frame.alpha_composite(moving, (x, y))
        save_frame(frame, OUTPUT / f"wave-{index:02d}.png")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    make_idle(source)
    make_blink_look(source)
    make_wave(source)


if __name__ == "__main__":
    main()
