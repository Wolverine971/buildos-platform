#!/usr/bin/env python3
# scripts/youtube-transcript.py

"""Download YouTube transcript with metadata, save as markdown."""
import argparse
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

from youtube_transcript_api import YouTubeTranscriptApi


def extract_video_id(url_or_id: str) -> str:
    if len(url_or_id) == 11 and re.match(r"^[A-Za-z0-9_-]{11}$", url_or_id):
        return url_or_id
    m = re.search(r"(?:v=|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})", url_or_id)
    if m:
        return m.group(1)
    raise ValueError(f"Could not extract video ID from: {url_or_id}")


def fetch_metadata(video_id: str) -> dict:
    out = subprocess.run(
        ["yt-dlp", "-J", "--no-warnings", f"https://www.youtube.com/watch?v={video_id}"],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def fetch_transcript(video_id: str) -> list[dict]:
    api = YouTubeTranscriptApi()
    fetched = api.fetch(video_id)
    return [{"text": s.text, "start": s.start, "duration": s.duration} for s in fetched]


def fmt_duration(secs: int) -> str:
    h, rem = divmod(secs, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def fmt_ts(secs: float) -> str:
    h, rem = divmod(int(secs), 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def render_markdown(meta: dict, transcript: list[dict]) -> str:
    title = meta.get("title", "Unknown")
    video_id = meta.get("id", "")
    channel = meta.get("uploader", meta.get("channel", "Unknown"))
    channel_url = meta.get("uploader_url", meta.get("channel_url", ""))
    upload_date = meta.get("upload_date", "")
    if upload_date and len(upload_date) == 8:
        upload_date = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:]}"
    duration = fmt_duration(int(meta.get("duration", 0)))
    views = meta.get("view_count", 0)
    description = meta.get("description", "").strip()
    chapters = meta.get("chapters") or []
    tags = meta.get("tags") or []

    lines = ["---"]
    lines.append(f'title: "{title.replace(chr(34), chr(39))}"')
    lines.append(f"video_id: {video_id}")
    lines.append(f'url: "https://www.youtube.com/watch?v={video_id}"')
    lines.append(f"channel: {channel}")
    if channel_url:
        lines.append(f'channel_url: "{channel_url}"')
    lines.append(f"upload_date: {upload_date}")
    lines.append(f'duration: "{duration}"')
    lines.append(f"views: {views}")
    if tags:
        lines.append("tags:")
        for t in tags[:20]:
            lines.append(f"  - {t}")
    if chapters:
        lines.append("timestamps:")
        for ch in chapters:
            lines.append(f'  - time: "{fmt_ts(ch.get("start_time", 0))}"')
            lines.append(f'    label: "{ch.get("title", "")}"')
    if description:
        lines.append("description: |")
        for dl in description.splitlines():
            lines.append(f"  {dl}")
    lines.append(f'transcribed_date: "{date.today().isoformat()}"')
    lines.append("---")
    lines.append("")
    lines.append(f"# {title}")
    lines.append("")
    lines.append("## Metadata")
    lines.append(f"- **Channel**: [{channel}]({channel_url})")
    lines.append(f"- **Video**: [Watch on YouTube](https://www.youtube.com/watch?v={video_id})")
    lines.append(f"- **Duration**: {duration}")
    lines.append(f"- **Upload Date**: {upload_date}")
    lines.append(f"- **Views**: {views:,}")
    lines.append("")
    if chapters:
        lines.append("## Timestamps")
        for ch in chapters:
            lines.append(f'- {fmt_ts(ch.get("start_time", 0))} — {ch.get("title", "")}')
        lines.append("")
    lines.append("## Transcript")
    lines.append("")
    text_parts = [seg["text"].replace("\n", " ").strip() for seg in transcript]
    lines.append(" ".join(text_parts))
    lines.append("")
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("url_or_id")
    p.add_argument("-o", "--output", help="Output markdown path. If omitted, writes to stdout.")
    p.add_argument("--metadata-only", action="store_true")
    args = p.parse_args()

    vid = extract_video_id(args.url_or_id)
    meta = fetch_metadata(vid)

    if args.metadata_only:
        print(json.dumps(meta, indent=2))
        return

    transcript = fetch_transcript(vid)
    md = render_markdown(meta, transcript)

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(md)
        print(f"Wrote {out} ({len(md):,} chars, {len(transcript)} segments)", file=sys.stderr)
    else:
        sys.stdout.write(md)


if __name__ == "__main__":
    main()
