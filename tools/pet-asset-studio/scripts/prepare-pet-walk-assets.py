#!/usr/bin/env python3
"""Prepare the Pet v5 eight-direction offline walk and destination-look pack.

Five camera views are authored as whole-cat raster sheets. The three matching
left views are emitted by mirroring the already registered right-side rasters
offline. Electron selects declared action ids from the travel vector; runtime
rotation, skewing, and mirroring are deliberately unnecessary.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = REPO_ROOT / "assets/source/pet-actors/golden-british"
SHEET_ROOT = SOURCE_ROOT / "story-actions/walk-round-trip-v5"
LEGACY_FRAME_ROOT = SOURCE_ROOT / "frames"
FRAME_ROOT = SOURCE_ROOT / "frames"

ARTBOARD_SIZE = 1024
GROUND_LINE_Y = 798
TARGET_MAX_DIMENSION = 530
FRAME_COUNT = 8
DIRECTIONS = (
    "right", "left", "front", "back",
    "front_right", "front_left", "back_right", "back_left",
)
NATIVE_VIEWS = ("right", "front", "back", "front_right", "back_right")
MIRRORS = {
    "right": "left",
    "front_right": "front_left",
    "back_right": "back_left",
}
LEGACY_SIDE_ORDER = (0, 4, 1, 5, 2, 6, 3, 7)
CONTACTS = (
    ("near-hind",),
    ("near-hind", "near-fore"),
    ("near-fore",),
    ("near-fore", "far-hind"),
    ("far-hind",),
    ("far-hind", "far-fore"),
    ("far-fore",),
    ("far-fore", "near-hind"),
)
WALK_ROOT_MOTION = {
    "kind": "authored-root-motion",
    "nominalStepDistancePx": 18,
    "footfallsPerCycle": 4,
    "rootStepKeyframes": [0, 0.18, 1, 1.18, 2, 2.18, 3, 3.18, 4],
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def crop_cells(sheet: Image.Image) -> list[Image.Image]:
    return [
        sheet.crop((
            round(sheet.width * column / 4),
            round(sheet.height * row / 2),
            round(sheet.width * (column + 1) / 4),
            round(sheet.height * (row + 1) / 2),
        ))
        for row in range(2)
        for column in range(4)
    ]


def remove_magenta_key(source: Image.Image) -> Image.Image:
    """Remove the connected imagegen chroma key without eating warm fur."""

    rgb = source.convert("RGB")
    data = np.asarray(rgb, dtype=np.int16)
    border = np.concatenate((
        data[:6].reshape(-1, 3), data[-6:].reshape(-1, 3),
        data[:, :6].reshape(-1, 3), data[:, -6:].reshape(-1, 3),
    ))
    key = np.median(border, axis=0)
    distance = np.max(np.abs(data - key), axis=2)
    alpha = np.where(distance <= 104, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack((np.asarray(rgb), alpha)), "RGBA")


def visible_median_x(image: Image.Image) -> float:
    alpha = np.asarray(image.getchannel("A"))
    ys, xs = np.where(alpha >= 48)
    if len(xs) == 0:
        raise ValueError("Pet source cell contains no visible actor pixels")
    # A median is deliberately robust to a swinging tail or one extended paw.
    return float(np.median(xs))


def remove_isolated_marks(image: Image.Image) -> Image.Image:
    """Drop detached imagegen specks while retaining whiskers and tail tips."""

    rgba = image.convert("RGBA")
    alpha = np.asarray(rgba.getchannel("A"))
    mask = alpha >= 48
    column_mass = mask.sum(axis=0)
    row_mass = mask.sum(axis=1)
    core_x = np.where(column_mass >= max(18, round(mask.shape[0] * 0.035)))[0]
    core_y = np.where(row_mass >= max(18, round(mask.shape[1] * 0.035)))[0]
    if len(core_x) == 0 or len(core_y) == 0:
        return rgba
    left = max(0, int(core_x[0]) - 28)
    right = min(mask.shape[1], int(core_x[-1]) + 29)
    top = max(0, int(core_y[0]) - 28)
    bottom = min(mask.shape[0], int(core_y[-1]) + 29)
    cleaned_alpha = alpha.copy()
    cleaned_alpha[:top, :] = 0
    cleaned_alpha[bottom:, :] = 0
    cleaned_alpha[:, :left] = 0
    cleaned_alpha[:, right:] = 0
    component_mask = cleaned_alpha >= 48
    ys, xs = np.where(component_mask)
    if len(xs):
        center_x = (int(xs.min()) + int(xs.max())) / 2
        center_y = (int(ys.min()) + int(ys.max())) / 2
        seed_index = int(np.argmin((xs - center_x) ** 2 + (ys - center_y) ** 2))
        seed = (int(ys[seed_index]), int(xs[seed_index]))
        connected = np.zeros_like(component_mask, dtype=bool)
        connected[seed] = True
        queue: deque[tuple[int, int]] = deque([seed])
        while queue:
            y, x = queue.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if not dx and not dy:
                        continue
                    ny, nx = y + dy, x + dx
                    if (
                        0 <= ny < component_mask.shape[0]
                        and 0 <= nx < component_mask.shape[1]
                        and component_mask[ny, nx]
                        and not connected[ny, nx]
                    ):
                        connected[ny, nx] = True
                        queue.append((ny, nx))
        cleaned_alpha[~connected] = 0
    rgba.putalpha(Image.fromarray(cleaned_alpha.astype(np.uint8), "L"))
    return rgba


def normalize_cell(cell: Image.Image) -> Image.Image:
    rgba = remove_isolated_marks(cell)
    alpha = rgba.getchannel("A").point(lambda value: 0 if value < 32 else value)
    rgba.putalpha(alpha)
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("Pet source cell contains no visible actor pixels")
    subject = rgba.crop(bounds)
    scale = TARGET_MAX_DIMENSION / max(subject.width, subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    subject_alpha = subject.getchannel("A")
    visible = subject_alpha.getbbox()
    if visible is None:
        raise ValueError("Pet actor became empty during registration")
    anchor_x = visible_median_x(subject)
    canvas = Image.new("RGBA", (ARTBOARD_SIZE, ARTBOARD_SIZE), (0, 0, 0, 0))
    x = round(ARTBOARD_SIZE / 2 - anchor_x)
    y = GROUND_LINE_Y - visible[3]
    canvas.alpha_composite(subject, (x, y))
    return canvas


def load_walk(direction: str) -> list[Image.Image]:
    if direction == "right":
        return [
            Image.open(LEGACY_FRAME_ROOT / f"walk_round_trip_v4_{index:02d}.png").convert("RGBA")
            for index in range(1, FRAME_COUNT + 1)
        ]
    slug = direction.replace("_", "-")
    with Image.open(SHEET_ROOT / f"walk-{slug}-sheet-magenta.png") as source:
        cells = crop_cells(remove_magenta_key(source))
    return [normalize_cell(cell) for cell in cells]


def load_look(direction: str) -> list[Image.Image]:
    slug = direction.replace("_", "-")
    with Image.open(SHEET_ROOT / f"look-{slug}-sheet-magenta.png") as source:
        cells = crop_cells(remove_magenta_key(source))
    return [normalize_cell(cell) for cell in cells]


def write_frame(image: Image.Image, frame_id: str) -> Path:
    output = FRAME_ROOT / f"{frame_id}.png"
    image.save(output, "PNG", optimize=True)
    return output


def source_frame(path: Path, duration_ms: int) -> dict[str, object]:
    return {
        "src": path.relative_to(REPO_ROOT).as_posix(),
        "kind": "approved-raster",
        "expectedSha256": sha256(path),
        "durationMs": duration_ms,
    }


def action(
    label: str,
    frames: list[Path],
    durations: list[int],
    *,
    locomotion: bool,
) -> dict[str, object]:
    result: dict[str, object] = {
        "label": label,
        "kind": "loop",
        "mood": "focused",
        "sourceFrames": [source_frame(path, duration) for path, duration in zip(frames, durations, strict=True)],
        "fps": 9 if locomotion else 5,
        "loop": True,
        "priority": 100,
    }
    if locomotion:
        result["locomotion"] = {
            **WALK_ROOT_MOTION,
            "phases": [
                {"frameIndex": index, "id": f"footfall-{index + 1}", "contacts": list(contacts)}
                for index, contacts in enumerate(CONTACTS)
            ],
        }
    return result


def checkerboard(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size, "#f8fafc")
    draw = ImageDraw.Draw(image)
    tile = 28
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill="#e2e8f0")
    return image


def write_preview(name: str, frames: list[Path], duration_ms: int) -> Path:
    rendered: list[Image.Image] = []
    for path in frames:
        with Image.open(path) as frame:
            actor = frame.convert("RGBA").resize((512, 512), Image.Resampling.LANCZOS)
        composed = checkerboard((512, 512)).convert("RGBA")
        composed.alpha_composite(actor)
        rendered.append(composed.convert("P", palette=Image.Palette.ADAPTIVE))
    output = SHEET_ROOT / name
    rendered[0].save(
        output,
        save_all=True,
        append_images=rendered[1:],
        duration=duration_ms,
        loop=0,
        disposal=2,
    )
    return output


def write_contact_sheet(sequences: dict[str, dict[str, list[Path]]]) -> Path:
    cell = 170
    margin = 24
    columns = 8
    rows = len(DIRECTIONS) * 2
    contact = checkerboard((margin * 2 + cell * columns, margin * 2 + cell * rows)).convert("RGBA")
    draw = ImageDraw.Draw(contact)
    row = 0
    for phase in ("walk", "look"):
        for direction in DIRECTIONS:
            for index, path in enumerate(sequences[phase][direction]):
                with Image.open(path) as frame:
                    preview = frame.convert("RGBA").resize((cell, cell), Image.Resampling.LANCZOS)
                x = margin + index * cell
                y = margin + row * cell
                contact.alpha_composite(preview, (x, y))
            draw.text((margin + 5, margin + row * cell + 5), f"{phase} {direction}", fill="#0f172a")
            row += 1
    output = SHEET_ROOT / "pet-eight-direction-contact-sheet.png"
    contact.convert("RGB").save(output, "PNG", optimize=True)
    return output


def alpha_report(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        bounds = rgba.getchannel("A").getbbox()
        corners = [
            rgba.getpixel((0, 0))[3], rgba.getpixel((rgba.width - 1, 0))[3],
            rgba.getpixel((0, rgba.height - 1))[3], rgba.getpixel((rgba.width - 1, rgba.height - 1))[3],
        ]
    return {
        "path": path.relative_to(REPO_ROOT).as_posix(),
        "sha256": sha256(path),
        "alphaBounds": list(bounds) if bounds else None,
        "cornerAlpha": corners,
    }


def main() -> None:
    FRAME_ROOT.mkdir(parents=True, exist_ok=True)
    SHEET_ROOT.mkdir(parents=True, exist_ok=True)
    for stale in FRAME_ROOT.glob("walk_round_trip_walk_*.png"):
        stale.unlink()
    for stale in FRAME_ROOT.glob("walk_round_trip_look_*.png"):
        # Do not touch the legacy walk_round_trip_look_01/02 compatibility pair.
        if not stale.stem.rsplit("_", 1)[-1].isdigit() or any(direction in stale.stem for direction in DIRECTIONS):
            stale.unlink()

    raw: dict[str, dict[str, list[Image.Image]]] = {"walk": {}, "look": {}}
    for direction in NATIVE_VIEWS:
        raw["walk"][direction] = load_walk(direction)
        raw["look"][direction] = load_look(direction)
        mirror = MIRRORS.get(direction)
        if mirror:
            raw["walk"][mirror] = [frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for frame in raw["walk"][direction]]
            raw["look"][mirror] = [frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for frame in raw["look"][direction]]

    sequences: dict[str, dict[str, list[Path]]] = {"walk": {}, "look": {}}
    actions: dict[str, dict[str, object]] = {}
    previews: list[Path] = []
    all_frames: list[Path] = []
    for direction in DIRECTIONS:
        sequences["walk"][direction] = [
            write_frame(frame, f"walk_round_trip_walk_{direction}_{index:02d}")
            for index, frame in enumerate(raw["walk"][direction], 1)
        ]
        sequences["look"][direction] = [
            write_frame(frame, f"walk_round_trip_look_{direction}_{index:02d}")
            for index, frame in enumerate(raw["look"][direction], 1)
        ]
        all_frames.extend(sequences["walk"][direction])
        all_frames.extend(sequences["look"][direction])
        walk_id = f"walk_round_trip_walk_{direction}"
        look_id = f"walk_round_trip_look_{direction}"
        actions[walk_id] = action(
            f"Pet relaxed walk {direction}",
            sequences["walk"][direction],
            [110] * FRAME_COUNT,
            locomotion=True,
        )
        actions[look_id] = action(
            f"Pet destination pause {direction}",
            sequences["look"][direction],
            [180, 180, 220, 180, 220, 220, 180, 180],
            locomotion=False,
        )
        slug = direction.replace("_", "-")
        previews.append(write_preview(f"pet-walk-{slug}-preview.gif", sequences["walk"][direction], 110))
        previews.append(write_preview(f"pet-look-{slug}-preview.gif", sequences["look"][direction], 190))

    fragment = {"schemaVersion": "tokenpet-pet-walk-actions/v5", "actions": actions}
    fragment_path = SHEET_ROOT / "source-actions.json"
    fragment_path.write_text(json.dumps(fragment, indent=2) + "\n", encoding="utf-8")
    contact_sheet = write_contact_sheet(sequences)
    native_sources = [
        SHEET_ROOT / f"{phase}-{direction.replace('_', '-')}-sheet-magenta.png"
        for phase in ("walk", "look")
        for direction in NATIVE_VIEWS
        if not (phase == "walk" and direction == "right")
    ] + [SOURCE_ROOT / "story-actions/walk-round-trip-v3/sprite-sheet.png"]
    report = {
        "schemaVersion": "tokenpet-pet-walk-assets/v5",
        "generationMode": "OpenAI built-in imagegen; offline registered whole-frame raster authoring",
        "promptSet": "Pet-specific relaxed four-footfall walk plus stationary destination-look sequence in five native camera views",
        "directions": list(DIRECTIONS),
        "walkFrames": FRAME_COUNT * len(DIRECTIONS),
        "lookFrames": FRAME_COUNT * len(DIRECTIONS),
        "nativeSourceSheets": [alpha_report(path) for path in native_sources],
        "offlineMirrors": {
            "left": "whole-frame mirror of registered right",
            "frontLeft": "whole-frame mirror of registered frontRight",
            "backLeft": "whole-frame mirror of registered backRight",
            "runtimeTransform": "none",
        },
        "registration": {
            "visibleMedianX": ARTBOARD_SIZE / 2,
            "visibleGroundLineY": GROUND_LINE_Y,
            "targetMaxDimension": TARGET_MAX_DIMENSION,
        },
        "rootMotion": WALK_ROOT_MOTION,
        "outputs": [alpha_report(path) for path in [*all_frames, contact_sheet, *previews]],
    }
    (SHEET_ROOT / "asset-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(all_frames)} Pet directional actor frames and {len(previews)} previews")


if __name__ == "__main__":
    main()
