#!/usr/bin/env python3
"""Build the public TokenPet story GIF from real Electron renderer captures."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


CAPTIONS = [
    "Launch · local-first companion",
    "Wake up · approved actor",
    "Token frame updates · 61.5M",
    "Click · click_purr",
    "Drag · drag_dangle",
    "Drop · drop_bounce",
    "Milestone · milestone_celebrate",
]

DURATIONS_MS = [900, 1_050, 1_150, 1_000, 1_000, 1_000, 1_450]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def font(size: int) -> ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def prepare_frame(source: Path, caption: str, width: int = 420) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    height = round(image.height * width / image.width)
    image = image.resize((width, height), Image.Resampling.LANCZOS)
    backdrop = Image.new("RGBA", image.size, (255, 253, 247, 255))
    backdrop.alpha_composite(image)

    overlay = Image.new("RGBA", backdrop.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    caption_font = font(17)
    bounds = draw.textbbox((0, 0), caption, font=caption_font)
    text_width = bounds[2] - bounds[0]
    pill_height = 42
    pill_width = min(width - 28, text_width + 32)
    x = (width - pill_width) // 2
    y = height - pill_height - 14
    draw.rounded_rectangle((x, y, x + pill_width, y + pill_height), radius=21, fill=(24, 43, 68, 232))
    draw.text((width // 2, y + pill_height // 2), caption, font=caption_font, fill=(255, 255, 255, 255), anchor="mm")
    return Image.alpha_composite(backdrop, overlay).convert("RGB")


def main() -> None:
    args = parse_args()
    sources = sorted(args.frames.glob("*.png"))
    if len(sources) != len(CAPTIONS):
        raise SystemExit(f"Expected {len(CAPTIONS)} demo frames, found {len(sources)} in {args.frames}")

    frames = [prepare_frame(source, caption) for source, caption in zip(sources, CAPTIONS, strict=True)]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        args.output,
        save_all=True,
        append_images=frames[1:],
        duration=DURATIONS_MS,
        loop=0,
        disposal=2,
        optimize=True,
    )


if __name__ == "__main__":
    main()
