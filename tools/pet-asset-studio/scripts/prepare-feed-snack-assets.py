#!/usr/bin/env python3
"""Prepare approved Feed Snack source sheets into deterministic runtime PNGs.

This is an offline authoring step. Runtime code consumes only the generated
manifest frames and never crops, warps, or invents cat anatomy.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = REPO_ROOT / "assets/source/pet-actors/golden-british"
SHEET_ROOT = SOURCE_ROOT / "story-actions/feed-snack-v2"
FRAME_ROOT = SOURCE_ROOT / "frames"
PUBLIC_PROP_ROOT = REPO_ROOT / "apps/desktop/public/pet-actors/golden-british/props"

ARTBOARD_SIZE = 1024
GROUND_LINE_Y = 802
CAT_SCALE = 1.65
CONTACT_ORDER = (0, 4, 1, 5, 2, 6, 3, 7)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def crop_cells(sheet: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    cells: list[Image.Image] = []
    for row in range(rows):
        for column in range(columns):
            left = round(sheet.width * column / columns)
            right = round(sheet.width * (column + 1) / columns)
            top = round(sheet.height * row / rows)
            bottom = round(sheet.height * (row + 1) / rows)
            cells.append(sheet.crop((left, top, right, bottom)))
    return cells


def normalize_cat(cell: Image.Image) -> Image.Image:
    alpha = cell.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("Feed Snack source cell has no visible cat pixels")
    subject = cell.crop(bounds)
    width = max(1, round(subject.width * CAT_SCALE))
    height = max(1, round(subject.height * CAT_SCALE))
    if width > 880 or height > 700:
        fit = min(880 / width, 700 / height)
        width = max(1, round(width * fit))
        height = max(1, round(height * fit))
    subject = subject.resize((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (ARTBOARD_SIZE, ARTBOARD_SIZE), (0, 0, 0, 0))
    x = round((ARTBOARD_SIZE - width) / 2)
    y = GROUND_LINE_Y - height
    canvas.alpha_composite(subject, (x, y))
    return canvas


def write_cat_sequence(sheet_name: str, output_prefix: str, order: tuple[int, ...]) -> list[Path]:
    with Image.open(SHEET_ROOT / sheet_name) as source:
        cells = crop_cells(source.convert("RGBA"), 4, 2)
    outputs: list[Path] = []
    for output_index, cell_index in enumerate(order, start=1):
        output = FRAME_ROOT / f"{output_prefix}_{output_index:02d}.png"
        normalize_cat(cells[cell_index]).save(output, "PNG", optimize=True)
        outputs.append(output)
    return outputs


def normalize_prop(cell: Image.Image) -> Image.Image:
    bounds = cell.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Feed Snack prop cell has no visible pixels")
    subject = cell.crop(bounds)
    scale = min(430 / subject.width, 430 / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    canvas.alpha_composite(subject, (round((512 - size[0]) / 2), round((512 - size[1]) / 2)))
    return canvas


def write_props() -> list[Path]:
    with Image.open(SHEET_ROOT / "snacks-sheet.png") as source:
        cells = crop_cells(source.convert("RGBA"), 3, 1)
    PUBLIC_PROP_ROOT.mkdir(parents=True, exist_ok=True)
    outputs: list[Path] = []
    for name, cell in zip(("paw", "fish", "token"), cells, strict=True):
        output = PUBLIC_PROP_ROOT / f"snack-{name}.png"
        normalize_prop(cell).save(output, "PNG", optimize=True)
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


def write_contact_sheet(sequences: list[tuple[str, list[Path]]], props: list[Path]) -> Path:
    cell = 280
    margin = 28
    width = margin * 2 + cell * 4
    height = margin * 2 + cell * 7
    contact = checkerboard((width, height)).convert("RGBA")
    draw = ImageDraw.Draw(contact)
    row = 0
    for label, paths in sequences:
        draw.text((margin, margin + row * cell + 8), label, fill="#0f172a")
        for index, path in enumerate(paths):
            with Image.open(path) as frame:
                preview = frame.convert("RGBA").resize((cell, cell), Image.Resampling.LANCZOS)
            x = margin + (index % 4) * cell
            y = margin + row * cell
            contact.alpha_composite(preview, (x, y))
            draw.text((x + 10, y + cell - 26), str(index + 1), fill="#0f172a")
            if index % 4 == 3:
                row += 1
        if len(paths) % 4:
            row += 1
    prop_y = margin + row * cell
    draw.text((margin, prop_y + 8), "snack props", fill="#0f172a")
    for index, path in enumerate(props):
        with Image.open(path) as frame:
            preview = frame.convert("RGBA").resize((cell, cell), Image.Resampling.LANCZOS)
        contact.alpha_composite(preview, (margin + index * cell, prop_y))
    output = SHEET_ROOT / "feed-snack-contact-sheet.png"
    contact.convert("RGB").save(output, "PNG", optimize=True)
    return output


def write_preview(name: str, frames: list[Path], duration_ms: int) -> Path:
    rendered: list[Image.Image] = []
    background = checkerboard((512, 512)).convert("RGBA")
    for path in frames:
        with Image.open(path) as frame:
            actor = frame.convert("RGBA").resize((512, 512), Image.Resampling.LANCZOS)
        composed = background.copy()
        composed.alpha_composite(actor)
        rendered.append(composed.convert("P", palette=Image.Palette.ADAPTIVE))
    output = SHEET_ROOT / name
    rendered[0].save(output, save_all=True, append_images=rendered[1:], duration=duration_ms, loop=0, disposal=2)
    return output


def alpha_report(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        bounds = rgba.getchannel("A").getbbox()
        corner_alpha = [
            rgba.getpixel((0, 0))[3],
            rgba.getpixel((rgba.width - 1, 0))[3],
            rgba.getpixel((0, rgba.height - 1))[3],
            rgba.getpixel((rgba.width - 1, rgba.height - 1))[3],
        ]
    return {
        "path": path.relative_to(REPO_ROOT).as_posix(),
        "sha256": sha256(path),
        "alphaBounds": list(bounds) if bounds else None,
        "cornerAlpha": corner_alpha,
    }


def main() -> None:
    FRAME_ROOT.mkdir(parents=True, exist_ok=True)
    walk = write_cat_sequence("walk-slow-sheet.png", "feed_snack_walk_slow", CONTACT_ORDER)
    returning = write_cat_sequence("return-run-sheet.png", "feed_snack_return_run", CONTACT_ORDER)
    interaction = write_cat_sequence("interaction-sheet.png", "feed_snack_interaction", tuple(range(8)))
    props = write_props()
    contact = write_contact_sheet([
        ("feed walk slow", walk),
        ("feed return run", returning),
        ("feed interaction", interaction),
    ], props)
    walk_preview = write_preview("feed-walk-slow-preview.gif", walk, 134)
    return_preview = write_preview("feed-return-run-preview.gif", returning, 88)
    report_paths = [*walk, *returning, *interaction, *props, contact, walk_preview, return_preview]
    report = {
        "schemaVersion": "tokenpet-feed-snack-assets/v2",
        "sourceSheets": [
            alpha_report(SHEET_ROOT / "walk-slow-sheet.png"),
            alpha_report(SHEET_ROOT / "return-run-sheet.png"),
            alpha_report(SHEET_ROOT / "interaction-sheet.png"),
            alpha_report(SHEET_ROOT / "snacks-sheet.png"),
        ],
        "frameOrder": list(CONTACT_ORDER),
        "groundLineY": GROUND_LINE_Y,
        "catScale": CAT_SCALE,
        "outputs": [alpha_report(path) for path in report_paths],
    }
    (SHEET_ROOT / "asset-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(walk) + len(returning) + len(interaction)} Feed cat frames and {len(props)} snack props")


if __name__ == "__main__":
    main()
