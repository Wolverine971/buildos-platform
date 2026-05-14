# docs/marketing/outreach/creator-support-show/scripts/download-transcripts.sh
#!/usr/bin/env bash
# Download all 49 Creator Support Show transcripts sequentially with 3s delays.
# Safe pattern per youtube-transcript skill (no IpBlocked risk).
set -uo pipefail

OUT_DIR="/Users/djwayne/buildos-platform/docs/marketing/outreach/creator-support-show/transcripts"
SCRIPT="/Users/djwayne/buildos-platform/scripts/youtube-transcript.py"
LOG="/tmp/css_download.log"
mkdir -p "$OUT_DIR"
: > "$LOG"

# idx | video_id | slug
ENTRIES=$(cat <<'EOF'
01|bC9OYlStDas|dream-job-3-years-still-not-paying-enough
02|EO5aIpt1t3Y|jerome-rufin-1200-videos-wrong-lesson
03|LaLb-cUGcEs|bryce-throttle-bros-quit-sold-house
04|D63tmGUVIwE|mitch-boyer-income-problem
05|DOsheLfXeFY|fixing-channel-24-min
06|_N5wAqTC7aQ|amandarachlee-channel-fix
07|Ja_hmlPSoFY|colt-kirwan-channel-fix
08|mFhjnQR1yWY|youtube-strategy-no-one-talks-about
09|ud2VeDf66tU|fixing-her-problem-18-min
10|HuXuaR7jvHs|fixing-his-video-20-min
11|Kp53fxL3YsE|fixing-his-problem-19-min
12|auYz0GMZKSs|kelly-wakasa-problem-fix
13|9-UETYd_LzY|fixing-his-video-13-min
14|z0N1iaitiCc|fixing-her-video-14-min
15|XxE1jvosO3U|we-tried-vr-filmmaking
16|aHOv6Yicl8w|how-we-make-youtube-videos
17|Oq0zdQMIw_M|were-done
18|Js0MeDJPl2A|casey-neistat-prime-bottle-hate-comments
19|avxjxQOsOBQ|honest-review-dude-perfect-app
20|NI6ZyGGOwa4|curse-of-viral-video
21|DYRmf0WoxQw|ai-youtubers-replacing-us
22|Zr4oSaztgRU|did-mrbeast-ruin-youtube
23|EIjvoXCl7gY|3-books-made-us-better-youtubers
24|W4RI6v5CnyE|perfect-youtube-intro
25|VQ89d0ilocU|7-habits-successful-youtubers
26|COX7Cmb2tLY|broke-3-laws-of-youtube
27|p3MuDRVuNzk|colin-vacation-no-thumbnail
28|CQb-E4-urx4|12-things-learned-12-years
29|Q3QIoVt1FI0|what-life-is-like-right-now
30|IYBevSo0HQ8|selling-youtube-merch-guide
31|Dxso8eDfRYc|best-youtube-ad-weve-seen
32|EtozAfF1zmM|anti-thumbnail-theory
33|Py0Rds9Caks|youtube-brand-deals-guide
34|W82NQkVkwJg|youtubers-do-things-that-dont-make-sense
35|oY7gUBaPj1E|future-of-youtube
36|TNrsOSQrKXs|answering-questions-weve-been-avoiding
37|0QRZrEJA5Yo|do-subscribers-still-matter
38|TtfvHQs5kAc|is-mrbeast-still-most-creative
39|cKt0Xm6C_z8|will-ai-destroy-youtube
40|JNjlABRrr1k|thoughts-on-tiktok-ban
41|1RmsPApNPLs|too-late-to-become-youtuber
42|0P439_Zl0Dk|youtubers-were-better-2017
43|SKk87lbyhHo|live-streaming-boring-but-works
44|voKJgyoG-3M|should-you-work-for-a-youtuber
45|Jdt5qmodwxM|is-youtube-about-to-get-worse
46|WTbFceRobyw|plagiarism-on-youtube
47|q4Xk5yzBhOY|how-much-youtubers-charge-collabs
48|XJO4I3vKbis|interviewed-youtube-employees-shorts
49|-nckO_vl2_U|how-we-make-268k-a-year
EOF
)

TOTAL=$(printf '%s\n' "$ENTRIES" | wc -l | tr -d ' ')
COUNT=0
FAILED=()

while IFS='|' read -r idx vid slug; do
  COUNT=$((COUNT + 1))
  out="$OUT_DIR/${idx}-${slug}.md"
  echo "[$COUNT/$TOTAL] $idx $vid → ${idx}-${slug}.md" | tee -a "$LOG"
  if [[ -f "$out" && -s "$out" ]]; then
    echo "  ↳ already exists, skipping" | tee -a "$LOG"
    sleep 1
    continue
  fi
  # Always pass full URL so video IDs starting with `-` don't trip argparse.
  if python3 "$SCRIPT" -o "$out" "https://www.youtube.com/watch?v=${vid}" >>"$LOG" 2>&1; then
    echo "  ↳ OK ($(wc -c <"$out" | tr -d ' ') bytes)" | tee -a "$LOG"
  else
    echo "  ↳ FAILED" | tee -a "$LOG"
    FAILED+=("$idx|$vid|$slug")
  fi
  # Pause between downloads to stay safe with YouTube's rate limit.
  sleep 3
done <<< "$ENTRIES"

echo "" | tee -a "$LOG"
echo "Done. $COUNT processed. ${#FAILED[@]} failed." | tee -a "$LOG"
if (( ${#FAILED[@]} > 0 )); then
  echo "Failed entries:" | tee -a "$LOG"
  printf '  %s\n' "${FAILED[@]}" | tee -a "$LOG"
fi
