<!-- tasker/163-youtube-videos.md -->

# 163 — YouTube watch history + local transcripts (index, don't hoard)

**Status:** OPEN (needs DJ's Takeout file) · **Opened:** 2026-11-17 · **Parent:** 160
**DJ (2026-11-17):** not his channel. He'll upload his **YouTube watch history** (Google Takeout),
plus **transcripts he made locally** of videos. "I don't want to ingest a ton of random
information for information's sake," but wants to find things fast and see connections.
Lesson from Libri: its recursive book → chapter research queue was over-engineered; the graph is
the better shape.

## Principle: index cheaply, research on demand

- Bringing something in should be free and small: a name, a link, a date, who/what it is about.
- Long text (transcripts) stays where it is; we keep a pointer and pull from it when asked.
- Nothing researches itself. Research only runs when DJ asks (164 queue), one bounded step per
  entry. No recursion.

## Watch history (Google Takeout → YouTube → history → `watch-history.json`)

- Parse free in the browser or server: title, video URL, channel name + URL, watched at.
- **Default (DJ can veto):** channels watched ≥ 5 times become `youtube_channel` entries ("channels I
  watch", with a count and last watched); single videos do NOT become graph entries. Every watch
  is kept in a light searchable log (one row per video, no graph entry) so "that video about X I
  watched last spring" is findable. A video gets promoted to a real entry when DJ links it, asks
  chat about it, or it has a transcript.
- Re-upload is safe (dedupe by video id + watched at).

## Local transcripts

- Found so far (2026-11-17): `~/.cache/9takes-research/` (21 public figures, ~735 .vtt/.srt/.txt
  files, 1.9 GB incl. audio, research for 9takes) and the Hyperplexed design transcripts in
  `.codex/skills/hyperplexed-audit/references/transcripts/`. Ask DJ where the rest live.
- Per transcript: a `youtube_video` entry (title, URL if known, who it's about) + people/orgs found by
  the free NER from 165 + a pointer to the file. Text is not copied into facts.
- Public figures (Hinton, Amodei…) are public entities; candidates for the shared public layer.
- When: on demand per folder ("bring in my 9takes research"), not a background crawl.

## Done when

- DJ uploads watch history → channels list + searchable log; counts reported.
- One transcript folder imported → videos + people linked; chat answers "what videos do I have
  on Geoffrey Hinton?".
