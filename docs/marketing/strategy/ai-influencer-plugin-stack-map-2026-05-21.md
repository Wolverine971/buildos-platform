<!-- docs/marketing/strategy/ai-influencer-plugin-stack-map-2026-05-21.md -->

# AI Influencer × Plugin Stack Map

**Status:** Draft research / outreach prep
**Date:** 2026-05-21
**Owner:** BuildOS
**Related:** `ai-influencers.md`, `docs/specs/buildos-corsair-plugin-priority-matrix-2026-05-21.md`, `docs/marketing/strategy/buildos-marketing-strategy-2026.md`, `docs/marketing/strategy/thinking-environment-creator-strategy.md`

## Purpose

`ai-influencers.md` identifies 10 target AI-native builders to court for BuildOS adoption. The plugin priority matrix says BuildOS only needs ~6 plugins working end-to-end (via Corsair) for credible demos. This doc maps which plugins each target _actually_ uses, so outreach is tailored to their stack — not a generic "52 integrations" pitch.

Confidence levels:

- ✅ **Confirmed** — referenced in public artifacts, posts, or workflows.
- 🟡 **Likely** — strong inference from role, output, or industry norm.
- — **Unlikely / N/A**.

Outreach implication: pitch only what you can demo today, for _their_ tools.

## 1. Cross-Influencer Heatmap

| Plugin      | Riley | Pietro | Swyx | Simon | Hamel | Nick | Rowan | Allie | Harrison | Maor |
| ----------- | ----- | ------ | ---- | ----- | ----- | ---- | ----- | ----- | -------- | ---- |
| GitHub      | ✅    | ✅     | ✅   | ✅    | ✅    | —    | —     | —     | ✅       | ✅   |
| Twitter / X | ✅    | ✅     | ✅   | ✅    | ✅    | ✅   | ✅    | ✅    | ✅       | ✅   |
| Notion      | 🟡    | 🟡     | ✅   | —     | ✅    | 🟡   | 🟡    | 🟡    | ✅       | 🟡   |
| Linear      | 🟡    | —      | —    | —     | —     | —    | —     | —     | ✅       | 🟡   |
| YouTube     | ✅    | ✅     | 🟡   | 🟡    | 🟡    | 🟡   | ✅    | 🟡    | —        | —    |
| Figma       | —     | ✅     | —    | —     | —     | ✅   | —     | —     | —        | —    |
| Slack       | 🟡    | 🟡     | ✅   | 🟡    | ✅    | —    | —     | 🟡    | ✅       | 🟡   |
| Cursor      | ✅    | 🟡     | 🟡   | —     | —     | —    | —     | —     | —        | 🟡   |
| Google Cal  | 🟡    | 🟡     | ✅   | 🟡    | 🟡    | 🟡   | 🟡    | ✅    | 🟡       | —    |
| Gmail       | 🟡    | 🟡     | ✅   | 🟡    | 🟡    | 🟡   | 🟡    | ✅    | 🟡       | —    |
| Discord     | 🟡    | 🟡     | 🟡   | —     | 🟡    | —    | 🟡    | —     | 🟡       | —    |
| Calendly    | —     | —      | 🟡   | —     | 🟡    | —    | —     | 🟡    | —        | —    |

Top concentration:

1. **Twitter / X** — 10/10. Universal.
2. **GitHub** — 7/10 confirmed. Every technical builder.
3. **Notion** — 3 confirmed + 6 likely. Near-universal among writers / technical builders.
4. **YouTube** — 3 confirmed + 5 likely. Publishers.
5. **Slack** — 3 confirmed + 5 likely. Anyone with a team / community.

This validates the S-tier in the priority matrix.

## 2. Per-Influencer Profiles

### 2.1 Riley Brown — AI coding workflow educator

**Stack (confirmed from public posts):**

- GitHub
- Cursor (heavy)
- Twitter / X
- YouTube
- Claude Code / Codex / OpenClaw (these are agent tools, not Corsair plugins)

**Likely:** Notion, Linear, Slack (course community)

**Outreach angle:** "BuildOS is the planning layer for your agent stack. Brain dump → projects → Cursor / Codex / Claude Code execute via your existing setup. GitHub + Cursor + X working through one place. The thinking layer agents share."

**Plugins BuildOS must demo for Riley:** GitHub, Cursor, X. **Tactical blocker:** confirm Corsair Cursor plugin works before reaching out — Cursor is the demo-cracking moment for Riley specifically.

**Outreach priority:** 1 (highest stack fit + highest reach in AI-coding niche).

---

### 2.2 Pietro Schirano — design + AI app generation

**Stack (confirmed):**

- Figma (MagicPath context)
- Twitter / X
- GitHub
- YouTube (model-drop demos)

**Likely:** Notion (design docs), Linear (if MagicPath has a team)

**Outreach angle:** "BuildOS for AI-native designers — brain dump becomes spec + Figma frame + GitHub repo, all wired up. The thinking layer for the work you already show on screen."

**Plugins BuildOS must demo for Pietro:** Figma, GitHub, X. **Figma is critical** — without it, no demo.

**Outreach priority:** 3.

---

### 2.3 Swyx (Shawn Wang) — AI Engineer movement builder

**Stack (confirmed):**

- Notion (Latent Space publishing infra)
- GitHub
- Twitter / X
- Slack (community)
- Google Calendar (AI Engineer events)
- Substack-equivalent / own infra (NOT in Corsair catalog)

**Likely:** Gmail, Figma (event design)

**Outreach angle:** "Context engineering primitive for AI engineers — BuildOS holds the thinking, your stack executes. Could be a primitive worth naming in the AI Engineer canon."

**Plugins BuildOS must demo for Swyx:** Notion, GitHub, Google Cal, X. **Notion is the killer demo** — Latent Space lives in Notion.

**Outreach priority:** 4 (slow play — ecosystem leverage, not immediate adoption).

---

### 2.4 Simon Willison — independent technical authority

**Stack (confirmed):**

- GitHub (Datasette, llm CLI)
- Twitter / X
- Own blog / Mastodon (NOT in Corsair catalog)

**Likely:** Google Calendar, YouTube (occasional)

**Outreach angle:** Hardest to court directly. Simon is credibility-first, skeptical. Best path is _not_ outreach but a _Simon-worthy artifact_: a reproducible BuildOS eval, a transparent context-engineering writeup, a benchmark. Simon links to things that prove themselves.

**Plugins BuildOS must demo for Simon:** GitHub. The "demo" should be a _technical artifact_, not a workflow.

**Outreach priority:** 7 — don't pitch; publish.

---

### 2.5 Hamel Husain — evals and applied AI

**Stack (likely + course-structure inference):**

- GitHub
- Twitter / X
- Notion (course material likely)
- Slack (course communities)
- Discord (possibly)

**Likely:** Google Calendar, Gmail

**Outreach angle:** "Eval-layer for BuildOS agents — measure whether the thinking environment actually produces better project outcomes. Could be a case study for your evals course."

**Plugins BuildOS must demo for Hamel:** GitHub, Slack, Notion. The hook is _evals as a BuildOS feature_, not plugin breadth.

**Outreach priority:** 5.

---

### 2.6 Nick St. Pierre — AI creative direction

**Stack (confirmed):**

- Twitter / X (his AI image/video highlight reel)
- Figma (creative direction)
- Instagram (NOT in Corsair catalog)

**Likely:** YouTube, Notion (client decks)

**Outreach angle:** "Creative operating system — BuildOS holds the brief, the brand voice, the asset memory. Wired into Figma so the creative work moves out into your real surfaces."

**Plugins BuildOS must demo for Nick:** Figma, X. **Instagram absence is a real gap** — flag for DevJane.

**Outreach priority:** 6.

---

### 2.7 Rowan Cheung — AI news distribution

**Stack (likely):**

- Twitter / X (primary)
- YouTube
- Beehiiv / The Rundown infra (NOT in Corsair catalog)
- Notion (editorial likely)

**Likely:** Google Calendar, Gmail, Slack (team)

**Outreach angle:** Don't pitch as a workflow tool — pitch as a _content angle_. "Daily AI product-release intelligence" published from BuildOS could be a Rundown segment. Less product-fit, more amplification-fit.

**Plugins BuildOS must demo for Rowan:** X, YouTube. Lower priority — Rowan is amplification, not adoption.

**Outreach priority:** 8.

---

### 2.8 Allie K. Miller — business AI adoption

**Stack (likely):**

- LinkedIn (primary distribution — NOT in Corsair catalog ⚠️)
- Twitter / X
- Notion (likely)
- Calendly (exec scheduling pattern)
- Google Calendar, Gmail

**Outreach angle:** "AI operating playbooks for executives — BuildOS as the boardroom-ready thinking environment." Less demo-y, more advisory.

**Plugins BuildOS must demo for Allie:** Calendly, Google Calendar. **LinkedIn is the gap** — her primary surface is unsupported until DevJane ships a LinkedIn plugin or BuildOS builds one natively.

**Outreach priority:** 9 — wait for LinkedIn.

---

### 2.9 Harrison Chase — LangChain / agents infrastructure

**Stack (confirmed via LangChain repo / team patterns):**

- GitHub (LangChain)
- Linear
- Notion (LangChain team)
- Slack (LangChain Slack)
- Twitter / X

**Likely:** Google Calendar, Gmail

**Outreach angle:** "BuildOS as long-term project memory for LangChain agents — context that persists across runs, structured by ontology. Could plug into LangGraph state."

**Plugins BuildOS must demo for Harrison:** GitHub, Linear, Notion, Slack. **Strongest plugin-stack match in the list.**

**Outreach priority:** 2.

---

### 2.10 Maor Shlomo — solo founder case study

**Stack:** Post-Base44-exit. Public artifacts limited.

**Outreach angle:** Not an adoption target — a _case study source_. Interview-driven.

**Plugins BuildOS must demo for Maor:** N/A.

**Outreach priority:** 10 (separate channel — case study, not product pitch).

## 3. Synthesis

### 3.1 Matrix validation

The S-tier in the priority matrix (GitHub, X, Google Cal, Gmail, Notion, Linear) covers 90%+ of use cases for influencers 1–5 and 9 — the technical / builder cluster where BuildOS has product fit. The matrix is correct.

### 3.2 A-tier plugins that swing specific influencers

- **Figma** → Pietro, Nick.
- **Cursor** → Riley specifically.
- **YouTube** → Riley, Pietro, Rowan.
- **Slack** → Hamel, Harrison.
- **Calendly** → Allie.

### 3.3 Corsair catalog gaps (flag for DevJane)

| Gap                    | Who needs it                            | Severity                  |
| ---------------------- | --------------------------------------- | ------------------------- |
| **LinkedIn**           | Allie Miller; BuildOS marketing broadly | High — recurring need     |
| **Instagram**          | Nick St. Pierre                         | Medium — niche            |
| **Substack / Beehiiv** | Swyx, Rowan                             | Medium — publisher cohort |

### 3.4 Plugins overrated by Corsair catalog presence

None of the target influencers will care about Reddit, Spotify, Strava, Oura, OpenWeather, Razorpay, DodoPayments. Keep as C-tier credibility badges; do not invest UX time.

## 4. Outreach Sequencing

Ranked by (plugin-fit × distribution leverage × demo readiness):

| #   | Target              | Why this order                                                                                     |
| --- | ------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | **Riley Brown**     | Perfect stack fit (GitHub + Cursor + X). Highest reach in AI-coding. Cursor demo is unique to him. |
| 2   | **Harrison Chase**  | Perfect stack fit (GitHub + Linear + Notion + Slack). Infrastructure credibility.                  |
| 3   | **Pietro Schirano** | Strong fit (Figma + GitHub + X). Design-first wedge.                                               |
| 4   | **Swyx**            | Perfect stack + ecosystem leverage. Slow play.                                                     |
| 5   | **Hamel Husain**    | Strong fit (GitHub + Slack + Notion). Eval-layer angle is differentiated.                          |
| 6   | **Nick St. Pierre** | Fit limited by Instagram gap; Figma demo helps.                                                    |
| 7   | **Simon Willison**  | Don't pitch — publish a Simon-worthy artifact.                                                     |
| 8   | **Rowan Cheung**    | Amplification target, not adoption. Save for after Phase 1 demos exist.                            |
| 9   | **Allie K. Miller** | LinkedIn gap blocks credible demo. Lower priority until gap closes.                                |
| 10  | **Maor Shlomo**     | Case study only — separate channel.                                                                |

## 5. Open Research Items

Confirm before outreach to each:

- **Riley** — Cursor specifics (subscription tier, recent posts citing it).
- **Pietro** — MagicPath team tools beyond Figma.
- **Swyx** — current Notion-vs-other tooling for Latent Space drafts.
- **Hamel** — course community on Slack or Discord (affects pitch angle).
- **Nick** — Instagram volume vs. X volume (does Instagram absence kill the pitch or just limit it?).
- **Allie** — primary CMS / authoring surface beyond LinkedIn.
- **Harrison** — does LangChain still use Linear or has the team moved?

## 6. What to do next

1. Pressure-test Corsair with DevJane (priority matrix §10 + §3.3 gap list above).
2. Lock S-tier demo recordings before any outreach.
3. Confirm research items in §5 for top-3 targets (Riley, Harrison, Pietro).
4. Tailor first-3 outreach drafts to _their_ specific stack overlap, not a generic "BuildOS connects to everything" pitch.
