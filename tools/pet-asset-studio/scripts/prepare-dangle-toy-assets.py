#!/usr/bin/env python3
"""Prepare Dangle Toy v4 offline sheets into deterministic runtime assets.

Runtime code swaps approved whole-cat rasters and moves the native window. It
never bends a flat cat image, redraws limbs, or bakes prop physics into anatomy.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = REPO_ROOT / "assets/source/pet-actors/golden-british"
SHEET_ROOT = SOURCE_ROOT / "story-actions/dangle-toy-v2"
FRAME_ROOT = SOURCE_ROOT / "frames"
PUBLIC_PROP_ROOT = REPO_ROOT / "apps/desktop/public/pet-actors/golden-british/props"

ARTBOARD_SIZE = 1024
GROUND_LINE_Y = 818
MAX_SUBJECT_WIDTH = 860
MAX_SUBJECT_HEIGHT = 680

ATTENTION_NAMES = (
    "dangle_alert_01",
    "dangle_alert_02",
    "dangle_stalk_01",
    "dangle_stalk_02",
    "dangle_crouch_01",
    "dangle_crouch_02",
    "dangle_settle_01",
    "dangle_settle_02",
)
POUNCE_PLAY_NAMES = (
    "dangle_pounce_01",
    "dangle_pounce_02",
    "dangle_pounce_03",
    "dangle_pounce_04",
    "dangle_play_01",
    "dangle_play_02",
    "dangle_play_03",
    "dangle_play_04",
)
PURSUIT_NAMES = tuple(f"dangle_pursuit_run_{index:02d}" for index in range(1, 9))
RETURN_NAMES = tuple(f"dangle_return_walk_{index:02d}" for index in range(1, 9))
POUNCE_PLAY_FRONT_NAMES = (
    *(f"dangle_pounce_front_{index:02d}" for index in range(1, 5)),
    *(f"dangle_play_front_{index:02d}" for index in range(1, 5)),
)
POUNCE_PLAY_BACK_NAMES = (
    *(f"dangle_pounce_back_{index:02d}" for index in range(1, 5)),
    *(f"dangle_play_back_{index:02d}" for index in range(1, 5)),
)
PURSUIT_FRONT_NAMES = tuple(f"dangle_pursuit_run_front_{index:02d}" for index in range(1, 9))
PURSUIT_BACK_NAMES = tuple(f"dangle_pursuit_run_back_{index:02d}" for index in range(1, 9))
RETURN_FRONT_NAMES = tuple(f"dangle_return_walk_front_{index:02d}" for index in range(1, 9))
RETURN_BACK_NAMES = tuple(f"dangle_return_walk_back_{index:02d}" for index in range(1, 9))
POUNCE_PLAY_FRONT_RIGHT_NAMES = (
    *(f"dangle_pounce_front_right_{index:02d}" for index in range(1, 5)),
    *(f"dangle_play_front_right_{index:02d}" for index in range(1, 5)),
)
POUNCE_PLAY_FRONT_LEFT_NAMES = (
    *(f"dangle_pounce_front_left_{index:02d}" for index in range(1, 5)),
    *(f"dangle_play_front_left_{index:02d}" for index in range(1, 5)),
)
POUNCE_PLAY_BACK_RIGHT_NAMES = (
    *(f"dangle_pounce_back_right_{index:02d}" for index in range(1, 5)),
    *(f"dangle_play_back_right_{index:02d}" for index in range(1, 5)),
)
POUNCE_PLAY_BACK_LEFT_NAMES = (
    *(f"dangle_pounce_back_left_{index:02d}" for index in range(1, 5)),
    *(f"dangle_play_back_left_{index:02d}" for index in range(1, 5)),
)
PURSUIT_FRONT_RIGHT_NAMES = tuple(f"dangle_pursuit_run_front_right_{index:02d}" for index in range(1, 9))
PURSUIT_FRONT_LEFT_NAMES = tuple(f"dangle_pursuit_run_front_left_{index:02d}" for index in range(1, 9))
PURSUIT_BACK_RIGHT_NAMES = tuple(f"dangle_pursuit_run_back_right_{index:02d}" for index in range(1, 9))
PURSUIT_BACK_LEFT_NAMES = tuple(f"dangle_pursuit_run_back_left_{index:02d}" for index in range(1, 9))
RETURN_FRONT_RIGHT_NAMES = tuple(f"dangle_return_walk_front_right_{index:02d}" for index in range(1, 9))
RETURN_FRONT_LEFT_NAMES = tuple(f"dangle_return_walk_front_left_{index:02d}" for index in range(1, 9))
RETURN_BACK_RIGHT_NAMES = tuple(f"dangle_return_walk_back_right_{index:02d}" for index in range(1, 9))
RETURN_BACK_LEFT_NAMES = tuple(f"dangle_return_walk_back_left_{index:02d}" for index in range(1, 9))
PROP_NAMES = (
    "dangle-wand",
    "dangle-wand-flex",
    "dangle-fish-mint",
    "dangle-fish-blue",
    "dangle-fish-feather",
    "dangle-connector",
    "dangle-catch-spark",
    "dangle-trail",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def restore_prop_color_from_matte(source: Image.Image, matte: Image.Image) -> Image.Image:
    """Recover authored RGB while retaining the approved chroma alpha matte.

    The shared chroma helper produces the clean topology/matte used by all
    sheets. Its generic magenta despill desaturates the intentional purple fish,
    so only that sheet recovers RGB by inverse-compositing boundary pixels.
    """

    rgb = source.convert("RGB")
    alpha = matte.convert("RGBA").getchannel("A")
    output = Image.new("RGBA", rgb.size, (0, 0, 0, 0))
    source_pixels = rgb.load()
    alpha_pixels = alpha.load()
    output_pixels = output.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            alpha_byte = alpha_pixels[x, y]
            if alpha_byte == 0:
                continue
            red, green, blue = source_pixels[x, y]
            output_pixels[x, y] = (
                max(0, min(255, red)),
                max(0, min(255, green)),
                max(0, min(255, blue)),
                alpha_byte,
            )
    return output


def clear_low_alpha_noise(image: Image.Image, threshold: int = 32) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: 0 if value < threshold else value)
    rgba.putalpha(alpha)
    return rgba


def alpha_components(image: Image.Image, threshold: int = 32) -> list[list[tuple[int, int]]]:
    """Return 8-connected visible components in an RGBA image.

    Image-generation contact sheets can leave a few opaque pixels from the
    neighboring cell at an exact crop edge. Props 1–6 are each one coherent
    physical object, so retaining their largest connected component removes
    that cell bleed without repainting or changing the approved subject.
    """

    alpha = image.convert("RGBA").getchannel("A")
    pixels = alpha.load()
    width, height = alpha.size
    visited = bytearray(width * height)
    components: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            offset = y * width + x
            if visited[offset] or pixels[x, y] <= threshold:
                continue
            visited[offset] = 1
            queue = deque([(x, y)])
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for neighbor_y in range(max(0, current_y - 1), min(height, current_y + 2)):
                    for neighbor_x in range(max(0, current_x - 1), min(width, current_x + 2)):
                        neighbor_offset = neighbor_y * width + neighbor_x
                        if visited[neighbor_offset] or pixels[neighbor_x, neighbor_y] <= threshold:
                            continue
                        visited[neighbor_offset] = 1
                        queue.append((neighbor_x, neighbor_y))
            components.append(component)
    return components


def keep_largest_alpha_component(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    components = alpha_components(rgba)
    if not components:
        raise ValueError("Dangle Toy prop cell has no visible component")
    largest = max(components, key=len)
    source_alpha = rgba.getchannel("A").load()
    clean_alpha = Image.new("L", rgba.size, 0)
    clean_pixels = clean_alpha.load()
    for x, y in largest:
        clean_pixels[x, y] = source_alpha[x, y]
    rgba.putalpha(clean_alpha)
    return rgba


def prepare_transparent_sheets() -> dict[str, Path]:
    names = (
        "attention-stalk-sheet",
        "pounce-play-sheet",
        "pounce-play-front-sheet",
        "pounce-play-back-sheet",
        "pounce-play-front-right-sheet",
        "pounce-play-back-right-sheet",
        "pursuit-run-sheet",
        "pursuit-run-front-sheet",
        "pursuit-run-back-sheet",
        "pursuit-run-front-right-sheet",
        "pursuit-run-back-right-sheet",
        "return-walk-sheet",
        "return-walk-front-sheet",
        "return-walk-back-sheet",
        "return-walk-front-right-sheet",
        "return-walk-back-right-sheet",
        "props-sheet",
    )
    outputs: dict[str, Path] = {}
    for name in names:
        output_path = SHEET_ROOT / f"{name}.png"
        if name == "props-sheet":
            with Image.open(SHEET_ROOT / "props-sheet-magenta.png") as source, Image.open(SHEET_ROOT / "props-sheet-matte.png") as matte:
                restore_prop_color_from_matte(source, matte).save(output_path, "PNG", optimize=True)
        if not output_path.exists():
            raise FileNotFoundError(f"Missing chroma-keyed Dangle Toy sheet: {output_path}")
        outputs[name] = output_path
    return outputs


def crop_cells(sheet: Image.Image, columns: int = 4, rows: int = 2) -> list[Image.Image]:
    cells: list[Image.Image] = []
    for row in range(rows):
        for column in range(columns):
            left = round(sheet.width * column / columns)
            right = round(sheet.width * (column + 1) / columns)
            top = round(sheet.height * row / rows)
            bottom = round(sheet.height * (row + 1) / rows)
            cells.append(sheet.crop((left, top, right, bottom)))
    return cells


def normalize_cat(cell: Image.Image) -> Image.Image:
    bounds = cell.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Dangle Toy source cell has no visible cat pixels")
    subject = cell.crop(bounds)
    scale = min(MAX_SUBJECT_WIDTH / subject.width, MAX_SUBJECT_HEIGHT / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    visible = subject.getchannel("A").getbbox()
    if visible is None:
        raise ValueError("Dangle Toy source cell became empty after normalization")
    canvas = Image.new("RGBA", (ARTBOARD_SIZE, ARTBOARD_SIZE), (0, 0, 0, 0))
    x = round(ARTBOARD_SIZE / 2 - (visible[0] + visible[2]) / 2)
    y = GROUND_LINE_Y - visible[3]
    canvas.alpha_composite(subject, (x, y))
    return canvas


def write_cat_sequence(sheet_path: Path, names: tuple[str, ...]) -> list[Path]:
    with Image.open(sheet_path) as source:
        cells = crop_cells(clear_low_alpha_noise(source))
    outputs: list[Path] = []
    for cell, name in zip(cells, names, strict=True):
        output = FRAME_ROOT / f"{name}.png"
        normalize_cat(cell).save(output, "PNG", optimize=True)
        outputs.append(output)
    return outputs


def write_diagonal_pair(
    sheet_path: Path,
    right_names: tuple[str, ...],
    left_names: tuple[str, ...],
) -> tuple[list[Path], list[Path]]:
    """Write an authored right diagonal and its registration-safe left pair.

    The left direction is mirrored offline after artboard normalization. Runtime
    therefore selects an ordinary whole-frame raster and never transforms the
    cat body or risks changing its ground contact.
    """

    with Image.open(sheet_path) as source:
        cells = crop_cells(clear_low_alpha_noise(source))
    right_outputs: list[Path] = []
    left_outputs: list[Path] = []
    for cell, right_name, left_name in zip(cells, right_names, left_names, strict=True):
        right_frame = normalize_cat(cell)
        right_output = FRAME_ROOT / f"{right_name}.png"
        right_frame.save(right_output, "PNG", optimize=True)
        right_outputs.append(right_output)

        left_output = FRAME_ROOT / f"{left_name}.png"
        right_frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(left_output, "PNG", optimize=True)
        left_outputs.append(left_output)
    return right_outputs, left_outputs


def normalize_prop(cell: Image.Image, max_size: int) -> Image.Image:
    bounds = cell.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Dangle Toy prop cell has no visible pixels")
    subject = cell.crop(bounds)
    scale = min(max_size / subject.width, max_size / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    canvas.alpha_composite(subject, (round((512 - size[0]) / 2), round((512 - size[1]) / 2)))
    return canvas


def write_props(sheet_path: Path) -> list[Path]:
    with Image.open(sheet_path) as source:
        cells = crop_cells(clear_low_alpha_noise(source))
    with Image.open(SHEET_ROOT / "feather-fish.png") as feather_source:
        cells[4] = clear_low_alpha_noise(feather_source)
    PUBLIC_PROP_ROOT.mkdir(parents=True, exist_ok=True)
    outputs: list[Path] = []
    for index, (cell, name) in enumerate(zip(cells, PROP_NAMES, strict=True)):
        if index < 6:
            cell = keep_largest_alpha_component(cell)
        max_size = 486 if index < 2 else 380 if index < 5 else 300
        output = PUBLIC_PROP_ROOT / f"{name}.png"
        normalize_prop(cell, max_size).save(output, "PNG", optimize=True)
        outputs.append(output)
    return outputs


def checkerboard(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size, "#f8fafc")
    draw = ImageDraw.Draw(image)
    tile = 32
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill="#e2e8f0")
    return image


def write_contact_sheet(sequences: list[tuple[str, list[Path]]], props: list[Path]) -> Path:
    cell = 240
    margin = 24
    rows = sum(math.ceil(len(paths) / 4) for _, paths in sequences) + 2
    contact = checkerboard((margin * 2 + cell * 4, margin * 2 + cell * rows)).convert("RGBA")
    draw = ImageDraw.Draw(contact)
    row = 0
    for label, paths in sequences:
        for index, path in enumerate(paths):
            with Image.open(path) as frame:
                preview = frame.convert("RGBA").resize((cell, cell), Image.Resampling.LANCZOS)
            x = margin + (index % 4) * cell
            y = margin + row * cell
            contact.alpha_composite(preview, (x, y))
            if index == 0:
                draw.text((x + 8, y + 8), label, fill="#0f172a")
            draw.text((x + 8, y + cell - 24), path.stem, fill="#0f172a")
            if index % 4 == 3:
                row += 1
        if len(paths) % 4:
            row += 1
    for index, path in enumerate(props):
        with Image.open(path) as frame:
            preview = frame.convert("RGBA").resize((cell, cell), Image.Resampling.LANCZOS)
        x = margin + (index % 4) * cell
        y = margin + (row + index // 4) * cell
        contact.alpha_composite(preview, (x, y))
        draw.text((x + 8, y + cell - 24), path.stem, fill="#0f172a")
    output = SHEET_ROOT / "dangle-toy-contact-sheet.png"
    contact.convert("RGB").save(output, "PNG", optimize=True)
    return output


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
        "alphaComponentSizes": sorted((len(component) for component in alpha_components(rgba)), reverse=True),
    }


def main() -> None:
    FRAME_ROOT.mkdir(parents=True, exist_ok=True)
    sheets = prepare_transparent_sheets()
    attention = write_cat_sequence(sheets["attention-stalk-sheet"], ATTENTION_NAMES)
    pounce_play = write_cat_sequence(sheets["pounce-play-sheet"], POUNCE_PLAY_NAMES)
    pounce_play_front = write_cat_sequence(sheets["pounce-play-front-sheet"], POUNCE_PLAY_FRONT_NAMES)
    pounce_play_back = write_cat_sequence(sheets["pounce-play-back-sheet"], POUNCE_PLAY_BACK_NAMES)
    pounce_play_front_right, pounce_play_front_left = write_diagonal_pair(
        sheets["pounce-play-front-right-sheet"], POUNCE_PLAY_FRONT_RIGHT_NAMES, POUNCE_PLAY_FRONT_LEFT_NAMES
    )
    pounce_play_back_right, pounce_play_back_left = write_diagonal_pair(
        sheets["pounce-play-back-right-sheet"], POUNCE_PLAY_BACK_RIGHT_NAMES, POUNCE_PLAY_BACK_LEFT_NAMES
    )
    pursuit = write_cat_sequence(sheets["pursuit-run-sheet"], PURSUIT_NAMES)
    pursuit_front = write_cat_sequence(sheets["pursuit-run-front-sheet"], PURSUIT_FRONT_NAMES)
    pursuit_back = write_cat_sequence(sheets["pursuit-run-back-sheet"], PURSUIT_BACK_NAMES)
    pursuit_front_right, pursuit_front_left = write_diagonal_pair(
        sheets["pursuit-run-front-right-sheet"], PURSUIT_FRONT_RIGHT_NAMES, PURSUIT_FRONT_LEFT_NAMES
    )
    pursuit_back_right, pursuit_back_left = write_diagonal_pair(
        sheets["pursuit-run-back-right-sheet"], PURSUIT_BACK_RIGHT_NAMES, PURSUIT_BACK_LEFT_NAMES
    )
    returning = write_cat_sequence(sheets["return-walk-sheet"], RETURN_NAMES)
    returning_front = write_cat_sequence(sheets["return-walk-front-sheet"], RETURN_FRONT_NAMES)
    returning_back = write_cat_sequence(sheets["return-walk-back-sheet"], RETURN_BACK_NAMES)
    returning_front_right, returning_front_left = write_diagonal_pair(
        sheets["return-walk-front-right-sheet"], RETURN_FRONT_RIGHT_NAMES, RETURN_FRONT_LEFT_NAMES
    )
    returning_back_right, returning_back_left = write_diagonal_pair(
        sheets["return-walk-back-right-sheet"], RETURN_BACK_RIGHT_NAMES, RETURN_BACK_LEFT_NAMES
    )
    props = write_props(sheets["props-sheet"])
    sequences = [
        ("alert / stalk / crouch / settle", attention),
        ("pounce / catch / play — side", pounce_play),
        ("pounce / catch / play — front", pounce_play_front),
        ("pounce / catch / play — back", pounce_play_back),
        ("pounce / catch / play — front-right", pounce_play_front_right),
        ("pounce / catch / play — front-left", pounce_play_front_left),
        ("pounce / catch / play — back-right", pounce_play_back_right),
        ("pounce / catch / play — back-left", pounce_play_back_left),
        ("pursuit run — side", pursuit),
        ("pursuit run — front", pursuit_front),
        ("pursuit run — back", pursuit_back),
        ("pursuit run — front-right", pursuit_front_right),
        ("pursuit run — front-left", pursuit_front_left),
        ("pursuit run — back-right", pursuit_back_right),
        ("pursuit run — back-left", pursuit_back_left),
        ("return walk — side", returning),
        ("return walk — front", returning_front),
        ("return walk — back", returning_back),
        ("return walk — front-right", returning_front_right),
        ("return walk — front-left", returning_front_left),
        ("return walk — back-right", returning_back_right),
        ("return walk — back-left", returning_back_left),
    ]
    contact = write_contact_sheet(sequences, props)
    story_preview = write_preview("dangle-alert-pounce-play-preview.gif", [*attention[:6], *pounce_play, *attention[6:]], 180)
    pursuit_preview = write_preview("dangle-pursuit-run-preview.gif", pursuit, 82)
    pursuit_front_preview = write_preview("dangle-pursuit-run-front-preview.gif", pursuit_front, 82)
    pursuit_back_preview = write_preview("dangle-pursuit-run-back-preview.gif", pursuit_back, 82)
    pursuit_front_right_preview = write_preview("dangle-pursuit-run-front-right-preview.gif", pursuit_front_right, 82)
    pursuit_front_left_preview = write_preview("dangle-pursuit-run-front-left-preview.gif", pursuit_front_left, 82)
    pursuit_back_right_preview = write_preview("dangle-pursuit-run-back-right-preview.gif", pursuit_back_right, 82)
    pursuit_back_left_preview = write_preview("dangle-pursuit-run-back-left-preview.gif", pursuit_back_left, 82)
    return_preview = write_preview("dangle-return-walk-preview.gif", returning, 122)
    return_front_preview = write_preview("dangle-return-walk-front-preview.gif", returning_front, 122)
    return_back_preview = write_preview("dangle-return-walk-back-preview.gif", returning_back, 122)
    return_front_right_preview = write_preview("dangle-return-walk-front-right-preview.gif", returning_front_right, 122)
    return_front_left_preview = write_preview("dangle-return-walk-front-left-preview.gif", returning_front_left, 122)
    return_back_right_preview = write_preview("dangle-return-walk-back-right-preview.gif", returning_back_right, 122)
    return_back_left_preview = write_preview("dangle-return-walk-back-left-preview.gif", returning_back_left, 122)
    report_paths = [
        *(path for _, sequence in sequences for path in sequence),
        *props,
        contact,
        story_preview,
        pursuit_preview,
        pursuit_front_preview,
        pursuit_back_preview,
        pursuit_front_right_preview,
        pursuit_front_left_preview,
        pursuit_back_right_preview,
        pursuit_back_left_preview,
        return_preview,
        return_front_preview,
        return_back_preview,
        return_front_right_preview,
        return_front_left_preview,
        return_back_right_preview,
        return_back_left_preview,
    ]
    report = {
        "schemaVersion": "tokenpet-dangle-toy-assets/v4",
        "generationMode": "OpenAI built-in imagegen; offline whole-frame raster authoring",
        "sourceSheets": [alpha_report(path) for path in [*sheets.values(), SHEET_ROOT / "feather-fish.png"]],
        "frameRoles": {
            "attentionStalkCrouchSettle": list(ATTENTION_NAMES),
            "pounceCatchPlay": list(POUNCE_PLAY_NAMES),
            "pounceCatchPlayFront": list(POUNCE_PLAY_FRONT_NAMES),
            "pounceCatchPlayBack": list(POUNCE_PLAY_BACK_NAMES),
            "pounceCatchPlayFrontRight": list(POUNCE_PLAY_FRONT_RIGHT_NAMES),
            "pounceCatchPlayFrontLeft": list(POUNCE_PLAY_FRONT_LEFT_NAMES),
            "pounceCatchPlayBackRight": list(POUNCE_PLAY_BACK_RIGHT_NAMES),
            "pounceCatchPlayBackLeft": list(POUNCE_PLAY_BACK_LEFT_NAMES),
            "pursuitRun": list(PURSUIT_NAMES),
            "pursuitRunFront": list(PURSUIT_FRONT_NAMES),
            "pursuitRunBack": list(PURSUIT_BACK_NAMES),
            "pursuitRunFrontRight": list(PURSUIT_FRONT_RIGHT_NAMES),
            "pursuitRunFrontLeft": list(PURSUIT_FRONT_LEFT_NAMES),
            "pursuitRunBackRight": list(PURSUIT_BACK_RIGHT_NAMES),
            "pursuitRunBackLeft": list(PURSUIT_BACK_LEFT_NAMES),
            "returnWalk": list(RETURN_NAMES),
            "returnWalkFront": list(RETURN_FRONT_NAMES),
            "returnWalkBack": list(RETURN_BACK_NAMES),
            "returnWalkFrontRight": list(RETURN_FRONT_RIGHT_NAMES),
            "returnWalkFrontLeft": list(RETURN_FRONT_LEFT_NAMES),
            "returnWalkBackRight": list(RETURN_BACK_RIGHT_NAMES),
            "returnWalkBackLeft": list(RETURN_BACK_LEFT_NAMES),
            "props": list(PROP_NAMES),
        },
        "offlineMirrors": {
            "frontLeft": "whole-frame horizontal mirror of authored frontRight after 1024px registration",
            "backLeft": "whole-frame horizontal mirror of authored backRight after 1024px registration",
            "runtimeTransform": "none",
        },
        "registration": {
            "visibleCenterX": ARTBOARD_SIZE // 2,
            "visibleGroundLineY": GROUND_LINE_Y,
            "runtimeBodyTransform": "forbidden",
            "rootMotion": "native-window distance locked",
        },
        "chromaKey": {
            "key": "#ff00ff",
            "matte": "shared imagegen chroma helper; soft matte plus edge contract",
            "propColor": "authored RGB plus the clean alpha matte",
            "featherFishKey": "#00ff00 dedicated source preserves intentional purple",
            "lowAlphaNoiseCutoff": 32,
        },
        "outputs": [alpha_report(path) for path in report_paths],
    }
    (SHEET_ROOT / "asset-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    cat_frame_count = sum(len(paths) for _, paths in sequences)
    print(f"Prepared {cat_frame_count} Dangle cat frames and {len(props)} props")


if __name__ == "__main__":
    main()
