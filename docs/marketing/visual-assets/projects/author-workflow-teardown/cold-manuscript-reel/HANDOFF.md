<!-- docs/marketing/visual-assets/projects/author-workflow-teardown/cold-manuscript-reel/HANDOFF.md -->

# Handoff — Author Workflow Teardown asset build

> For: an agent picking up production of the 3 marketing assets in the asset plan.
> Source plan: `docs/marketing/visual-assets/asset-plans/2026-04-10_author-workflow-teardown.md` (READ THIS FIRST — it is the spec; this doc is the execution layer).
> Brand reference: `docs/marketing/visual-assets/references/inkprint-card-system.md` and `.claude/commands/moodboard.md`.
> Project dir: `docs/marketing/visual-assets/projects/author-workflow-teardown/cold-manuscript-reel/`
> Status as of 2026-07-01: **Asset 1 (HERO) built — first pass, 4:5 + 1:1, from live authenticated BuildOS captures. Asset 2 built (first pass). Asset 3 (video) pending — DJ to record.**

---

## 0. The goal in one line

Produce a **set of 3** complementary assets for one LinkedIn/social post about a novelist's mid-revision mess becoming a structured revision plan in BuildOS. The emotional truth is **relief** — "the muddy middle was a memory problem, and the memory problem got solved." Real-media lane (no AI imagery of product or founder).

The three assets must tell **one story** — the same manuscript details recur across all three (Chapter 7, the **Marcus** continuity bug, the **warehouse** scene that might break chapters 3–4). Repetition is what makes the proof legible.

---

## 1. Status / what's done

| #   | Asset                               | Type                                     | Status                                                                    | Files                                                                                                                                                                                                           |
| --- | ----------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | "Not the only thing you're holding" | Inkprint pain-list card                  | ✅ **Built (first pass)**                                                 | [`asset2-painlist-light.png`](./source-material/asset2-painlist-light.png) (2160×2700, 4:5) · src [`asset2-painlist-light.html`](./source-material/asset2-painlist-light.html)                                                                  |
| 1   | The mess → the revision plan (HERO) | Before/after real screenshots            | ✅ **Built (first pass)**                                                 | **4:5** [`asset1-beforeafter-light.png`](./source-material/asset1-beforeafter-light.png) (2160×2700) · **1:1** [`asset1-beforeafter-square.png`](./source-material/asset1-beforeafter-square.png) (2160×2160). Src + raws linked in §1.1 below. |
| 3   | Talk through the mess               | Screen-recording storyboard (~25s video) | ⏳ **Pending** — best recorded by DJ; automation = weak. Shot list in §6. | —                                                                                                                                                                                                               |

### Build log — Asset 1 (2026-07-01)

- **Capture path that worked:** `claude-in-chrome` extension could NOT save screenshots to disk here (`save_to_disk` wrote nothing accessible) and the agentic new-project flow wouldn't submit via its synthetic clicks. Switched to the handoff's prescribed `agent-browser` path. Two gotchas beyond §5a: (1) an agent-browser **daemon from a prior session** was already running — had to `agent-browser close --all` first or `--profile` is ignored; (2) `--profile Default` alone launches a bundled Chromium that **can't decrypt Chrome's Keychain cookies** → logged out. Fix: add `--executable-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`. Full launch: `agent-browser --profile Default --executable-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headed open https://build-os.com`.
- **Live-browser caveat:** launching the real Default profile **restores all of DJ's tabs**, and agent-browser attaches to the frontmost tab — it kept drifting to Gmail/YouTube. Work in a dedicated tab and re-select it by index (`agent-browser tab t6`) before each command.
- **AFTER data:** fresh brain dump (§4 text) → BuildOS created **"Novel Revision Project"** (`/projects/0abfbd46-7b62-4d1c-afb9-cc14970742dc`) with a goal, 5 scene-level tasks, a START HERE doc, and 1 risk. The two continuity issues landed as the top two Backlog tasks (warehouse vs ch3–4; confrontation-vs-Marcus) with warning descriptions. Tapped "SUGGESTED NEXT MOVE" → generated "Consolidate revision notes to build a clear action roadmap" (renders in burnt orange — carries the next-move beat). **This throwaway project is DJ's to delete.**
- **Deferred refinement:** plan wants the two continuity issues as _flagged risks_ (currently 1 risk + 2 continuity tasks). Not yet done — would need an agent-chat instruction to create 2 risks, then re-capture. Also open: a true side-by-side 4:5 (would read best from **mobile-width** captures) and the "tighter crop leading on the two risks" variant.

### 1.1 Captured files (all in this dir)

**Asset 1 — shipped renders**

- [`asset1-beforeafter-light.png`](./source-material/asset1-beforeafter-light.png) — 4:5 (2160×2700), stacked before→after · src [`asset1-beforeafter-light.html`](./source-material/asset1-beforeafter-light.html)
- [`asset1-beforeafter-square.png`](./source-material/asset1-beforeafter-square.png) — 1:1 (2160×2160), after-dominant + before inset · src [`asset1-beforeafter-square.html`](./source-material/asset1-beforeafter-square.html)

**Asset 1 — real product raws** (live BuildOS, captured via agent-browser)

- [`asset1-before-full.png`](./source-material/asset1-before-full.png) — full "New project flow" modal with the §4 text typed in (the BEFORE receipt)
- [`asset1-before-crop.png`](./source-material/asset1-before-crop.png) — tight crop of just the input box (used in both composites)
- [`asset1-after-viewport.png`](./source-material/asset1-after-viewport.png) — project page, one viewport (header + next-move + first tasks); used in the 4:5
- [`asset1-after-fullpage.png`](./source-material/asset1-after-fullpage.png) — full project page (header → kanban → docs); used in the 1:1

**Asset 2** — [`asset2-painlist-light.png`](./source-material/asset2-painlist-light.png) · src [`asset2-painlist-light.html`](./source-material/asset2-painlist-light.html)

### 1.2 Remaining work

- [ ] **Approve Asset 1 hero** (gates downstream identity reuse per build order).
- [ ] **Asset 3 — record the ~25s video** (DJ). Shot list §6; caption §9. Reuse the same `Novel Revision Project` so the story matches.
- [ ] **Asset 1 refinement — flag the 2 continuity issues as risks.** Currently 1 risk + 2 continuity _tasks_. Have the agent add 2 risks (Marcus ch12; warehouse vs ch3–4), then re-capture the AFTER. (Plan §Asset 1 asks for "flagged risks" explicitly.)
- [ ] **Asset 1 variants (plan):** true side-by-side 4:5 (capture at **mobile width** so both frames are portrait); a tighter crop that leads on the two flagged risks.
- [x] ~~**Asset 1 square polish:** the "BuildOS" wordmark is white over the light kanban — low contrast; switch to ink or reposition.~~ **FIXED 2026-07-01** — wordmark switched to ink (`var(--ink)`) with a light paper halo (`text-shadow: 0 1px 8px rgba(251,250,247,0.9)`); re-rendered. Now legible bottom-right.
- [ ] **Asset 2 variants (plan, §8):** dark "ink room" mode; a version where the closing "memory problem" line is dominant; nudge the pile/closing vertical gap.
- [ ] **Cleanup (DJ):** delete the throwaway `Novel Revision Project` (`/projects/0abfbd46-7b62-4d1c-afb9-cc14970742dc`); close the extra BuildOS tabs left open in Chrome.

**Build order per the plan: Asset 1 (hero) first, approve, then Asset 2 reuse identity, then Asset 3.** Asset 1 + Asset 2 first passes are done; remaining priority is **approve Asset 1**, then **Asset 3**.

---

## 2. Locked decisions (do not re-ask)

- **Capture path:** drive DJ's **live logged-in Chrome** (his real BuildOS session), not a mock. (See §5 for the exact mechanism + the Chrome-profile-lock gotcha.)
- **Project/data:** do a **fresh brain dump into a throwaway project** using the verbatim campaign text below — so all 3 assets share the Marcus/warehouse story. It's fine to leave the project for DJ to delete; it runs real (small-cost) LLM calls on his account.
- **Lane:** real-media throughout. **No `--ai-scene`.** Product UI + founder are always real.

---

## 3. Shared brand signature (constant across ALL assets)

From the plan + `inkprint-card-system.md`. Every asset obeys:

- **Single burnt-orange accent `#b85416`** — exactly one element per asset (the divider arrow / the word "only" / the next-move highlight). **Never** amber/gold `#f59e0b`, never neon/purple/sparkle.
- **Light "paper studio" mode:** bg `#fbfaf7`, deep ink `#16161a`, muted ink `#66666e`, card `#f0ede8`, border `#d6d0c6`. (Dark "ink room" variant: bg `#1d1c1a`, text `#eae7e1`, accent `#ee8743`.)
- **Type:** IBM Plex Serif for headline/quote voice; Inter for labels/UI/body. One dominant element per asset. Uppercase micro-label eyebrow (`0.15em` tracking, often accent).
- **Texture carries the transformation:** _before_ = **Static** (`tx-static`, overwhelm); _after_ = **Frame**/**Thread** (structure + memory). One texture per card, weak/medium behind text.
- **Light chrome:** small "BuildOS" wordmark, one consistent corner (bottom-right). Handle/URL live in the caption, never burned on the card.
- **Aspect:** 4:5 portrait primary (1080×1350, render @2x → 2160×2700). Also export 1:1 where noted. Asset 3 video is 9:16 + 1:1.
- **Every asset rides a real receipt** — a real BuildOS screen or real footage. (Asset 2 is the one allowed explanatory graphic, and it must be posted _alongside_ Asset 1 so the thesis rides a real screen.)

---

## 4. The campaign brain-dump text (VERBATIM — use for Asset 1 capture and Asset 3)

Type/paste this exact paragraph into the BuildOS brain-dump input:

```
Chapter 7 needs a complete rewrite. The pacing is off after the reveal in chapter 5. Sarah's motivation doesn't connect to chapter 12 anymore. I have notes in my Google Doc but I also wrote something on my phone about the timeline. The beta reader said the middle drags. I think I need to move the confrontation earlier but that breaks the subplot with Marcus. Also I changed the warehouse scene and need to check if it contradicts chapters 3 and 4.
```

The AFTER state should surface, at minimum: scene-level revision tasks, the **two continuity risks flagged** (Marcus ch12; warehouse vs ch3–4), and **one clear next move**.

---

## 5. Asset 1 — HERO before/after (full build instructions)

> ✅ **DONE (first pass) 2026-07-01** — see the [Build log](#build-log--asset-1-2026-07-01) and [§1.1 files](#11-captured-files-all-in-this-dir). This section is kept as the original spec + reusable capture recipe for re-shoots/variants.
>
> **What actually shipped vs. this spec:** the raw captures are landscape desktop shots, so left/right side-by-side would over-crop. Shipped instead: **4:5 = stacked** (before top → orange down-arrow → after bottom — the plan's approved IG scroll-reveal variant) and **1:1 = after-dominant with a before inset**. A true left/right side-by-side is still open and reads best from **mobile-width** captures (see §1.2).

**Target:** 4:5 portrait (also export 1:1). BEFORE on left, AFTER on right, single burnt-orange `#b85416` arrow/divider between. Eyebrow micro-label "BEFORE / AFTER" (uppercase, `0.15em`). Accent = the divider arrow ONLY. Small BuildOS mark bottom-right. Legible at phone size. **Real product screenshots — never mock.**

### 5a. Capture mechanism (agent-browser + DJ's live Chrome)

Tooling present on this machine: **Google Chrome** + the global **`agent-browser`** CLI (`/opt/homebrew/bin/agent-browser`). No Playwright/Puppeteer in the repo. agent-browser drives Chrome via CDP using accessibility-tree snapshots (`snapshot -i` → `@eN` refs).

**The blocker you must resolve:** DJ's BuildOS login lives in the Chrome **Default** profile (`djwayne35` → his BuildOS account). While his normal Chrome is running, that profile is **locked** — you cannot launch a second instance on it, and `--auto-connect` fails because his Chrome wasn't started with a debug port.

**Resolution — ask DJ to fully quit Chrome first**, then drive his Default profile. ⚠️ The recipe below is the **corrected, verified-working** one (2026-07-01); the two extra flags are non-optional (see Build log for why):

```bash
# DJ runs this (or you ask him to): quits Chrome, freeing the Default profile
osascript -e 'quit app "Google Chrome"'

# Kill any stale agent-browser daemon or --profile is silently IGNORED:
agent-browser close --all

# Launch his logged-in session. --executable-path is REQUIRED — without the real
# Chrome binary, agent-browser's bundled Chromium can't decrypt the Keychain
# session cookies and you land on the logged-OUT marketing page.
agent-browser --profile Default \
  --executable-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headed open https://build-os.com
agent-browser snapshot -i          # confirm logged in (look for "Dashboard/Projects" nav, not "Log in")
```

**Then:** the Default profile restores ALL of DJ's tabs and the daemon attaches to whichever is frontmost — open a dedicated tab (`agent-browser tab new` → `open <url>`) and re-select it by index (`agent-browser tab t6`) before every command, or you'll act on his Gmail/YouTube. Do not touch his other tabs. Screenshot a specific region with `agent-browser screenshot "<css-selector>" out.png`, or full page with `screenshot --full`.

If DJ does NOT want to quit his browser, fallback: `agent-browser --headed open https://build-os.com/auth/login`, have him log in once in that controlled window, then proceed.

### 5b. Capture sequence

1. Navigate to the brain-dump entry point (new project / brain dump). Snapshot to find the input ref.
2. **BEFORE capture:** `fill`/`type` the §4 campaign text into the input. Snapshot to confirm the text is in and the cursor is mid-thought. `agent-browser screenshot asset1-before-raw.png`. Crop tight to the input content; texture-feel = one dense unstructured block, weak hierarchy.
3. Submit/process the brain dump. `agent-browser wait --text "..."` on something that only appears when the structured result is ready (e.g. a task title or "risk"/"flag" label); or `wait --url` to the new project page. Processing runs real LLM calls — give it generous time (`wait` default 25s may need a retry loop).
4. Navigate to the resulting project (revision plan).
5. **AFTER capture:** ensure the two continuity risks (Marcus ch12; warehouse vs ch3–4) and a next move are visible on screen; scroll/arrange if needed. `agent-browser screenshot asset1-after-raw.png`. Texture-feel = calm, one home, strong hierarchy.
6. `agent-browser close` when done.

**Kill rule (from plan):** keep only the pair where a reader grasps "scattered → structured" in 2 seconds AND the flagged risks are legible. If the turn isn't legible, re-capture in-tool — don't over-annotate.

### 5c. Compositing (you own this fully — no auth needed)

Build an HTML compositor that places the two raw PNGs side-by-side on a `#fbfaf7` paper field with the burnt-orange divider arrow + "BEFORE / AFTER" eyebrow + bottom-right "BuildOS" wordmark, then render with the §7 Chrome-headless pipeline. Reuse the type/token system from `asset2-painlist-light.html`. Export 4:5 (2160×2700) and a 1:1 variant.

**Variations to also try (plan):** stacked (before top / after bottom) for IG scroll-reveal; a tighter crop that leads on the two flagged continuity risks.

---

## 6. Asset 3 — storyboard video (~25s, 9:16 + 1:1)

**Honest constraint:** a polished marketing screen-recording with real cursor/two-minute turn is **best recorded by DJ himself** — automated capture produces a stiff, low-feel result that fights the "real receipt" intent. Recommend handing DJ the shot list and having him record, OR (if asked) capture a rough screen-flow with `agent-browser record start asset3-rough.webm` during the §5 brain-dump run, clearly labeled as a scratch take.

**Beats (verbatim from plan):**

- **0–5s** — Screen: messy input field, text appearing as DJ talks. Caption: "revision notes in four places".
- **5–10s** — Over-the-shoulder: hit process; structure begins to form. Caption: "I didn't organize anything".
- **10–18s** — Close-up: revision plan resolves — scene tasks, two continuity issues flagged (Marcus ch12; warehouse vs ch3–4). Caption: "two minutes later".
- **18–25s** — The one clear next move highlighted in burnt orange. Caption: "the project remembers it with me".

Constraints: real product, real cursor, real data; no simulated UI animation; no AI footage; burnt orange = only the next-move highlight. Also cut a 10s version opening on the close-up of the flagged risks (lead with payoff).

---

## 7. Proven render pipeline (HTML → PNG)

This is how Asset 2 was rendered; reuse for the Asset 1 compositor and any card variants. No Playwright needed.

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 \
  --window-size=1080,1350 \
  --default-background-color=00000000 \
  --virtual-time-budget=4000 \
  --screenshot="OUTPUT.png" \
  "file:///ABSOLUTE/PATH/TO/INPUT.html"
# verify: sips -g pixelWidth -g pixelHeight OUTPUT.png   → 2160 x 2700 for 4:5
```

Notes:

- `--window-size` sets the CSS pixel canvas; the `.card` div must be exactly that size with `overflow:hidden`.
- `--force-device-scale-factor=2` gives crisp 2× output.
- `--virtual-time-budget=4000` lets Google Fonts (`@import` Inter + IBM Plex Serif) load before the shot. If fonts look like fallback serif/sans, raise it.
- `--headless=new` prints a harmless GCM "DEPRECATED_ENDPOINT" error to stderr — ignore.
- After rendering, **view the PNG with the Read tool** to verify composition before declaring done.

---

## 8. Asset 2 — what was built + remaining variants

`asset2-painlist-light.html` → `asset2-painlist-light.png`. Light paper studio, weak `tx-static`, eyebrow "THE MUDDY MIDDLE", IBM Plex Serif headline with the word **"only"** in burnt-orange italic, 5-item pile in muted Inter (cramped so the list reads as weight), closing line "It's not a craft problem. It's a memory problem." in accent, "BuildOS" wordmark bottom-right.

**Plan asks for these variants (still TODO):**

- Dark "ink room" mode (bg `#1d1c1a`, text `#eae7e1`, accent `#ee8743`) for a moodier feed.
- A version where the closing "memory problem" line is the **dominant** instead of the pile.

**Minor polish note on the first pass:** there's a large vertical gap between the pile and the closing line — consider nudging the closing line up or vertically centering the pile block so the negative space reads as intentional breathing room rather than a hole.

**Kill rule:** keep only the version where the headline lands first and the pile reads as weight, not a tidy bulleted list.

---

## 9. On-card copy / captions (verbatim, DJ voice)

- **Asset 1 caption:** _Left is the actual brain dump — Chapter 7, the Marcus continuity bug, the warehouse scene that might break chapters 3 and 4. Right is what BuildOS gave back two minutes later. I didn't organize anything. I just talked through the mess._
- **Asset 2 on-card:** eyebrow `THE MUDDY MIDDLE`; headline _Your manuscript is not the only thing you're holding._; the 5-item pile (beta-reader comments / midnight phone timeline fix / continuity problem solved three weeks ago / character note to come back to / setting change that might contradict chapter 3); closing _It's not a craft problem. It's a memory problem._
- **Asset 3 caption:** _My chapter-revision notes lived in four places. Here's me dumping the whole mess into one — and what came back two minutes later._

For the post itself: pair **Draft C** (the pain-list, in `docs/marketing/growth/lead-campaigns/2026-04-10_author-workflow-teardown_linkedin-post-drafts.md`) with **Asset 1** as the attached image, or **Asset 3** (video) as the hero.

---

## 10. Real-media litmus (must pass before shipping)

- **Asset 1 ✓** only if both frames are real product states and the flagged risks are legible — must be captured from live BuildOS, never mocked.
- **Asset 2 ✓** — explanatory Inkprint graphic (allowed exception); post alongside Asset 1 so it rides a real screen.
- **Asset 3 ✓** only if it's a real screen recording with real cursor/data; the visible turn is the proof.
- No `--ai-scene` anywhere. Burnt orange used once per asset. Lead with relief, name BuildOS at the close.
