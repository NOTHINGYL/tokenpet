#!/usr/bin/env python3
"""Create exhaustive frame sheets plus motion/audio timing evidence for Dance."""

from __future__ import annotations

import argparse
import json
import math
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


FACE_CROP = (55, 210, 1235, 1690)
MOTION_CROP = (190, 360, 1100, 1450)


def resize_cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def frame_sheet(
    frame_paths: list[Path],
    timestamps: list[float],
    output: Path,
    first_index: int,
) -> None:
    columns = 10
    rows = 6
    cell_w = 142
    cell_h = 186
    label_h = 18
    sheet = Image.new("RGB", (columns * cell_w, rows * (cell_h + label_h)), "#101114")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for offset, frame_path in enumerate(frame_paths):
        frame_index = first_index + offset
        source = Image.open(frame_path).convert("RGB").crop(FACE_CROP)
        thumb = resize_cover(source, (cell_w, cell_h))
        x = offset % columns * cell_w
        y = offset // columns * (cell_h + label_h)
        sheet.paste(thumb, (x, y))
        draw.rectangle((x, y + cell_h, x + cell_w, y + cell_h + label_h), fill="#101114")
        draw.text(
            (x + 4, y + cell_h + 3),
            f"{frame_index + 1:04d}  {timestamps[frame_index]:06.3f}s",
            fill="#ffffff",
            font=font,
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def motion_scores(frame_paths: list[Path]) -> list[float]:
    scores = [0.0]
    previous: np.ndarray | None = None
    for frame_path in frame_paths:
        image = Image.open(frame_path).convert("L").crop(MOTION_CROP).resize((91, 109), Image.Resampling.BILINEAR)
        current = np.asarray(image, dtype=np.float32)
        if previous is not None:
            scores.append(float(np.mean(np.abs(current - previous))))
        previous = current
    return scores[: len(frame_paths)]


def local_peaks(values: np.ndarray, min_distance: int, threshold: float) -> list[int]:
    candidates: list[tuple[float, int]] = []
    for index in range(1, len(values) - 1):
        if values[index] >= threshold and values[index] >= values[index - 1] and values[index] > values[index + 1]:
            candidates.append((float(values[index]), index))
    selected: list[int] = []
    for _, index in sorted(candidates, reverse=True):
        if all(abs(index - prior) >= min_distance for prior in selected):
            selected.append(index)
    return sorted(selected)


def read_waveform(path: Path) -> tuple[int, np.ndarray]:
    with wave.open(str(path), "rb") as source:
        rate = source.getframerate()
        channels = source.getnchannels()
        width = source.getsampwidth()
        frames = source.readframes(source.getnframes())
    if width != 2:
        raise ValueError(f"expected 16-bit PCM, found {width * 8}-bit")
    audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return rate, audio


def audio_analysis(path: Path) -> dict[str, object]:
    rate, audio = read_waveform(path)
    hop = max(1, round(rate * 0.01))
    usable = len(audio) // hop * hop
    windows = audio[:usable].reshape(-1, hop)
    rms = np.sqrt(np.mean(np.square(windows), axis=1) + 1e-12)
    onset = np.maximum(0.0, np.diff(rms, prepend=rms[0]))
    smooth = np.convolve(onset, np.ones(5, dtype=np.float32) / 5, mode="same")
    threshold = float(np.quantile(smooth, 0.82))
    peak_indices = local_peaks(smooth, min_distance=18, threshold=threshold)
    peak_times = [round(index * hop / rate, 4) for index in peak_indices]

    centered = smooth - smooth.mean()
    autocorrelation = np.correlate(centered, centered, mode="full")[len(centered) - 1 :]
    min_lag = round(60 / 220 / 0.01)
    max_lag = round(60 / 55 / 0.01)
    lag = int(np.argmax(autocorrelation[min_lag:max_lag]) + min_lag)
    estimated_bpm = 60 / (lag * 0.01)
    return {
        "sampleRate": rate,
        "sampleCount": len(audio),
        "durationSeconds": len(audio) / rate,
        "rmsPeak": float(rms.max()),
        "estimatedBpm": estimated_bpm,
        "onsetPeakTimesSeconds": peak_times,
        "rms": rms.tolist(),
        "onset": smooth.tolist(),
        "hopSeconds": hop / rate,
    }


def draw_timeline(
    timestamps: list[float],
    motion: list[float],
    audio: dict[str, object],
    output: Path,
) -> None:
    width = 2048
    height = 520
    margin = 64
    duration = max(timestamps[-1], float(audio["durationSeconds"]))
    canvas = Image.new("RGB", (width, height), "#111318")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    chart_w = width - margin * 2
    motion_arr = np.asarray(motion, dtype=np.float32)
    motion_norm = motion_arr / max(1e-6, float(np.quantile(motion_arr, 0.99)))
    onset = np.asarray(audio["onset"], dtype=np.float32)
    onset_norm = onset / max(1e-6, float(np.quantile(onset, 0.99)))

    def x_for(time_seconds: float) -> float:
        return margin + time_seconds / duration * chart_w

    draw.text((margin, 18), "Dance reference: per-frame motion and extracted-audio onset timeline", fill="#ffffff", font=font)
    draw.text((margin, 42), f"duration {duration:.3f}s · {len(timestamps)} video frames · audio BPM estimate {float(audio['estimatedBpm']):.2f}", fill="#aab4c5", font=font)
    motion_base = 230
    audio_base = 438
    draw.line((margin, motion_base, width - margin, motion_base), fill="#3b4351", width=1)
    draw.line((margin, audio_base, width - margin, audio_base), fill="#3b4351", width=1)
    motion_points = [(x_for(time), motion_base - min(1.25, float(value)) * 130) for time, value in zip(timestamps, motion_norm)]
    onset_points = [
        (x_for(index * float(audio["hopSeconds"])), audio_base - min(1.25, float(value)) * 130)
        for index, value in enumerate(onset_norm)
    ]
    draw.line(motion_points, fill="#46c98a", width=2)
    draw.line(onset_points, fill="#f2a93b", width=2)
    draw.text((margin, 82), "VIDEO MOTION", fill="#46c98a", font=font)
    draw.text((margin, 290), "AUDIO ONSETS", fill="#f2a93b", font=font)
    for second in range(math.ceil(duration) + 1):
        x = x_for(second)
        draw.line((x, 68, x, height - 34), fill="#242a33", width=1)
        draw.text((x + 2, height - 26), f"{second}s", fill="#7d8798", font=font)
    for peak in audio["onsetPeakTimesSeconds"]:
        x = x_for(float(peak))
        draw.line((x, 304, x, audio_base + 4), fill="#f2a93b", width=1)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("reference_dir", type=Path)
    args = parser.parse_args()
    root = args.reference_dir
    metadata = json.loads((root / "metadata.json").read_text())
    timestamps = [float(value) for value in metadata["timestampsSeconds"]]
    frame_paths = sorted((root / "frames").glob("frame_*.png"))
    if len(frame_paths) != len(timestamps):
        raise ValueError(f"frame/timestamp mismatch: {len(frame_paths)} != {len(timestamps)}")

    sheets_dir = root / "frame-sheets"
    for start in range(0, len(frame_paths), 60):
        frame_sheet(
            frame_paths[start : start + 60],
            timestamps,
            sheets_dir / f"frames_{start + 1:04d}_{min(len(frame_paths), start + 60):04d}.png",
            start,
        )

    motion = motion_scores(frame_paths)
    audio = audio_analysis(root / "reference-audio.wav")
    motion_arr = np.asarray(motion, dtype=np.float32)
    motion_threshold = float(np.quantile(motion_arr, 0.82))
    motion_peak_indices = local_peaks(motion_arr, min_distance=12, threshold=motion_threshold)
    draw_timeline(timestamps, motion, audio, root / "motion-audio-timeline.png")
    report = {
        "video": {key: value for key, value in metadata.items() if key != "timestampsSeconds"},
        "frameSheets": len(list(sheets_dir.glob("*.png"))),
        "faceCrop": FACE_CROP,
        "motionCrop": MOTION_CROP,
        "motionPeakFrames": [index + 1 for index in motion_peak_indices],
        "motionPeakTimesSeconds": [round(timestamps[index], 4) for index in motion_peak_indices],
        "audio": {key: value for key, value in audio.items() if key not in {"rms", "onset"}},
    }
    (root / "analysis.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(
        f"analyzed {len(frame_paths)} frames into {report['frameSheets']} exhaustive sheets; "
        f"{len(motion_peak_indices)} motion peaks; {len(audio['onsetPeakTimesSeconds'])} audio onsets"
    )


if __name__ == "__main__":
    main()
