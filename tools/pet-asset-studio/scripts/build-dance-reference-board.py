#!/usr/bin/env python3
"""Build compact, timestamped pose boards from the user-provided Dance video.

The video is already decoded frame-for-frame by extract-video-frames.swift.
This helper only selects the nearest true presentation timestamp, crops away
the screen-recording chrome, and lays the source poses out for visual QA and
offline asset authoring. It never modifies a source frame.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
REFERENCE = ROOT / "assets/source/pet-actors/golden-british/story-actions/dance-video-reference-v2"
FRAMES = REFERENCE / "frames"
ACTOR_ROOT = ROOT / "apps/desktop/public/pet-actors/golden-british"

# One complete source motif plus the final variation. The face crop retains
# eyes, mouth, cheeks, shoulders, and planted chest while removing the social
# UI at the sides and most of the comment field above the head.
BOARDS = {
    "dance-source-motif-board.png": [0.000, 0.400, 0.800, 1.100, 1.550, 2.350, 2.700, 3.050],
    "dance-source-final-beat-board.png": [17.800, 17.950, 18.150, 18.350, 18.750, 19.150, 19.420, 20.350],
    "dance-source-closed-mouth-head-push-board.png": [2.750, 2.967, 3.200, 3.467, 6.735, 7.068, 7.368, 7.785],
    "dance-source-tongue-body-groove-board.png": [1.050, 1.333, 1.533, 1.900, 5.102, 5.452, 5.902, 6.135],
}


def nearest_frame(timestamps: list[float], seconds: float) -> dict[str, object]:
    zero_index = min(range(len(timestamps)), key=lambda index: abs(float(timestamps[index]) - seconds))
    frame_index = zero_index + 1
    return {
        "index": frame_index,
        "timestampSeconds": timestamps[zero_index],
        "file": f"frame_{frame_index:06d}.png",
    }


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    result = Image.new("RGB", size, "#15100d")
    result.paste(copy, ((size[0] - copy.width) // 2, (size[1] - copy.height) // 2))
    return result


def composite_actor(path: Path, size: tuple[int, int]) -> Image.Image:
    with Image.open(path) as source:
        actor = source.convert("RGBA")
    actor.thumbnail(size, Image.Resampling.LANCZOS)
    result = Image.new("RGBA", size, "#f1f5f9")
    result.alpha_composite(actor, ((size[0] - actor.width) // 2, (size[1] - actor.height) // 2))
    return result.convert("RGB")


def runtime_frame_at(frames: list[dict[str, object]], milliseconds: int) -> dict[str, object]:
    cursor = 0
    for frame in frames:
        cursor += int(frame["durationMs"])
        if milliseconds < cursor:
            return frame
    return frames[-1]


def write_comparison(
    filename: str,
    requested_times: list[float],
    timestamps: list[float],
    runtime_frames: list[dict[str, object]],
) -> None:
    cell_width, cell_height = 360, 430
    caption_height = 32
    board = Image.new("RGB", (cell_width * 4, (cell_height + caption_height) * 4), "#111827")
    draw = ImageDraw.Draw(board)
    source_crop = (115, 455, 1175, 1715)
    for index, requested_time in enumerate(requested_times):
        column = index % 4
        pair = index // 4
        source_row = pair * 2
        runtime_row = source_row + 1

        source_entry = nearest_frame(timestamps, requested_time)
        with Image.open(FRAMES / str(source_entry["file"])) as source:
            source_cell = contain(source.convert("RGB").crop(source_crop), (cell_width, cell_height))
        runtime_entry = runtime_frame_at(runtime_frames, round(requested_time * 1_000))
        runtime_cell = composite_actor(ACTOR_ROOT / str(runtime_entry["src"]), (cell_width, cell_height))

        for row, label, cell in (
            (source_row, f"SOURCE {requested_time:05.3f}s", source_cell),
            (runtime_row, f"TOKENPET {requested_time:05.3f}s · {runtime_entry['id']}", runtime_cell),
        ):
            x = column * cell_width
            y = row * (cell_height + caption_height)
            board.paste(cell, (x, y))
            draw.rectangle((x, y + cell_height, x + cell_width, y + cell_height + caption_height), fill="#111827")
            draw.text((x + 9, y + cell_height + 9), label, fill="#f8fafc")
    board.save(REFERENCE / filename, "PNG", optimize=True)


def main() -> None:
    metadata = json.loads((REFERENCE / "metadata.json").read_text())
    timestamps = metadata["timestampsSeconds"]
    manifest = json.loads((ACTOR_ROOT / "actor.json").read_text())
    runtime_frames = manifest["animations"]["action.dance_reference_clip"]["frames"]
    font = ImageFont.load_default()
    cell_width, cell_height = 360, 520
    caption_height = 34
    # Crop a stable central head-and-chest region from the 1290x2796 capture.
    source_crop = (115, 455, 1175, 1715)

    selected_report: dict[str, list[dict[str, object]]] = {}
    for filename, requested_times in BOARDS.items():
        board = Image.new("RGB", (cell_width * 4, (cell_height + caption_height) * 2), "#15100d")
        draw = ImageDraw.Draw(board)
        selected_report[filename] = []
        for index, requested_time in enumerate(requested_times):
            entry = nearest_frame(timestamps, requested_time)
            path = FRAMES / str(entry["file"])
            with Image.open(path) as source:
                crop = source.convert("RGB").crop(source_crop)
            rendered = contain(crop, (cell_width, cell_height))
            column, row = index % 4, index // 4
            x, y = column * cell_width, row * (cell_height + caption_height)
            board.paste(rendered, (x, y))
            label = f"{float(entry['timestampSeconds']):05.3f}s  frame {int(entry['index']):04d}"
            draw.rectangle((x, y + cell_height, x + cell_width, y + cell_height + caption_height), fill="#15100d")
            draw.text((x + 10, y + cell_height + 10), label, fill="#f8fafc", font=font)
            selected_report[filename].append({
                "requestedSeconds": requested_time,
                "actualSeconds": entry["timestampSeconds"],
                "frame": entry["file"],
            })
        board.save(REFERENCE / filename, "PNG", optimize=True)

    (REFERENCE / "reference-board-selection.json").write_text(json.dumps(selected_report, indent=2) + "\n")
    write_comparison("dance-source-runtime-motif-comparison.png", BOARDS["dance-source-motif-board.png"], timestamps, runtime_frames)
    write_comparison("dance-source-runtime-final-comparison.png", BOARDS["dance-source-final-beat-board.png"], timestamps, runtime_frames)
    write_comparison(
        "dance-source-runtime-head-push-comparison.png",
        BOARDS["dance-source-closed-mouth-head-push-board.png"],
        timestamps,
        runtime_frames,
    )
    write_comparison(
        "dance-source-runtime-body-groove-comparison.png",
        BOARDS["dance-source-tongue-body-groove-board.png"],
        timestamps,
        runtime_frames,
    )
    print(f"Wrote {len(BOARDS)} Dance source-pose boards to {REFERENCE}")


if __name__ == "__main__":
    main()
