#!/usr/bin/env python3
"""Split the approved TokenPet story contact sheet into normalized actor frames."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "assets/source/pet-actors/golden-british/story-actions/story-sprite-sheet.png"
QUICK_SHEET = ROOT / "assets/source/pet-actors/golden-british/story-actions/quick-play-sprite-sheet.png"
OUT = ROOT / "assets/source/pet-actors/golden-british/frames"
IDS = (
    "idle_breathe", "blink", "sleep_loop", "focus_loop",
    "hot_loop", "overdrive_loop", "click_purr", "drag_dangle",
    "drop_bounce", "token_snack", "play_cursor", "milestone_celebrate",
)
QUICK_IDS = (
    "click_purr", "token_snack", "play_cursor",
    "drag_dangle", "toss_yarn", "nap_here",
    "wake_up", "summon_to_screen", "capture_moment",
)
QUICK_ONLY_IDS = {"toss_yarn", "nap_here", "wake_up", "summon_to_screen", "capture_moment"}


def token_frame() -> Image.Image:
    layer = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((300, 710, 724, 860), radius=75, fill=(62, 45, 18, 48))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    layer.alpha_composite(shadow)
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle((300, 682, 724, 832), radius=75, fill=(255, 248, 221, 255), outline=(239, 219, 165, 255), width=5)
    draw.rounded_rectangle((348, 714, 676, 808), radius=47, fill=(255, 253, 240, 246), outline=(242, 226, 186, 255), width=3)
    return layer


def prepare_sheet(sheet_path: Path, ids: tuple[str, ...], columns: int, selected: set[str] | None = None) -> int:
    sheet = Image.open(sheet_path).convert("RGBA")
    cell_width = sheet.width // columns
    rows = (len(ids) + columns - 1) // columns
    cell_height = sheet.height // rows
    frame_layer = token_frame()
    written = 0
    for index, action_id in enumerate(ids):
        if selected is not None and action_id not in selected:
            continue
        column, row = index % columns, index // columns
        cell = sheet.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
        bounds = cell.getbbox()
        if not bounds:
            raise RuntimeError(f"empty story frame: {action_id}")
        subject = cell.crop(bounds)
        subject.thumbnail((780, 710), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
        canvas.alpha_composite(frame_layer)
        x = (1024 - subject.width) // 2
        y = max(14, 704 - subject.height)
        canvas.alpha_composite(subject, (x, y))
        canvas.save(OUT / f"{action_id}.png", optimize=True)
        written += 1
    return written


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    written = prepare_sheet(SHEET, IDS, 4)
    written += prepare_sheet(QUICK_SHEET, QUICK_IDS, 3, QUICK_ONLY_IDS)

    print(f"Prepared {written} approved story frames in {OUT}")


if __name__ == "__main__":
    main()
