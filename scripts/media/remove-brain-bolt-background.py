#!/usr/bin/env python3
# scripts/media/remove-brain-bolt-background.py
"""Create transparent Brain Bolt animations from the dark-blue MP4 masters."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from fractions import Fraction
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def video_fps(input_path: Path) -> Fraction:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=r_frame_rate",
            "-of",
            "json",
            str(input_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    rate = json.loads(result.stdout)["streams"][0]["r_frame_rate"]
    return Fraction(rate)


def estimate_background(rgb: np.ndarray) -> np.ndarray:
    height, width, _ = rgb.shape
    size = max(24, min(height, width) // 10)
    samples = np.concatenate(
        [
            rgb[:size, :size].reshape(-1, 3),
            rgb[:size, -size:].reshape(-1, 3),
            rgb[-size:, :size].reshape(-1, 3),
            rgb[-size:, -size:].reshape(-1, 3),
        ]
    )
    return np.median(samples, axis=0).astype(np.float32)


def filled_core_mask(raw_alpha: np.ndarray, threshold: float) -> np.ndarray:
    binary = Image.fromarray((raw_alpha >= threshold).astype(np.uint8) * 255)

    # Close small breaks in the neon outline so its enclosed brain shape survives.
    closed = binary.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
    flood = closed.copy()
    ImageDraw.floodfill(flood, (0, 0), 128, thresh=0)

    flooded = np.asarray(flood)
    filled = np.where(flooded == 128, 0, 255).astype(np.uint8)
    return np.asarray(
        Image.fromarray(filled).filter(ImageFilter.GaussianBlur(1.25)),
        dtype=np.float32,
    ) / 255.0


def remove_background(
    frame_path: Path,
    output_path: Path,
    noise_floor: float,
    core_threshold: float,
) -> None:
    rgb_u8 = np.asarray(Image.open(frame_path).convert("RGB"))
    rgb = rgb_u8.astype(np.float32)
    background = estimate_background(rgb)

    positive_delta = np.maximum(rgb - background, 0.0)
    channel_range = np.maximum(255.0 - background, 1.0)
    raw_alpha = np.max(positive_delta / channel_range, axis=2)

    effect_alpha = np.clip(
        (raw_alpha - noise_floor) / (1.0 - noise_floor), 0.0, 1.0
    )
    effect_alpha = np.power(effect_alpha, 0.72)
    core_alpha = filled_core_mask(raw_alpha, core_threshold)
    alpha = np.maximum(effect_alpha, core_alpha)

    # Undo the dark-blue plate contribution in translucent glow pixels. This
    # prevents a navy halo when the result is composited on a light surface.
    safe_alpha = np.maximum(alpha[..., None], 1.0 / 255.0)
    foreground = (rgb - (1.0 - safe_alpha) * background) / safe_alpha
    foreground = np.clip(foreground, 0.0, 255.0)

    solid = core_alpha >= 0.995
    foreground[solid] = rgb[solid]
    foreground[alpha <= 0.0] = 0.0

    rgba = np.dstack(
        [foreground.astype(np.uint8), np.rint(alpha * 255.0).astype(np.uint8)]
    )
    Image.fromarray(rgba).save(output_path)


def encode(frames: Path, output_path: Path, fps: Fraction) -> None:
    common = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-framerate",
        f"{fps.numerator}/{fps.denominator}",
        "-i",
        str(frames / "frame_%05d.png"),
        "-an",
    ]

    if output_path.suffix.lower() == ".mov":
        codec = [
            "-c:v",
            "prores_ks",
            "-profile:v",
            "4444",
            "-pix_fmt",
            "yuva444p10le",
        ]
    else:
        codec = [
            "-c:v",
            "libvpx-vp9",
            "-pix_fmt",
            "yuva420p",
            "-b:v",
            "0",
            "-crf",
            "12",
            "-deadline",
            "good",
            "-cpu-used",
            "2",
            "-row-mt",
            "1",
            "-auto-alt-ref",
            "0",
            "-metadata:s:v:0",
            "alpha_mode=1",
        ]

    run(common + codec + [str(output_path)])


def process(
    input_path: Path,
    output_path: Path,
    noise_floor: float,
    core_threshold: float,
) -> None:
    fps = video_fps(input_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="brain-bolt-alpha-") as temp_dir:
        temp = Path(temp_dir)
        source_frames = temp / "source"
        alpha_frames = temp / "alpha"
        source_frames.mkdir()
        alpha_frames.mkdir()

        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                str(input_path),
                "-vsync",
                "0",
                str(source_frames / "frame_%05d.png"),
            ]
        )

        frame_paths = sorted(source_frames.glob("frame_*.png"))
        if not frame_paths:
            raise RuntimeError(f"No frames decoded from {input_path}")

        for index, frame_path in enumerate(frame_paths, start=1):
            remove_background(
                frame_path,
                alpha_frames / f"frame_{index:05d}.png",
                noise_floor,
                core_threshold,
            )

        encode(alpha_frames, output_path, fps)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--noise-floor", type=float, default=0.03)
    parser.add_argument("--core-threshold", type=float, default=0.34)
    args = parser.parse_args()

    process(
        args.input.resolve(),
        args.output.resolve(),
        args.noise_floor,
        args.core_threshold,
    )


if __name__ == "__main__":
    main()
