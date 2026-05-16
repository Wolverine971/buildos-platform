---
doc_type: resource-inventory
skill: cold-email-engagement-first-outreach
source_doc: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/next-sources.md
created: 2026-05-15
purpose: Concrete resource map for the v2 cold-email outreach synthesis pass. Includes local transcripts, newly pulled transcripts, confirmed web resources, books, PDFs, and unresolved search targets from next-sources.md.
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/resource-inventory.md
---

# Cold Email Outreach Resource Inventory

This file converts `next-sources.md` from a shopping list into a concrete resource queue for the next synthesis pass.

## 2026-05-15 Acquisition Archive

The source acquisition pass now has a local archive manifest:

```text
docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/manifest.md
```

Archive summary: 53 web snapshots, 13 PDFs, and 3 additional YouTube transcripts were captured in the source-materials acquisition pass. Combined with the earlier 2026-05-15 transcript pulls already listed here, this inventory now tracks 7 newly pulled transcripts for the v2 cold email buildout. Use the manifest as the operational index for acquired files, failed captures, manual book extractions, and next analysis batches.

Status legend:

- `local-existing`: already in the repo before this pass.
- `pulled-2026-05-15`: transcript pulled into the repo during this pass.
- `external-confirmed`: URL exists and is ready for source analysis or manual extraction.
- `acquired-2026-05-15`: source file or transcript was captured in the local source archive.
- `transcript-pulled-2026-05-15`: a related video page was confirmed and a local transcript was captured.
- `missing-2026-05-15`: URL failed during acquisition and needs a replacement source.
- `unresolved-target`: backlog item is useful, but still needs a specific video/article URL chosen.
- `optional-adjacent`: useful if the skill expands into adjacent modes.

## New Transcripts Pulled This Pass

| Gap                                   | Source                                                                                          | URL                                         | Local transcript                                                                                                | Status            | Why it matters                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Research workflow / personalization   | Sam McKenna, Closing Time: "The End of the Line for Cold Calling (& What's Replacing it)"       | https://www.youtube.com/watch?v=5ln1cGTzXTg | `docs/marketing/growth/research/youtube-transcripts/2026-05-15-sam-mckenna-show-me-you-know-me-closing-time.md` | pulled-2026-05-15 | Longer SMYKM treatment than the Apollo clip; useful for AI-era authenticity, LinkedIn touches, and buyer-perspective research. |
| Multi-channel / practitioner writing  | Florin Tatulea + Evan Greek, 30MPC: "Cold Email Showdown: Rookie Sales Rep vs 10-Year Director" | https://www.youtube.com/watch?v=Ag-6pB51s5o | `docs/marketing/growth/research/youtube-transcripts/2026-05-15-florin-tatulea-cold-email-showdown.md`           | pulled-2026-05-15 | Live drafting against weird prompts; useful for context-first cold email, account research, and AI-assisted draft refinement.  |
| Reply handling / low-friction replies | Steli Efti / Close: "Get 457% more replies to your sales emails with the 1, 2, 3 hack"          | https://www.youtube.com/watch?v=hmuMkXntbH0 | `docs/marketing/growth/research/youtube-transcripts/2026-05-15-steli-efti-1-2-3-email-hack.md`                  | pulled-2026-05-15 | Directly supports reply-handling and "no is better than silence" mechanics.                                                    |
| Investor outreach                     | Michael Seibel / YC: "How To Cold Email Investors"                                              | https://www.youtube.com/watch?v=A3MmYbH1hbs | `docs/marketing/growth/research/youtube-transcripts/2026-05-15-michael-seibel-how-to-cold-email-investors.md`   | pulled-2026-05-15 | Concise fundraising-specific cold email rules: short, clear, credible, no premature meeting ask.                               |
| Reply-rate improvement / webinar      | Jason Bay: "Cold Email: Ignore this webinar if you don't want to double your reply rates"       | https://www.youtube.com/watch?v=_0K91ESIa94 | `docs/marketing/growth/research/youtube-transcripts/2026-05-15-jason-bay-cold-email-double-reply-rates.md`      | pulled-2026-05-15 | Webinar-length source for reply-rate improvement, relevance, and executive-style cold email judgment.                          |
| Subject-line formulas                 | Jason Bay + Belal Batrawy: "Steal these 3 subject line formulas..."                            | https://www.youtube.com/watch?v=ZQzX4uTV87Y | `docs/marketing/growth/research/youtube-transcripts/2026-05-15-jason-bay-belal-batrawy-subject-line-formulas.md` | pulled-2026-05-15 | Transcript-backed subject-line source that complements the Lavender subject-line article.                                      |
| Large-sample email patterns           | 30MPC: "We Analyzed 85 MILLION Cold Emails..."                                                  | https://www.youtube.com/watch?v=EDbuEGO01uM | `docs/marketing/growth/research/youtube-transcripts/2026-05-15-30mpc-85-million-cold-emails.md`                 | pulled-2026-05-15 | Large-sample cold email pattern source for compiler and taste-layer analysis.                                                  |

Commands used:

```bash
python3 scripts/youtube-transcript.py "https://www.youtube.com/watch?v=5ln1cGTzXTg" -o docs/marketing/growth/research/youtube-transcripts/2026-05-15-sam-mckenna-show-me-you-know-me-closing-time.md
python3 scripts/youtube-transcript.py "https://www.youtube.com/watch?v=Ag-6pB51s5o" -o docs/marketing/growth/research/youtube-transcripts/2026-05-15-florin-tatulea-cold-email-showdown.md
python3 scripts/youtube-transcript.py "https://www.youtube.com/watch?v=hmuMkXntbH0" -o docs/marketing/growth/research/youtube-transcripts/2026-05-15-steli-efti-1-2-3-email-hack.md
python3 scripts/youtube-transcript.py "https://www.youtube.com/watch?v=A3MmYbH1hbs" -o docs/marketing/growth/research/youtube-transcripts/2026-05-15-michael-seibel-how-to-cold-email-investors.md
python3 scripts/youtube-transcript.py "https://www.youtube.com/watch?v=_0K91ESIa94" -o docs/marketing/growth/research/youtube-transcripts/2026-05-15-jason-bay-cold-email-double-reply-rates.md
python3 scripts/youtube-transcript.py "https://www.youtube.com/watch?v=ZQzX4uTV87Y" -o docs/marketing/growth/research/youtube-transcripts/2026-05-15-jason-bay-belal-batrawy-subject-line-formulas.md
python3 scripts/youtube-transcript.py "https://www.youtube.com/watch?v=EDbuEGO01uM" -o docs/marketing/growth/research/youtube-transcripts/2026-05-15-30mpc-85-million-cold-emails.md
```

Note: Aaron Harris's YC fundraising source has a full transcript on the YC page, so it is captured below as an external transcript source rather than duplicated locally.

## Local Material Already Available

| Gap                                   | Source                                                                              | URL                                                        | Local path                                                                                                         | Analysis path                                                                                                               | Status         | Use in v2                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| V1 system layer                       | Connor Murray / Higher Levels: "10 Years of Expert Cold Email Advice in 36 Minutes" | https://www.youtube.com/watch?v=XLsAAnNaFOc                | `docs/marketing/growth/research/youtube-transcripts/2026-05-14-connor-murray-higher-levels-10-years-cold-email.md` | `apps/web/src/content/blogs/source-analyses/connor-murray-cold-email-assumptive-cadence.md`                                 | local-existing | Strategic body, cadence, coiled-spring prep, assumptive language.                       |
| V1 volume / offer layer               | Aaron Shepherd / GrowthFlare: "I Sent 1,500,000 Cold Emails Last Month..."          | https://www.youtube.com/watch?v=CFZuljj6DrU                | `docs/marketing/growth/research/youtube-transcripts/2026-05-14-aaron-shepherd-1.5m-cold-emails-2026.md`            | `apps/web/src/content/blogs/source-analyses/aaron-shepherd-volume-front-end-offer.md`                                       | local-existing | Volume math, infrastructure arithmetic, front-end offer design.                         |
| V1 engagement / deliverability layer  | Austin Schneider / Instantly: "The New Way of Cold Emailing in 2026"                | https://www.youtube.com/watch?v=h8u840Wm-BI                | `docs/marketing/growth/research/youtube-transcripts/2026-05-14-instantly-new-way-cold-emailing-2026.md`            | `apps/web/src/content/blogs/source-analyses/austin-schneider-engagement-first-cold-email-2026.md`                           | local-existing | Engagement-first filters, deliverability floor, 2-touch recycle.                        |
| Contextual outbound                   | Sam McKenna / Apollo: "Her Cold Email Strategy Has a 43% Open Rate"                 | https://www.youtube.com/watch?v=ydsMxs2yeos                | `docs/marketing/growth/research/youtube-transcripts/2024-10-01-sam-mckenna-cold-email-43-percent-open-rate.md`     | `docs/marketing/growth/research/youtube-transcripts/2024-10-01-sam-mckenna-cold-email-43-percent-open-rate-ANALYSIS.md`     | local-existing | Hyper-specific subject lines, first sentence, value prop, respectful CTA.               |
| Contextual outbound                   | Mitchell Keller: "I Booked 2230+ Calls In 2025"                                     | https://www.youtube.com/watch?v=iheqddsNN_Q                | `docs/marketing/growth/research/youtube-transcripts/2026-01-05-mitchell-keller-2230-calls-cold-email.md`           | `docs/marketing/growth/research/youtube-transcripts/2026-01-05-mitchell-keller-2230-calls-cold-email-ANALYSIS.md`           | local-existing | Infrastructure, offer testing, reply-to-call routing.                                   |
| Earlier skill draft                   | Cold Email Contextual Outbound                                                      | n/a                                                        | `docs/research/youtube-library/skill-drafts/cold-email-contextual-outbound/SKILL.md`                               | n/a                                                                                                                         | local-existing | Merge worldview research, buyer-language mining, reply handling, offer tests.           |
| Founder-to-founder / warm via content | Justin Welsh solopreneur playbook                                                   | https://www.youtube.com/watch?v=kXAQfx8usl8                | `docs/marketing/growth/research/youtube-transcripts/2026-04-29-justin-welsh-solopreneur-playbook-ANALYSIS.md`      | same                                                                                                                        | local-existing | "Warm via content" counterpoint to cold list prep; owned audience as pre-warming layer. |
| Investor / fundraising adjacent       | Michael Seibel: "Perfectly Pitch Your Seed Stage Startup"                           | https://www.youtube.com/watch?v=lw2X3PxKlAY                | `docs/marketing/growth/research/youtube-transcripts/michael-seibel-yc-perfect-seed-pitch.md`                       | `docs/marketing/growth/research/youtube-transcripts/michael-seibel-yc-perfect-seed-pitch-ANALYSIS.md`                       | local-existing | Investor clarity, concise company explanation, ask discipline.                          |
| Fundraising narrative                 | NFX / James Currier: "23 Rules of Storytelling for Fundraising"                     | https://www.nfx.com/post/23-rules-storytelling-fundraising | `docs/research/youtube-library/analyses/2026-04-28_nfx-storytelling-fundraising_analysis.md`                       | same                                                                                                                        | local-existing | Retellability and investor narrative, useful for fundraising outreach mode.             |
| Fundraising solo-founder adjacent     | Charles Hudson / Precursor fundraise solo founder                                   | n/a                                                        | `docs/marketing/growth/research/youtube-transcripts/2026-04-28-charles-hudson-precursor-fundraise-solo-founder.md` | `docs/marketing/growth/research/youtube-transcripts/2026-04-28-charles-hudson-precursor-fundraise-solo-founder-ANALYSIS.md` | local-existing | Solo-founder fundraising context; optional investor layer support.                      |

Excluded from cold outreach synthesis unless building a separate list-email skill:

- Alex Hormozi, "Learn Email Marketing in 39 Minutes!" - list/newsletter email to opted-in subscribers, not cold outreach.

## Tier 1 Resources From `next-sources.md`

### Subject Line Craft

| Resource                                           | Type                | URL                                                                                               | Status             | Extract for v2                                                                                                                               |
| -------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Lavender Cold Email Benchmark Report, Will Allred  | Data/blog           | https://www.lavender.ai/blog/the-cold-email-benchmark-report                                      | external-confirmed | Persona/department benchmark table, content insights, quality lift from high-scoring emails, reply-rate segmentation.                        |
| Lavender subject line article                      | Blog                | https://www.lavender.ai/blog/cold-email-subject-line-tips                                         | external-confirmed | Subject-line do/don't list, preview-text importance, neutral/internal-email frame, data points on questions/numbers/punctuation.             |
| Lavender Cold Email 101                            | Blog                | https://www.lavender.ai/blog/cold-email-101                                                       | external-confirmed | Cold email as a valid conversation invite, reason-for-showing-up logic, short email constraints.                                             |
| Lavender Inbox Triage                              | Knowledge base      | https://help.lavender.ai/en/articles/5325618-inbox-triage-a-cold-email-mindset                    | missing-2026-05-15 | Previously listed URL returned 404 during acquisition; find a current replacement before using this source.                                   |
| Lavender YouTube channel `@trylavender`            | YouTube channel     | https://www.youtube.com/@trylavender                                                              | unresolved-target  | Pick a specific recent subject-line or teardown video if a transcript-backed source is needed.                                               |
| LavenderLand subject-line video with Belal Batrawy | Video page          | https://land.lavender.ai/media/cold-email-subject-lines-with-belal-batrawy-get-your-emails-opened | transcript-pulled-2026-05-15 | Local YouTube transcript now exists at `docs/marketing/growth/research/youtube-transcripts/2026-05-15-jason-bay-belal-batrawy-subject-line-formulas.md`. |
| Eddie Shleyner / VeryGoodCopy archive              | Copywriting archive | https://www.verygoodcopy.com/                                                                     | external-confirmed | Voice/register craft, microcopy, subject-line texture, concise copy rhythm. Search inside archive for email, subject line, and preview text. |
| VeryGoodCopy HubSpot cold-email story              | Blog                | https://www.verygoodcopy.com/verygoodcopy-blog-3/hubspot-did-not-hire-me                          | external-confirmed | Personal cold outreach story; useful for "specific, human, low-ego" register.                                                                |

### Reply Handling And Objection Conversion

| Resource                               | Type                 | URL                                                                                       | Status             | Extract for v2                                                                                         |
| -------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| Steli Efti 1-2-3 email hack transcript | YouTube transcript   | https://www.youtube.com/watch?v=hmuMkXntbH0                                               | pulled-2026-05-15  | Low-friction reply options, "reply with a number", no-option framing, response over silence.           |
| Close 1-2-3 update article             | Blog                 | https://close.com/blog/1-2-3-email-hack                                                   | external-confirmed | 2025 reinterpretation of the 1-2-3 hack; include as current companion to the 2016 video.               |
| Close Hail Mary / dead leads article   | Blog                 | https://close.com/blog/hail-mary-email-dead-leads                                         | external-confirmed | Using low-friction replies to surface hidden objections and revive old/no-response leads.              |
| Close cold email follow-up plan        | Blog                 | https://www.close.com/blog/cold-email-follow-up-plan/                                     | external-confirmed | Cold email follow-up timing, modified reframe follow-ups, stopping rules for cold prospects.           |
| Close sales follow-up guide            | Blog                 | https://www.close.com/blog/follow-up                                                      | external-confirmed | Follow-up philosophy, 1-2-7 cadence, short follow-up templates, value in every touch.                  |
| Close follow-up formula resource       | Ebook / landing page | https://www.close.com/resources/followup                                                  | external-confirmed | More durable follow-up principles, use for same-day routing and reply handling if ebook is downloaded. |
| Close Follow-Up Formula PDF            | PDF                  | https://resource-downloads.close.com/resources/steli_efti-the_follow_up_formula-ebook.pdf | external-confirmed | Download/summarize for fuller Steli follow-up doctrine.                                                |
| Close Cold Email Hacks PDF             | PDF                  | https://resource-downloads.close.com/resources/cold-email-hacks.pdf                       | external-confirmed | Candidate source for cold-email-specific scripts and older Close doctrine.                             |
| Sam McKenna Closing Time transcript    | YouTube transcript   | https://www.youtube.com/watch?v=5ln1cGTzXTg                                               | pulled-2026-05-15  | AI-era SMYKM, buyer numbness to scaled outreach, LinkedIn as signal, authentic touches.                |
| Closing Time transcript page           | Podcast transcript   | https://www.listennotes.com/podcasts/closing-time-quick/show-me-you-know-me-y2NC4p1nS-f/  | external-confirmed | Backup transcript and summary metadata for the same Sam McKenna theme.                                 |

### Multi-Channel Sequencing

| Resource                                                         | Type               | URL                                                                                                                                          | Status             | Extract for v2                                                                                                     |
| ---------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Florin Tatulea cold-email showdown                               | YouTube transcript | https://www.youtube.com/watch?v=Ag-6pB51s5o                                                                                                  | pulled-2026-05-15  | Live research-to-draft examples, prompt-by-prompt judgment criteria, reply method.                                 |
| Florin Tatulea LinkedIn post pointing to the 30MPC video         | Social post        | https://www.linkedin.com/posts/florintatulea_sales-outbound-activity-7415451139258626048-0ubZ                                                | external-confirmed | Context-first example and comments on what practitioners noticed.                                                  |
| Cerebral Selling: Advanced Email Prospecting with Florin Tatulea | Video/article      | https://cerebralselling.com/advanced-email-prospecting/                                                                                      | external-confirmed | Older practitioner deep dive; use if the 30MPC source needs triangulation.                                         |
| Florin Tatulea / Sell Better cold email framework PDF            | PDF                | https://content.sellbetter.xyz/hubfs/Lead%20Magnets/The%20Cold%20Email%20Framework%20-%20Florin%20Tatulea/The%20Cold%20Email%20Framework.pdf | external-confirmed | Cold email framework document; likely high-signal extraction target.                                               |
| Trent Dressel YouTube channel                                    | YouTube channel    | https://www.youtube.com/channel/UCVH-JPDuoBUO_CCfASplB0w                                                                                     | unresolved-target  | Choose 1-2 cold-call / objection / prospecting videos. Stronger for phone and SDR behavior than email body craft.  |
| Trent Dressel / Practical Prospecting resource mention           | Resource page      | https://www.practicalprospecting.io/resources                                                                                                | external-confirmed | Contains "How to Write a Cold Email That Works" podcast mention; resolve if using Trent for email, not only calls. |
| Cognism State of Outbound 2026                                   | Report             | https://www.cognism.com/reports/state-of-outbound-2026                                                                                       | external-confirmed | Multi-channel data: phone-led cadences, task mix, answer rates, reply rates, data accuracy.                        |
| Cognism sales cadence guide                                      | Article            | https://cognism.medium.com/how-to-build-sales-cadences-c19db4aa6feb                                                                          | external-confirmed | Cadence structure across email, call, LinkedIn.                                                                    |

### Psychology Of Cold Outreach

| Resource                               | Type | URL                                                               | Status             | Extract for v2                                                                                                            |
| -------------------------------------- | ---- | ----------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Robert Cialdini, Influence             | Book | https://www.oreilly.com/library/view/influence/9780061899874/     | external-confirmed | Map reciprocity, scarcity, authority, social proof, commitment/consistency, and liking into the skill's psychology audit. |
| Chris Voss, Never Split the Difference | Book | https://www.blackswanltd.com/never-split-the-difference           | external-confirmed | Map tactical empathy, mirroring, labeling, calibrated questions into objection/reply handling.                            |
| Daniel Pink, To Sell Is Human          | Book | https://www.danpink.com/books/to-sell-is-human/?version=published | external-confirmed | Add attunement, buoyancy, and clarity as non-pushy sales psychology primitives.                                           |

## Tier 2 Resources From `next-sources.md`

### Founder-To-Founder Outreach

| Resource                                   | Type            | URL                                                                                                                   | Status             | Extract for v2                                                                                         |
| ------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| Sam Parr personal site                     | Website         | https://samparr.com/                                                                                                  | external-confirmed | Official cold-email origin story: Airbnb founder outreach, founder scrappiness, directness.            |
| CopyThat about page                        | Website         | https://copythat.com/pages/about                                                                                      | external-confirmed | Sam Parr copywriting background and cold-email origin story from a writing/copy lens.                  |
| Sam Parr / Horizons Pod cold email formula | Podcast page    | https://www.audible.ca/podcast/The-Cold-Email-Formula-That-Made-Over-1-000-000-with-Sam-Parr-Horizons-Pod/B0FHKHBBH3  | external-confirmed | Cold email technique and follow-up segment around 24:49; resolve YouTube/Spotify if transcript needed. |
| Sam Parr "100 People Cold Email" page      | Web page        | https://frontend-production-f8b7.up.railway.app/framework/bfe37838-6b65-4d82-9231-79e26f3d59ff                        | unresolved-target  | Potentially useful but non-canonical; verify provenance before treating as source.                     |
| Justin Welsh local solopreneur analysis    | Local analysis  | `docs/marketing/growth/research/youtube-transcripts/2026-04-29-justin-welsh-solopreneur-playbook-ANALYSIS.md`         | local-existing     | Use as warm-via-content counter-model.                                                                 |
| Justin Welsh newsletter/profile            | Website/profile | https://justinwelsh.kit.com/profile                                                                                   | external-confirmed | Confirm current Saturday Solopreneur positioning; useful as source metadata.                           |
| Sahil Bloom cold email thread              | Thread mirror   | https://www.upcarta.com/resources/66805-one-cold-email-can-completely-change-your-life-heres-how-to-write-a-great-one | external-confirmed | Cold email feature checklist: inbox, short, personalization, social proof, create value, clear CTA.    |
| Sahil Bloom cold email thread PDF          | PDF             | https://files.btbytes.com/tweet_threads/sahilbloom_1581260995153911809.pdf                                            | external-confirmed | Durable snapshot of the same thread; can be stored/analyzed as document.                               |

### Foundational Framework

| Resource                                     | Type              | URL                                                                                           | Status             | Extract for v2                                                                                    |
| -------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| Aaron Ross / Predictable Revenue Methodology | PDF               | https://predictablerevenue.com/wp-content/uploads/2021/01/Predictable-Revenue-Methodology.pdf | external-confirmed | Cold Calling 2.0 history, persona-based outbound system, team specialization.                     |
| Predictable Revenue guide to outbound sales  | Guide             | https://predictablerevenue.com/guides/outbound/                                               | external-confirmed | Practical outbound frame; use to keep skill aligned with outbound sales-development fundamentals. |
| Predictable Revenue 15-minute summary        | Blog              | https://predictablerevenue.com/blog/15-minute-summary-of-predictable-revenue                  | external-confirmed | Quick extraction companion if book/PDF is too broad.                                              |
| Donald Miller / Building a StoryBrand book   | Book page         | https://storybrand.com/building-a-storybrand-book-old/                                        | external-confirmed | "Recipient/customer as hero" source for bridge sentence and offer framing.                        |
| StoryBrand framework page                    | Guide/course page | https://storybrand.com/learn-the-framework/                                                   | external-confirmed | 7-part story framework; use only the buyer-as-hero layer, not full marketing funnel.              |
| StoryBrand customer hero persona guide       | Guide             | https://storybrand.com/hero/                                                                  | external-confirmed | Persona questions that may improve buyer-research prompts.                                        |

### Deliverability Deep-Dive

| Resource                                 | Type          | URL                                                                           | Status             | Extract for v2                                                                                                   |
| ---------------------------------------- | ------------- | ----------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Postmark deliverability guides           | Guide hub     | https://postmarkapp.com/guides/deliverability                                 | external-confirmed | SPF/DKIM/DMARC, bounces, SMTP, domain warmup, transactional-grade rigor.                                         |
| Postmark delivery troubleshooting        | Support guide | https://postmarkapp.com/support/article/troubleshooting-email-delivery-issues | external-confirmed | Diagnose infrastructure, sending practices, and content problems.                                                |
| Maildoso cold email deliverability guide | Blog guide    | https://maildoso.ai/blog/guides/deliverability-guide                          | external-confirmed | Cold-sender-specific constraints: plain text, no open tracking, signatures, warmup ratios, campaign variability. |
| Maildoso product/home page               | Website       | https://maildoso.ai/                                                          | external-confirmed | Cold-email infrastructure positioning and health-score mechanics.                                                |
| GlockApps inbox placement tutorial       | Tutorial      | https://glockapps.com/tutorials/test-inbox-placement-and-test-spam-score/     | external-confirmed | Seed-list inbox placement, spam-score test, report interpretation, action steps.                                 |
| GlockApps help: tests and deliverability | Help article  | https://qa.glockapps.com/help/art/email-tests-deliverability/                 | external-confirmed | Clarifies seed testing limits and whether tests harm deliverability.                                             |
| GlockApps deliverability guide PDF       | PDF           | https://glockapps.com/files/email-deliverability-ultimate-guide.pdf           | external-confirmed | Candidate document for a more technical deliverability reference layer.                                          |

### Investor / Fundraising Outreach

| Resource                                                  | Type                    | URL                                                                                          | Status             | Extract for v2                                                                                                      |
| --------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Michael Seibel / YC: How To Cold Email Investors          | YouTube transcript      | https://www.youtube.com/watch?v=A3MmYbH1hbs                                                  | pulled-2026-05-15  | Fundraising cold email rules: short, focused, credible, no meeting-first ask.                                       |
| YC page for Michael Seibel cold-email investors           | Blog/video page         | https://www.ycombinator.com/blog/how-to-cold-email-investors-michael-seibel/                 | external-confirmed | Metadata and topic list for the transcript above.                                                                   |
| Aaron Harris / YC: Fundraising and Meeting with Investors | Transcript page         | https://www.ycombinator.com/blog/aaron-harris-on-fundraising-and-meeting-with-investors      | external-confirmed | Short + informative investor emails, investor-fit research, direct ask, no big deck up front.                       |
| YC: How to Email Early Stage Investors                    | Blog                    | https://www.ycombinator.com/blog/how-to-email-early-stage-investors/                         | external-confirmed | Earlier YC advice on succinctly communicating situation and requested help.                                         |
| Mark Suster / Both Sides of the Table                     | Blog home/search target | https://bothsidesofthetable.com/                                                             | unresolved-target  | Search terms: cold email, warm intro, fundraising email, lines not dots. Direct cold-email source not yet resolved. |
| NFX fundraising storytelling analysis                     | Local analysis          | `docs/research/youtube-library/analyses/2026-04-28_nfx-storytelling-fundraising_analysis.md` | local-existing     | Retellability and investor narrative support.                                                                       |

## Tier 3 / Specialty Layers

### Hiring / Recruiting Cold Outreach

| Resource                                 | Type          | URL                                                                | Status             | Extract for v2                                                                                  |
| ---------------------------------------- | ------------- | ------------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------- |
| RecruitingDaily cold outreach checklist  | Blog          | https://recruitingdaily.com/cold-outreach-email-six-elements-need/ | external-confirmed | Recruiting-specific norms: sender identity, length, candidate-focused pitch, subject-line data. |
| Puzzle Inbox recruiting cold email guide | Blog          | https://puzzleinbox.com/blog/cold-email-for-recruiting/            | external-confirmed | Modern recruiting outreach mechanics; optional because it is vendor content.                    |
| Recruiter ops content                    | Search target | n/a                                                                | unresolved-target  | Defer unless the skill explicitly supports recruiting sequences.                                |

### PR / Podcast Pitch Outreach

| Resource                                               | Type    | URL                                                                             | Status             | Extract for v2                                                                                  |
| ------------------------------------------------------ | ------- | ------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| Justin Jackson: Advice for Sending Cold Emails and DMs | Blog    | https://justinjackson.ca/cold-email                                             | external-confirmed | Founder/creator recipient perspective: create connection, ask small, avoid hidden sales motive. |
| Justin Jackson / MegaMaker archive                     | Website | https://megamaker.co/                                                           | external-confirmed | Background on audience/community; not yet a specific PR source.                                 |
| Kai Davis podcast pitch article                        | Blog    | https://www.kaidavis.com/articles/podcast-outreach-email/                       | external-confirmed | Podcast guest pitch craft; older but focused and practitioner-oriented.                         |
| CastFox 2026 podcast guest pitch guide                 | Blog    | https://www.castfox.net/blog/podcast-guest-pitch-template-35-percent-reply-rate | external-confirmed | Current podcast outreach structure; vendor content, so triangulate before using claims.         |
| Puzzle Inbox podcast guest outreach guide              | Blog    | https://puzzleinbox.com/blog/cold-email-for-podcast-guest-outreach              | external-confirmed | Optional current PR/podcast playbook; vendor content.                                           |

### Voice And Register Craft

| Resource                                             | Type           | URL                                                                                                              | Status             | Extract for v2                                                                                   |
| ---------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| Eddie Shleyner / VeryGoodCopy archive                | Website        | https://www.verygoodcopy.com/                                                                                    | external-confirmed | Copy rhythm, restraint, voice, specificity.                                                      |
| Joel Klettke / Orbit Media case-study webinar        | Webinar page   | https://www.orbitmedia.com/events/ww-case-studies/                                                               | external-confirmed | Customer story extraction and proof language.                                                    |
| Joel Klettke / Agency Journey interview              | Blog/podcast   | https://www.zenpilot.com/blog/what-makes-a-great-agency-case-study-with-joel-klettke                             | external-confirmed | Case-study language, sales-sheet reuse, customer proof assets.                                   |
| Joel Klettke / Siege Media SEO copywriting interview | Blog/interview | https://www.siegemedia.com/creation/copywriting                                                                  | external-confirmed | Customer interviews and voice-of-customer research as B2B copy foundation.                       |
| Joel Klettke Case Study Blueprint                    | PDF            | https://www.contentjam.com/wp-content/uploads/2014/10/JoelKlettke-Case-Study-Blueprint.pdf                       | external-confirmed | Interview flow and case-study proof structure.                                                   |
| Joel Klettke headline formula sheet                  | PDF            | https://businesscasualcopywriting.com/wp-content/uploads/2021/08/Joel-Klettkes-Headline-Formulas-Cheat-Sheet.pdf | external-confirmed | Optional headline/subject inspiration; use carefully so cold email does not become copywriterly. |

## Suggested First Synthesis Batch

Use this order for the next pass because it fills the biggest v1 gaps without exploding scope:

1. `pulled-2026-05-15` transcripts: Sam McKenna Closing Time, Florin/30MPC showdown, Steli 1-2-3, Michael Seibel investor email, Jason Bay reply-rate webinar, Jason Bay/Belal subject lines, and 30MPC 85M cold emails.
2. Lavender Benchmark Report + subject-line article + Cold Email 101 + teardown #1. Do not use the older Inbox Triage URL until a replacement is found.
3. Close cold-email follow-up plan + Hail Mary / dead-leads article + Follow-Up Formula PDF.
4. Cognism State of Outbound 2026.
5. Cialdini / Voss / Pink book layer for explicit psychology primitives.
6. Predictable Revenue + StoryBrand as foundational frame only.
7. Justin Jackson + Sahil Bloom + Sam Parr for founder-to-founder and creator-recipient outreach modes.

## Still Unresolved

- Pick one specific current Lavender/Will Allred or `@trylavender` subject-line teardown video if a video transcript is required. The strongest currently confirmed Lavender source is the 2026 benchmark report by Will Allred, not a YouTube transcript.
- Find the current replacement for the old Lavender Inbox Triage article; the listed help-center URL returned 404 on 2026-05-15.
- Pick one specific Trent Dressel video for cold-call/objection handling. His channel is relevant, but the best cold-email-specific source was not resolved in this pass.
- Resolve a canonical Mark Suster / Both Sides of the Table source for cold investor outreach or warm intro dynamics. The YC sources are stronger and already concrete.
- Treat vendor blogs with performance claims as directional unless triangulated with primary data or multiple practitioner sources.
