#!/usr/bin/env python3
from io import BytesIO
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
FRAME_ROOT = ROOT / "assets/source/pet-actors/golden-british/frames"
FRAME_COUNT = 1_192
TEN_MIB = 10 * 1024 * 1024


def png_size(path: Path, side: int) -> int:
    with Image.open(path).convert("RGBA") as image:
        resized = image.resize((side, side), Image.Resampling.LANCZOS)
        output = BytesIO()
        resized.save(output, format="PNG", optimize=True)
        return output.tell()


def main() -> None:
    frames = sorted(FRAME_ROOT.glob("dance_video_*.png"))
    report = {
        "uniqueSourceFrames": len(frames),
        "targetTimelineFrames": FRAME_COUNT,
        "tenMiBAverageBudgetBytes": TEN_MIB // FRAME_COUNT,
        "sizes": {},
    }
    for side in (1024, 512, 384, 256, 192, 128, 96, 64):
        sizes = [png_size(path, side) for path in frames]
        average = round(sum(sizes) / len(sizes))
        report["sizes"][str(side)] = {
            "averagePngBytes": average,
            "projected1192PngBytes": average * FRAME_COUNT,
            "projected1192PngMiB": round(average * FRAME_COUNT / 1024 / 1024, 2),
            "fitsTenMiB": average * FRAME_COUNT <= TEN_MIB,
        }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
