#!/usr/bin/env bash
# scripts/marketing/hyperframes-reel.sh

set -euo pipefail

usage() {
	printf '%s\n' \
		"Usage: $0 <project-directory> [draft|final] [owned-or-royalty-free-music-file]" \
		"" \
		"Examples:" \
		"  $0 docs/marketing/visual-assets/projects/example/hyperframes-story draft" \
		"  $0 docs/marketing/visual-assets/projects/example/hyperframes-story final" \
		"  $0 docs/marketing/visual-assets/projects/example/hyperframes-story final /absolute/path/music.mp3"
}

if [[ $# -lt 1 || $# -gt 3 ]]; then
	usage
	exit 64
fi

PROJECT_INPUT=$1
MODE=${2:-draft}
MUSIC_FILE=${3:-}
HYPERFRAMES_VERSION=${HYPERFRAMES_VERSION:-0.7.36}

if [[ "$MODE" != "draft" && "$MODE" != "final" ]]; then
	printf 'Mode must be draft or final; received: %s\n' "$MODE" >&2
	exit 64
fi

if [[ ! -d "$PROJECT_INPUT" ]]; then
	printf 'Project directory not found: %s\n' "$PROJECT_INPUT" >&2
	exit 66
fi

PROJECT_DIR=$(cd "$PROJECT_INPUT" && pwd)
PROJECT_SLUG=$(basename "$PROJECT_DIR")
ENTRY_FILE="$PROJECT_DIR/index.html"
DELIVERY_DIR="$PROJECT_DIR/delivery"
QA_DIR="$DELIVERY_DIR/qa-$MODE"
SILENT_MASTER="$DELIVERY_DIR/${PROJECT_SLUG}-reel-silent-${MODE}.mp4"
LINT_REPORT="$DELIVERY_DIR/lint.json"
MEDIA_REPORT="$DELIVERY_DIR/${PROJECT_SLUG}-media-${MODE}.json"
SOURCE_PACKAGE="$DELIVERY_DIR/${PROJECT_SLUG}-source.zip"

if [[ ! -f "$ENTRY_FILE" ]]; then
	printf 'HyperFrames entry file not found: %s\n' "$ENTRY_FILE" >&2
	exit 66
fi

for command_name in node npx ffmpeg ffprobe zip awk; do
	if ! command -v "$command_name" >/dev/null 2>&1; then
		printf 'Required command is missing: %s\n' "$command_name" >&2
		exit 69
	fi
done

NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
if (( NODE_MAJOR < 22 )); then
	printf 'HyperFrames requires Node.js 22 or newer; found Node.js %s\n' "$(node --version)" >&2
	exit 69
fi

mkdir -p "$DELIVERY_DIR" "$QA_DIR"

printf 'Linting %s with HyperFrames %s...\n' "$PROJECT_SLUG" "$HYPERFRAMES_VERSION"
npx --yes "hyperframes@${HYPERFRAMES_VERSION}" lint "$PROJECT_DIR" --json | tee "$LINT_REPORT"

RENDER_ARGS=(
	npx --yes "hyperframes@${HYPERFRAMES_VERSION}"
	render "$PROJECT_DIR"
	--output "$SILENT_MASTER"
)

if [[ "$MODE" == "draft" ]]; then
	RENDER_ARGS+=(--quality draft)
fi

printf 'Rendering %s silent master...\n' "$MODE"
"${RENDER_ARGS[@]}"

ffprobe \
	-v error \
	-show_entries format=duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,r_frame_rate,pix_fmt \
	-of json \
	"$SILENT_MASTER" > "$MEDIA_REPORT"

DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$SILENT_MASTER")

FRAME_NUMBER=1
for PERCENT in 12 32 52 72 90; do
	TIMESTAMP=$(awk -v duration="$DURATION" -v percent="$PERCENT" 'BEGIN { printf "%.3f", duration * percent / 100 }')
	FRAME_PATH=$(printf '%s/%02d-%s-percent.jpg' "$QA_DIR" "$FRAME_NUMBER" "$PERCENT")
	ffmpeg \
		-hide_banner \
		-loglevel error \
		-y \
		-ss "$TIMESTAMP" \
		-i "$SILENT_MASTER" \
		-frames:v 1 \
		-q:v 2 \
		"$FRAME_PATH"
	FRAME_NUMBER=$((FRAME_NUMBER + 1))
done

/bin/cp -p "$QA_DIR/01-12-percent.jpg" "$DELIVERY_DIR/${PROJECT_SLUG}-cover-candidate.jpg"

(
	cd "$PROJECT_DIR"
	zip -rq "$SOURCE_PACKAGE" . \
		-x 'delivery/*' \
		-x 'snapshots/*' \
		-x '*.mp4' \
		-x '.DS_Store'
)

if [[ -n "$MUSIC_FILE" ]]; then
	if [[ ! -f "$MUSIC_FILE" ]]; then
		printf 'Music file not found: %s\n' "$MUSIC_FILE" >&2
		exit 66
	fi

	MUSIC_PATH=$(cd "$(dirname "$MUSIC_FILE")" && pwd)/$(basename "$MUSIC_FILE")
	AUDIO_MASTER="$DELIVERY_DIR/${PROJECT_SLUG}-reel-owned-audio-${MODE}.mp4"
	FADE_OUT_START=$(awk -v duration="$DURATION" 'BEGIN { value = duration - 0.9; if (value < 0) value = 0; printf "%.3f", value }')

	printf 'Mixing supplied audio at 16%%. Confirm that you own or licensed this track for the intended use.\n'
	ffmpeg \
		-hide_banner \
		-loglevel error \
		-y \
		-i "$SILENT_MASTER" \
		-stream_loop -1 \
		-i "$MUSIC_PATH" \
		-filter_complex "[1:a]volume=0.16,afade=t=in:st=0:d=0.35,afade=t=out:st=${FADE_OUT_START}:d=0.9[a]" \
		-map 0:v:0 \
		-map '[a]' \
		-t "$DURATION" \
		-c:v copy \
		-c:a aac \
		-b:a 192k \
		-movflags +faststart \
		"$AUDIO_MASTER"
fi

printf '\nBuild complete.\n'
printf 'Silent master: %s\n' "$SILENT_MASTER"
printf 'QA frames:     %s\n' "$QA_DIR"
printf 'Cover:         %s\n' "$DELIVERY_DIR/${PROJECT_SLUG}-cover-candidate.jpg"
printf 'Media report:  %s\n' "$MEDIA_REPORT"
printf 'Source pack:   %s\n' "$SOURCE_PACKAGE"

if [[ -n "$MUSIC_FILE" ]]; then
	printf 'Audio master:  %s\n' "$AUDIO_MASTER"
else
	printf 'Music:         add inside Instagram, or rerun with an owned/royalty-free track\n'
fi
