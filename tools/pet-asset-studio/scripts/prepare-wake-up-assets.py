#!/usr/bin/env python3
"""Prepare the dedicated Golden British Wake Up offline animation pack.

The three imagegen sources are coherent 4x2 sheets on a magenta field. This
script only performs deterministic production work: grid extraction, chroma
cleanup, constant-scale registration, hashes, source action registration, and
visual QA artifacts. Runtime code selects complete authored frames and never
scales or warps the cat's anatomy.
"""

from __future__ import annotations

import hashlib
import json
import math
import wave
from array import array
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = REPO_ROOT / "assets/source/pet-actors/golden-british"
SHEET_ROOT = SOURCE_ROOT / "story-actions/wake-up-v2"
FRAME_ROOT = SOURCE_ROOT / "frames"
PUBLIC_AUDIO_ROOT = REPO_ROOT / "apps/desktop/public/pet-audio"

ARTBOARD_SIZE = 1024
VISIBLE_CENTER_X = 512
GROUND_LINE_Y = 818
SOURCE_SCALE = 1.82

PHASES = {
    "wake_up_blink": {
        "label": "Wake Up sleepy blink",
        "sheet": "wake-blink-roll-sheet.png",
        "cell_range": range(0, 4),
        "durations": [140, 140, 140, 180],
    },
    "wake_up_roll": {
        "label": "Wake Up side roll",
        "sheet": "wake-blink-roll-sheet.png",
        "cell_range": range(4, 8),
        "durations": [160, 170, 180, 190],
    },
    "wake_up_stretch": {
        "label": "Wake Up long full-body stretch",
        "sheet": "long-stretch-sheet.png",
        "cell_range": range(0, 8),
        "durations": [280, 320, 400, 500, 500, 400, 300, 200],
    },
    "wake_up_gather": {
        "label": "Wake Up gather and restore",
        "sheet": "gather-restore-sheet.png",
        "cell_range": range(0, 8),
        "durations": [80, 90, 90, 100, 100, 110, 110, 120],
    },
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


def remove_generated_background(cell: Image.Image) -> Image.Image:
    """Remove the generated magenta field and white grid gutters.

    The hard offline matte is intentionally conservative around the kitten's
    pink ears and nose. It retains source RGB byte-for-byte wherever alpha is
    visible and clears small detached background remnants afterward.
    """

    rgb = np.asarray(cell.convert("RGB"), dtype=np.uint8)
    red = rgb[:, :, 0].astype(np.int16)
    green = rgb[:, :, 1].astype(np.int16)
    blue = rgb[:, :, 2].astype(np.int16)
    magenta_seed = (red > 175) & (blue > 135) & (green < 145) & ((red - green) > 70) & ((blue - green) > 45)
    if not np.any(magenta_seed):
        raise ValueError("Wake Up source cell does not contain the required magenta chroma field")
    key = np.median(rgb[magenta_seed], axis=0).astype(np.int16)
    key_distance = np.max(np.abs(rgb.astype(np.int16) - key), axis=2)
    # Include darker generated magenta falloff around the kitten/shadow while
    # staying well clear of the warm orange fur and pink nose/inner ears.
    magenta = key_distance <= 120
    white = (red > 235) & (green > 235) & (blue > 235) & ((np.maximum.reduce([red, green, blue]) - np.minimum.reduce([red, green, blue])) < 18)
    alpha = np.where(magenta | white, 0, 255).astype(np.uint8)
    # Imagegen's sheet divider is a narrow off-white antialiased rule. It is
    # authoring chrome, never subject matter, and always lives at cell edges.
    gutter = max(8, round(min(cell.size) * 0.03))
    alpha[:gutter, :] = 0
    alpha[-gutter:, :] = 0
    alpha[:, :gutter] = 0
    alpha[:, -gutter:] = 0

    # Generated chroma sheets can contain a few isolated non-magenta pixels.
    # Keep only components large enough to be cat anatomy or its local shadow.
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


def register_frame(cell: Image.Image) -> Image.Image:
    transparent = remove_generated_background(cell)
    bounds = transparent.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Wake Up source cell has no visible kitten pixels")
    subject = transparent.crop(bounds)
    size = (max(1, round(subject.width * SOURCE_SCALE)), max(1, round(subject.height * SOURCE_SCALE)))
    if size[0] > 900 or size[1] > 700:
        raise ValueError(f"Wake Up fixed-scale subject exceeds approved artboard envelope: {size}")
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    visible = subject.getchannel("A").getbbox()
    if visible is None:
        raise ValueError("Wake Up source cell became empty after registration")
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


def authored_action(label: str, paths: list[Path], durations: list[int], *, stable: bool = False) -> dict[str, object]:
    action: dict[str, object] = {
        "label": label,
        "kind": "transition",
        "mood": "focused",
        "sourceFrames": [source_frame(path, duration) for path, duration in zip(paths, durations, strict=True)],
        "fps": 10,
        "loop": False,
        "priority": 100,
    }
    if stable:
        action.update({"cooldownMs": 800, "reducedMotionFallback": "idle_breathe"})
    return action


def checkerboard(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size, "#f8fafc")
    draw = ImageDraw.Draw(image)
    tile = 28
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill="#e2e8f0")
    return image


def write_preview(frames: list[Path], durations: list[int]) -> Path:
    rendered: list[Image.Image] = []
    background = checkerboard((512, 512)).convert("RGBA")
    for path in frames:
        with Image.open(path) as source:
            actor = source.convert("RGBA").resize((512, 512), Image.Resampling.LANCZOS)
        composed = background.copy()
        composed.alpha_composite(actor)
        rendered.append(composed.convert("P", palette=Image.Palette.ADAPTIVE))
    output = SHEET_ROOT / "wake-up-preview.gif"
    rendered[0].save(output, save_all=True, append_images=rendered[1:], duration=durations, loop=0, disposal=2)
    return output


def write_contact_sheet(frames_by_phase: dict[str, list[Path]]) -> Path:
    cell = 220
    columns = 8
    margin = 24
    rows = sum(math.ceil(len(paths) / columns) for paths in frames_by_phase.values())
    contact = checkerboard((margin * 2 + cell * columns, margin * 2 + cell * rows)).convert("RGBA")
    draw = ImageDraw.Draw(contact)
    row = 0
    for phase, paths in frames_by_phase.items():
        for index, path in enumerate(paths):
            with Image.open(path) as source:
                preview = source.convert("RGBA").resize((cell, cell), Image.Resampling.LANCZOS)
            x = margin + (index % columns) * cell
            y = margin + (row + index // columns) * cell
            contact.alpha_composite(preview, (x, y))
            draw.text((x + 7, y + 7), f"{phase.removeprefix('wake_up_')} {index + 1}", fill="#0f172a")
        row += math.ceil(len(paths) / columns)
    output = SHEET_ROOT / "wake-up-contact-sheet.png"
    contact.convert("RGB").save(output, "PNG", optimize=True)
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


def prepare_meows() -> list[Path]:
    """Write three short deterministic local meow cues for timeline keyframes."""

    PUBLIC_AUDIO_ROOT.mkdir(parents=True, exist_ok=True)
    profiles = {
        "soft": (520.0, 315.0, 0.42, 0.48),
        "cozy": (590.0, 350.0, 0.48, 0.56),
        "playful": (700.0, 410.0, 0.38, 0.62),
    }
    sample_rate = 22_050
    outputs: list[Path] = []
    for voice, (start_hz, end_hz, duration, amplitude) in profiles.items():
        samples = array("h")
        count = round(sample_rate * duration)
        phase = 0.0
        for index in range(count):
            time = index / sample_rate
            progress = index / max(1, count - 1)
            glide = start_hz + (end_hz - start_hz) * (progress ** 0.72)
            frequency = glide * (1 + 0.035 * math.sin(2 * math.pi * 17 * time))
            phase += 2 * math.pi * frequency / sample_rate
            attack = min(1.0, progress / 0.09)
            release = min(1.0, (1 - progress) / 0.22)
            envelope = (attack * release) ** 1.35
            tone = math.sin(phase) + 0.32 * math.sin(phase * 2.01) + 0.12 * math.sin(phase * 3.02)
            samples.append(round(max(-1, min(1, tone * amplitude * envelope / 1.44)) * 32767))
        output = PUBLIC_AUDIO_ROOT / f"wake-meow-{voice}.wav"
        with wave.open(str(output), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(samples.tobytes())
        outputs.append(output)
    return outputs


def main() -> None:
    FRAME_ROOT.mkdir(parents=True, exist_ok=True)
    cells_by_sheet: dict[str, list[Image.Image]] = {}
    frames_by_phase: dict[str, list[Path]] = {}
    durations_by_phase: dict[str, list[int]] = {}
    actions: dict[str, dict[str, object]] = {}

    for phase, config in PHASES.items():
        sheet_name = str(config["sheet"])
        if sheet_name not in cells_by_sheet:
            with Image.open(SHEET_ROOT / sheet_name) as source:
                cells_by_sheet[sheet_name] = crop_cells(source.convert("RGB"))
        phase_cells = [cells_by_sheet[sheet_name][index] for index in config["cell_range"]]
        paths: list[Path] = []
        for index, cell in enumerate(phase_cells, 1):
            output = FRAME_ROOT / f"{phase}_{index:02d}.png"
            register_frame(cell).save(output, "PNG", optimize=True)
            paths.append(output)
        durations = list(config["durations"])
        frames_by_phase[phase] = paths
        durations_by_phase[phase] = durations
        actions[phase] = authored_action(str(config["label"]), paths, durations)

    ordered_frames = [path for phase in PHASES for path in frames_by_phase[phase]]
    ordered_durations = [duration for phase in PHASES for duration in durations_by_phase[phase]]
    if sum(ordered_durations) != 5_000:
        raise ValueError(f"Wake Up authored timeline must total exactly 5000ms, got {sum(ordered_durations)}")
    actions["wake_up"] = authored_action(
        "Wake Up dedicated five-second sequence",
        ordered_frames,
        ordered_durations,
        stable=True,
    )

    source_path = SOURCE_ROOT / "source.json"
    source = json.loads(source_path.read_text(encoding="utf-8"))
    for action_id, action in actions.items():
        source["actions"][action_id] = action
    source_path.write_text(json.dumps(source, indent=2) + "\n", encoding="utf-8")

    contact = write_contact_sheet(frames_by_phase)
    preview = write_preview(ordered_frames, ordered_durations)
    meows = prepare_meows()
    report = {
        "schemaVersion": "tokenpet-wake-up-assets/v2",
        "generationMode": "OpenAI built-in imagegen; offline whole-frame raster authoring",
        "promptSet": [
            "wake/blink then physically coherent side roll, 4x2 magenta sheet",
            "real-cat long side-lying full-body stretch, 4x2 magenta sheet",
            "soft gather, roll upright, and awake restore, 4x2 magenta sheet",
        ],
        "frameCount": len(ordered_frames),
        "durationMs": sum(ordered_durations),
        "phaseDurationsMs": {phase: sum(durations_by_phase[phase]) for phase in PHASES},
        "registration": {
            "artboard": [ARTBOARD_SIZE, ARTBOARD_SIZE],
            "visibleCenterX": VISIBLE_CENTER_X,
            "visibleGroundLineY": GROUND_LINE_Y,
            "constantSourceScale": SOURCE_SCALE,
            "runtimeBodyTransform": "forbidden",
        },
        "audio": [
            {
                "path": path.relative_to(REPO_ROOT).as_posix(),
                "sha256": sha256(path),
                "kind": "preloaded-local-wav",
            }
            for path in meows
        ],
        "outputs": [alpha_report(path) for path in [*ordered_frames, contact, preview]],
    }
    (SHEET_ROOT / "asset-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(ordered_frames)} Wake Up frames across {len(PHASES)} dedicated phases ({sum(ordered_durations)}ms)")


if __name__ == "__main__":
    main()
