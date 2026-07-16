#!/usr/bin/env python3
"""Prepare the Toss Yarn v2 eight-direction offline actor pack.

The authoring sources are 4x2 imagegen sheets on a magenta chroma field. This
tool performs only deterministic production work: crop, alpha cleanup,
registration, whole-frame offline mirroring, yarn-only colour variants, hashes,
preview artifacts, and the source-action fragment consumed by the manifest
builder. Runtime code never rotates, warps, recolours, or redraws cat anatomy.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = REPO_ROOT / "assets/source/pet-actors/golden-british"
SHEET_ROOT = SOURCE_ROOT / "story-actions/toss-yarn-v2"
FRAME_ROOT = SOURCE_ROOT / "frames"
PUBLIC_PROP_ROOT = REPO_ROOT / "apps/desktop/public/pet-actors/golden-british/props"

ARTBOARD_SIZE = 1024
GROUND_LINE_Y = 818
MAX_SUBJECT_WIDTH = 860
MAX_SUBJECT_HEIGHT = 680
COLORS = ("orange", "blue", "violet")
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

CHASE_ROOT = {
    "kind": "authored-root-motion",
    "nominalStepDistancePx": 26,
    "footfallsPerCycle": 4,
    "rootStepKeyframes": [0, 0.36, 1, 1.36, 2, 2.36, 3, 3.36, 4],
}
CARRY_ROOT = {
    "kind": "authored-root-motion",
    "nominalStepDistancePx": 18,
    "footfallsPerCycle": 4,
    "rootStepKeyframes": [0, 0.18, 1, 1.18, 2, 2.18, 3, 3.18, 4],
}
CONTACTS = (
    ("near-fore", "far-hind"),
    ("near-fore",),
    ("near-hind",),
    ("far-fore",),
    ("far-fore", "near-hind"),
    ("far-fore",),
    ("far-hind",),
    ("near-fore",),
)


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


def extract_authored_grid_subjects(sheet: Image.Image, columns: int = 4, rows: int = 2) -> list[Image.Image]:
    """Extract complete subjects even when imagegen art crosses a cell edge.

    Fixed 4x2 crops can clip the intended yarn and leak that clipped fragment
    into the neighbouring pickup frame. We label connected alpha runs across
    the complete sheet, assign each component to its nearest authored grid
    centre, and then rebuild each cell from only those assigned components.
    This is deterministic offline registration; runtime never repairs assets.
    """

    rgba = sheet.convert("RGBA")
    pixels = np.asarray(rgba, dtype=np.uint8)
    foreground = pixels[:, :, 3] > 0
    height, width = foreground.shape
    parent: list[int] = []
    runs: list[tuple[int, int, int]] = []
    previous: list[tuple[int, int, int]] = []

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(left: int, right: int) -> None:
        left_root = find(left)
        right_root = find(right)
        if left_root != right_root:
            parent[right_root] = left_root

    for y, row in enumerate(foreground):
        edges = np.diff(np.pad(row.astype(np.int8), (1, 1)))
        starts = np.flatnonzero(edges == 1)
        ends = np.flatnonzero(edges == -1)
        current: list[tuple[int, int, int]] = []
        previous_index = 0
        for start, end in zip(starts, ends, strict=True):
            run_index = len(parent)
            parent.append(run_index)
            runs.append((y, int(start), int(end)))
            current.append((int(start), int(end), run_index))
            while previous_index < len(previous) and previous[previous_index][1] < start - 1:
                previous_index += 1
            overlap_index = previous_index
            while overlap_index < len(previous) and previous[overlap_index][0] <= end:
                union(run_index, previous[overlap_index][2])
                overlap_index += 1
        previous = current

    stats: dict[int, dict[str, float]] = {}
    for run_index, (y, start, end) in enumerate(runs):
        root = find(run_index)
        length = end - start
        stat = stats.setdefault(root, {"area": 0, "sum_x": 0, "sum_y": 0})
        stat["area"] += length
        stat["sum_x"] += (start + end - 1) * length / 2
        stat["sum_y"] += y * length

    assignments: list[set[int]] = [set() for _ in range(columns * rows)]
    for root, stat in stats.items():
        if stat["area"] < 50:
            continue
        center_x = stat["sum_x"] / stat["area"]
        center_y = stat["sum_y"] / stat["area"]
        column = min(columns - 1, max(0, int(center_x / (width / columns))))
        row = min(rows - 1, max(0, int(center_y / (height / rows))))
        assignments[row * columns + column].add(root)

    cells: list[Image.Image] = []
    for cell_index, roots in enumerate(assignments):
        selected_runs = [run for index, run in enumerate(runs) if find(index) in roots]
        if not selected_runs:
            raise ValueError(f"Toss Yarn authored grid cell {cell_index} has no assigned subject")
        min_x = min(start for _, start, _ in selected_runs)
        min_y = min(y for y, _, _ in selected_runs)
        max_x = max(end for _, _, end in selected_runs)
        max_y = max(y for y, _, _ in selected_runs) + 1
        cell_pixels = np.zeros((max_y - min_y, max_x - min_x, 4), dtype=np.uint8)
        for y, start, end in selected_runs:
            cell_pixels[y - min_y, start - min_x:end - min_x] = pixels[y, start:end]
        cells.append(Image.fromarray(cell_pixels, "RGBA"))
    return cells


def clear_low_alpha_noise(image: Image.Image, threshold: int = 32) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: 0 if value < threshold else value)
    rgba.putalpha(alpha)
    return rgba


def normalize_cat(cell: Image.Image) -> Image.Image:
    cell = clear_low_alpha_noise(cell)
    bounds = cell.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Toss Yarn source cell has no visible cat pixels")
    subject = cell.crop(bounds)
    scale = min(MAX_SUBJECT_WIDTH / subject.width, MAX_SUBJECT_HEIGHT / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    visible = subject.getchannel("A").getbbox()
    if visible is None:
        raise ValueError("Toss Yarn cat became empty after registration")
    canvas = Image.new("RGBA", (ARTBOARD_SIZE, ARTBOARD_SIZE), (0, 0, 0, 0))
    x = round(ARTBOARD_SIZE / 2 - (visible[0] + visible[2]) / 2)
    y = GROUND_LINE_Y - visible[3]
    canvas.alpha_composite(subject, (x, y))
    return canvas


def recolor_blue_yarn(image: Image.Image, target: str) -> Image.Image:
    """Change only the authored azure yarn, preserving all cat RGB and alpha."""

    if target == "blue":
        return image.copy()
    data = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    red = data[:, :, 0].astype(np.float32)
    green = data[:, :, 1].astype(np.float32)
    blue = data[:, :, 2].astype(np.float32)
    alpha = data[:, :, 3]
    yarn = (alpha > 0) & (blue > 70) & (blue > red * 1.08) & (blue > green * 1.04)
    value = np.maximum(np.maximum(red, green), blue)
    if target == "orange":
        next_channels = (np.minimum(255, value * 1.08), value * 0.49, value * 0.07)
    else:
        next_channels = (value * 0.66, value * 0.19, np.minimum(255, value * 1.01))
    for channel, values in enumerate(next_channels):
        data[:, :, channel][yarn] = np.clip(values[yarn], 0, 255).astype(np.uint8)
    return Image.fromarray(data, "RGBA")


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
    variants: dict[str, list[Path]] | None = None,
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
    if variants:
        action["variants"] = {
            color: [source_frame(path, duration) for path, duration in zip(paths, durations, strict=True)]
            for color, paths in variants.items()
        }
    return action


def prepare_actor_pack() -> tuple[dict[str, dict[str, object]], dict[str, dict[str, list[Path]]]]:
    FRAME_ROOT.mkdir(parents=True, exist_ok=True)
    phase_frames: dict[str, dict[str, list[Path]]] = {
        "chase": {}, "carry_blue": {}, "pickup_blue": {}, "drop_blue": {},
    }
    actions: dict[str, dict[str, object]] = {}

    def emit_direction(direction: str, normalized: dict[str, list[Image.Image]]) -> None:
        chase = [write_frame(frame, f"toss_yarn_chase_{direction}_{index:02d}") for index, frame in enumerate(normalized["chase"], 1)]
        phase_frames["chase"][direction] = chase
        actions[f"toss_yarn_chase_{direction}"] = authored_action(
            f"Toss Yarn chase {direction}", chase, [82] * 8, loop=True, fps=12, root_motion=CHASE_ROOT,
        )

        carry_variants: dict[str, list[Path]] = {}
        pickup_variants: dict[str, list[Path]] = {}
        drop_variants: dict[str, list[Path]] = {}
        pickup_cells = normalized["interaction"][:4]
        # Reverse the physical pickup contact and add the two authored resting
        # cells so the ball remains visible through release and settle.
        drop_cells = [
            normalized["interaction"][3],
            normalized["interaction"][2],
            normalized["interaction"][1],
            normalized["interaction"][0],
            normalized["interaction"][6],
            normalized["interaction"][7],
        ]
        for color in COLORS:
            carry_variants[color] = [
                write_frame(recolor_blue_yarn(frame, color), f"toss_yarn_carry_{direction}_{color}_{index:02d}")
                for index, frame in enumerate(normalized["carry"], 1)
            ]
            pickup_variants[color] = [
                write_frame(recolor_blue_yarn(frame, color), f"toss_yarn_pickup_{direction}_{color}_{index:02d}")
                for index, frame in enumerate(pickup_cells, 1)
            ]
            drop_variants[color] = [
                write_frame(recolor_blue_yarn(frame, color), f"toss_yarn_drop_{direction}_{color}_{index:02d}")
                for index, frame in enumerate(drop_cells, 1)
            ]

        phase_frames["carry_blue"][direction] = carry_variants["blue"]
        phase_frames["pickup_blue"][direction] = pickup_variants["blue"]
        phase_frames["drop_blue"][direction] = drop_variants["blue"]
        actions[f"toss_yarn_carry_{direction}"] = authored_action(
            f"Toss Yarn mouth carry {direction}", carry_variants["orange"], [105] * 8,
            loop=True, fps=10, root_motion=CARRY_ROOT, variants=carry_variants,
        )
        actions[f"toss_yarn_pickup_{direction}"] = authored_action(
            f"Toss Yarn pickup {direction}", pickup_variants["orange"], [150, 160, 170, 190],
            loop=False, fps=7, variants=pickup_variants,
        )
        actions[f"toss_yarn_drop_{direction}"] = authored_action(
            f"Toss Yarn drop {direction}", drop_variants["orange"], [145, 145, 155, 170, 175, 210],
            loop=False, fps=7, variants=drop_variants,
        )

    # Process one native view and (where required) its offline whole-frame
    # mirror at a time. Keeping the full pack in memory exceeds 800 MB.
    for direction, view in VIEW_SHEETS.items():
        normalized: dict[str, list[Image.Image]] = {}
        for phase in ("chase", "carry", "interaction"):
            with Image.open(SHEET_ROOT / f"{phase}-{view}-sheet-magenta.png") as source:
                cells = extract_authored_grid_subjects(restore_cat_rgb(source))
            normalized[phase] = [normalize_cat(cell) for cell in cells]
        emit_direction(direction, normalized)
        mirror = MIRRORS.get(direction)
        if mirror:
            mirrored = {
                phase: [frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for frame in frames]
                for phase, frames in normalized.items()
            }
            emit_direction(mirror, mirrored)

    right = "right"
    # The stable same-id capability remains a compact authored summary; native
    # execution selects the dedicated directional phase actions above.
    summary = [
        phase_frames["chase"][right][0],
        *(FRAME_ROOT / f"toss_yarn_pickup_right_orange_{index:02d}.png" for index in range(1, 5)),
        FRAME_ROOT / "toss_yarn_carry_right_orange_01.png",
        *(FRAME_ROOT / f"toss_yarn_drop_right_orange_{index:02d}.png" for index in range(1, 7)),
    ]
    actions["toss_yarn"] = authored_action(
        "Toss Yarn eight-direction retrieve summary", summary,
        [180, 150, 160, 170, 190, 210, 145, 145, 155, 170, 175, 210],
        loop=False, fps=8,
    )
    return actions, phase_frames


def restore_cat_rgb(source: Image.Image) -> Image.Image:
    """Remove the connected chroma field without classifying cat-coloured RGB.

    The shared helper supplies the first hard matte and proves the key colour,
    but a red+blue dominance heuristic can mistake warm Golden British pixels
    for magenta spill. The cat's warm pixels are well separated from the field,
    so a deliberately wider hard matte removes the background/edge spill while
    preserving pink ears and the untouched source RGB of the cat.
    """

    rgb = source.convert("RGB")
    data = np.asarray(rgb, dtype=np.int16)
    border = np.concatenate((data[:6].reshape(-1, 3), data[-6:].reshape(-1, 3), data[:, :6].reshape(-1, 3), data[:, -6:].reshape(-1, 3)))
    key = np.median(border, axis=0)
    distance = np.max(np.abs(data - key), axis=2)
    # Golden/orange cat pixels are more than 180 channel units from this
    # magenta field. A 104-unit hard matte removes generated background spill
    # while retaining the kitten's disconnected pink inner-ear detail.
    background = distance <= 104
    alpha = np.where(background, 0, 255).astype(np.uint8)
    output = Image.fromarray(np.dstack((np.asarray(rgb), alpha)), "RGBA")
    return output


def restore_prop_rgb(source: Image.Image, matte: Image.Image) -> Image.Image:
    rgb = source.convert("RGB")
    alpha = matte.convert("RGBA").getchannel("A")
    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    output.paste(rgb, mask=alpha)
    output.putalpha(alpha)
    return output


def normalize_prop(cell: Image.Image, max_size: int = 440) -> Image.Image:
    cell = clear_low_alpha_noise(cell)
    bounds = cell.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Toss Yarn prop cell has no visible pixels")
    subject = cell.crop(bounds)
    scale = min(max_size / subject.width, max_size / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    subject.putalpha(subject.getchannel("A").filter(ImageFilter.MinFilter(3)))
    canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    canvas.alpha_composite(subject, (round((512 - size[0]) / 2), round((512 - size[1]) / 2)))
    return canvas


def prepare_props() -> list[Path]:
    with Image.open(SHEET_ROOT / "props-sheet-magenta.png") as source, Image.open(SHEET_ROOT / "props-sheet.png") as matte:
        restored = restore_prop_rgb(source, matte)
    cells = crop_cells(restored)
    names = (
        "toss-yarn-orange", "toss-yarn-blue", "toss-yarn-violet", "toss-yarn-spark",
        "toss-yarn-orange-roll", "toss-yarn-blue-roll", "toss-yarn-violet-roll", "toss-yarn-trail",
    )
    PUBLIC_PROP_ROOT.mkdir(parents=True, exist_ok=True)
    outputs: list[Path] = []
    for cell, name in zip(cells, names, strict=True):
        output = PUBLIC_PROP_ROOT / f"{name}.png"
        normalize_prop(cell, 450 if "yarn" in name and "spark" not in name and "trail" not in name else 330).save(output, "PNG", optimize=True)
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
        (f"chase {direction}", phase_frames["chase"][direction]) for direction in DIRECTIONS
    ] + [
        (f"carry blue {direction}", phase_frames["carry_blue"][direction]) for direction in DIRECTIONS
    ] + [
        (f"pickup/drop blue {direction}", [*phase_frames["pickup_blue"][direction], *phase_frames["drop_blue"][direction]])
        for direction in DIRECTIONS
    ]
    cell = 180
    columns = 8
    margin = 22
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
        draw.text((margin + index * cell + 4, margin + (row + 1) * cell - 22), path.stem, fill="#0f172a")
    output = SHEET_ROOT / "toss-yarn-contact-sheet.png"
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
    props = prepare_props()
    fragment = {
        "schemaVersion": "tokenpet-toss-yarn-actions/v2",
        "actions": actions,
    }
    fragment_path = SHEET_ROOT / "source-actions.json"
    fragment_path.write_text(json.dumps(fragment, indent=2) + "\n", encoding="utf-8")
    # source-actions.json supplies the directional build fragment, while the
    # stable same-id Toss Yarn summary also lives in the root source spec and
    # participates in source-hash QA. Keep that one approved action in sync
    # whenever cross-cell extraction changes its pickup/drop rasters.
    source_spec_path = SOURCE_ROOT / "source.json"
    source_spec = json.loads(source_spec_path.read_text(encoding="utf-8"))
    source_spec["actions"]["toss_yarn"] = actions["toss_yarn"]
    source_spec_path.write_text(json.dumps(source_spec, indent=2) + "\n", encoding="utf-8")
    contact = write_contact_sheet(phase_frames, props)
    previews = []
    for direction in DIRECTIONS:
        previews.append(write_preview(f"toss-yarn-chase-{direction.replace('_', '-')}-preview.gif", phase_frames["chase"][direction], 82))
        previews.append(write_preview(f"toss-yarn-carry-{direction.replace('_', '-')}-preview.gif", phase_frames["carry_blue"][direction], 105))
    story = write_preview(
        "toss-yarn-pickup-carry-drop-preview.gif",
        [
            *phase_frames["pickup_blue"]["right"],
            *phase_frames["carry_blue"]["right"],
            *phase_frames["drop_blue"]["left"],
        ],
        145,
    )
    all_actor_frames = sorted(FRAME_ROOT.glob("toss_yarn_chase_*.png")) + sorted(FRAME_ROOT.glob("toss_yarn_carry_*.png")) + sorted(FRAME_ROOT.glob("toss_yarn_pickup_*.png")) + sorted(FRAME_ROOT.glob("toss_yarn_drop_*.png"))
    output_paths = [
        *all_actor_frames,
        *props, contact, *previews, story, fragment_path,
    ]
    report = {
        "schemaVersion": "tokenpet-toss-yarn-assets/v2",
        "generationMode": "OpenAI built-in imagegen; offline whole-frame raster authoring",
        "catFrames": 8 * 8 + 8 * 3 * (8 + 4 + 6),
        "directions": list(DIRECTIONS),
        "colors": list(COLORS),
        "offlineMirrors": {
            "left": "whole-frame mirror of registered right",
            "frontLeft": "whole-frame mirror of registered frontRight",
            "backLeft": "whole-frame mirror of registered backRight",
            "runtimeTransform": "none",
        },
        "registration": {
            "visibleCenterX": 512,
            "visibleGroundLineY": GROUND_LINE_Y,
            "runtimeBodyTransform": "forbidden",
            "rootMotion": "native-window distance locked",
        },
        "yarnVariants": "offline azure-yarn mask recolour; cat RGB remains byte-identical between variants",
        "gridExtraction": "connected alpha components assigned to nearest authored grid centre; cross-cell clipping and neighbour bleed forbidden",
        "outputs": [alpha_report(path) for path in output_paths if path.suffix.lower() in {".png", ".gif"}],
    }
    (SHEET_ROOT / "asset-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {report['catFrames']} Toss Yarn cat frames, {len(props)} props, and {len(previews) + 1} previews")


if __name__ == "__main__":
    main()
