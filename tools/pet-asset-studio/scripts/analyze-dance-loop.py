#!/usr/bin/env python3
"""Measure the smallest stable visual/audio loop in the Dance reference recording.

The phone UI is static, so the visual score removes each pixel's temporal median
before comparing frames.  The audio score uses normalized FFT autocorrelation.
Both measurements are intentionally independent: a publishable loop boundary
must be supported by the cat motion and the soundtrack, not just one of them.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
FFMPEG = ROOT / "node_modules" / "ffmpeg-static" / "ffmpeg"


def decode_video(path: Path, fps: int = 60) -> np.ndarray:
    width = 80
    height = 128
    # The crop contains the whole dancing cat while excluding most controls.
    # Scaling before analysis keeps the measurement deterministic and cheap.
    command = [
        str(FFMPEG),
        "-v",
        "error",
        "-i",
        str(path),
        "-vf",
        f"fps={fps},crop=1050:1900:120:60,scale={width}:{height}:flags=area,format=gray",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "pipe:1",
    ]
    payload = subprocess.check_output(command)
    frame_bytes = width * height
    frame_count = len(payload) // frame_bytes
    return np.frombuffer(payload[: frame_count * frame_bytes], dtype=np.uint8).reshape(frame_count, height, width)


def decode_audio(path: Path, sample_rate: int = 4_000) -> np.ndarray:
    command = [
        str(FFMPEG),
        "-v",
        "error",
        "-i",
        str(path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-f",
        "s16le",
        "pipe:1",
    ]
    payload = subprocess.check_output(command)
    return np.frombuffer(payload, dtype="<i2").astype(np.float64) / 32768.0


def normalized_autocorrelation(signal: np.ndarray) -> np.ndarray:
    centered = signal.astype(np.float64) - float(np.mean(signal))
    size = len(centered)
    fft_size = 1 << (2 * size - 1).bit_length()
    spectrum = np.fft.rfft(centered, fft_size)
    numerator = np.fft.irfft(spectrum * np.conjugate(spectrum), fft_size)[:size]
    squared = centered * centered
    prefix = np.concatenate(([0.0], np.cumsum(squared)))
    lags = np.arange(size)
    left_energy = prefix[size - lags]
    right_energy = prefix[size] - prefix[lags]
    denominator = np.sqrt(np.maximum(left_energy * right_energy, 1e-12))
    return numerator / denominator


def visual_scores(frames: np.ndarray, fps: int, minimum: float, maximum: float) -> list[dict[str, float]]:
    temporal_median = np.median(frames, axis=0)
    centered = frames.astype(np.float32) - temporal_median
    # Motion energy gives a second signal that is insensitive to static phone UI.
    motion = np.mean(np.abs(np.diff(centered, axis=0)), axis=(1, 2))
    motion_corr = normalized_autocorrelation(motion)
    results: list[dict[str, float]] = []
    for lag in range(round(minimum * fps), min(round(maximum * fps), len(frames) - 2) + 1):
        left = centered[:-lag].reshape(len(centered) - lag, -1)
        right = centered[lag:].reshape(len(centered) - lag, -1)
        numerator = np.sum(left * right, axis=1)
        denominator = np.sqrt(np.sum(left * left, axis=1) * np.sum(right * right, axis=1))
        frame_corr = float(np.mean(numerator / np.maximum(denominator, 1e-6)))
        mae = float(np.mean(np.abs(left - right)) / 255.0)
        motion_value = float(motion_corr[min(lag, len(motion_corr) - 1)])
        results.append(
            {
                "seconds": lag / fps,
                "frameCorrelation": frame_corr,
                "motionCorrelation": motion_value,
                "normalizedMae": mae,
                "score": frame_corr * 0.72 + motion_value * 0.28 - mae * 0.2,
            }
        )
    return results


def local_maxima(rows: list[dict[str, float]], key: str, count: int = 8) -> list[dict[str, float]]:
    candidates = []
    for index in range(1, len(rows) - 1):
        value = rows[index][key]
        if value >= rows[index - 1][key] and value >= rows[index + 1][key]:
            candidates.append(rows[index])
    return sorted(candidates, key=lambda row: row[key], reverse=True)[:count]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("--minimum", type=float, default=5.0)
    parser.add_argument("--maximum", type=float, default=15.0)
    parser.add_argument("--json", dest="json_path", type=Path)
    args = parser.parse_args()

    frames = decode_video(args.video)
    visual = visual_scores(frames, 60, args.minimum, args.maximum)
    audio = decode_audio(args.video)
    audio_corr = normalized_autocorrelation(audio)
    audio_rows = [
        {"seconds": lag / 4_000, "correlation": float(audio_corr[lag])}
        for lag in range(round(args.minimum * 4_000), min(round(args.maximum * 4_000), len(audio_corr) - 1) + 1)
    ]
    visual_top = local_maxima(visual, "score")
    audio_top = local_maxima(audio_rows, "correlation")

    # Rank visual candidates using the strongest audio value within one video frame.
    for row in visual_top:
        center = round(row["seconds"] * 4_000)
        radius = round(4_000 / 60)
        row["audioCorrelation"] = float(np.max(audio_corr[max(0, center - radius) : center + radius + 1]))
        row["combinedScore"] = row["score"] * 0.62 + row["audioCorrelation"] * 0.38
    visual_top.sort(key=lambda row: row["combinedScore"], reverse=True)

    result = {
        "source": str(args.video),
        "decodedVideoFrames": len(frames),
        "decodedAudioSamples": len(audio),
        "visualCandidates": visual_top,
        "audioCandidates": audio_top,
        "selectedPeriodSeconds": visual_top[0]["seconds"],
    }
    output = json.dumps(result, indent=2)
    print(output)
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(f"{output}\n", encoding="utf-8")


if __name__ == "__main__":
    main()
