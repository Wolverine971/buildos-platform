<!-- tasker/03-anti-feed-t35-publish.md -->

# 03 — Publish anti-feed T35 blog (+ social extractions)

**Priority:** P1 — unblocks the WS10 video pipeline
**Type:** Marketing / content
**Source:** `docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md`

## ⚠️ Refresh 2026-07-01 — the blog IS live; only distribution remains

Verified directly: `https://build-os.com/blogs/philosophy/you-stopped-choosing-what-you-think-about` returns **200** (frontmatter `published: true`, committed since ~2026-05-04). The "Not published" claim below was wrong — the WS09 dashboard (still 🔵) and this file were out of sync with the deployed file.

## ✅ Update 2026-07-01 (later) — quality pass done, dashboard reconciled

- **Quality pass complete.** Content-editor review run (verdict: strong post, minor edits). All 8 edits applied to the source file: tweet-cadence irony trimmed (stacked not-X-but-Y pairs), off-brand "the system gets smarter" AI-hype paragraph rewritten, duplicated $666K/2.2B receipt consolidated into the first citation, marketing-meta parenthetical cut, "thinking environment" linked to its definition post, description + excerpt rewritten relief-first (they led with AI), draft-notes + audit HTML comments stripped, `lastmod` → 2026-07-01. **Edits are uncommitted — commit + push to deploy.** (Comments never rendered live — `sanitize-html` strips them — so this was repo hygiene, not a live leak.)
- **WS09 dashboard flipped**: T35 → ✅. Also discovered `what-a-thinking-environment-actually-is.md` (= T36's title) has been live since 2026-04-18 but untracked — flagged ⚠️ in the dashboard pending spec verification.
- Technical validation: JSON-LD (`BlogPosting`, correct `datePublished`) ✅, all cross-links live ✅, no comment leaks ✅. Note: `pic` frontmatter is dead site-wide (parsed, never rendered; OG image falls back to generic card) — a custom OG image would help the social wave but is a site-wide fix, not a T35 blocker.

**Remaining:**

1. ~~Flip T35 to ✅ in the WS09 dashboard~~ ✅ done 2026-07-01.
2. **Commit + push the quality edits** (blog + WS09 + this file).
3. Post the drafted social extractions (X thread, LinkedIn, IG carousel, Reddit angles) from the publish kit — post-edit deploy first so the page matches what gets quoted.
4. TikTok recordings (T48) still gated on [[11-tiktok-ws10-setup]] account setup.
5. Cadence at-risk: verify T36's live post against its spec (it may already satisfy the slot), then the real gap is T37+ — nothing new tracked since April.

## State

- **T34** ✅ published 2026-04-17.
- **T35** — "You Stopped Choosing What You Think About" — draft complete (~2,238 words, ~11 min), publish kit drafted (all 5 social lanes), TikTok scripts drafted. **Not published.**
- T36–T43 not started (T36 gated on a WS04 T15 reconciliation decision).
- T44 cadence rule: flag at-risk if last published cluster post is >14 days old — **T34 is now >60 days old**, so the cluster is at-risk.

## Loose end

The drafted T35 blog and its social extractions are sitting unpublished. Publishing T35 is the dependency unlock for WS10 short-form video (the TikTok scripts can't be recorded until the post lands).

## Next action

1. Publish T35 to `apps/web/src/content/blogs/philosophy/you-stopped-choosing-what-you-think-about.md` (confirm exact slug) and validate JSON-LD.
2. Post the social extractions: X thread, LinkedIn, IG carousel, 2 TikTok scripts.
3. Trigger WS10 T48 recording for both T35 TikTok scripts within 7 days (depends on [[11-tiktok-ws10-setup]]).
4. Use `/draft-anti-feed-blog` / `anti-feed` skill if the draft needs a final pass first.

## Done when

T35 is live at its canonical URL, social lanes posted, cluster no longer >14 days stale.
