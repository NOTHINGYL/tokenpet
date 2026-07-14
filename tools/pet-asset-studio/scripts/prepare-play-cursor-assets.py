#!/usr/bin/env python3
"""Prepare the authored Play Cursor sheets into deterministic runtime PNGs.

The desktop renderer may select these registered whole-cat poses. It never
warps a flat cat image or paints replacement eyes, head geometry, or ears.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = REPO_ROOT / "assets/source/pet-actors/golden-british"
SHEET_ROOT = SOURCE_ROOT / "story-actions/play-cursor-v2"
FRAME_ROOT = SOURCE_ROOT / "frames"

ARTBOARD_SIZE = 1024
GROUND_LINE_Y = 818
MAX_SUBJECT_WIDTH = 760
MAX_SUBJECT_HEIGHT = 620

ATTENTION_NAMES = (
    "play_cursor_neutral",
    "play_cursor_notice",
    "play_cursor_eye_left",
    "play_cursor_eye_right",
    "play_cursor_eye_up",
    "play_cursor_eye_down",
    "play_cursor_blink",
    "play_cursor_settle",
)
FOLLOW_NAMES = (
    "play_cursor_head_left",
    "play_cursor_head_right",
    "play_cursor_head_up",
    "play_cursor_head_down",
    "play_cursor_ear_left",
    "play_cursor_ear_right",
    "play_cursor_ear_up",
    "play_cursor_ear_down",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def crop_cells(sheet: Image.Image) -> list[Image.Image]:
    cells: list[Image.Image] = []
    for row in range(2):
        for column in range(4):
            left = round(sheet.width * column / 4)
            right = round(sheet.width * (column + 1) / 4)
            top = round(sheet.height * row / 2)
            bottom = round(sheet.height * (row + 1) / 2)
            cells.append(sheet.crop((left, top, right, bottom)))
    return cells


def load_cells() -> tuple[list[Image.Image], list[Image.Image]]:
    with Image.open(SHEET_ROOT / "attention-sheet.png") as source:
        attention = crop_cells(source.convert("RGBA"))
    with Image.open(SHEET_ROOT / "follow-sheet.png") as source:
        follow = crop_cells(source.convert("RGBA"))
    return attention, follow


def shared_source_crop(cells: list[Image.Image]) -> tuple[int, int, int, int]:
    bounds = [cell.getchannel("A").getbbox() for cell in cells]
    if any(bound is None for bound in bounds):
        raise ValueError("Play Cursor source sheet contains an empty cell")
    visible = [bound for bound in bounds if bound is not None]
    left = max(0, min(bound[0] for bound in visible) - 8)
    top = max(0, min(bound[1] for bound in visible) - 8)
    right = min(cells[0].width, max(bound[2] for bound in visible) + 8)
    bottom = min(cells[0].height, max(bound[3] for bound in visible) + 8)
    return left, top, right, bottom


def normalize_cell(cell: Image.Image, crop: tuple[int, int, int, int]) -> Image.Image:
    registered = cell.crop(crop)
    scale = min(MAX_SUBJECT_WIDTH / registered.width, MAX_SUBJECT_HEIGHT / registered.height)
    size = (max(1, round(registered.width * scale)), max(1, round(registered.height * scale)))
    registered = registered.resize(size, Image.Resampling.LANCZOS)
    visible = registered.getchannel("A").getbbox()
    if visible is None:
        raise ValueError("Play Cursor source cell became empty after normalization")
    canvas = Image.new("RGBA", (ARTBOARD_SIZE, ARTBOARD_SIZE), (0, 0, 0, 0))
    # Generated sheet cells can contain harmless composition drift even when the
    # cat pose is authored in place. Register every whole-cat frame to the same
    # visible center and paw ground line before runtime; the renderer then only
    # swaps approved rasters and never compensates with live image transforms.
    x = round(ARTBOARD_SIZE / 2 - (visible[0] + visible[2]) / 2)
    y = GROUND_LINE_Y - visible[3]
    canvas.alpha_composite(registered, (x, y))
    return canvas


def write_frames(cells: list[Image.Image], names: tuple[str, ...], crop: tuple[int, int, int, int]) -> list[Path]:
    outputs: list[Path] = []
    for cell, name in zip(cells, names, strict=True):
        output = FRAME_ROOT / f"{name}.png"
        normalize_cell(cell, crop).save(output, "PNG", optimize=True)
        outputs.append(output)
    return outputs


def checkerboard(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size, "#f8fafc")
    draw = ImageDraw.Draw(image)
    tile = 32
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill="#e2e8f0")
    return image


def write_contact_sheet(paths: list[Path]) -> Path:
    cell_size = 280
    margin = 28
    output = SHEET_ROOT / "play-cursor-contact-sheet.png"
    contact = checkerboard((margin * 2 + cell_size * 4, margin * 2 + cell_size * 4)).convert("RGBA")
    draw = ImageDraw.Draw(contact)
    for index, path in enumerate(paths):
        with Image.open(path) as frame:
            preview = frame.convert("RGBA").resize((cell_size, cell_size), Image.Resampling.LANCZOS)
        x = margin + index % 4 * cell_size
        y = margin + index // 4 * cell_size
        contact.alpha_composite(preview, (x, y))
        draw.rectangle((x + 5, y + cell_size - 30, x + cell_size - 5, y + cell_size - 5), fill=(248, 250, 252, 225))
        draw.text((x + 10, y + cell_size - 27), path.stem.replace("play_cursor_", ""), fill="#0f172a")
    contact.convert("RGB").save(output, "PNG", optimize=True)
    return output


def write_preview(frame_by_name: dict[str, Path]) -> Path:
    names: list[str] = ["play_cursor_notice"]
    for direction in ("left", "right", "up", "down"):
        names.extend((
            f"play_cursor_eye_{direction}",
            f"play_cursor_head_{direction}",
            f"play_cursor_ear_{direction}",
            f"play_cursor_head_{direction}",
        ))
    names.extend(("play_cursor_blink", "play_cursor_settle"))
    background = checkerboard((512, 512)).convert("RGBA")
    rendered: list[Image.Image] = []
    for name in names:
        with Image.open(frame_by_name[name]) as frame:
            actor = frame.convert("RGBA").resize((512, 512), Image.Resampling.LANCZOS)
        composed = background.copy()
        composed.alpha_composite(actor)
        rendered.append(composed.convert("P", palette=Image.Palette.ADAPTIVE))
    output = SHEET_ROOT / "play-cursor-direction-preview.gif"
    rendered[0].save(output, save_all=True, append_images=rendered[1:], duration=180, loop=0, disposal=2)
    return output


def alpha_report(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        bounds = rgba.getchannel("A").getbbox()
        corners = [
            rgba.getpixel((0, 0))[3],
            rgba.getpixel((rgba.width - 1, 0))[3],
            rgba.getpixel((0, rgba.height - 1))[3],
            rgba.getpixel((rgba.width - 1, rgba.height - 1))[3],
        ]
    return {
        "path": path.relative_to(REPO_ROOT).as_posix(),
        "sha256": sha256(path),
        "alphaBounds": list(bounds) if bounds else None,
        "cornerAlpha": corners,
    }


def main() -> None:
    FRAME_ROOT.mkdir(parents=True, exist_ok=True)
    attention, follow = load_cells()
    crop = shared_source_crop([*attention, *follow])
    attention_outputs = write_frames(attention, ATTENTION_NAMES, crop)
    follow_outputs = write_frames(follow, FOLLOW_NAMES, crop)
    outputs = [*attention_outputs, *follow_outputs]
    by_name = {path.stem: path for path in outputs}
    contact = write_contact_sheet(outputs)
    preview = write_preview(by_name)
    report = {
        "schemaVersion": "tokenpet-play-cursor-assets/v2",
        "generationMode": "offline-authored-whole-frame-directional-poses",
        "sourceSheets": [
            alpha_report(SHEET_ROOT / "attention-sheet.png"),
            alpha_report(SHEET_ROOT / "follow-sheet.png"),
        ],
        "frameRoles": {
            "attention": list(ATTENTION_NAMES),
            "follow": list(FOLLOW_NAMES),
        },
        "sharedSourceCrop": list(crop),
        "registration": {
            "visibleCenterX": ARTBOARD_SIZE // 2,
            "visibleGroundLineY": GROUND_LINE_Y,
            "runtimeBodyTransform": "forbidden",
        },
        "groundLineY": GROUND_LINE_Y,
        "outputs": [alpha_report(path) for path in [*outputs, contact, preview]],
    }
    (SHEET_ROOT / "asset-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(outputs)} Play Cursor frames with shared crop {crop}")


if __name__ == "__main__":
    main()
