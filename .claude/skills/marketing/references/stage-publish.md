# Stage ③ — PUBLISH

Turn a published blog into platform posts, in one unified voice, and get them actually posted. This is where the "post across IG / LinkedIn / Twitter" pain gets solved — and where drafted-but-never-posted debt (the T35 problem) gets paid down.

Two sub-steps: **draft the kit** (if not drafted) → **post each lane** (the part that keeps getting skipped).

## Voice — load these so the copy stops being fragmented

All lanes ladder to one voice. Before drafting or posting, pull:

- `docs/marketing/brand/brand-guide-1-pager.md` — the arbiter (terms to prefer/avoid, category discipline, Channel Adaptation sections).
- `docs/marketing/social-media/FOUNDER_CONTEXT.md` — DJ's voice / lived experience.
- Per-platform quick-refs: `twitter-voice-quick-ref.md`, `linkedin-voice-quick-ref.md`, `instagram-voice-quick-ref.md` (all in `docs/marketing/social-media/`).
- Anti-AI stance: lead with relief, never with AI. No hype language.

## Sub-step A — draft the kit (if lanes are `pending`)

Reuse the **`anti-feed` skill, menu option 2 (build publish kit)**. Do not re-implement it. It produces all 5 lanes (Twitter thread / LinkedIn post / IG 9-slide carousel / TikTok 30–45s / TikTok 60–90s) + Reddit angles + cross-post order, written to `docs/marketing/social-media/publish-kits/{date}-{slug}-kit.md`.

After it runs → patch the queue: set each lane `status: "drafted"` (see `queue-editing.md`). Re-run the engine.

## Sub-step B — post a lane (`/marketing post <id> <platform>`)

This is the step that keeps getting dropped. For the requested lane:

1. Confirm the lane is `drafted` and its `asset_needs` are resolved (`assets` non-empty). If assets are missing → route to stage ② first.
2. Open the kit file, pull that lane's copy + asset(s).
3. Drive the matching **browser skill** to post: `twitter`, `linkedin`, `instagram`, or `reddit`. These skills own the actual posting flow and (critically for LinkedIn) capturing the live post URL.
4. **Immediately** patch the queue: `status: "posted"`, `posted_at: "<today>"`, `url: "<captured url>"`. Re-run the engine (watch the overdue count drop).
5. Log the touch in `docs/marketing/social-media/comment-log.md` if it fits that tracker's format.

**Cross-post order** (from the kit): blog → X within 2h → LinkedIn within 24h → TikTok1 within 48h → IG within 72h → TikTok2 within 7d → Reddit only if the karma gate is cleared. The engine's 7-day post window enforces the outer bound; use this order to sequence within it.

## Reddit caveat

Reddit posting is gated on the WS03 karma cadence (500 comment-karma/sub before any promo post). If a Reddit angle's gate isn't cleared, mark that deliverable `skipped` with a note rather than leaving it overdue forever.

## Blog drafting (when the 🔵 next-blog is due)

That's a different skill: `draft-anti-feed-blog` (reads `docs/marketing/anti-feed/blog-context.md`, picks the next-up T##, writes to `apps/web/src/content/blogs/philosophy/`). After it drafts + you publish, mark the item `published` and seed its 5 `pending` deliverables so the extraction clock starts.
