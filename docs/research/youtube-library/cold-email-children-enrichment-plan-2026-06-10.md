---
doc_type: research-report
skill: cold-email-engagement-first-outreach
created: 2026-06-10
visibility: internal
publish: false
purpose: Per-child enrichment plan with distilled, agent-checkable material for the five thin cold_email_* runtime skills, mined from the cleaned source corpus, existing source analyses, research-draft references, and targeted web research.
path: docs/research/youtube-library/cold-email-children-enrichment-plan-2026-06-10.md
---

# Cold Email Children Enrichment Plan — 2026-06-10

Raw material for five enrichment agents. Each child section contains (a) current state, (b) distilled material ready to become reference modules, (c) a proposed reference-module split, and (d) what stays in the shell. Every block cites its source inline.

North-star metric for the whole suite (keep verbatim in every child):

```text
qualified conversations started per unit of market trust consumed
```

Source paths used throughout (abbreviated):

- `CORPUS:` = `docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/`
- `SA:` = `apps/web/src/content/blogs/source-analyses/`
- `DRAFT-REF:` = `docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/`
- `RUNTIME:` = `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/`

---

## 1. Executive Summary

**Enrichable from existing internal material alone (corpus + source analyses + research-draft references):**

- **`cold_email_reply_os` — STRONG.** Close 1-2-3 / Hail Mary / follow-up-plan cards, Gong objection card, Black Swan tactical-empathy card, the Steli source analysis, and `DRAFT-REF:reply-handling.md` (which is itself a near-finished reference module the runtime skill never absorbed) cover the full planned output: reply taxonomy, SLA matrix, objection route table, numbered fork library.
- **`cold_email_offer_lab` — STRONG.** Dunford, Moesta, Challenger, Mom Test cards plus the Aaron Shepherd front-end-offer analysis and Austin Schneider "deliverable, not a meeting" rule cover the offer artifact library and trust/ask rubric. The existing `offer-design-rubric.md` reference is good; it needs a mode-keyed artifact library and a trust/ask ratio rubric added.
- **`cold_email_outreach_compiler` — STRONG with web fill.** Mode templates exist across Connor Murray (3-paragraph enterprise), Aaron Shepherd (casual volume), `DRAFT-REF:strategic-and-single-target.md` (anchor→bridge→proof→artifact→CTA anatomy), Seibel/YC (investor payload), Gem/Greenhouse/RecruitingDaily (recruiting), Kai Davis + Muck Rack (PR/podcast). Subject/preview numeric rules required web research because **all four Lavender corpus cards are scrape failures** (see below).

**Needed web research (done in this pass, results embedded below):**

- **Lavender benchmark + subject-line data** — the corpus cards `CORPUS:web/lavender-*.md` contain only "Read next" footer boilerplate; the actual articles were never captured. Re-fetched 2026-06-10 from lavender.ai (231,818-email Feb-2026 benchmark; subject 1–3 words; reading-level and word-count reply lifts). Feeds `taste_review` and `outreach_compiler`. Directional-vendor status preserved.
- **2026 provider sender-requirement changes** — Google began **server-level rejection** (not just spam-foldering) of non-compliant bulk mail in Nov 2025; Postmaster Tools v2 now shows binary Pass/Fail compliance; Microsoft enforces SPF/DKIM/DMARC for 5k+/day senders to outlook.com (Junk-foldering from 2025-05-05, then 550 5.7.515 rejection). This belongs primarily in `cold_email_deliverability_readiness` (out of scope here) but `learning_review` and `outreach_compiler` need the one-line context: _low opens in 2026 are more likely a compliance/placement failure than a copy failure._
- **A/B test validity rules** — the corpus "experiment-guide" card scraped the wrong page (experimentguide.com book blurbs instead of Evan Miller's article). Re-fetched evanmiller.org/how-not-to-run-an-ab-test.html for the peeking problem and fixed-sample rule. Feeds `learning_review`.

**Genuinely unsourced after this pass (flagged per child below):**

1. **Trust-consumed measurement** for `learning_review` — no external source measures "market trust consumed"; the proxy metric set (complaint rate, opt-out rate, negative-reply share, spam-foldering trend) is assembled from deliverability + benchmark sources but the composite is our own construction. Mark it as internal methodology, not sourced fact.
2. **Async email-specific objection examples** for `reply_os` — Black Swan and Gong are call-centric; the email adaptations are our derivation (already noted in `CORPUS:SYNTHESIS.md` "Missing Or Weak").
3. **Manual book extractions** (Dunford _Obviously Awesome/Sales Pitch_, Moesta _Demand-Side Sales_, Fitzpatrick _Mom Test_, _Challenger Customer_) — would deepen `offer_lab` examples; queue item, not blocker.
4. **Taste scorecard thresholds** — the dimensions are sourced; the pass/revise/do-not-send cut lines are our calibration. Label them as defaults to tune, not industry standards.

**Coverage verdict per child:** reply_os **strong** · offer_lab **strong** · outreach_compiler **strong** · learning_review **partial→strong** (benchmarks directional) · taste_review **partial** (dimensions sourced, thresholds internal).

---

## 2. `cold_email_learning_review`

### 2a. Current state

`RUNTIME:cold_email_learning_review/SKILL.md` is 1.6KB with no references/ directory. The workflow is sound (separate metrics → diagnose layer → extract buyer language → decide → next test) but carries zero numbers: no benchmark ranges, no sample-size discipline, no stop/iterate/recycle/scale gates, no learning memo template. The queue's planned artifacts for this child (Batch 4): stop/iterate/recycle/scale decision tree + learning memo template; (Batch 4 sources): Cognism 2026, Mailshake 2025, Lavender benchmark, experiment-design sources.

### 2b. Distilled material

#### Metric diagnostic table (which metric diagnoses which failure)

Source: Connor Murray three-rate diagnostic (`SA:connor-murray-cold-email-assumptive-cadence.md` §"Tracking three inputs, not one"), extended with deliverability context (`SA:austin-schneider-engagement-first-cold-email-2026.md`) and 2026 provider enforcement (web, see §1).

| Metric                                      | What it diagnoses                                 | If low, suspect (in order)                                                                                   |
| ------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Delivered rate / bounce rate                | List hygiene + domain health                      | List source quality, verification skipped, domain reputation                                                 |
| Open rate                                   | Subject + preview + sender reputation + placement | 2026 note: compliance/placement failure first (auth, complaint rate), then subject/preview, then send timing |
| Reply rate (all)                            | Body craft + CTA friction                         | Passive language, multi-CTA, ask too large, no artifact offer                                                |
| **Positive** reply rate                     | Offer + segment fit                               | Offer not useful pre-meeting, wrong persona, stale signal                                                    |
| Meeting-booked rate (from positive replies) | Relevance paragraph + reply handling speed        | "Why I'm relevant" misses persona priorities; slow reply routing                                             |
| Meeting held rate                           | Qualification + expectation set in thread         | Front-end offer attracted bad-fit; no pre-call filter                                                        |
| Complaint / opt-out / angry-reply rate      | Trust consumed                                    | Segment too broad, cadence too long, fake personalization                                                    |

Hard rule (Murray): **never optimize a single composite "reply rate."** Replies include "no," "stop," and "wrong person." Diagnose stage by stage.

Hard rule (Mailshake, `CORPUS:pdf/mailshake-state-of-cold-email-2025.md`): open rate is "a directional metric, not a definitive one... Use reply rate as your true north, not open rate." Opens are additionally unreliable due to privacy proxies — treat open deltas >10pts as signal, smaller moves as noise.

#### Benchmark bands (all directional-vendor; triangulate before treating as governing)

From Mailshake State of Cold Email 2025 (508 self-reporting senders, survey early 2025; methodology stated; `CORPUS:pdf/mailshake-state-of-cold-email-2025.md`):

- Most common reply-rate band: **1–4%**. Only **~16% of senders exceed 5%** reply rate.
- Most common open-rate band: **10–30%**; few exceed 40%.
- Bounce: nearly half of senders report **2–5%**; **15% exceed 6%**. "Bounce rates above 5% signal risky list hygiene and can cripple sender reputation." Monitor weekly.
- **69% of respondents** said performance declined YoY (spam filtering + AI-content fatigue).
- Top performers who personalize 1:1 report **2–3x higher reply rates**; only **5% of senders** personalize every email individually.
- High-volume senders (1,000+/mo) were **not** more likely to generate more leads than low/mid volume senders.

From Austin Schneider / Instantly (`SA:austin-schneider-engagement-first-cold-email-2026.md`):

- Industry-average reply rates fell **~5% → ~1%** after AI spam filters (Gmail 2024, Microsoft 2025); bulk-sender inbox placement fell **10–27%** Q1-2024→Q1-2025.
- Campaigns **<50 recipients: 5.8% reply** vs **>1,000 recipients: 2.1%** — the relevance ceiling.
- Touch effects: follow-up #1 **+49% replies**; email 3 **−20%** (2026 vs +9% in 2023); email 4+ **−55%** and trains filters to flag the sender as bulk.

From Cognism State of Outbound 2026 (internal Cognism team data, methodology stated: 149,376 emails, 451,895 calls, 39,679 meetings; "directional, not diagnostic"; `CORPUS:web/cognism-state-of-outbound-2026.md`):

- SDR cold-call answered rate **13.3%** vs AE warm-call **14.4%** — list quality and timing, not volume, drive connection.
- Channel task mix in their top motion: calls **57%**, LinkedIn **27%**, email **15%** — email-only learning loops under-read the market when the motion is multichannel.
- ~70% of SDR calls came from sequences; structure drives consistency, personalization drives meetings.

From Lavender Cold Email Benchmark (231,818 cold emails as of 2026-02-04, ~50k inboxes; directional-vendor; https://www.lavender.ai/blog/the-cold-email-benchmark-report):

- A-grade emails to operations: **5.4% reply** (58% lift over baseline). Finance: **79% lift** for A-grade, but only **6.1% of finance emails earn an A**. Technical buyers baseline ≈ **5.2%**.
- Use: quality lift is real and measurable per persona — when a campaign underperforms, grade the email quality before declaring the segment dead.

From Gem (vendor, recruiting mode; `CORPUS:web/gem-cold-recruiting-email.md`): average **32% reply rate for a 4-stage recruiting sequence** — recruiting benchmarks are an order of magnitude above sales benchmarks; never grade recruiting campaigns against sales bands.

From Predictable Revenue (`CORPUS:pdf/predictable-revenue-methodology.md`) — validation-phase gates for an outbound system: open rate **>40%**, meeting acceptance **>80%**, ~**20% of opportunities "go deep,"** SDR task on-time execution **>90%**. And the nurture asymmetry: assume only **~5% of created opportunities buy within 90 days**; **95% of outbound value is the nurture pipeline**; channel takes **12–18 months** to mature. Implication: a campaign is not "dead" because it produced no near-term meetings — count nurture-pipeline adds.

#### Sample-size and test-validity rules

Source: Evan Miller, "How Not To Run An A/B Test" (https://www.evanmiller.org/how-not-to-run-an-ab-test.html; the corpus card `CORPUS:web/experiment-guide.md` mis-scraped this — it contains book blurbs only); Kohavi et al. _Trustworthy Online Controlled Experiments_ ch.1 (`CORPUS:pdf/trustworthy-online-controlled-experiments-chapter1.md` — note the card is mostly endorsement blurbs; the usable principles are: define an Overall Evaluation Criterion, test trustworthiness before interpreting, implement guardrail metrics, beware Twyman's law / carryover effects).

- **No peeking.** Checking repeatedly and stopping at the first significant result inflates a nominal 5% false-positive rate to as much as **26.1%**. Decide sample size in advance; read once at the end.
- **Fixed-sample formula:** n ≈ 16·(σ²/δ²) per arm, with σ² = p(1−p) for rates. Practical cold-email table (baseline 3% positive-reply rate):
    - detect 3% → 6% (doubling): ≈ **n=560 per arm**.
    - detect 3% → 4.5%: ≈ **n=2,100 per arm**.
    - detect 3% → 3.5%: ≈ **n=18,000 per arm** — i.e., micro-segment campaigns can only detect _large_ effects. If the campaign is <100 sends, treat results as qualitative evidence (buyer language, objection mix), never as a rate comparison.
- **One variable per test** (already in shell; keep). Holding rules from `DRAFT-REF:high-volume-and-deliverability.md` §Offer Testing: same CTA across variants, one persona × one signal, same list source per variant, same sending infrastructure per variant — otherwise placement differences masquerade as copy differences.
- **OEC for this suite:** qualified conversations per unit of market trust consumed — not replies, not meetings booked (Kohavi OEC concept applied to the suite's north star; composite construction is internal, see gaps).

#### Stop / Iterate / Recycle / Scale decision tree

Assembled from: Schneider non-responder recycling (`SA:austin-schneider...`), Mailshake bands, Shepherd volume-as-data (`SA:aaron-shepherd-volume-front-end-offer.md`), Close "no response is a response" (`CORPUS:web/close-cold-email-follow-up-plan.md`), Predictable Revenue nurture asymmetry. Gate values are defaults to tune per market — label as internal calibration.

```text
0. TRUST GATE (check first, overrides everything):
   complaints >0.3% absolute or >0.1% sustained, bounce >5%,
   or spam-foldering evidence → STOP SENDING. Fix sender/list before
   reading any copy/offer metric. (Google/Yahoo 0.3% ceiling, 0.1% target;
   Mailshake bounce threshold.)

1. SAMPLE GATE: fewer than ~200 delivered per variant, or mixed personas
   → NO RATE VERDICT. Extract buyer language + objections only.
   Next action: keep sending or widen the same segment.

2. POSITIVE-REPLY GATE (offer/segment signal):
   positive reply ≥3% → candidate to SCALE (step 4).
   positive reply 1–3% → ITERATE: change ONE of offer artifact / persona
     priorities paragraph / signal freshness. Re-test same segment.
   positive reply <1% AND opens ≥30% → offer or segment is wrong:
     RECYCLE non-responders into a new campaign with a different
     opener + different artifact offer (Schneider replacement for touches 3–7).
   positive reply <1% AND opens <20% → packaging or placement problem:
     route to deliverability child first, then subject/preview rework.

3. QUALITY GATE (before scaling):
   meetings from positive replies <40%, or bad-fit replies >50% of replies
   → fix reply routing / qualification before scale (Shepherd back-end filter).

4. SCALE: widen the same persona × signal, add adjacent micro-segments
   (keep each <50–500 recipients per Schneider relevance cliff), add domains
   not per-inbox volume. Re-run gates at each expansion.

5. DEAD: two recycle attempts on the same segment with <1% positive reply
   and no usable buyer language → declare segment dead, document why,
   move budget. Keep the buyer-language file.
```

#### Buyer-language extraction worksheet

Sources: Close Hail Mary case (`CORPUS:web/close-hail-mary-dead-leads.md`), Mom Test rules (`CORPUS:web/mom-test-publisher-page.md`), Moesta timeline (`CORPUS:web/bob-moesta-demand-side-sales-talk.md`).

For every reply (including negative), capture:

1. **Verbatim objection phrase** (not paraphrase — buyer words feed future copy).
2. **Named alternative/incumbent** ("going with [competitor] because…" — the Close Hail Mary surfaced a previously unknown objection: easier hiring for the bigger-brand CRM).
3. **Timeline state** (Moesta): passive looking / active looking / deciding / onboarding / habit. "Not now" is timeline data → nurture, not failure.
4. **Evidence grade** (Mom Test): past behavior and current spend = strong; compliments and hypotheticals = weak. Tag compliments as weak unless paired with behavior.
5. **Decision dynamics** ("CEO made the call," "loved it but no power") → feeds the buying-committee map in `cold_email_icp_signal_design`.

Hail Mary corollary: don't end the conversation at the first reply — the price objection in the Close case only surfaced on the _second_ exchange. One follow-through question per reply minimum.

#### Learning memo template

Assembled to satisfy the queue's "learning memo template" artifact (structure internal; content fields sourced as cited above):

```markdown
# Learning Memo — [campaign] — [date]

Mode / segment / signal: [persona × signal, n delivered]
Test variable (exactly one): [what changed vs control]
Funnel: delivered % | open % | reply % | positive reply % | meetings | held
Trust cost: bounces % | complaints % | opt-outs % | angry replies (count)
Sample verdict: [rate-readable (n≥~200/arm) | qualitative only]
Diagnosis (one layer): [sender | segment | offer | body | proof | cadence | reply-handling]
Buyer language (verbatim): - ...
Objection mix: [counts by class]
Winning / losing lines: ...
Decision: [stop | iterate | recycle | scale | dead] + which gate fired
Next test (one variable): ...
Nurture adds: [count of good-fit, not-now accounts added]
```

### 2c. Proposed reference-module split

| Module id                                       | File                                             | Contents                                                                                                                                 | when_to_load                                                     |
| ----------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `cold_email_learning_review.metric_diagnostics` | `references/metric-diagnostic-benchmarks.md`     | Metric diagnostic table, benchmark bands with vendor caveats, 2026 placement context, mode-specific bands (recruiting 32% vs sales 1–4%) | When interpreting campaign numbers or comparing against "normal" |
| `cold_email_learning_review.decision_gates`     | `references/stop-iterate-recycle-scale.md`       | Trust gate, sample gate, decision tree, sample-size table, no-peeking rule, one-variable test rules                                      | When deciding what to do next after a test                       |
| `cold_email_learning_review.learning_memo`      | `references/learning-memo-and-buyer-language.md` | Memo template, buyer-language worksheet, evidence grading, nurture accounting                                                            | When writing up results or mining replies                        |

**Stays in the shell:** the 5-step workflow, output contract (add "sample verdict" and "trust cost" fields), guardrails (add: "No rate verdict below the sample gate"; "Trust gate overrides all other reads"; "Recruiting/PR/investor modes use their own bands").

### 2d. Gaps for this child

- Trust-consumed composite is internal methodology (flag in module).
- Cognism/Mailshake/Lavender all vendor data; the module must carry the queue's "directional unless methodology stated" rule inline (Mailshake and Cognism state methodology; keep Lavender "directional-vendor").
- No source for _time-decay of learning_ (how long a learning memo stays valid). Recommend future source: Trustworthy OCE ch. on long-term effects (manual book extract).

---

## 3. `cold_email_taste_review`

### 3a. Current state

`RUNTIME:cold_email_taste_review/SKILL.md` is 2KB, no references/. It has a good 9-step workflow (mode dignity checks, verdict, highest-risk line) but no scorecard, no thresholds, no named tests, no bad→good examples. Queue Batch 2 planned artifacts: **taste scorecard + bad-to-good rewrite examples**. Note: the Lavender teardown card (`CORPUS:web/lavender-email-teardown-1.md`) is a scrape failure — only the "them > you" title survives; the dimension is reconstructed from the re-fetched Lavender 101 article.

### 3b. Distilled material

#### The taste scorecard (8 dimensions, 0–2 each; 16 max)

Dimensions sourced as cited; **cut lines are internal defaults to tune** (≥13 pass · 9–12 revise · ≤8 do-not-send · any auto-fail = do-not-send).

| #   | Dimension                                     | 2 (pass)                                                                                                                                         | 0 (fail)                                                                                              | Source                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Two-people test** (personalization honesty) | Anchor line could only be about this recipient, OR is honestly graded as 1:many relevance with a strong (trigger-based) signal                   | "Personalized" opener that could be sent to two people unchanged; decorative detail                   | Becc Holland: "If you can send the same email to two people, it is relevance — not personalization" (`SA:becc-holland-personalization-to-relevance.md`)                                                                                                                                                                                                                                                               |
| 2   | **Bridge integrity**                          | Remove the hook and the outreach reason collapses — the anchor _causes_ the email                                                                | Hook is removable; personal detail with no business consequence ("fellow eagle," shared school alone) | McKenna authenticity bridge + Turkish-military-"training" context-miss example (`SA:sam-mckenna-show-me-you-know-me-ai-era.md`); `DRAFT-REF:strategic-and-single-target.md` audit question                                                                                                                                                                                                                            |
| 3   | **Them > you ratio**                          | ≥3:1 "you/your" vs "we/our/I"; first sentence proves relevance before introducing sender                                                         | Email opens with sender bio; "we help companies…"                                                     | RecruitingDaily/Recruiterflow 3-to-1 golden ratio, 50k-email dataset (`CORPUS:web/recruitingdaily-cold-outreach-six-elements.md`); Lavender teardown title "a little more them > you"                                                                                                                                                                                                                                 |
| 4   | **Readability**                               | ≤100 words (volume) / ≤170 (strategic, recruiting); 3rd–5th-grade reading level; 1-sentence paragraphs; one phone screen                         | Wall of text; 10th-grade+ register; jargon                                                            | Lavender: 3rd–5th-grade level = **+67% replies**; short mobile-shaped emails = **+83% replies**; 81% read on mobile (https://www.lavender.ai/blog/cold-email-101); Bay 50–100 words (`SA:florin-tatulea-reply-method-cold-email-showdown.md`); Murray one-phone-screen rule (`SA:connor-murray...`)                                                                                                                   |
| 5   | **Ask/trust proportion**                      | Smallest useful yes; artifact before meeting; ask helps the buyer make progress                                                                  | "Worth a chat?"; calendar link first touch; Zoom-with-a-stranger ask at zero trust                    | Justin Jackson: "A Zoom meeting with a stranger is a tremendous ask. Keep your request small." (`CORPUS:web/justin-jackson-cold-email.md`); Schneider "booking a call is not valuable… solve the problem with an actual action" (`SA:austin-schneider...`)                                                                                                                                                            |
| 6   | **Proof integrity**                           | Proof matched to the exact claim; named only with permission; verifiable                                                                         | Unsupported ROI ("457%"-style claims), vague "teams like yours," fabricated mutual contact            | Dunford "reserve proof for the specific differentiated claim" (`CORPUS:pdf/april-dunford-sales-pitch-structure.md`); Steli analysis critical treatment (`SA:steli-efti-low-friction-replies-123.md`)                                                                                                                                                                                                                  |
| 7   | **Voice / automation smell**                  | Reads like a person typed it; no "I hope this finds you well," no "just checking in," no theatric prepositioning                                 | Marketing-automation register; AI-template fingerprint; fake-casual                                   | Mailshake: "If your email could've been written by a robot, it's getting deleted by a human" (`CORPUS:pdf/mailshake-state-of-cold-email-2025.md`); Jackson on "I trust this email finds you well" ×5 (`CORPUS:web/justin-jackson-cold-email.md`); Shepherd follow-up don'ts (`SA:aaron-shepherd...`); Greenhouse "hope all is well… doesn't sound sincere" (`CORPUS:web/greenhouse-sourcing-email-best-practices.md`) |
| 8   | **Mode dignity**                              | PR: serves recipient's audience; recruiting: candidate-centered with honest constraints; research: discloses intent; investor: factual, non-hype | Audience-irrelevant pitch; hidden sales motive in research ask; hype                                  | Muck Rack checklist + guide (`CORPUS:pdf/muckrack-successful-pitch-checklist.md`, `pdf/muckrack-guide-to-pitching.md`: "don't try to dazzle them, give it to them straight"); Mom Test (`CORPUS:web/mom-test-publisher-page.md`); Seibel (`CORPUS:web/yc-cold-email-investors.md`)                                                                                                                                    |

**Auto-fails** (any one → do-not-send regardless of score): fabricated research/proof/mutual contact; research ask hiding a pitch (Mom Test); guilt or insult anywhere in thread ("probably bad timing," "just nudging" — Shepherd; `SA:aaron-shepherd...`); misleading subject ("Re:"/"Fwd:" on a first touch — Greenhouse card); claim that would embarrass the sender if screenshotted.

#### The screenshot test (named test, keep the name)

"Would a serious operator be embarrassed if the recipient screenshotted this and posted it?" Justin Jackson literally does this to bad cold emails (`CORPUS:web/justin-jackson-cold-email.md`). Check: fake warmth, oversized ask, automation fingerprints, unsupported claims, guilt language.

#### Fake-warmth detector (named patterns to flag)

- "I hope this email finds you well" / "Hope all is well" (Jackson; Greenhouse; Lavender 101 cliché list).
- "Loved your post" with no named post or point (McKenna weak-vs-strong research table, `SA:sam-mckenna...`).
- "Fellow [anything]" / "saw we're both dog dads" (Murray's LinkedIn-guru failure camp, `SA:connor-murray...`).
- Word-match personalization without semantic fit (McKenna's "training" example).
- "Just checking in" / "just nudging" / "bumping this" (Black Swan card taste implications, `CORPUS:pdf/black-swan-leadership-guide-tactical-empathy.md`; Shepherd).
- Compliment → pivot-to-pitch ("ulterior motive" pattern — Jackson: "the worst thing you could do is think: first I'll ask for advice, then ask them to buy").

#### Subject/preview taste rules (shared with compiler; taste owns the _rejection_ list)

Lavender data (directional-vendor; https://www.lavender.ai/blog/cold-email-subject-line-tips): questions in subject **−56% opens**; numbers **−46%**; ?/! punctuation **−36%**; no title case **−30%**; first names in subject **−12% replies**; 2→4 words **−17.5% replies**. Reject clichés: "Quick Question," "Thoughts?," "15 minutes?". RecruitingDaily counterpoint for recruiting mode: first name in subject **+16% opens** in their 50k-candidate dataset — mode matters; do not cross-apply.

#### Bad→good rewrite examples (assembled from corpus; ready to paste)

1. **Meeting-first → artifact-first** (root rewrite pattern, `RUNTIME:cold_email_offer_lab/references/offer-design-rubric.md`): "Worth a chat next week?" → "I pulled a short note on [specific tradeoff]. Want me to send it?"
2. **Feature-first → progress-first** (Dunford/Moesta): "We help teams automate [feature]." → "When teams hit [moment], [workaround] usually breaks because [tradeoff]. I can send the 3-point check we use to spot that."
3. **Decorative hook → causal bridge** (`DRAFT-REF:strategic-and-single-target.md`): "Saw you like Rush. We sell sales training." → "Saw your interview where you described sales onboarding as 'getting the whole band in time.' That's why I'm writing: we found two onboarding gaps that show up when teams scale past 20 reps."
4. **Passive → assumptive** (Murray table, `SA:connor-murray...`): "I was hoping to set up some time…" → "I'm looking to set some time…"; "If you're interested…" → "Do either of these dates work for you?"
5. **Guilt follow-up → fork** (Shepherd + Steli): "Just nudging you — probably bad timing." → the numbered fork with a dignified close-loop option.

### 3c. Proposed reference-module split

| Module id                                          | File                                              | Contents                                                                                                                                      | when_to_load                                                                      |
| -------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `cold_email_taste_review.taste_scorecard`          | `references/taste-scorecard.md`                   | 8-dimension scorecard with thresholds + auto-fails + screenshot test + verdict mapping                                                        | When grading any draft                                                            |
| `cold_email_taste_review.fake_warmth_and_rewrites` | `references/fake-warmth-detector-and-rewrites.md` | Fake-warmth pattern list, subject/preview rejection data, 5 bad→good rewrites, mode-dignity checks expanded (PR/recruiting/research/investor) | When the draft fails dimensions 1, 2, 7, or 8, or the user asks "why is this bad" |

**Stays in the shell:** When-to-Use, 9-step workflow (point steps 2–7 at the scorecard module), output contract, guardrails. Add one guardrail: "Scorecard cut-lines are internal defaults — say so when reporting a verdict."

### 3d. Gaps for this child

- Thresholds (≥13 / 9–12 / ≤8) are internal calibration — flagged.
- Lavender teardown before/after bodies were never captured; rewrites above are corpus-derived instead. Optional future pull: 2–3 Lavender "Email Teardown" posts re-fetched properly.
- No source on _taste for AI-disclosure_ (when a sender should disclose AI assistance). Genuinely unsourced; leave out.

---

## 4. `cold_email_offer_lab`

### 4a. Current state

`RUNTIME:cold_email_offer_lab/SKILL.md` is 2.6KB and already has one solid reference (`references/offer-design-rubric.md`: six-test artifact rubric, seven artifact families, two rewrite patterns, disqualifiers). Missing vs queue Batch 3 planned artifacts: **offer artifact library (by mode)** and **trust/ask ratio rubric**; plus production-cost discipline detail and meeting-ask exceptions.

### 4b. Distilled material

#### Core offer vs front-end artifact (the central distinction, with worked example)

Source: Aaron Shepherd (`SA:aaron-shepherd-volume-front-end-offer.md`). "Nothing in a cold email strategy is more important than your offer." The front-end offer is a no-commitment **test drive** of the core service:

| Core offer (too big for cold)                                   | Front-end offer (size of yes a stranger gives)                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| "Turn your experience into a client-generating book in 60 days" | "Free strategic book positioning audit — teardown of your existing messaging"                                           |
| "Done-for-you book that unlocks speaking gigs in 90 days"       | "Book topic validation — 15 min, validates your idea against your market" / "Seven-figure founder book-funnel teardown" |

Shape requirements (Shepherd): free or near-free · specific deliverable (audit/teardown/sample, not "let's chat") · custom to the recipient · opens the loop to the core offer. Schneider's hard line (`SA:austin-schneider...`): "Booking a call is not valuable. Sending a Loom video is not valuable in 2026… solve the problem with an actual action." Examples: SEO agency → free Google Business Profile optimization; cold-email agency → 100 verified leads + sample sequence; branding agency → free positioning teardown.

#### Offer artifact library by mode

Assembled per the queue's "artifact offer library by mode." Each row: artifact + smallest useful yes + source.

| Mode                        | Artifacts                                                                                                                                         | Smallest useful yes                                                                                                                                                                  | Source                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High-volume B2B             | Diagnostic audit, benchmark cut, signal report ("the 5 accounts showing [trigger]"), verified-lead sample, teardown                               | "want me to send it?" / "would that be worth sharing more?"                                                                                                                          | Shepherd; Schneider; existing rubric families                                                                                                                                                                                |
| Strategic B2B               | Mobilizer-forwardable: tradeoff memo, risk map, buying-committee question set, internal narrative draft, benchmark for their stage                | "want the internal version?" / "worth sending the two-page note?"                                                                                                                    | Challenger (`CORPUS:web/challenger-customer-profiles.md`): equip the Mobilizer with "insight, tradeoff clarity, and internal-coaching material"; 30MPC buyer-benefit framing (`SA:30mpc-multithreading-buying-committee.md`) |
| Physical / tangible product | Sample                                                                                                                                            | "Can I send samples?" (Florin's winning McDonald's-round CTA)                                                                                                                        | `SA:florin-tatulea-reply-method-cold-email-showdown.md` CTA-fits-product table: data product → snapshot; service → teardown; SaaS → 3 signals; advisory → note                                                               |
| Investor                    | The email itself is the artifact: problem, solution, launch status, traction, market, team, contrarian insight; optional standard-format deck     | "Would it be worth sending the deck?" / "Does this fit what you like to see?"                                                                                                        | Seibel ×2 (`CORPUS:web/yc-cold-email-investors.md`, `web/yc-email-early-stage-investors.md`): "Don't ask for a phone call or a meeting. Let me escalate things."                                                             |
| Recruiting                  | Role note with honest constraints (comp/level/location), hiring-manager context, "first 100 days" doc for candidates pitching themselves          | "open to seeing the role note?" — note RecruitingDaily's counterpoint that a 15-min call is an acceptable recruiting CTA; never "apply on the careers page," never a take-home first | Gem, Greenhouse, RecruitingDaily cards; Sahil Bloom 100-days example (`CORPUS:pdf/sahil-bloom-cold-email-thread.md`)                                                                                                         |
| PR / podcast                | Source packet (data, quotes, visuals, expert availability), 2–3 concrete topic angles ("choice of yeses"), pre-vetted expert, local sourcing help | "want the angle list?" / "which topic fits your audience?"                                                                                                                           | Kai Davis template (`CORPUS:web/kai-davis-podcast-outreach-email.md`); Muck Rack guide + PR News (`CORPUS:web/pr-news-state-of-journalism-2025.md`): "inspire a story rather than demand a transaction"                      |
| Customer research           | Anonymized findings summary, benchmark of peers, early access, honest counter-gift                                                                | "mind if I send 3 questions?" / interview ask with disclosed intent                                                                                                                  | Mom Test cards; `DRAFT-REF:investor-founder-pr.md`                                                                                                                                                                           |
| Founder-to-founder          | Specific note/draft/gut-check on their thing; genuine advice request (small)                                                                      | "Want me to send the note?" / "Open to a quick gut check?"                                                                                                                           | Jackson ("a genuine request for advice is a good way to create a connection"); Sahil Bloom mock-up-of-the-service pattern                                                                                                    |

#### Trust/ask ratio rubric

Assembled per queue artifact. Trust levels (internal construction; level behaviors sourced as cited):

| Trust level                                   | Definition                                                                | Acceptable ask ceiling                                                                   | Source basis                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| T0 — true stranger, volume                    | No prior contact, no recognition                                          | Permission to send an artifact ("want it?") — nothing more. No calendar links, no Looms  | Schneider, Shepherd, Jackson                                                                                 |
| T1 — stranger w/ strong signal or recognition | Trigger-based relevance; or sender is recognizable from content/community | Artifact + optional soft fork; recruiting may offer 15-min call                          | Becc Holland trigger strength (`SA:becc-holland...`); Jackson "be recognizable" pre-warming; RecruitingDaily |
| T2 — engaged (replied, accepted artifact)     | They responded or consumed the artifact                                   | Two specific times for a short call; keep the artifact promise first                     | `DRAFT-REF:reply-handling.md` reply-to-call frame                                                            |
| T3 — strategic w/ earned research             | SMYKM-grade anchor on a high-value named target                           | Direct time ask is acceptable ("What does your availability look like later this week?") | Murray strategic bucket; McKenna executive mode                                                              |

Rule of thumb: **the ask may never outrun the trust by more than one level**, and the artifact must be valuable _even if they never buy_ (existing rubric's "useful before meeting" test). Exception register (when a meeting-first ask is acceptable): Murray-style enterprise outreach where the sender genuinely owns the account relationship (T3); recruiting 15-min call (RecruitingDaily); never investors (Seibel), never PR (Muck Rack), never research (Mom Test).

#### Production-cost and false-positive checks

- **Production cost** (Shepherd; existing rubric "cheap to deliver"): if the artifact takes >30 min per accepted reply to produce, it cannot back a volume campaign — reserve it for strategic mode or pre-build a template.
- **False-positive avoidance** (Mom Test publisher card): collect evidence from past behavior, current spend, current workaround, urgency — never "would you use this?" in a first email; compliments are not validation.
- **Buyer-choice check** (Dunford card): "What buyer choice does this email help clarify?" If the artifact doesn't name or imply the current alternative, it's a brochure.
- **Struggling-moment check** (Moesta card): frame artifacts as help making progress at a named moment; "context creates value and contrast creates meaning."

### 4c. Proposed reference-module split

Keep `references/offer-design-rubric.md` as-is. Add:

| Module id                               | File                                     | Contents                                                                                                     | when_to_load                                                                                 |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `cold_email_offer_lab.artifact_library` | `references/artifact-library-by-mode.md` | Mode-keyed artifact library, core-vs-front-end worked examples, CTA-fits-product table, production-cost rule | When generating artifact hypotheses (workflow step 5) or the mode is non-sales               |
| `cold_email_offer_lab.trust_ask_rubric` | `references/trust-ask-ratio-rubric.md`   | T0–T3 ladder, ask ceilings, meeting-ask exception register, false-positive checks                            | When sizing the smallest useful yes (step 6) or judging whether a meeting ask is permissible |

**Stays in the shell:** everything currently there; update workflow step 5/6 to point at the new modules.

### 4d. Gaps for this child

- Trust-level ladder is internal construction from sourced behaviors — label it.
- Manual book extractions (Dunford, Moesta, Fitzpatrick, Challenger) remain the queue's named deepening path for richer examples.
- No pricing/risk-reversal source in corpus (Hormozi _$100M Offers_ was never acquired and his newsletter source is banned for this suite) — risk-reversal guidance stays out until a legitimate cold-context source is added.

---

## 5. `cold_email_reply_os`

### 5a. Current state

`RUNTIME:cold_email_reply_os/SKILL.md` is 2.4KB with one good reference (`references/tactical-empathy-routes.md`: response shape, 8-row route table, numbered fork, labels/calibrated questions). Missing vs queue Batch 4 planned artifacts: **full reply taxonomy** (the SKILL names 11 classes; the route table covers 8), **SLA matrix** (currently just "set owner and SLA"), **objection route table** (objection is one undifferentiated row). Crucially, `DRAFT-REF:reply-handling.md` is a near-complete superset that was never ported into the runtime skill.

### 5b. Distilled material

#### Reply taxonomy (canonical, 12 classes)

Sources: SKILL's own class list + `DRAFT-REF:reply-handling.md` + Close cards + Mailshake reply-content note ("If a lead replies to a cold email, typically the answer won't be 'let's have a meeting.' It may be 'we're using a competitor' or 'speak to X person'" — Michael Hanson in `CORPUS:pdf/mailshake-state-of-cold-email-2025.md`).

| #   | Class                                            | Detection cues                                             | Intent                                                                                                         |
| --- | ------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Yes / interested                                 | "send it," "tell me more," asks a question about the offer | High                                                                                                           |
| 2   | Send info                                        | "send me something," "what's the pricing"                  | Medium-high                                                                                                    |
| 3   | Numbered response                                | replies "1"/"2"/"3" to a fork                              | Per option                                                                                                     |
| 4   | Not now / timing                                 | "next quarter," "after [event]"                            | Medium (timeline data — Moesta)                                                                                |
| 5   | Already solved / competitor                      | names incumbent or "we're covered"                         | Low-medium (objection-discovery value — Close Hail Mary)                                                       |
| 6   | Objection (budget / priority / risk / switching) | substantive pushback                                       | Medium                                                                                                         |
| 7   | Skeptical                                        | "does this actually…," challenge to claim                  | Medium (serious buyers get critical — Gong card: negative sentiment increases toward purchase)                 |
| 8   | Wrong person / referral                          | "talk to X," "not my area"                                 | Routing value (Craig Elias: a referral target is warmer than a cold name)                                      |
| 9   | Compliment-no-action                             | "great email!" with no movement                            | Weak evidence (Mom Test: tag compliments weak)                                                                 |
| 10  | Angry / opt-out                                  | "stop emailing me," unsubscribe                            | Stop                                                                                                           |
| 11  | Auto-reply / OOO / left-company                  | bounce text                                                | "Left company" = trigger event for ICP child (Elias bounce surface, `SA:craig-elias-trigger-event-selling.md`) |
| 12  | Ambiguous                                        | unclassifiable one-liner                                   | Ask one calibrated question; do not assume                                                                     |

#### SLA matrix

Assembled per the queue artifact. Speed rationale: replies are scarce trust signals; same-day routing (`CORPUS:SYNTHESIS.md` Reply OS implications); "do not leave high-intent replies overnight when the motion depends on calls" (existing guardrail); Hormozi's 391% speed-to-contact stat is **list-email territory — do not cite it in this child** (Do Not Import).

| Reply class                  | Owner                              | First response SLA                            | Notes                                                                                                                                    |
| ---------------------------- | ---------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Yes / interested, numbered 1 | Sender (human)                     | Same business day; within 1–2h if call motion | Keep artifact promise before any meeting push                                                                                            |
| Send info                    | Sender or assistant                | Same business day                             | Send the promised artifact, never a brochure                                                                                             |
| Objection / skeptical        | Sender (human — judgment required) | Within 1 business day                         | Use objection route table below                                                                                                          |
| Wrong person / referral      | Sender                             | Within 1 business day                         | Thank, ask routing question, log new contact                                                                                             |
| Not now                      | Sender                             | Within 2 business days                        | Ask permission for a specific future touch; calendar it (Close follow-up guide: "I'll put that in my calendar and ping them in 14 days") |
| Angry / opt-out              | Sender                             | Same day                                      | Two lines max, confirm stop, suppress address                                                                                            |
| Left-company auto-reply      | System → ICP child                 | n/a                                           | Fire trigger workflow (Elias)                                                                                                            |
| Ambiguous                    | Sender                             | 1 business day                                | One calibrated question only                                                                                                             |

#### Objection route table (expands the single "objection" row)

Structure: label → one answer/artifact → one calibrated question (Black Swan response shape, `CORPUS:pdf/black-swan-leadership-guide-tactical-empathy.md`) wrapped in Gong's process discipline (`CORPUS:web/gong-objection-handling-techniques.md`, adapted from calls to async):

Gong's seven steps adapted to email: (1) don't fire back instantly — the email equivalent of the pause; (2) clarify with a question before answering (mirroring works; **never ask "why"** — it puts the buyer on defense); (3) validate before answering (summarize until they'd feel understood); (4) isolate ("is anything else stopping this?" — smoke-screen check); (5) get permission to share a different view; (6) reframe; (7) close with an unbiased resolution question — never "does that resolve your concern?" which begs a false yes. Bonus Gong data for context: objections are positive signals (skeptical buyers are serious buyers); pricing should be handled late, not first.

| Objection                | Label (first line)                                           | Move                                                                                                                                                                                                                          | Calibrated question                                                                                     |
| ------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| No budget                | "Totally fair — sounds like budget's locked for now."        | Acknowledge-and-redirect (Murray objection bank): offer the artifact anyway so they're ready when priorities shift                                                                                                            | "When does planning for next [quarter/FY] start?"                                                       |
| Already have a solution  | "Sounds like coverage is handled."                           | Contrast the _specific gap only if true_ (DRAFT-REF example: "the gap I usually see is whether reps can see [signal] before the account goes quiet — I can send the 3-signal snapshot and you can decide if it's redundant.") | "Is [specific gap] still annoying?" / "What should I send so you can decide whether this is redundant?" |
| Not a priority           | "Makes sense — sounds like this isn't this quarter's fight." | Timeline-tag (Moesta), route to nurture; permission ask for specific future touch                                                                                                                                             | "Would [month] be the wrong time to send the benchmark?"                                                |
| Switching cost / risk    | "Seems like the concern is switching cost, not interest."    | One proof point matched to the exact risk, or a risk-map artifact                                                                                                                                                             | "What would need to be true for this to be worth revisiting?"                                           |
| Skepticism about claim   | "Fair to be skeptical."                                      | One verifiable example; let them judge                                                                                                                                                                                        | "Want the example and you can judge?"                                                                   |
| Send-me-info-as-brushoff | (No label needed)                                            | Send the real artifact + one-line fork: active vs. polite-no                                                                                                                                                                  | "Should I close the loop after this, or is [pain] still live?"                                          |
| Competitor chosen        | "Congrats on getting that sorted."                           | Hail Mary learning move: ask one genuine learning question; do not counter-pitch                                                                                                                                              | "What tipped it for [competitor]?" (Close case: second-exchange questions surfaced the real objection)  |

#### Numbered fork library (three named forks)

Source: Steli Efti analysis (`SA:steli-efti-low-friction-replies-123.md`) + Close cards.

1. **Qualification fork** (first touch when several buyer states are plausible): 3–4 options anchored in buyer pain, not features; promise a tailored artifact per option (1 = teardown, 2 = benchmark, 3 = comparison checklist, 4 = close loop/right owner). No call ask in the same CTA.
2. **Ghosted-thread fork** (after real silence): light tone, dignified exit option, one per thread maximum. The existing reference's fork text is correct — keep.
3. **Objection-discovery / dead-lead fork** (Hail Mary): churned or long-dead leads; frame as feedback request, options = your top known objections + "no" option. Close's actual subject: "1, 2, or 3? I can take it." Goal is learning, not revival; every reply is a win.

Fork discipline (Steli + Close): options mutually exclusive · real buyer states, not manipulative false choices · always include a no/exit option ("you can work with a no; you can't work with being ignored… If you're open to 'no,' they know you don't plan on being pushy") · reply burden = one keystroke · follow through on the promised tailored next step · never two CTAs · don't make the no option embarrassing.

#### Silence and revival cadence rules

- Mode-dependent: volume = stop after touch 2, recycle non-responders into a new campaign (Schneider); strategic = 4 touches over ~7–8 days then stop (Murray); post-interaction (they engaged once) = 2-7-14-30-day rhythm then monthly, indefinitely until yes/no (Close follow-up guide, `CORPUS:web/close-follow-up.md`: cold = 6 touches max ever; engaged = "keep following up as long as it takes").
- Follow-ups redirect to the original email rather than pitching fresh (Murray: 70–80% of meetings come from follow-ups; "Please give me your thoughts on this" = his highest-reply line).
- Breakup email leverages loss aversion; optional 4th touch only (Close follow-up plan card).
- After verbal interest: follow up until booked or declined — assets: promised artifact, short proof, concrete agenda, two specific times (`DRAFT-REF:reply-handling.md`).

#### Tactical empathy boundary rules (taste-adjacent)

From the Black Swan card's "should not enter": no manipulative negotiation tactics, no long psychological analysis in email, no scripted-sounding mirrors. Labels: "Sounds like timing is the blocker." Calibrated questions: what/how only. Angry replies: "Understood. I will not follow up." — no defense, no explanation, no final question.

### 5c. Proposed reference-module split

Keep `references/tactical-empathy-routes.md` (route shape + labels). Add:

| Module id                                | File                                   | Contents                                                                                                                                                              | when_to_load                                                             |
| ---------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `cold_email_reply_os.reply_taxonomy_sla` | `references/reply-taxonomy-and-sla.md` | 12-class taxonomy with detection cues, SLA matrix, left-company trigger handoff, same-day routing rules, reply-to-call frame                                          | When classifying a reply (workflow step 1) or setting owner/SLA (step 6) |
| `cold_email_reply_os.objection_routes`   | `references/objection-route-table.md`  | 7-objection route table, Gong 7-step async adaptation, objection-bank template structure (acknowledge → label → one contrast/artifact → smallest calibrated question) | When the reply is an objection, skepticism, or competitor-chosen         |
| `cold_email_reply_os.fork_library`       | `references/numbered-fork-library.md`  | Three named forks with full text, fork discipline rules, revival cadence by mode                                                                                      | When silence revival or a fork is the chosen move (steps 2, 7)           |

**Stays in the shell:** workflow, output contract, guardrails — add "Never ask 'why' in an objection reply" and "One fork per thread, ever."

### 5d. Gaps for this child

- Async-specific objection examples are our adaptation of call-era sources (Gong/Voss) — known weak spot already flagged in `CORPUS:SYNTHESIS.md`. Recommended future source: a real corpus of email objection threads (internal BuildOS outreach replies once volume exists).
- The Steli "457% more replies" and "7%→39%" figures are marketing anecdotes — keep the existing analysis's rule: cite the mechanism, never the numbers.
- Gong's exact magic phrases were images in the original post and are absent from the card; the adapted phrasing above is reconstructed — label as adaptation.

---

## 6. `cold_email_outreach_compiler`

### 6a. Current state

`RUNTIME:cold_email_outreach_compiler/SKILL.md` is 2.2KB, no references/. The workflow names everything the queue's Batch 2 planned outputs require (subject/preview before body, mode register, proof slot, cadence map, reply routes) but carries no templates, no numeric rules, no lint checklist. Most of the raw material already exists in `DRAFT-REF:strategic-and-single-target.md`, `DRAFT-REF:high-volume-and-deliverability.md`, and `DRAFT-REF:investor-founder-pr.md` — the enrichment job is largely porting + adding the Lavender numbers fetched this pass.

### 6b. Distilled material

#### Subject + preview rules (the packaging pass)

Mode-keyed synthesis (the McKenna-vs-Bay tension is already resolved by mode in `SA:florin-tatulea-reply-method-cold-email-showdown.md`):

| Mode                  | Subject rule                                                                                                                                | Examples                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Volume outbound       | 2–5 words; internal-looking; no marketing language. Shepherd variant: 2–3 words, lowercase, no punctuation, curiosity not summary           | "quick question" (Shepherd), "book positioning"; Lavender good list: "Template Revisions," "Ramp," "Reply Rate Question" |
| Strategic account     | 3–8 words; specific noun, initiative, or direct-report names; still internal-looking                                                        | "enterprise ramp," "Mark and Larry," "north america expansion" (`DRAFT-REF:strategic-and-single-target.md`)              |
| Single-target / SMYKM | May be longer if the recipient will recognize the hyper-specific hook instantly                                                             | McKenna CEO-of-LinkedIn public-phrase subject (`SA:sam-mckenna...`)                                                      |
| Recruiting            | ≤30 characters; candidate first name OK (+16% opens in Recruiterflow's 50k dataset); location/remote mention helps; CTA at front if present | "[First Name], about your LinkedIn post"; "Remote [Job Title], [Company]" (Greenhouse card)                              |
| PR / podcast          | Upfront and clear on what the pitch is about; no cleverness                                                                                 | Muck Rack checklist                                                                                                      |

Universal rejections (Lavender subject data, directional-vendor, https://www.lavender.ai/blog/cold-email-subject-line-tips): questions **−56% opens** · numbers **−46%** · ?/! **−36%** · 2→4 words **−17.5% replies** · clichés ("Quick Question" capitalized-cliché form, "Thoughts?", "15 minutes?") · commands and superlatives · emojis · misleading "Re:"/"Fwd:" (Greenhouse) · money words in subject. Note Lavender's title-case finding (−30% opens without it) directly conflicts with Shepherd's lowercase register — resolve by register: formal modes title-case, casual-founder volume mode lowercase; never mix within a campaign.

Preview text (Florin/Bay + DRAFT-REF + Lavender): the first two sentences ARE the preview — write them deliberately; extend the subject, don't repeat it; surface the anchor early; never let a tracking pixel disclaimer or "view in browser" leak into preview. Murray's highest-reply follow-up runs entirely on preview text ("Please give me your thoughts on this").

#### Body length + register rules

- Volume: **25–50 words ideal, <75 good, 100 max** (Lavender 101: short mobile-shaped emails +83% replies; Bay: 50–100 words); one sentence per paragraph; one phone screen (Murray).
- Strategic/enterprise: 3 paragraphs, 4–6 sentences total (Murray); ≤170 words hard cap (Recruiterflow data: 170 was "the magic number," and <200 words lifted response 42% in Greenhouse's analysis — recruiting numbers, apply as ceiling not target).
- Reading level 3rd–5th grade (+67% replies, Lavender); 81% of email read on mobile.
- You:we ratio ≥3:1 (RecruitingDaily golden ratio).
- Investor: readable in <60 seconds (Seibel); three-sentence framework for early-stage asks (what you do / why exciting / what you want — `CORPUS:web/yc-email-early-stage-investors.md`).
- PR: <200 words; most reporters prefer pitches under 200 words (Muck Rack checklist). Podcast: 200–400 words with topic menu (Kai Davis).

#### Mode-specific compiler templates (the queue's "mode-specific compiler templates" artifact)

1. **Volume casual (Shepherd register)** — `First name,` on its own line, no greeting word, single-sentence body with front-end offer, CTA "would that be worth sharing more?" Full pattern in `DRAFT-REF:high-volume-and-deliverability.md` §Body Pattern. Follow-up = abbreviate the original, never fresh pitch.
2. **Volume/enterprise formal (Murray three-paragraph)** — Who I am (1–2 sentences, account-team framing) / Why I'm relevant (persona priorities + how the team addresses them) / What I want (assumptive time ask). Two full verbatim scaffolds in `SA:connor-murray-cold-email-assumptive-cadence.md` §"What this looks like in the wild". Assumptive-language replacement table applies as a lint pass.
3. **Strategic anchor-led** — Anchor → Bridge → Problem/opportunity → Proof → Artifact offer → smallest useful yes; Mobilizer-forwardable artifact for buying-group accounts; objection preemption (max one) — full anatomy in `DRAFT-REF:strategic-and-single-target.md` (port nearly verbatim).
4. **Investor (Seibel payload)** — problem, solution, launch status, traction, market, cofounders/technical, contrarian insight; named founder @ company domain; no meeting-first ask; CTA invites reply ("Does this fit what you like to see?"); deck optional, standard format; slow follow-up especially after confirmed opens. Sources: both YC cards + `SA:michael-seibel-cold-email-investors.md` + `DRAFT-REF:investor-founder-pr.md`.
5. **Recruiting (candidate-centered)** — why this person specifically / role relevance to their trajectory / one concrete role detail / honest constraints / small CTA. Six-elements checklist (name in subject +16%; send as hiring manager +29% response vs recruiter; <170 words; always follow up — follow-ups got 3× the responses of the first email; 3:1 you:we; dead-simple CTA). Sequence shape: 3–4 steps (1–2 get lost; >4 frustrates), spacing same-day / +2d / +3d / +5d (Greenhouse engage cadence); nurture = monthly. Sources: RecruitingDaily, Greenhouse, Gem cards.
6. **PR/podcast (audience-first)** — Kai Davis template verbatim (in `CORPUS:web/kai-davis-podcast-outreach-email.md`): recent-episode reference → who you help with what expensive problem → 3 topic angles with audience outcomes ("choice of yeses") → assumptive-but-small CTA ("reply with which topic fits your audience") → prep-materials ask. Muck Rack rules: beat fit verified by reading their last pieces; correct name spelling; <200 words; clear subject; follow-up **once, 3–7 days later** (51% of reporters say 3–7 days is right; ~45% say exactly one follow-up is ideal). Beat-specific seasoning from the Muck Rack pitching guide: tech = no hyperbole ("give it to them straight"); health = pitch the health angle + topline data visible; business/finance = beat relevance + don't bury the lede; broadcast = visual elements + everyday-people interviews; local = local angle + geographic bounds; lifestyle = respect publishing calendars/cyclical features.
7. **Founder-to-founder** — direct, specific, low ego, proof of real attention, small ask; CTAs "Want me to send the note?" / "Open to a quick gut check?" (`DRAFT-REF:investor-founder-pr.md`; Jackson card). Sahil Bloom checklist as the operator variant: find/guess the address (4 patterns cover >80%), short + hard enters, specific personal touch, non-humble proof, value-first artifact (mock-up/100-days doc), bold single CTA, standalone bolded ask line (`CORPUS:pdf/sahil-bloom-cold-email-thread.md`).

#### Body lint checklist (run after drafting, before bundling)

1. Passive→assumptive sweep (Murray table): "I was hoping…"→"I'm looking…"; "If you're interested…"→date question; "Worth a chat?"→banned (root guardrail).
2. Cliché sweep: "I hope this finds you well," "hope all is well," "just checking in," "quick question" as a _body_ opener (Lavender 101, Greenhouse, Jackson).
3. One CTA only; CTA is a Call-to-Conversation, easy-to-answer, not a booking demand (Lavender 101 CTC rule) — except modes where time-ask is sanctioned (Murray strategic, recruiting).
4. You:we ≥3:1 (RecruitingDaily).
5. Word count + reading level per mode table above.
6. Proof claim-matched, permissioned (Dunford; root guardrail).
7. No attachment on follow-ups; follow-up #1 = same message different format (long→2-sentence or reverse), follow-up #2 = CTA restatement only, follow-up #3 = breakup/loss-aversion (Close follow-up plan card, `CORPUS:web/close-cold-email-follow-up-plan.md`).
8. Subject/preview pass per packaging rules.
9. Mobile render: no paragraph >2 lines on a phone (Lavender; Murray one-screen rule).

#### Cadence map by mode (attach to every bundle)

| Mode                    | Cadence                                                                                                                                                                                                 | Source                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Volume                  | Day 0 + Day ~3, stop; recycle non-responders into a new angle/offer campaign                                                                                                                            | Schneider two-touch (+49% on touch 2, −20% touch 3, −55% touch 4+); `DRAFT-REF:high-volume-and-deliverability.md` |
| Strategic               | 4 touches, alternating days, 7–8-day window: initial / benefit-of-the-doubt / "thoughts on this" / assumptive breakup ("Is next month better? Closing the loop either way.") Never Monday-Monday-Monday | Murray (`SA:connor-murray...`); 70–80% of meetings from follow-ups                                                |
| Executive single-target | ≤4 touches in-thread; test Thu/Fri (and cautiously weekend) initial sends; follow-up within 48h while research is fresh                                                                                 | McKenna (`SA:sam-mckenna...`)                                                                                     |
| Investor                | Slow; never rapid-fire after confirmed opens                                                                                                                                                            | Seibel                                                                                                            |
| Recruiting engage       | 4 steps: 0 / +2d / +3d / +5d over ~2 weeks; nurture monthly thereafter                                                                                                                                  | Greenhouse                                                                                                        |
| PR/podcast              | One follow-up, 3–7 days; nothing more                                                                                                                                                                   | Muck Rack checklist                                                                                               |
| Post-engagement revival | 2-7-14-30 then monthly; numbered fork as the revival instrument                                                                                                                                         | Close follow-up guide; Steli                                                                                      |

#### Compile-time refusal triggers (port to output contract)

Refuse or flag instead of compiling when: mixed personas in one campaign · no artifact and the mode forbids meeting-first · anchor below Level 3 for strategic/single-target (specific post/article/hire/initiative; Level 4 = quote from talk; Level 5 = real mutual — `DRAFT-REF:strategic-and-single-target.md` research bar) · sender health unverified at volume (route to deliverability child; 2026 context: Google rejects at SMTP level since Nov 2025, Microsoft 550 5.7.515 — compiling great copy for a blocked sender is waste) · proof unapproved · PR pitch without named beat fit.

### 6c. Proposed reference-module split

| Module id                                       | File                                  | Contents                                                                                                                                                           | when_to_load                                                     |
| ----------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `cold_email_outreach_compiler.packaging_rules`  | `references/subject-preview-rules.md` | Mode-keyed subject table, universal rejection list with Lavender deltas, preview rules, title-case-vs-lowercase register resolution                                | Workflow step 4 (subject/preview before body)                    |
| `cold_email_outreach_compiler.mode_templates`   | `references/mode-templates.md`        | All seven mode templates with verbatim scaffolds, body length/register table, three-sentence investor framework, Kai Davis PR template, beat-specific PR seasoning | Workflow step 5 (drafting in mode register)                      |
| `cold_email_outreach_compiler.lint_and_cadence` | `references/body-lint-and-cadence.md` | 9-point lint checklist, assumptive-language table, cadence map by mode, follow-up content rules, refusal triggers                                                  | Workflow steps 9–11 (lint, cadence, reply routes, refusal notes) |

**Stays in the shell:** workflow, output contract, guardrails. Add guardrail: "Do not compile for an unverified sender at volume — name the deliverability gap instead."

### 6d. Gaps for this child

- Lavender numbers are single-vendor; the conflicting title-case finding vs practitioner lowercase register is resolved editorially (by mode register), not by data — note in module.
- No partnership-mode template source in corpus beyond the thin `DRAFT-REF:investor-founder-pr.md` paragraph (anchor in complementary audience; one collaboration artifact; small exploratory yes) — ship that paragraph as the partnership template and flag as thin.
- Mobile-rendering specifics (line-length at common viewport widths) unsourced; keep qualitative.

---

## 7. Do Not Import

Honor the queue's rules (`RUNTIME:cold_email_engagement_first_outreach/references/source-acquisition-queue.md` §Do Not Do) plus findings from this pass:

1. **No list-email advice as cold-email advice.** `SA:hormozi-newsletter-email-marketing-39-minutes.md` is opted-in newsletter material. Reviewed for this plan: only its _technical_ hygiene (plain text, 1–2 links, mobile, preview text, money-language-out-of-subject, subject A/B) transfers, and all of those are already independently sourced from cold-specific sources above — so import **nothing** from Hormozi into the five children. Specifically banned: reward-loop framing, 3x/week cadence, templated-newsletter branding, reply-"yes" deliverability mechanic, the 791% segmentation stat, and the 391% speed-to-call stat (inbound-lead context; do not let it leak into the reply_os SLA matrix as a cold-email fact). The source-map already states the rule; repeat it in any module that touches cadence or SLA.
2. **No unauthorized book PDFs.** Dunford/Moesta/Fitzpatrick/Challenger deepening goes through legitimate access or official excerpts only (Lean Analytics sneak peek and Trustworthy OCE ch.1 are official excerpts — fine).
3. **Vendor benchmarks are directional unless methodology is stated.** Methodology stated: Mailshake (508-respondent survey, self-reported caveat printed), Cognism (internal-team dataset with counts and "directional, not diagnostic" disclaimer), Lavender (231,818 emails / ~50k inboxes — sample stated, selection bias not characterized: keep directional). Methodology NOT stated: Recruiterflow 50k-email claims, Gem 32%, Greenhouse 42%, Schneider's touch-decay percentages, Shepherd's infrastructure economics — usable as named-practitioner patterns, never as governing thresholds.
4. **No marketing-anecdote numbers as benchmarks:** Steli's 457%/7%→39%, Elias's 75% first-in and 28–33% rep-change stats (practitioner-grade, Level 4 — cite mechanism, flag grade), Gong's 258% team-selling stat (call-era, off-topic for email children).
5. **Do not dump raw transcripts or this report into runtime skills.** Distill into the modules specified above; keep SKILL.md shells compact.
6. **Do not re-add pruned cards** (admin-only deliverability pages, testing-tool guides, generic AI prompt sheets, legacy template PDFs) — pruning log in `source-materials/metadata/sources.json`.
7. **Do not optimize for emails sent.** Every module's framing metric is **qualified conversations started per unit of market trust consumed** — keep the phrase verbatim.
8. **Mode quarantine:** recruiting benchmarks (32% reply, first-name-subject lift) and PR rules (one follow-up) must not leak into sales-mode guidance, and vice versa (Murray's time-ask is banned in investor/PR modes).

---

## 8. Open Gaps + Recommended Next Sources

**Corpus repair (cheap, high value):**

1. **Re-scrape the four Lavender cards** — current cards are footer-only. This pass recovered the key numbers via WebFetch (embedded above with URLs); a proper re-scrape would also recover teardown #1's before/after bodies for taste_review. Status to set: still `directional-vendor`.
2. **Fix the experiment-guide card** — `CORPUS:web/experiment-guide.md` has experimentguide.com blurbs under the evanmiller.org URL. Replace with the actual Evan Miller article extract (key content embedded in §2b above).
3. **Port the four `DRAFT-REF` docs into runtime children** — `reply-handling.md`, `strategic-and-single-target.md`, `high-volume-and-deliverability.md`, `investor-founder-pr.md` are finished-quality material sitting outside the runtime skill tree. This is the single largest unrealized asset found in this pass.

**New acquisitions (per child):**

4. learning_review: Kohavi OEC/guardrail-metrics chapter (manual book access) for the trust-guardrail formalization; one non-vendor outbound benchmark (e.g., academic or aggregator with stated methodology) — may not exist; if not, keep triangulation rule.
5. taste_review: 2–3 more Lavender/30MPC teardowns with full before/after text; optionally a Josh Braun or Kyle Coleman teardown source for a second practitioner voice.
6. offer*lab: legitimate Dunford \_Sales Pitch* and Moesta _Demand-Side Sales_ extracts; a service-packaging source (e.g., Jonathan Stark on productized offers) for production-cost discipline.
7. reply_os: real async objection threads (internal BuildOS replies once campaigns run); optional Chris Voss book notes (legitimate access) for written-medium labels.
8. outreach_compiler: a partnership-outreach source (current coverage one paragraph); a producer/host interview for podcast mode (already flagged in `CORPUS:SYNTHESIS.md`).

**Deliverability handoff (out of scope here but discovered):** Google Nov-2025 enforcement shift (server-level rejection; Postmaster Tools v2 binary Pass/Fail; 0.3% complaint ceiling with 0.1% practical target) and Microsoft's 550 5.7.515 rejection for 5k+/day senders should be verified against the official pages (`support.google.com/a/answer/81126`, `techcommunity.microsoft.com` Defender for Office 365 blog post "Strengthening Email Ecosystem") and folded into `cold_email_deliverability_readiness/references/provider-requirement-matrix.md` — per the child-skill-source-plan rule, update that matrix rather than duplicating provider rules in any of the five children.
