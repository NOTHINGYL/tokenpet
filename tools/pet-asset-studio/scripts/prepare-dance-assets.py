#!/usr/bin/env python3
"""Prepare the Golden British frame-matched minimal-loop Dance pack.

Imagegen-authored 4x2 source sheets translate the supplied video's head push
and whole-body groove into the established Golden British art direction. The
source sheets remain immutable authoring evidence. Independent visual and audio
autocorrelation selects the first 10.133-second, 595-presentation-frame loop.
Runtime code only swaps complete registered rasters and never rotates,
stretches, or deforms cat anatomy.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps


REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = REPO_ROOT / "assets/source/pet-actors/golden-british"
LEGACY_ROOT = SOURCE_ROOT / "story-actions/dance-v1"
SHEET_ROOT = SOURCE_ROOT / "story-actions/dance-video-v2"
VIDEO_REFERENCE_ROOT = SOURCE_ROOT / "story-actions/dance-video-reference-v2"
FRAME_ROOT = SOURCE_ROOT / "frames"
ICON_ROOT = REPO_ROOT / "apps/desktop/public/quick-play-v18"

ARTBOARD_SIZE = 1024
VISIBLE_CENTER_X = 512
GROUND_LINE_Y = 818
SOURCE_SCALE = 1.68

# Imagegen sheets intentionally preserve each phase's internal silhouette
# changes. Apply one fixed authoring-scale correction per sheet so phase
# transitions keep the same kitten size without normalizing individual poses
# (which would erase the authored head projection and haunch weight transfer).
PHASE_SCALE_MULTIPLIERS = {
    "dance_tongue_hold": 1.13,
    "dance_smug_hold": 1.04,
}

RISE_DURATIONS = [120, 120, 130, 130]
RESTORE_DURATIONS = [120, 120, 130, 130]
REFERENCE_DURATION_MS = 10_133

PHASE_SHEETS = (
    ("dance_eye_snap", "01-squint-to-open-sheet.png"),
    ("dance_tongue_pop", "02-tongue-pop-sheet.png"),
    ("dance_tongue_hold", "09-tongue-haunch-groove-sheet.png"),
    ("dance_tongue_retract", "04-tongue-retract-sheet.png"),
    ("dance_smug_hold", "08-closed-mouth-forward-push-sheet.png"),
)

# Curated from the extracted source soundtrack's onset analysis, then checked
# against the true video frames. Tongue-out left/right weight accents start on
# these source-audio beats; renderer and Console both consume the resulting
# pre-timed manifest, so no runtime BPM approximation can drift from the AAC.
AUDIO_GROOVE_ONSETS_MS = (
    1_320, 1_730, 2_250,
    5_400, 5_950,
    8_480, 9_130,
)

# Hand-verified state boundaries from the smallest visual/audio loop.
# Durations sum to the detected 10.133-second period. Each
# phrase preserves the source's wide-eye pause before the mouth starts moving;
# merging that pause into tongue_pop made the old version visibly early by up
# to one second. Eye snaps use only the first six eye-sheet poses, while
# dance_wide_hold reuses the final fully-open, closed-mouth pose.
REFERENCE_SEGMENTS = (
    ("dance_smug_hold", 383),
    ("dance_eye_snap", 34),
    ("dance_wide_hold", 466),
    ("dance_tongue_pop", 167),
    ("dance_tongue_hold", 1_300),
    ("dance_tongue_retract", 400),
    ("dance_smug_hold", 1_335),
    ("dance_eye_snap", 35),
    ("dance_wide_hold", 965),
    ("dance_tongue_pop", 165),
    ("dance_tongue_hold", 800),
    ("dance_tongue_retract", 350),
    ("dance_smug_hold", 1_450),
    ("dance_eye_snap", 35),
    ("dance_wide_hold", 265),
    ("dance_tongue_pop", 270),
    ("dance_tongue_hold", 760),
    ("dance_tongue_retract", 140),
    # The original 20.45-second recording repeats after this closing phrase.
    # End on the same planted closed-mouth state used at frame zero.
    ("dance_smug_hold", 813),
)


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


def remove_generated_background(cell: Image.Image) -> Image.Image:
    rgb = np.asarray(cell.convert("RGB"), dtype=np.uint8)
    red = rgb[:, :, 0].astype(np.int16)
    green = rgb[:, :, 1].astype(np.int16)
    blue = rgb[:, :, 2].astype(np.int16)
    magenta_seed = (red > 175) & (blue > 135) & (green < 150) & ((red - green) > 65) & ((blue - green) > 40)
    if not np.any(magenta_seed):
        raise ValueError("Dance source cell does not contain the required magenta chroma field")
    key = np.median(rgb[magenta_seed], axis=0).astype(np.int16)
    key_distance = np.max(np.abs(rgb.astype(np.int16) - key), axis=2)
    magenta = key_distance <= 122
    white = (red > 235) & (green > 235) & (blue > 235) & ((np.maximum.reduce([red, green, blue]) - np.minimum.reduce([red, green, blue])) < 18)
    alpha = np.where(magenta | white, 0, 255).astype(np.uint8)
    gutter = max(8, round(min(cell.size) * 0.025))
    alpha[:gutter, :] = 0
    alpha[-gutter:, :] = 0
    alpha[:, :gutter] = 0
    alpha[:, -gutter:] = 0

    visible = alpha > 0
    height, width = visible.shape
    seen = np.zeros_like(visible, dtype=bool)
    kept = np.zeros_like(visible, dtype=bool)
    for y in range(height):
        for x in range(width):
            if not visible[y, x] or seen[y, x]:
                continue
            stack = [(x, y)]
            seen[y, x] = True
            component: list[tuple[int, int]] = []
            while stack:
                current_x, current_y = stack.pop()
                component.append((current_x, current_y))
                for next_x, next_y in ((current_x - 1, current_y), (current_x + 1, current_y), (current_x, current_y - 1), (current_x, current_y + 1)):
                    if 0 <= next_x < width and 0 <= next_y < height and visible[next_y, next_x] and not seen[next_y, next_x]:
                        seen[next_y, next_x] = True
                        stack.append((next_x, next_y))
            if len(component) >= 90:
                for component_x, component_y in component:
                    kept[component_y, component_x] = True
    alpha = np.where(kept, 255, 0).astype(np.uint8)
    return Image.fromarray(np.dstack((rgb, alpha)), "RGBA")


def register_frame(cell: Image.Image, scale_multiplier: float = 1.0) -> Image.Image:
    transparent = remove_generated_background(cell)
    bounds = transparent.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Dance source cell has no visible kitten pixels")
    subject = transparent.crop(bounds)
    source_scale = SOURCE_SCALE * scale_multiplier
    size = (max(1, round(subject.width * source_scale)), max(1, round(subject.height * source_scale)))
    if size[0] > 900 or size[1] > 720:
        raise ValueError(f"Dance fixed-scale subject exceeds approved artboard envelope: {size}")
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    visible = subject.getchannel("A").getbbox()
    if visible is None:
        raise ValueError("Dance source cell became empty after registration")
    canvas = Image.new("RGBA", (ARTBOARD_SIZE, ARTBOARD_SIZE), (0, 0, 0, 0))
    x = round(VISIBLE_CENTER_X - (visible[0] + visible[2]) / 2)
    y = GROUND_LINE_Y - visible[3]
    canvas.alpha_composite(subject, (x, y))
    return canvas


def source_frame(path: Path, duration_ms: int) -> dict[str, object]:
    return {
        "src": path.relative_to(REPO_ROOT).as_posix(),
        "kind": "approved-raster",
        "expectedSha256": sha256(path),
        "durationMs": duration_ms,
    }


def action(label: str, paths: list[Path], durations: list[int], *, loop: bool = False) -> dict[str, object]:
    return {
        "label": label,
        "kind": "loop" if loop else "transition",
        "mood": "hot",
        "sourceFrames": [source_frame(path, duration) for path, duration in zip(paths, durations, strict=True)],
        "fps": 12,
        "loop": loop,
        "priority": 100,
        "cooldownMs": 800,
        "reducedMotionFallback": "idle_breathe",
    }


def checkerboard(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size, "#f8fafc")
    draw = ImageDraw.Draw(image)
    tile = 28
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill="#e2e8f0")
    return image


def write_preview(paths: list[Path], durations: list[int]) -> tuple[Path, int]:
    # Production intentionally retains every presentation frame in the
    # detected minimal loop.
    # The review GIF collapses adjacent identical rasters so it stays small
    # enough to inspect without changing the production manifest clock.
    collapsed_paths: list[Path] = []
    collapsed_durations: list[int] = []
    for path, duration in zip(paths, durations, strict=True):
        if collapsed_paths and path == collapsed_paths[-1]:
            collapsed_durations[-1] += duration
        else:
            collapsed_paths.append(path)
            collapsed_durations.append(duration)
    background = checkerboard((512, 512)).convert("RGBA")
    frames: list[Image.Image] = []
    for path in collapsed_paths:
        with Image.open(path) as source:
            actor = source.convert("RGBA").resize((512, 512), Image.Resampling.LANCZOS)
        frame = background.copy()
        frame.alpha_composite(actor)
        frames.append(frame.convert("P", palette=Image.Palette.ADAPTIVE))
    output = SHEET_ROOT / "dance-reference-cycle-preview.gif"
    frames[0].save(output, save_all=True, append_images=frames[1:], duration=collapsed_durations, loop=0, disposal=2)
    return output, len(collapsed_paths)


def write_contact_sheet(rise: list[Path], phase_paths: dict[str, list[Path]], restore: list[Path]) -> Path:
    cell = 220
    margin = 24
    ordered_rows: list[tuple[str, list[Path], int]] = [("rise / restore", [*rise, *restore], 0)]
    for phase, _ in PHASE_SHEETS:
        paths = phase_paths[phase]
        for chunk_index in range(0, len(paths), 8):
            label = phase if chunk_index == 0 else f"{phase} mirrored"
            ordered_rows.append((label, paths[chunk_index : chunk_index + 8], 0))
    rows = len(ordered_rows)
    output = SHEET_ROOT / "dance-contact-sheet.png"
    contact = checkerboard((margin * 2 + cell * 8, margin * 2 + cell * rows)).convert("RGBA")
    draw = ImageDraw.Draw(contact)
    for target_row, (label, paths, start_column) in enumerate(ordered_rows):
        for index, path in enumerate(paths):
            with Image.open(path) as source:
                actor = source.convert("RGBA").resize((cell, cell), Image.Resampling.LANCZOS)
            x = margin + (start_column + index) * cell
            y = margin + target_row * cell
            contact.alpha_composite(actor, (x, y))
            draw.text((x + 7, y + 7), f"{label} {index + 1}", fill="#0f172a")
    contact.convert("RGB").save(output, "PNG", optimize=True)
    return output


def distribute_duration(total_ms: int, count: int) -> list[int]:
    base, remainder = divmod(total_ms, count)
    return [base + (1 if index < remainder else 0) for index in range(count)]


def source_presentation_schedule() -> tuple[list[float], list[int]]:
    metadata = json.loads((VIDEO_REFERENCE_ROOT / "metadata.json").read_text())
    timestamps_ms = [
        float(value) * 1_000
        for value in metadata["timestampsSeconds"]
        if float(value) * 1_000 < REFERENCE_DURATION_MS
    ]
    if len(timestamps_ms) != 595 or abs(timestamps_ms[0]) > 0.001:
        raise ValueError("Dance source-video presentation timestamp contract changed")
    exact_durations = [
        (timestamps_ms[index + 1] if index + 1 < len(timestamps_ms) else REFERENCE_DURATION_MS) - timestamp
        for index, timestamp in enumerate(timestamps_ms)
    ]
    durations = [max(1, math.floor(value)) for value in exact_durations]
    remainder = REFERENCE_DURATION_MS - sum(durations)
    ranked = sorted(
        range(len(durations)),
        key=lambda index: exact_durations[index] - math.floor(exact_durations[index]),
        reverse=remainder > 0,
    )
    cursor = 0
    while remainder != 0:
        index = ranked[cursor % len(ranked)]
        if remainder > 0:
            durations[index] += 1
            remainder -= 1
        elif durations[index] > 1:
            durations[index] -= 1
            remainder += 1
        cursor += 1
        if cursor > len(ranked) * 4:
            raise ValueError("Could not integerize Dance source-video frame durations")
    if sum(durations) != REFERENCE_DURATION_MS or any(duration <= 0 for duration in durations):
        raise ValueError("Dance source-video duration integerization failed")
    return timestamps_ms, durations


def phase_at(milliseconds: float) -> tuple[str, float]:
    cursor = 0
    for phase, duration in REFERENCE_SEGMENTS:
        if milliseconds < cursor + duration:
            return phase, min(1.0, max(0.0, (milliseconds - cursor) / max(1, duration)))
        cursor += duration
    return REFERENCE_SEGMENTS[-1][0], 1.0


def indexed_pose(paths: list[Path], progress: float) -> Path:
    return paths[min(len(paths) - 1, max(0, math.floor(progress * len(paths))))]


def groove_pose_at(groove_paths: list[Path], start_ms: float, end_ms: float) -> Path:
    if len(groove_paths) != 16:
        raise ValueError("Dance tongue groove requires eight native and eight offline-mirrored haunch poses")
    best_magnitude = 0.0
    best_bank = 0
    for onset_index, onset in enumerate(AUDIO_GROOVE_ONSETS_MS):
        if start_ms <= onset < end_ms:
            return groove_paths[(onset_index % 2) * 8 + 7]
        center_ms = (start_ms + end_ms) / 2
        delta = center_ms - onset
        if -140 <= delta < 0:
            magnitude = 1 - (-delta / 140)
        elif 0 <= delta <= 260:
            magnitude = 1 - delta / 260
        else:
            continue
        magnitude = max(0.0, min(1.0, magnitude))
        if magnitude > best_magnitude:
            best_magnitude = magnitude
            best_bank = onset_index % 2
    pose_index = min(7, max(0, round(best_magnitude * 7)))
    return groove_paths[best_bank * 8 + pose_index]


def build_reference_clip(phase_paths: dict[str, list[Path]]) -> tuple[list[Path], list[int]]:
    reference_phase_paths = {
        **phase_paths,
        "dance_eye_snap": phase_paths["dance_eye_snap"][:6],
        "dance_wide_hold": [phase_paths["dance_eye_snap"][5]],
        "dance_tongue_pop": [*phase_paths["dance_eye_snap"][6:], *phase_paths["dance_tongue_pop"]],
    }
    timestamps_ms, durations = source_presentation_schedule()
    paths: list[Path] = []
    elapsed_ms = 0
    for timestamp_ms, duration_ms in zip(timestamps_ms, durations, strict=True):
        phase, progress = phase_at(timestamp_ms)
        onset_crosses_frame = any(elapsed_ms <= onset < elapsed_ms + duration_ms for onset in AUDIO_GROOVE_ONSETS_MS)
        if phase == "dance_tongue_hold" or (phase == "dance_tongue_pop" and onset_crosses_frame):
            path = groove_pose_at(reference_phase_paths["dance_tongue_hold"], elapsed_ms, elapsed_ms + duration_ms)
        else:
            path = indexed_pose(reference_phase_paths[phase], progress)
        paths.append(path)
        elapsed_ms += duration_ms
    if sum(durations) != REFERENCE_DURATION_MS:
        raise ValueError(f"Dance reference duration mismatch: {sum(durations)}ms")
    if len(paths) != 595:
        raise ValueError(f"Dance per-source-frame schedule mismatch: {len(paths)}")
    return paths, durations


def alpha_report(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        bounds = rgba.getchannel("A").getbbox()
        corners = [rgba.getpixel(point)[3] for point in ((0, 0), (rgba.width - 1, 0), (0, rgba.height - 1), (rgba.width - 1, rgba.height - 1))]
    return {
        "path": path.relative_to(REPO_ROOT).as_posix(),
        "sha256": sha256(path),
        "alphaBounds": list(bounds) if bounds else None,
        "cornerAlpha": corners,
    }


def write_icon(path: Path) -> Path:
    ICON_ROOT.mkdir(parents=True, exist_ok=True)
    output = ICON_ROOT / "dance.png"
    with Image.open(path) as source:
        source.convert("RGBA").resize((256, 256), Image.Resampling.LANCZOS).save(output, "PNG", optimize=True)
    return output


def main() -> None:
    FRAME_ROOT.mkdir(parents=True, exist_ok=True)
    SHEET_ROOT.mkdir(parents=True, exist_ok=True)
    rise_restore_sheet = LEGACY_ROOT / "rise-restore-sheet.png"
    with Image.open(rise_restore_sheet) as source:
        rise_restore_cells = crop_cells(source.convert("RGBA"))

    rise_paths: list[Path] = []
    restore_paths: list[Path] = []
    for prefix, cell_group, durations, output_paths in (
        ("dance_rise", rise_restore_cells[:4], RISE_DURATIONS, rise_paths),
        ("dance_restore", rise_restore_cells[4:], RESTORE_DURATIONS, restore_paths),
    ):
        for index, cell in enumerate(cell_group, start=1):
            output = FRAME_ROOT / f"{prefix}_{index:02d}.png"
            register_frame(cell).save(output, "PNG", optimize=True)
            output_paths.append(output)

    phase_paths: dict[str, list[Path]] = {}
    unique_paths: list[Path] = []
    frame_index = 1
    for phase, filename in PHASE_SHEETS:
        with Image.open(SHEET_ROOT / filename) as source:
            cells = crop_cells(source.convert("RGBA"))
        if phase == "dance_tongue_hold":
            # The authored sheet is one strong haunch-weight half-cycle. The
            # opposite direction is baked here as independent production PNGs
            # so runtime never mirrors or rotates the actor.
            cells = [*cells, *[ImageOps.mirror(cell) for cell in cells]]
        phase_paths[phase] = []
        for cell in cells:
            output = FRAME_ROOT / f"dance_video_{frame_index:02d}.png"
            register_frame(cell, PHASE_SCALE_MULTIPLIERS.get(phase, 1.0)).save(output, "PNG", optimize=True)
            phase_paths[phase].append(output)
            unique_paths.append(output)
            frame_index += 1

    reference_paths, reference_durations = build_reference_clip(phase_paths)
    source = json.loads((SOURCE_ROOT / "source.json").read_text())
    source["sourceVersion"] = "1.10.0-dance-detected-loop-registered-groove"
    source["actions"].pop("summon_to_pointer", None)
    source["actions"]["dance_rise"] = action("Dance rise", rise_paths, RISE_DURATIONS)
    for phase, _ in PHASE_SHEETS:
        paths = phase_paths[phase]
        source["actions"][phase] = action(
            phase.replace("_", " ").title(),
            paths,
            distribute_duration(800, len(paths)),
        )
    # Compatibility phase aliases remain available to older persisted state,
    # but both Quick Play and Console use the single full-reference clip.
    source["actions"]["dance_tongue_sway"] = action(
        "Dance Tongue Sway", phase_paths["dance_tongue_hold"], distribute_duration(800, len(phase_paths["dance_tongue_hold"]))
    )
    source["actions"]["dance_smug_sway_left"] = action(
        "Dance Smug Sway Left", phase_paths["dance_smug_hold"][:4], distribute_duration(500, 4)
    )
    source["actions"]["dance_smug_sway_right"] = action(
        "Dance Smug Sway Right", phase_paths["dance_smug_hold"][4:], distribute_duration(500, 4)
    )
    source["actions"]["dance_eyes_reset"] = action(
        "Dance Eyes Reset", phase_paths["dance_eye_snap"], distribute_duration(500, 8)
    )
    source["actions"]["dance_reference_clip"] = action(
        "Dance video reference clip", reference_paths, reference_durations
    )
    source["actions"]["dance"] = action(
        "Dance video reference clip", reference_paths, reference_durations
    )
    source["actions"]["dance_restore"] = action("Dance restore", restore_paths, RESTORE_DURATIONS)
    source["capabilities"] = [
        entry for entry in source["capabilities"]
        if entry["id"] not in {"summon_to_pointer", "dance"}
    ]
    source["capabilities"].append({
        "id": "dance",
        "status": "ready",
        "uiBehavior": "show",
        "runtimeBehavior": "animation",
        "reason": "Uses 48 registered whole-cat poses across the detected 10.133-second, 595-presentation-frame source loop with synchronized trimmed audio.",
    })
    (SOURCE_ROOT / "source.json").write_text(json.dumps(source, indent=2) + "\n")

    preview, preview_frame_count = write_preview(reference_paths, reference_durations)
    contact = write_contact_sheet(rise_paths, phase_paths, restore_paths)
    icon = write_icon(phase_paths["dance_tongue_pop"][5])
    report = {
        "schemaVersion": "tokenpet-dance-assets/v4",
        "generationMode": "detected-minimal-loop-registered-whole-cat-audio-synchronized-groove",
        "sourceVideo": (VIDEO_REFERENCE_ROOT / "metadata.json").relative_to(REPO_ROOT).as_posix(),
        "sourceAudio": (VIDEO_REFERENCE_ROOT / "reference-audio.m4a").relative_to(REPO_ROOT).as_posix(),
        "sourceSheets": [
            alpha_report(rise_restore_sheet),
            *[alpha_report(SHEET_ROOT / filename) for _, filename in PHASE_SHEETS],
        ],
        "semanticTimeline": ["dance_rise", "dance_reference_clip", "dance_restore"],
        "referenceSegments": [{"phase": phase, "durationMs": duration} for phase, duration in REFERENCE_SEGMENTS],
        "audioGrooveOnsetsMs": list(AUDIO_GROOVE_ONSETS_MS),
        "referenceDurationMs": REFERENCE_DURATION_MS,
        "sourcePresentationFrames": len(reference_paths),
        "uniquePoseFrames": len(unique_paths),
        "scheduledFrames": len(reference_paths),
        "reviewPreviewFrames": preview_frame_count,
        "registration": {
            "visibleCenterX": VISIBLE_CENTER_X,
            "visibleGroundLineY": GROUND_LINE_Y,
            "frontPawsAndPelvis": "offline-registered",
            "closedMouthMechanics": "15-to-20-percent-head-neck-forward-projection-with-stable-lower-body",
            "tongueOutMechanics": "12-to-15-percent-pelvis-haunch-displacement-with-planted-paws-on-source-audio-onsets",
            "sourceFrameScheduling": "one-manifest-entry-per-true-presentation-frame-in-detected-minimal-loop",
            "runtimeBodyTransform": "forbidden",
            "runtimeWindowMovement": "forbidden",
            "phaseScaleMultipliers": PHASE_SCALE_MULTIPLIERS,
        },
        "outputs": [alpha_report(path) for path in [*rise_paths, *unique_paths, *restore_paths]],
        "qaArtifacts": [preview.relative_to(REPO_ROOT).as_posix(), contact.relative_to(REPO_ROOT).as_posix()],
        "icon": icon.relative_to(REPO_ROOT).as_posix(),
    }
    (SHEET_ROOT / "asset-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"Prepared {len(rise_paths) + len(unique_paths) + len(restore_paths)} Dance frames, {preview}, and {contact}")


if __name__ == "__main__":
    main()
