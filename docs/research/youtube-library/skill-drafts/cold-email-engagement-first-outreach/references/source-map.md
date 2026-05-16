---
doc_type: skill-reference
skill: cold-email-engagement-first-outreach
reference: source-map
purpose: Map the source base behind the master cold email outreach skill and show which source layer to trust for each subsystem.
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/source-map.md
---

# Source Map

Use this reference when you need to trace a rule in the root skill back to a source layer, decide which source governs a conflict, or find deeper local analysis.

## Primary Source Layers

| Layer                               | Source                             | Local analysis                                                                                    | Governs                                                                                                     |
| ----------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Strategic body and cadence          | Connor Murray / Higher Levels      | `apps/web/src/content/blogs/source-analyses/connor-murray-cold-email-assumptive-cadence.md`       | Three-part body, assumptive language, 4-touch strategic cadence, coiled-spring prep, three-rate diagnostics |
| Volume, offer, casual body          | Aaron Shepherd / GrowthFlare       | `apps/web/src/content/blogs/source-analyses/aaron-shepherd-volume-front-end-offer.md`             | Volume-as-data, front-end offer, casual one-line script, back-end pre-call form                             |
| Engagement-first deliverability     | Austin Schneider / Instantly       | `apps/web/src/content/blogs/source-analyses/austin-schneider-engagement-first-cold-email-2026.md` | SPF/DKIM/DMARC floor, micro-segments, 2-touch volume cadence, non-responder recycle                         |
| Executive research and authenticity | Sam McKenna / Closing Time         | `apps/web/src/content/blogs/source-analyses/sam-mckenna-show-me-you-know-me-ai-era.md`            | SMYKM research, executive outreach, LinkedIn/public-content anchors, thread nurture                         |
| Packaging and artifact CTA          | Florin Tatulea / 30MPC / Jason Bay | `apps/web/src/content/blogs/source-analyses/florin-tatulea-reply-method-cold-email-showdown.md`   | Subject plus preview, mobile body, proof slot, AI-assisted research, artifact CTA                           |
| Low-friction replies                | Steli Efti / Close                 | `apps/web/src/content/blogs/source-analyses/steli-efti-low-friction-replies-123.md`               | Numbered reply fork, ghosted-thread revival, objection-state routing                                        |
| Investor email                      | Michael Seibel / Y Combinator      | `apps/web/src/content/blogs/source-analyses/michael-seibel-cold-email-investors.md`               | Fundraising payload, no meeting-first investor ask, company-domain sender trust                             |

## ICP and Signal Design Source Layers

Added in 2026-05 for the `cold_email_icp_signal_design` child skill. These layers govern segment definition, signal grading, and committee mapping — the work that precedes any anchor, offer, or draft.

| Layer                               | Source                                         | Local analysis                                                                                                       | Governs                                                                                                         |
| ----------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Trigger taxonomy (observability)    | Craig Elias / SHiFT Selling                    | `apps/web/src/content/blogs/source-analyses/craig-elias-trigger-event-selling.md`                                    | A/B/C trigger families, three-event buying model, first-in 75% win, monitoring surfaces                         |
| Relevance taxonomy + signal grading | Becc Holland / Flip the Script                 | `apps/web/src/content/blogs/source-analyses/becc-holland-personalization-to-relevance.md`                            | Four-type relevance taxonomy, three trigger sub-types, "send to two people" test                                |
| ICP fit scoring (seven dimensions)  | Lincoln Murphy / Sixteen Ventures              | `apps/web/src/content/blogs/source-analyses/lincoln-murphy-ideal-customer-profile-framework.md`                      | Seven-dimension ICP rubric, six Success Potential fit types, ICP-then-persona ordering                          |
| Segment tier and PMF validation     | Mark Roberge / Stage 2 Capital, HBS            | `apps/web/src/content/blogs/source-analyses/mark-roberge-science-of-scaling-segment-tiering.md`                      | Leading Indicator of Retention formula, Green/Yellow/Red segment tiering, Quality × Engagement grid             |
| Minimum Viable Segment              | Underscore VC / Michael Skok                   | `apps/web/src/content/blogs/source-analyses/underscore-vc-minimum-viable-segment.md`                                 | Common Needs / Dominability / Viability gate, channel reachability, shared vocabulary requirement               |
| Buying committee map                | 30MPC + Brent Adamson + John McMahon + Gartner | `apps/web/src/content/blogs/source-analyses/30mpc-multithreading-buying-committee.md`                                | Golden Path (Top-Down vs. Bottom-Up), Mobilizer/Talker/Blocker, McMahon Champion test, 6.8-buyer committee data |
| Switching triggers + job-based ICP  | Ash Maurya / LEANFoundry (existing inventory)  | `docs/marketing/growth/research/youtube-transcripts/2026-04-28-ash-maurya-personas-fail-do-this-instead-ANALYSIS.md` | Anti-persona thesis, switching-trigger taxonomy, job-based ICP (trigger × outcome × current solution)           |

## Local Adjacent Sources

| Source                                  | Local path                                                                                                                  | Use                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Sam McKenna / Apollo SMYKM              | `docs/marketing/growth/research/youtube-transcripts/2024-10-01-sam-mckenna-cold-email-43-percent-open-rate-ANALYSIS.md`     | Hyper-specific subject lines, preview text, preempting objections, respectful CTA |
| Mitchell Keller cold email              | `docs/marketing/growth/research/youtube-transcripts/2026-01-05-mitchell-keller-2230-calls-cold-email-ANALYSIS.md`           | Offer testing, buyer worldview, speed-to-reply, reply-to-call routing             |
| Earlier contextual outbound skill       | `docs/research/youtube-library/skill-drafts/cold-email-contextual-outbound/SKILL.md`                                        | Buyer-language mining, worldview alignment, offer tests, same-day reply routing   |
| Justin Welsh solopreneur analysis       | `docs/marketing/growth/research/youtube-transcripts/2026-04-29-justin-welsh-solopreneur-playbook-ANALYSIS.md`               | Warm-via-content counter-model for founder-led outreach                           |
| Michael Seibel seed pitch               | `docs/marketing/growth/research/youtube-transcripts/michael-seibel-yc-perfect-seed-pitch-ANALYSIS.md`                       | Startup clarity, concise pitch payload                                            |
| NFX fundraising storytelling            | `docs/research/youtube-library/analyses/2026-04-28_nfx-storytelling-fundraising_analysis.md`                                | Retellable fundraising narrative                                                  |
| Charles Hudson solo-founder fundraising | `docs/marketing/growth/research/youtube-transcripts/2026-04-28-charles-hudson-precursor-fundraise-solo-founder-ANALYSIS.md` | Fundraising context for solo founders                                             |

## External Resource Queue

The concrete resource queues live in `resource-inventory.md` and `references/internal-source-acquisition-queue.md`. They include:

- Lavender subject-line and benchmark material.
- Close/Steli follow-up articles and transcripts.
- Cognism multi-channel outbound reports.
- Cialdini, Chris Voss, and Daniel Pink psychology sources.
- Predictable Revenue and StoryBrand foundational sources.
- Google, Yahoo, Microsoft Outlook, Postmark, FTC, ICO, and CRTC deliverability/compliance sources.
- YC, NFX, and related investor-outreach material.
- Recruiting, PR, podcast, and voice/register specialty sources.

Treat unprocessed external resources as supporting context, not governing rules, until they have a local analysis or are explicitly synthesized.

## Tactical Gap-Fill Sources

Added 2026-05-16 to close the highest-value gaps without broad scraping:

| Layer               | Source card                                                                                                                                | Governs                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| OfferLab / compiler | `source-materials/cleaned/pdf/april-dunford-sales-pitch-structure.md`                                                                      | Buyer-choice framing, alternatives, differentiated value, proof restraint |
| ICP / OfferLab      | `source-materials/cleaned/web/bob-moesta-demand-side-sales-talk.md`                                                                        | Struggling moment, buyer progress timeline, demand-side reason-now        |
| Research / OfferLab | `source-materials/cleaned/web/mom-test-publisher-page.md`                                                                                  | False positives, past behavior, customer-research ask integrity           |
| Strategic accounts  | `source-materials/cleaned/web/challenger-customer-profiles.md`                                                                             | Mobilizer/Talker/Blocker, internal-consensus artifact offers              |
| Reply OS            | `source-materials/cleaned/pdf/black-swan-leadership-guide-tactical-empathy.md`                                                             | Label -> calibrated question replies, tactical empathy for objections     |
| PR/podcast          | `source-materials/cleaned/web/muckrack-state-of-journalism-2025.md` and `source-materials/cleaned/web/pr-news-state-of-journalism-2025.md` | Journalist workload, source packets, audience-first pitch standard        |
| Deliverability      | `references/deliverability-provider-requirement-matrix.md`                                                                                 | Pass / blocked / manual-only sender-readiness decisions                   |

## Conflict Resolution

Use mode to resolve source conflicts:

- Volume vs. strategic cadence: Schneider governs high-volume sending; Murray governs strategic named-account sending.
- Short vs. hyper-specific subject: 30MPC governs volume and most strategic packaging; Sam McKenna governs high-value single-target executive outreach when the hook is genuinely specific.
- Meeting ask vs. artifact ask: Shepherd, Schneider, and Tatulea govern cold-first offer asks; Murray governs strong-fit strategic meeting asks; Seibel governs investor mode.
- Personalization vs. relevance: Schneider and Shepherd govern scale; McKenna governs high-value executive targets.
- Loom as offer: treat Loom as a last-resort or post-reply asset, not the default first cold offer.

## Excluded Source

Alex Hormozi's email marketing source is excluded from this skill because it covers newsletter/list email to opted-in subscribers. Use it only for a separate list-email skill.
