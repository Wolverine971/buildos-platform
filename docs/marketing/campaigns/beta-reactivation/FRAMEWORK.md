<!-- docs/marketing/campaigns/beta-reactivation/FRAMEWORK.md -->

# Beta Reactivation Framework

_Reactivating the 86 original beta signups (July–Nov 2025) — segmentation, email doctrine, and activation mechanics_

**Status:** framework drafted 2026-07-17. Drafts in `/admin/emails` (category `beta_reactivation`, created 2026-07-15) are **v1 — do not send**. See audit below. Rewrites in [REWRITES.md](REWRITES.md), per-person analysis in [ROSTER.md](ROSTER.md).

**Related:** [`../retargeting/`](../retargeting/README.md) holds the general dormant-user pilot (infra: cohort freeze, holdout, 3 touches, reply tracking, `/welcome-back` page). This campaign is a specific cohort riding the same doctrine and, where possible, the same infra.

---

## 1. The situation

- **86 signups** between 2025-07-09 and 2025-11-25 (8–12 months ago). Signup form captured `why_interested`, `biggest_challenge`, `productivity_tools`, job/company — 44 people wrote substantive answers. This is the personalization fuel.
- **20 created accounts.** Of those, **7 left real work behind** (projects + brain dumps). **0 have touched the new onto system.** 12 logged in and bounced without creating anything.
- **66 never entered the product at all.** For them this is not "reactivation" — it is a **delayed first invitation**.
- No reactivation email has ever been sent to any of them. The 86 v1 drafts are unsent.

### Why this cohort is winnable

They already raised their hands for exactly what BuildOS now is. Their signup answers are one long chorus: _too many ideas, can't keep track, no follow-through, tools don't hold it together, ADHD/executive function_. The product they asked for in July 2025 is the product that exists in July 2026. The only obstacles are (a) a bad or absent first impression, and (b) 8–12 months of silence. Both are addressable with honesty.

## 2. Audit of the v1 drafts (why they don't ship)

Grade: **C-. Rewrite everything.** Specific failures:

1. **The elephant is missing.** No draft acknowledges that ~a year has passed or that the product wasn't ready back then. They read as if the person signed up last week. This is the single biggest miss — the honest time-gap admission IS the pattern interrupt, and it's the campaign's stated core (see retargeting EMAIL_COPY.md: "I do not think the product earned a habit yet").
2. **One skeleton, 86 times.** Every draft: "You joined the BuildOS beta [to/with/because]…" → near-verbatim identical feature paragraph ("turn messy voice or text input into a project with durable context, linked tasks, and documents… in-app agent… proposes changes for your approval") → "I invite you to spend five minutes today" → link. Anyone who compares notes, or has an AI-tuned ear, spots the template instantly.
3. **Feature-dump middle.** Violates the anti-AI stance (lead with relief, not capabilities).
4. **Unattributed personal data = creepy.** Drafts quote project names ("your Synapse Matrix server setup") without saying how we know. Same data with provenance ("your account still has the project you started") reads as care instead of surveillance.
5. **Tone-deaf subject lines.** Gerund-benefit template throughout ("Moving/Turning/Organizing your X") — drip-campaign smell. Worst case: _"Turning existential dread into a plan"_ mirrors a signup's darkest words back at her in a subject line. Never do this.
6. **Fabrication.** E.g. the Ian Bicking draft invents "keeping those initial thoughts from disappearing into a Google Doc is a constant challenge" — he never said that. Several S3 drafts say "jump back in" to people who never entered.
7. **One CTA for everyone.** "Spend five minutes today" regardless of relationship depth.

What v1 got right and we keep: per-person subject/body ambition, `/welcome-back` vs `/auth/register` link routing, founder sender, UTM discipline.

## 3. List hygiene (do first)

| Action               | Who                                                     | Why                                                                                                    |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Remove**           | `djwayne35@gmail.com`                                   | DJ himself                                                                                             |
| **Remove**           | `ycdemo@hausofapex.com`                                 | Test account ("This is a test account by Zach")                                                        |
| **Remove**           | `zach@hausofapex.com`                                   | Zach is DJ's co-founder — not a reactivation target                                                    |
| **Fix**              | `radioriver@yahoo.c` → `radioriver@yahoo.com`           | Truncated domain. → **S3-T** delicate handling (see §4)                                                |
| **Fix**              | `lanemlarson@icloid.com` → `lanemlarson@icloud.com`     | Typo domain. → **S3-T**                                                                                |
| **Fix**              | `ryanbesslings72@ail.com` → `ryanbesslings72@aol.com`   | Typo domain (best guess: `ail`→`aol`, one-char slip). → **S3-T**. Bonus hook: he's a Maryland neighbor |
| **Low expectations** | `onefupidstucker.jinx735@8shield.net`, `*@duck.com` × 2 | Relay/burner addresses; send once, never chase                                                         |

**Net sendable: 83.** The typo'd three most likely never received _anything_ from BuildOS — the original welcome email would have bounced. Their copy must account for a full year of total silence (see S3-T below). Corrections are best-guess single-character fixes; if one bounces, drop it and move on — never retry variants (that's address-guessing, not outreach).

## 4. Segmentation framework

Two axes. **Axis 1: relationship depth** (what they did) picks the _message frame and CTA_. **Axis 2: story specificity** (what they told us) picks the _personalization depth_.

### Axis 1 — relationship depth

| Segment                   | Definition                                                                 | Count             | Frame                                                                                                                                                                                                                                    | CTA                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1 — Left work behind** | Account + projects/brain dumps                                             | 6                 | "Your project is still here. The product finally deserves it."                                                                                                                                                                           | Reply-question about _their_ project, or one-click reopen. High-touch: concierge offer. Project mentioned **by title only** (see §5 rule 3) |
| **S2 — Peeked inside**    | Account, zero artifacts                                                    | 11 real           | "You made it in, and I'm guessing it didn't click. That was fair — it barely worked."                                                                                                                                                    | `/welcome-back` link, one honest relief line                                                                                                |
| **S3 — Raised a hand**    | Signup only, never entered                                                 | 66                | Delayed first invitation: "You asked for access. It wasn't ready. I didn't want to burn your first impression. Now I'm ready."                                                                                                           | `/auth/register` link + no-hard-feelings opt-out line                                                                                       |
| **S3-T — Typo cohort**    | Signup only, address typo'd — likely never received a single email from us | 3 (inside the 66) | Extra-delicate: a year of _total_ silence, possibly wondering why they never heard back. "I don't think anything we sent ever reached you — your signup had a one-letter typo in the address. This is me finally reaching the real you." | Same as S3 + the typo honesty is the hook                                                                                                   |

S1 members: Michael McCulley (note: visited as recently as 2026-03), Cris Soto, Wil Allyn, Joris Conrad, Tab Hawk, Luis Colon.

### Axis 2 — story specificity

| Type                     | Signal                                                              | Personalization move                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Named a thing**    | Concrete project / company / craft in signup answers                | Mirror their noun ("your keno model", "the Synapse server", "three startups and a festival"). Subject can be the noun                                                                     |
| **B — Named a struggle** | ADHD, executive function, too-many-ideas, follow-through, overwhelm | Mirror the pattern in their words, lead with relief. **Sensitive subset** (brain injury, existential dread, "audhd and lost"): warm, never quote dark words back, never in a subject line |
| **C — Thin answer**      | Generic or empty                                                    | Don't fake personalization. Short honest founder note from the segment template                                                                                                           |

Every person is classified S#-letter in [ROSTER.md](ROSTER.md).

## 5. Email doctrine (rewrite rules)

1. **Lead with the elephant.** First line names the gap: "You signed up for the BuildOS beta last July." No throat-clearing.
2. **Own the miss in one sentence.** "The version behind that signup form barely worked — you could dump thoughts in and it would sort of organize them. That was it." Self-aware, not groveling.
3. **Attribute everything — and respect the data boundary.** Two classes of knowledge:
    - **Their words to us** (signup answers): fair game, always attributed. "When you signed up, you told me…"
    - **Their product data**: project **titles and existence only**. Never contents, never brain-dump text, never activity patterns ("you logged in twice", "you left two brain dumps"). We are not snooping in their projects, and the emails must neither do it nor imply we could. "Your account still has the project you started — _Throttle Racing Club_" is the ceiling.
4. **Mirror their nouns, don't paraphrase into marketing.** Amber gets "three startups, a nonprofit board, festivals, and your own art" — not "your fractional COO and creative work."
5. **One idea about what changed, in relief terms.** The context thesis in plain words: "AI got genuinely smart this year. It's still dumb about _your_ work unless something holds the context. That's what I've been building." Never a feature list.
6. **One CTA.** Reply-question (S1) or a single link (S2/S3). The demo link lives in the P.S., not beside the CTA.
7. **Under ~120 words** body (S1 may run slightly longer). Founder note, not newsletter.
8. **Subjects: their noun, or plain honesty.** "your Synapse server" / "the sim racing café" / "you signed up for buildos a year ago" / "buildos wasn't ready. it is now". Lowercase-natural. Never gerund-benefit constructions.
9. **Zero fabrication.** If we don't know it, we don't imply it.
10. **Give S3 a graceful exit.** "If this isn't relevant anymore, reply 'done' and that's the last you'll hear from me." Disarms the out-of-nowhere, earns trust, keeps the list clean.

## 6. Activation mechanics beyond the email

The goal is curiosity → first real project in the new BuildOS. Ranked by expected impact. **Decisions locked 2026-07-17 (DJ):** concierge ✅, founding-beta angle ✅, demo video ✅ (DJ records, see §9), personal Looms of user projects ❌ (privacy), data-respect touch ❌ (dropped — data respect is a given, not a lever).

1. **Concierge rebuild (the killer offer — S1 and rich S3). ✅** "Reply with whatever's in your head about [their project] — messy is fine — and I'll send you back a link to it organized in BuildOS." We do their first brain dump _for_ them: zero friction, demonstrates the exact core value, converts an email into a thread. Privacy-clean: the input is what _they_ choose to send us, not what's sitting in their account.
2. **Founding-beta-tester angle. ✅** DJ's framing, verbatim spirit: _"You were one of the first people to try BuildOS, but it was in a rough state when you tried it. It's now worth beta testing."_ This re-invites them into a **role** (early tester whose judgment we want), not just a purchase. Identity + Ben-Franklin effect: asking for their eyes is more activating than offering them a discount. No pricing promises unless DJ later defines one.
3. **Reply-first CTAs for S1.** "Did the sim racing café happen? Genuinely curious." Replies beat clicks: starts a thread, trains deliverability, gathers intel even when they don't reactivate.
4. **One 2-minute demo video. ✅** DJ records it on **his own projects only** (never a user's), scrappy and real, captioned so it works muted; hosted at/linked from `/welcome-back`, referenced only in the P.S. This replaces the per-person Loom idea, which is dead for a good reason: opening users' projects to film them is snooping, and this campaign's credibility rests on _not_ being that company. See §9 for the shot list.

## 7. Sequencing & execution plan

**Phase 0 — hygiene: ✅ decided 2026-07-17.** Exclusions per §3 (DJ, ycdemo, Zach). Typo addresses corrected best-guess; bounces get dropped, never variant-guessed.

**Phase 1 — angle decisions: ✅ locked 2026-07-17.** Concierge yes. Founding-beta-tester angle yes (no pricing promise). Personal Looms no (privacy — titles only). Data-respect touch dropped. Demo video: DJ records (§9).

**Phase 2 — regenerate all 83 drafts** per doctrine + ROSTER hooks; DJ spot-checks ~10; update the drafts in `/admin/emails` in place (v1 bodies are backed up).

**Phase 3 — send in waves (Tue–Thu mornings):**

- Wave 1: S1 (6) with reply-CTAs + concierge. Watch replies 2–3 days; calibrate.
- Wave 2: S2 (11).
- Wave 3: S3 including the typo trio, in batches of ~20/day (protects deliverability and DJ's reply capacity).
- Mechanics: from DJ's real address, plain-text-looking, one body link + P.S. link max. Links are short links (`/s/welcome-back`, `/s/start`) that re-attach the full UTM payload (`utm_campaign=beta-reactivation-…`) on redirect — **deploy the `/s` route before sending**.
- Demo video is NOT a blocker: waves can ship without the P.S. line, or the P.S. gets added from Wave 2 onward once the video exists.

**Phase 4 — follow-up touches:**

- Touch 2 (day 4–6, non-responders): different angle — the receipt/demo. "Here's what a messy brain dump looks like after BuildOS chews on it" (screenshot or 30s clip), or the concierge offer if touch 1 didn't carry it.
- Touch 3 (day 12–14): founding-beta-tester last call — "you were one of the first ~100; the beta is finally worth your time, and I'd value an early tester's eyes." One send, then done.
- Stop rules: any reply → out of sequence, DJ handles personally. "done"/negative → suppress everywhere (`email_suppressions`).

**Infra note:** the 20 account-holders can ride the retargeting pilot machinery (`buildos_reactivation_founder_pilot`: cohort freeze, holdout, touch tracking, reply status). The 63 signup-only people have no `user_id`, so they run through the admin email composer drafts. Keep the same campaign UTM so `/welcome-back` analytics unify. A holdout is optional here — the list is small and this is a one-shot founder campaign, not the A/B pilot; recommend **no holdout** for S1/S2 (too few people, every one matters), optional 10-person holdout inside S3 if DJ wants a read.

**Measurement:** replies > clicks > opens. Reactivation = signed in AND created/updated a project within 14 days of touch. Track per segment; expect S1 to dominate. Even 5–8 reactivations from 81 sends is a win at this stage; the replies are worth as much as the logins.

## 8. What "what changed" means (the one-paragraph story)

For copy consistency, the shared narrative — pick one or two sentences per email, never the whole list:

> When you signed up, BuildOS could take a brain dump and sort of organize it. Since then it became a real thinking environment: brain dumps become projects with context that compounds, an agent that actually knows your project plans and audits work with you (changes only ship with your approval), daily briefs that keep threads warm, calendar that follows through, voice notes, OCR, collaboration. And the landscape shifted the same direction — everyone has smart AI now, but it's amnesiac about your work. The thing that makes AI useful is accumulated context. That's the bet BuildOS made a year before it was obvious.

Written to spec: humble about then, concrete about now, rides the "context is the moat" thesis DJ wants — without leading with "AI-powered."

## 9. Demo video spec (DJ records, ~2 minutes)

Privacy rule applies to the video too: **DJ's own projects only**, nothing user-related on screen, no admin surfaces. Scrappy-authentic beats polished — this is a founder showing his tool, not an ad.

Shot list (~2:00):

1. **0:00–0:30 — the dump.** Open BuildOS, hit brain dump, and _actually ramble_ (voice) about a real messy project for 20 seconds. The mess is the point.
2. **0:30–1:15 — the receipt.** Show what came back: the project, its context doc, tasks with next steps. One sentence: "I didn't organize any of this."
3. **1:15–1:45 — the agent.** Ask the project agent something real ("what should I do next?" / "audit this plan"). Show the proposed change + one-click approve.
4. **1:45–2:00 — the close.** Daily brief glimpse + one line to camera or voiceover: "This is what I wished existed when you signed up. Five minutes and you'll know."

Production: DJ records screen + voice in one take (imperfect is fine). Claude post-produces: cut, captions burned in (must be watchable muted), hosted and linked from `/welcome-back`. Existing `video-to-guide` / captioning pipeline covers this — hand over the raw `.mp4` and it comes back captioned.
