#!/usr/bin/env python3
"""Split, register, and normalize the approved Golden British walk cycle."""

import json
from pathlib import Path
from statistics import median

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "assets/source/pet-actors/golden-british/story-actions/walk-round-trip-v3/sprite-sheet.png"
OUT = ROOT / "assets/source/pet-actors/golden-british/frames"
CLIP_DIR = ROOT / "assets/source/pet-actors/golden-british/story-actions/walk-round-trip-v4"
PREVIEW = CLIP_DIR / "walk-cycle-preview.gif"
ROOT_MOTION_PREVIEW = CLIP_DIR / "walk-root-motion-preview.gif"
ROOT_MOTION_CONTACT_SHEET = CLIP_DIR / "walk-root-motion-contact-sheet.png"
REGISTRATION_REPORT = CLIP_DIR / "locomotion-report.json"
FRAME_COUNT = 8
COLS = 4
ROWS = 2
ARTBOARD = 1024
FOOT_LINE_Y = 798
TARGET_MAX_WIDTH = 530
HEAD_ANCHOR_ROI = (520, 450, 820, 625)
HEAD_ANCHOR_DARK_LIMIT = 72
# The source sheet's rows are two hind-leg variants of the same four fore-leg
# phases. Row-major playback makes the fore legs complete two cycles while the
# body advances one. Column interleaving produces one coherent four-beat gait.
AUTHORED_CELL_ORDER = (0, 4, 1, 5, 2, 6, 3, 7)
GAIT_PHASES = (
    ("near-hind-contact", "near-hind"),
    ("near-hind-support", "near-hind"),
    ("near-fore-contact", "near-fore"),
    ("near-fore-support", "near-fore"),
    ("far-hind-contact", "far-hind"),
    ("far-hind-support", "far-hind"),
    ("far-fore-contact", "far-fore"),
    ("far-fore-support", "far-fore"),
)
# Expressed in completed physical footfalls at every authored frame boundary.
# Contact poses advance only a small amount; support poses carry body weight
# over the planted paw and complete the remainder of the step.
ROOT_STEP_KEYFRAMES = (0.0, 0.18, 1.0, 1.18, 2.0, 2.18, 3.0, 3.18, 4.0)


def split_cells(sheet: Image.Image) -> list[Image.Image]:
    cells_by_sheet_order: list[Image.Image] = []
    for index in range(FRAME_COUNT):
        column, row = index % COLS, index // COLS
        left = round(column * sheet.width / COLS)
        top = round(row * sheet.height / ROWS)
        right = round((column + 1) * sheet.width / COLS)
        bottom = round((row + 1) * sheet.height / ROWS)
        cells_by_sheet_order.append(sheet.crop((left, top, right, bottom)))
    return [cells_by_sheet_order[index] for index in AUTHORED_CELL_ORDER]


def head_anchor_x(frame: Image.Image) -> float:
    """Locate the stable eye/face mass instead of the moving paws or tail."""
    left, top, right, bottom = HEAD_ANCHOR_ROI
    pixels = frame.load()
    dark_points: list[int] = []
    for y in range(top, bottom):
        for x in range(left, right):
            red, green, blue, alpha = pixels[x, y]
            if alpha > 200 and red < HEAD_ANCHOR_DARK_LIMIT and green < HEAD_ANCHOR_DARK_LIMIT and blue < HEAD_ANCHOR_DARK_LIMIT:
                dark_points.append(x)
    if not dark_points:
        raise RuntimeError("unable to locate the walk-cycle head anchor")
    return sum(dark_points) / len(dark_points)


def smooth_step(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def root_steps_at_cycle_progress(progress: float) -> float:
    """Sample the same authored root curve consumed by the Electron runtime."""
    frame_position = max(0.0, min(1.0, progress)) * FRAME_COUNT
    frame_index = min(FRAME_COUNT - 1, int(frame_position))
    frame_progress = frame_position - frame_index
    start = ROOT_STEP_KEYFRAMES[frame_index]
    end = ROOT_STEP_KEYFRAMES[frame_index + 1]
    return start + (end - start) * smooth_step(frame_progress)


def main() -> None:
    sheet = Image.open(SHEET).convert("RGBA")
    cells = split_cells(sheet)
    bounds = [cell.getbbox() for cell in cells]
    if any(box is None for box in bounds):
        raise RuntimeError("walk cycle contains an empty sprite cell")

    opaque_bounds = [box for box in bounds if box is not None]
    widest = max(box[2] - box[0] for box in opaque_bounds)
    scale = TARGET_MAX_WIDTH / widest
    OUT.mkdir(parents=True, exist_ok=True)
    CLIP_DIR.mkdir(parents=True, exist_ok=True)
    prepared: list[Image.Image] = []
    for index, cell in enumerate(cells):
        box = opaque_bounds[index]
        resized = cell.resize(
            (round(cell.width * scale), round(cell.height * scale)),
            Image.Resampling.LANCZOS,
        )
        canvas = Image.new("RGBA", (ARTBOARD, ARTBOARD), (0, 0, 0, 0))
        x = round(ARTBOARD / 2 - cell.width * scale / 2)
        # Every authored pose contains at least one planted paw. Align each
        # pose independently so no frame floats above the shared floor.
        y = round(FOOT_LINE_Y - box[3] * scale)
        canvas.alpha_composite(resized, (x, y))
        prepared.append(canvas)

    # The generated source sheet places the same cat at slightly different
    # horizontal offsets. Native BrowserWindow motion already owns root travel,
    # so retaining that offset makes the entire animal wobble while walking.
    source_anchors = [head_anchor_x(frame) for frame in prepared]
    target_anchor = median(source_anchors)
    stabilized: list[Image.Image] = []
    registration_frames: list[dict[str, float | int | str]] = []
    for index, (frame, source_anchor) in enumerate(zip(prepared, source_anchors, strict=True)):
        shift_x = round(target_anchor - source_anchor)
        registered = Image.new("RGBA", (ARTBOARD, ARTBOARD), (0, 0, 0, 0))
        registered.alpha_composite(frame, (shift_x, 0))
        registered_anchor = head_anchor_x(registered)
        frame_id = f"walk_round_trip_v4_{index + 1:02}"
        registered.save(OUT / f"{frame_id}.png", optimize=True)
        stabilized.append(registered)
        registration_frames.append({
            "id": frame_id,
            "sourceCell": AUTHORED_CELL_ORDER[index] + 1,
            "phase": GAIT_PHASES[index][0],
            "contacts": [GAIT_PHASES[index][1]],
            "rootStepStart": ROOT_STEP_KEYFRAMES[index],
            "rootStepEnd": ROOT_STEP_KEYFRAMES[index + 1],
            "sourceEyeAnchorX": round(source_anchor, 3),
            "shiftX": shift_x,
            "registeredEyeAnchorX": round(registered_anchor, 3),
            "residualPx": round(abs(registered_anchor - target_anchor), 3),
        })

    max_residual = max(float(frame["residualPx"]) for frame in registration_frames)
    REGISTRATION_REPORT.write_text(
        json.dumps({
            "schemaVersion": "tokenpet-locomotion-report/v2",
            "anchor": "dark eye and face mass",
            "sourceCellOrder": [index + 1 for index in AUTHORED_CELL_ORDER],
            "footLineY": FOOT_LINE_Y,
            "nominalStepDistancePx": 18,
            "footfallsPerCycle": 4,
            "rootStepKeyframes": list(ROOT_STEP_KEYFRAMES),
            "targetEyeAnchorX": round(target_anchor, 3),
            "maxResidualPx": max_residual,
            "frames": registration_frames,
        }, indent=2) + "\n",
        encoding="utf-8",
    )

    preview_frames: list[Image.Image] = []
    for frame in stabilized:
        preview = Image.new("RGB", (512, 512), (250, 250, 248))
        ImageDraw.Draw(preview).line((0, FOOT_LINE_Y // 2, 512, FOOT_LINE_Y // 2), fill=(218, 221, 226), width=1)
        scaled_frame = frame.resize((512, 512), Image.Resampling.LANCZOS)
        preview.paste(scaled_frame, (0, 0), scaled_frame)
        preview_frames.append(preview)
    preview_frames[0].save(PREVIEW, save_all=True, append_images=preview_frames[1:], duration=110, loop=0, optimize=False)

    # A frame-only loop can still hide foot sliding. This second preview bakes
    # the production root curve into a two-cycle 1x traversal, making the paw
    # contacts and real body distance reviewable without launching Electron.
    root_preview_frames: list[Image.Image] = []
    samples_per_authored_frame = 4
    samples_per_cycle = FRAME_COUNT * samples_per_authored_frame
    preview_actor_size = 384
    preview_step_distance = 27
    start_center_x = 128
    for sample_index in range(samples_per_cycle * 2):
        cycle_index = sample_index // samples_per_cycle
        sample_in_cycle = sample_index % samples_per_cycle
        cycle_progress = sample_in_cycle / samples_per_cycle
        authored_frame_index = sample_in_cycle // samples_per_authored_frame
        root_steps = cycle_index * ROOT_STEP_KEYFRAMES[-1] + root_steps_at_cycle_progress(cycle_progress)
        preview = Image.new("RGB", (640, 384), (250, 250, 248))
        floor_y = round(FOOT_LINE_Y * preview_actor_size / ARTBOARD)
        ImageDraw.Draw(preview).line((0, floor_y, 640, floor_y), fill=(218, 221, 226), width=1)
        actor = stabilized[authored_frame_index].resize(
            (preview_actor_size, preview_actor_size),
            Image.Resampling.LANCZOS,
        )
        actor_x = round(start_center_x - preview_actor_size / 2 + root_steps * preview_step_distance)
        preview.paste(actor, (actor_x, 0), actor)
        root_preview_frames.append(preview)
    root_preview_frames[0].save(
        ROOT_MOTION_PREVIEW,
        save_all=True,
        append_images=root_preview_frames[1:],
        duration=28,
        loop=0,
        optimize=False,
    )
    contact_tiles = [
        root_preview_frames[index * samples_per_authored_frame].resize((320, 192), Image.Resampling.LANCZOS)
        for index in range(FRAME_COUNT)
    ]
    contact_sheet = Image.new("RGB", (1280, 384), (250, 250, 248))
    for index, tile in enumerate(contact_tiles):
        contact_sheet.paste(tile, ((index % 4) * 320, (index // 4) * 192))
    contact_sheet.save(ROOT_MOTION_CONTACT_SHEET, optimize=True)

    print(
        f"Prepared {FRAME_COUNT} distance-locked walk frames "
        f"at scale {scale:.4f} with foot line {FOOT_LINE_Y}; "
        f"head-anchor residual <= {max_residual:.3f}px"
    )


if __name__ == "__main__":
    main()
