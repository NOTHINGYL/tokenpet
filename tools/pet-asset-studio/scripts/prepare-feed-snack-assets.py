#!/usr/bin/env python3
"""Prepare the Feed Snack v4 eight-direction offline actor pack.

The five native camera views are authored 4x2 source sheets. Left-facing
partners are emitted by whole-frame mirroring only after registration. Runtime
selects declared rasters and never rotates, warps, mirrors, or invents anatomy.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
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
DIRECTIONS = (
    "right", "left", "front", "back",
    "front_right", "front_left", "back_right", "back_left",
)
VIEW_SHEETS = {
    "right": "side",
    "front": "front",
    "back": "back",
    "front_right": "front-right",
    "back_right": "back-right",
}
MIRRORS = {
    "right": "left",
    "front_right": "front_left",
    "back_right": "back_left",
}
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
WALK_ROOT = {
    "kind": "authored-root-motion",
    "nominalStepDistancePx": 16,
    "footfallsPerCycle": 4,
    "rootStepKeyframes": [0, 0.14, 1, 1.14, 2, 2.14, 3, 3.14, 4],
}
RETURN_ROOT = {
    "kind": "authored-root-motion",
    "nominalStepDistancePx": 24,
    "footfallsPerCycle": 4,
    "rootStepKeyframes": [0, 0.32, 1, 1.32, 2, 2.32, 3, 3.32, 4],
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def crop_cells(sheet: Image.Image, columns: int = 4, rows: int = 2) -> list[Image.Image]:
    return [
        sheet.crop((
            round(sheet.width * column / columns),
            round(sheet.height * row / rows),
            round(sheet.width * (column + 1) / columns),
            round(sheet.height * (row + 1) / rows),
        ))
        for row in range(rows)
        for column in range(columns)
    ]


def restore_cat_rgb(source: Image.Image) -> Image.Image:
    """Remove the connected magenta key while preserving warm kitten pixels."""

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


def load_phase_cells(view: str, phase: str) -> list[Image.Image]:
    if phase == "consume":
        with Image.open(SHEET_ROOT / f"consume-{view}-v4-sheet-magenta.png") as source:
            return crop_cells(restore_cat_rgb(source))
    base = {
        "walk": "walk-slow",
        "return": "return-run",
        "interaction": "interaction",
    }[phase]
    # Keep the approved side source and its locked hashes byte-stable. New
    # native camera views are keyed directly from their imagegen source sheets.
    if view == "side":
        if phase == "interaction":
            with Image.open(SHEET_ROOT / "interaction-side-v3-sheet-magenta.png") as source:
                return crop_cells(restore_cat_rgb(source))
        path = SHEET_ROOT / f"{base}-sheet.png"
        with Image.open(path) as source:
            return crop_cells(source.convert("RGBA"))
    path = SHEET_ROOT / f"{base}-{view}-sheet-magenta.png"
    with Image.open(path) as source:
        return crop_cells(restore_cat_rgb(source))


def normalize_cat(cell: Image.Image, *, legacy_registration: bool = False) -> Image.Image:
    rgba = cell.convert("RGBA")
    alpha = rgba.getchannel("A")
    if not legacy_registration:
        alpha = alpha.point(lambda value: 0 if value < 32 else value)
        rgba.putalpha(alpha)
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("Feed Snack source cell has no visible cat pixels")
    subject = rgba.crop(bounds)
    width = max(1, round(subject.width * CAT_SCALE))
    height = max(1, round(subject.height * CAT_SCALE))
    if width > 880 or height > 700:
        fit = min(880 / width, 700 / height)
        width = max(1, round(width * fit))
        height = max(1, round(height * fit))
    subject = subject.resize((width, height), Image.Resampling.LANCZOS)
    if legacy_registration:
        canvas = Image.new("RGBA", (ARTBOARD_SIZE, ARTBOARD_SIZE), (0, 0, 0, 0))
        canvas.alpha_composite(subject, (round((ARTBOARD_SIZE - width) / 2), GROUND_LINE_Y - height))
        return canvas
    visible = subject.getchannel("A").getbbox()
    if visible is None:
        raise ValueError("Feed Snack cat became empty after registration")
    canvas = Image.new("RGBA", (ARTBOARD_SIZE, ARTBOARD_SIZE), (0, 0, 0, 0))
    x = round(ARTBOARD_SIZE / 2 - (visible[0] + visible[2]) / 2)
    y = GROUND_LINE_Y - visible[3]
    canvas.alpha_composite(subject, (x, y))
    return canvas


def output_prefix(phase: str, direction: str) -> str:
    base = {
        "walk": "feed_snack_walk_slow",
        "return": "feed_snack_return_run",
        "interaction": "feed_snack_interaction",
        "consume": "feed_snack_consume",
    }[phase]
    if direction == "right" and phase in {"walk", "return"}:
        return base
    return f"{base}_{direction}"


def write_frame(image: Image.Image, name: str) -> Path:
    output = FRAME_ROOT / f"{name}.png"
    image.save(output, "PNG", optimize=True)
    return output


def source_frame(path: Path, duration_ms: int) -> dict[str, object]:
    return {
        "src": path.relative_to(REPO_ROOT).as_posix(),
        "kind": "approved-raster",
        "expectedSha256": sha256(path),
        "durationMs": duration_ms,
    }


def locomotion(root: dict[str, object]) -> dict[str, object]:
    return {
        **root,
        "phases": [
            {"frameIndex": index, "id": f"footfall-{index + 1}", "contacts": list(contacts)}
            for index, contacts in enumerate(CONTACTS)
        ],
    }


def authored_action(
    label: str,
    frames: list[Path],
    durations: list[int],
    *,
    loop: bool,
    fps: int,
    root_motion: dict[str, object] | None = None,
) -> dict[str, object]:
    action: dict[str, object] = {
        "label": label,
        "kind": "loop" if loop else "transition",
        "mood": "focused",
        "sourceFrames": [source_frame(path, duration) for path, duration in zip(frames, durations, strict=True)],
        "fps": fps,
        "loop": loop,
        "priority": 100,
    }
    if root_motion:
        action["locomotion"] = locomotion(root_motion)
    return action


def emit_direction(
    direction: str,
    normalized: dict[str, list[Image.Image]],
    actions: dict[str, dict[str, object]],
    phase_frames: dict[str, dict[str, list[Path]]],
) -> None:
    written: dict[str, list[Path]] = {}
    for phase, frames in normalized.items():
        prefix = output_prefix(phase, direction)
        written[phase] = [write_frame(frame, f"{prefix}_{index:02d}") for index, frame in enumerate(frames, 1)]
        phase_frames[phase][direction] = written[phase]

    walk_id = f"feed_snack_walk_slow_{direction}"
    return_id = f"feed_snack_return_run_{direction}"
    arrive_id = f"feed_snack_arrive_{direction}"
    lick_id = f"feed_snack_lick_{direction}"
    bite_id = f"feed_snack_bite_{direction}"
    chew_id = f"feed_snack_chew_{direction}"
    swallow_id = f"feed_snack_swallow_{direction}"
    actions[walk_id] = authored_action(
        f"Feed Snack cautious approach {direction}", written["walk"], [134] * 8,
        loop=True, fps=8, root_motion=WALK_ROOT,
    )
    actions[return_id] = authored_action(
        f"Feed Snack satisfied return {direction}", written["return"], [88] * 8,
        loop=True, fps=11, root_motion=RETURN_ROOT,
    )
    interaction = written["interaction"]
    actions[arrive_id] = authored_action(
        f"Feed Snack arrival {direction}", interaction[:3], [170, 170, 180], loop=False, fps=8,
    )
    consume = written["consume"]
    actions[lick_id] = authored_action(
        f"Feed Snack single lick {direction}", consume[:2], [180, 140], loop=False, fps=8,
    )
    actions[bite_id] = authored_action(
        f"Feed Snack bite and prop handoff {direction}", consume[1:3], [160, 220], loop=False, fps=8,
    )
    actions[chew_id] = authored_action(
        f"Feed Snack two-sided chew {direction}", consume[3:5], [220, 220], loop=False, fps=8,
    )
    actions[swallow_id] = authored_action(
        f"Feed Snack swallow and lip lick {direction}", consume[5:8], [260, 200, 260], loop=False, fps=8,
    )


def prepare_actor_pack() -> tuple[dict[str, dict[str, object]], dict[str, dict[str, list[Path]]]]:
    FRAME_ROOT.mkdir(parents=True, exist_ok=True)
    for stale in FRAME_ROOT.glob("feed_snack_*_front*.png"):
        stale.unlink()
    for stale in FRAME_ROOT.glob("feed_snack_*_back*.png"):
        stale.unlink()
    for prefix in ("feed_snack_walk_slow_left_", "feed_snack_return_run_left_", "feed_snack_interaction_right_", "feed_snack_interaction_left_"):
        for stale in FRAME_ROOT.glob(f"{prefix}*.png"):
            stale.unlink()
    for stale in FRAME_ROOT.glob("feed_snack_consume_*.png"):
        stale.unlink()

    actions: dict[str, dict[str, object]] = {}
    phase_frames: dict[str, dict[str, list[Path]]] = {"walk": {}, "return": {}, "interaction": {}, "consume": {}}
    for direction, view in VIEW_SHEETS.items():
        normalized: dict[str, list[Image.Image]] = {}
        for phase in ("walk", "return", "interaction", "consume"):
            cells = load_phase_cells(view, phase)
            order = CONTACT_ORDER if phase in {"walk", "return"} else tuple(range(8))
            normalized[phase] = [normalize_cat(cells[index], legacy_registration=view == "side" and phase != "interaction") for index in order]
        emit_direction(direction, normalized, actions, phase_frames)
        mirror = MIRRORS.get(direction)
        if mirror:
            mirrored = {
                phase: [frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for frame in frames]
                for phase, frames in normalized.items()
            }
            emit_direction(mirror, mirrored, actions, phase_frames)
    return actions, phase_frames


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
    tile = 28
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill="#e2e8f0")
    return image


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


def write_contact_sheet(phase_frames: dict[str, dict[str, list[Path]]], props: list[Path]) -> Path:
    sequences = [
        (f"{phase} {direction}", phase_frames[phase][direction])
        for phase in ("walk", "interaction", "consume", "return")
        for direction in DIRECTIONS
    ]
    cell = 176
    columns = 8
    margin = 24
    rows = sum(math.ceil(len(paths) / columns) for _, paths in sequences) + 1
    contact = checkerboard((margin * 2 + cell * columns, margin * 2 + cell * rows)).convert("RGBA")
    draw = ImageDraw.Draw(contact)
    row = 0
    for label, paths in sequences:
        for index, path in enumerate(paths):
            with Image.open(path) as frame:
                preview = frame.convert("RGBA").resize((cell, cell), Image.Resampling.LANCZOS)
            x = margin + (index % columns) * cell
            y = margin + (row + index // columns) * cell
            contact.alpha_composite(preview, (x, y))
            if index == 0:
                draw.text((x + 6, y + 6), label, fill="#0f172a")
        row += math.ceil(len(paths) / columns)
    for index, path in enumerate(props):
        with Image.open(path) as prop:
            preview = prop.convert("RGBA").resize((cell, cell), Image.Resampling.LANCZOS)
        contact.alpha_composite(preview, (margin + index * cell, margin + row * cell))
    output = SHEET_ROOT / "feed-snack-contact-sheet.png"
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
    actions, phase_frames = prepare_actor_pack()
    props = write_props()
    fragment = {"schemaVersion": "tokenpet-feed-snack-actions/v4", "actions": actions}
    fragment_path = SHEET_ROOT / "source-actions.json"
    fragment_path.write_text(json.dumps(fragment, indent=2) + "\n", encoding="utf-8")

    contact = write_contact_sheet(phase_frames, props)
    previews: list[Path] = []
    for direction in DIRECTIONS:
        slug = direction.replace("_", "-")
        previews.append(write_preview(f"feed-walk-slow-{slug}-preview.gif", phase_frames["walk"][direction], 134))
        previews.append(write_preview(f"feed-interaction-{slug}-preview.gif", phase_frames["interaction"][direction], 180))
        previews.append(write_preview(f"feed-consume-{slug}-preview.gif", phase_frames["consume"][direction], 180))
        previews.append(write_preview(f"feed-return-run-{slug}-preview.gif", phase_frames["return"][direction], 88))

    actor_frames = [path for phase in phase_frames.values() for frames in phase.values() for path in frames]
    native_sources = []
    for view in VIEW_SHEETS.values():
        for base in ("walk-slow", "return-run", "interaction", "consume"):
            if base == "consume":
                native_sources.append(SHEET_ROOT / f"consume-{view}-v4-sheet-magenta.png")
                continue
            if view == "side" and base == "interaction":
                native_sources.append(SHEET_ROOT / "interaction-side-v3-sheet-magenta.png")
            else:
                native_sources.append(SHEET_ROOT / (f"{base}-sheet.png" if view == "side" else f"{base}-{view}-sheet-magenta.png"))
    report = {
        "schemaVersion": "tokenpet-feed-snack-assets/v4",
        "generationMode": "OpenAI built-in imagegen; offline registered whole-frame raster authoring",
        "promptSet": "Feed-specific cautious approach, arrival, single lick, bite, two-sided chew, swallow, lip lick, and satisfied return in five native camera views",
        "catFrames": 32 * 8,
        "directions": list(DIRECTIONS),
        "nativeSourceSheets": [alpha_report(path) for path in native_sources],
        "offlineMirrors": {
            "left": "whole-frame mirror of registered right",
            "frontLeft": "whole-frame mirror of registered frontRight",
            "backLeft": "whole-frame mirror of registered backRight",
            "runtimeTransform": "none",
        },
        "registration": {"visibleCenterX": 512, "visibleGroundLineY": GROUND_LINE_Y},
        "outputs": [alpha_report(path) for path in [*actor_frames, *props, contact, *previews]],
    }
    (SHEET_ROOT / "asset-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {report['catFrames']} directional Feed cat frames, {len(props)} snack props, and {len(previews)} previews")


if __name__ == "__main__":
    main()
