---
doc_type: skill-reference
skill: cold_email_outreach_compiler
reference: mode-templates
visibility: internal
publish: false
created: 2026-06-10
purpose: Seven mode-specific compiler templates with verbatim scaffolds, the body length and register table, the three-sentence investor framework, the Kai Davis podcast template, and beat-specific PR seasoning.
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_outreach_compiler/references/mode-templates.md
---

# Mode Templates and Scaffolds

Load this when drafting the body in the mode register (workflow drafting step). Pick exactly one mode, use its scaffold, and respect its length and register row below. Never mix registers or mode allowances within one campaign. The framing metric for every template is qualified conversations started per unit of market trust consumed.

## Body Length and Register Table

| Mode                     | Length                                                           | Register                                                    | Source                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Volume casual            | 25–50 words ideal, <75 good, 100 max; one sentence per paragraph | Lowercase, casual-founder, no greeting word                 | Lavender 101 (short mobile-shaped emails +83% replies; directional vendor data), Jason Bay (50–100 words), Aaron Shepherd                         |
| Volume/enterprise formal | 3 paragraphs, 4–6 sentences total; fits one phone screen         | Formal account-team framing, title case                     | Connor Murray                                                                                                                                     |
| Strategic anchor-led     | ≤170 words hard cap                                              | Specific, senior-respectful; anchor carries the opening     | Murray three-paragraph cap; 170-word and <200-word lifts come from recruiting datasets (Recruiterflow, Greenhouse) — apply as ceiling, not target |
| Investor                 | Readable in under 60 seconds; plain language                     | Named founder at company domain; no jargon, no origin story | Michael Seibel / Y Combinator                                                                                                                     |
| Recruiting               | <170 words                                                       | Candidate-centered, honest about constraints                | Recruiterflow / Greenhouse (vendor data, methodology unstated — pattern, not threshold)                                                           |
| PR                       | <200 words                                                       | Clear, no cleverness, lede first                            | Muck Rack (most reporters prefer pitches under 200 words)                                                                                         |
| Podcast                  | 200–400 words with topic menu                                    | Peer-helpful, audience-first                                | Kai Davis                                                                                                                                         |

Universal: reading level 3rd–5th grade (+67% replies — Lavender Cold Email 101, directional vendor data); first opens are ~8x more likely to happen on a phone (Lavender — write for the mobile screen); you:we ratio ≥3:1 (RecruitingDaily golden ratio).

## 1. Volume Casual (Aaron Shepherd register)

`First name,` on its own line, no greeting word, single-sentence body carrying the front-end offer, one CTA.

```text
First name,

if I could send over [specific artifact] for [specific situation], would that be worth sharing more?
```

Rules: no fake one-to-one intimacy; no "noticed your post" unless actually verified; no full pitch; no calendar link first; no long paragraph. Follow-up = abbreviate the original, never a fresh pitch.

## 2. Volume/Enterprise Formal (Connor Murray three-paragraph)

Structure: (1) **Who I am** — name, company, team, 1–2 sentences, positioned as if already part of their account team. (2) **Why I'm relevant** — this persona's likely priorities and how the team addresses them; the only paragraph where industry/role specificity shows up. (3) **What I want** — an assumptive time ask, not "is this worth a chat."

Verbatim scaffold A (outbound-to-existing-account, finance buyer):

> Hi John, my name's Connor Murray and I'm part of the [Company] financial applications team responsible for supporting [Account]. Given your role I'm looking to introduce our team and get aligned with your priorities going forward.
>
> My team specifically works on priorities related to expense optimization, financial forecasting, and automated financial reporting. We work with clients to deliver real-time visibility into financial data, reduce unnecessary operational expenses, and automate much of the month-end reporting process.
>
> I'm looking to set some time for an introduction as my team will be the main point of contact for any priorities in these areas going forward. What does your availability look like later this week?
>
> Thanks in advance,
> Connor

Verbatim scaffold B (pure outbound, construction networking buyer):

> Hi John, my name is Connor Murray and I'm part of the construction team at [Company]. We work with networking teams in the construction space to improve system reliability and accelerate response times.
>
> My team specifically focuses on priorities related to network management, managed cloud hosting, and mobile device management, and we work with clients to proactively monitor and maintain networks, plan and execute cloud migrations, and streamline the onboarding of mobile devices.
>
> Do you have availability for an introduction this week? Let me know when works best and I will send us an invite. Looking forward to it.
>
> Connor

The two scaffolds are structurally identical; only the company-specific noun and the persona's priority list change between sends. The assumptive-language replacement table (in the lint reference) applies as a post-draft pass. Murray's time-ask is sanctioned in this mode and recruiting only — it is banned in investor and PR modes.

## 3. Strategic Anchor-Led

Research bar: minimum shippable anchor is Level 3 — a specific post, article, hire, initiative, public trigger, or named detail. Level 4 = quote from a podcast/talk/interview or detailed buyer language. Level 5 = real mutual contact or insider context. Below Level 3, refuse to compile and route to `cold_email_research_anchors`.

Body anatomy, in order:

1. **Anchor** — specific, real, recent.
2. **Bridge** — why that anchor makes this email relevant.
3. **Problem/opportunity** — what risk, cost, or desire this creates.
4. **Proof** — peer, customer, artifact, or "seen this before."
5. **Offer/artifact** — what you can send or do.
6. **CTA** — the smallest useful yes.

For strategic B2B with a buying group, the artifact must be useful enough for a Mobilizer to forward internally (Challenger Customer): a diagnostic, risk map, tradeoff memo, benchmark cut, buying-committee question set, or internal narrative draft.

Authenticity bridge test (Sam McKenna): if the hook were removed, would the reason for outreach still make sense? If yes, the hook is decorative — rewrite until the anchor causes the outreach.

Bad: "Saw you like Rush. We sell sales training."

Better: "Saw your interview where you described sales onboarding as 'getting the whole band in time.' That is why I am writing: we found two onboarding gaps that usually show up when teams scale past 20 reps."

Buyer-choice bridge (Dunford/Moesta), when the offer is more than a quick artifact:

```text
When teams hit [struggling moment], they usually choose between [alternative A] and [alternative B].
The tradeoff I noticed is [specific tradeoff].
I can send the short note if useful.
```

Objection preemption: when the likely objection is obvious, preempt exactly one inside the first email ("You may already have [X], but the gap I usually see is [Y]." / "This may not be a priority this quarter; if so, I can send the benchmark and close the loop."). Never preempt three.

Proof slot — use only when credible: similar buyer role; peer company in the same situation; a specific artifact already pulled; named customer result with permission; real mutual contact. No vague "teams like yours."

CTA menu (smallest useful yes): "Want me to send the note?" · "Mind if I send the teardown?" · "Can I send the 3 signals?" · "Worth sending the example?" · "Open to 15 min if I send the summary first?" · strong-fit strategic sales only: "What does availability look like next week?" Avoid calendar links in the first touch unless the user explicitly accepts the risk.

## 4. Investor (Michael Seibel / YC payload)

Goal: start a back-and-forth. Never force a meeting before explaining the company.

Payload: problem · solution · launch status · traction or growth, if any · market size or why it can be large · cofounders and technical ability · contrarian insight · optional standard-format deck.

Rules: readable in under 60 seconds; plain language; no long origin story; no jargon; no hidden company description; no meeting-first ask; named founder sender at company domain; slow follow-up — do not hammer after confirmed opens.

CTA examples: "Does this fit what you like to see?" · "Happy to send more if useful." · "Would it be worth sending the deck?" · "Open to feedback if this is in your lane."

Three-sentence framework for early-stage asks (YC):

1. **Sentence one** — clearly explain what you do. No jargon; assume a distracted reader.
2. **Sentence two** — sell why the investor should be excited: huge market, launched product, solid growth, or notable technical founders. Best things only — no resume, awards, or personal story.
3. **Sentence three** — ask for what you want (advice, investment, an introduction). "Don't ask for a phone call or a meeting. Let me escalate things."

Seibel's verbatim example: "My name is Tim and I'm building Twitch for cooking. I previously ran programming at the Food Network and my technical co-founder is a college friend. We're working on our mvp and were wondering whether we should build out private messaging in addition to group chat or just group chat alone."

## 5. Recruiting (candidate-centered)

Include: why this specific person · why the role is meaningfully relevant to their trajectory · one concrete role detail · honest compensation/location/level constraints when available · small CTA ("open to seeing the role note?").

Six-elements checklist (Gem / Greenhouse / RecruitingDaily — vendor datasets, methodology unstated; use as named-practitioner patterns, never governing thresholds): candidate first name in subject (+16% opens, Recruiterflow 50k dataset) · send as hiring manager (+29% response vs recruiter) · <170 words · always follow up — follow-ups got 3x the responses of the first email · you:we ≥3:1 · dead-simple CTA.

Avoid: generic "impressive background"; hiding role details; over-selling mission before relevance; calendar link first. Recruiting numbers and allowances stay in recruiting mode.

## 6. PR / Podcast (audience-first)

Recipient psychology: they are protecting their audience. The pitch must reduce evaluation work and inspire a story for their audience, not demand attention for the sender.

Kai Davis podcast template, verbatim:

> Are you currently looking for guests for {Podcast Name}? {Recent Episode} where you talked about {topic} was great and inspired me to write in.
>
> I help teach {target market} how to solve {expensive problem}. Would your audience be interested in learning about {area of expertise} or any of the following topics?
>
> • Topic #1 — Short description of the topic and the outcome for the audience
> • Topic #2 — Short description of the topic and the outcome for the audience
> • Topic #3 — Short description of the topic and the outcome for the audience
>
> Would one of these be a good fit for your audience? Just hit reply and let me know which topic you'd like to talk about. After that, we can work out scheduling details.
>
> Additionally, I'd love to learn more about how you like your guests to prepare for an interview. If you have any onboarding documents you'd like me to read ahead of the interview, please send them over!

Mechanics: recent-episode reference → who you help with what expensive problem → 3 topic angles with audience outcomes (the "choice of yeses") → assumptive-but-small CTA → prep-materials ask. Draw the 3 angles from: a controversial industry opinion, a solution to a common problem, and an overview of your area of expertise.

Muck Rack PR rules: beat fit verified by reading their last pieces; correct name spelling; <200 words; clear subject; follow up once, 3–7 days later (51% of reporters say 3–7 days is right; ~45% say exactly one follow-up is ideal).

Beat-specific seasoning (Muck Rack pitching guide): tech = no hyperbole, "give it to them straight" · health = pitch the health angle with topline data visible · business/finance = beat relevance, don't bury the lede · broadcast = visual elements + everyday-people interviews · local = local angle + geographic bounds · lifestyle = respect publishing calendars and cyclical features.

Avoid: "I love your show" without a specific reference; long bio first; generic founder story; hidden sales motive; social DMs unless invited.

## 7. Founder-to-Founder (with operator variant)

Frame: direct · specific · low ego · proof of real attention · small ask. Founder-led outreach can carry more personality than SDR outreach but still needs a real bridge — do not hide a sales pitch behind fake peer warmth.

CTAs: "Want me to send the note?" · "Mind if I share the draft?" · "Open to a quick gut check?" · "Worth sending over?"

Sahil Bloom checklist as the operator variant: find or guess the address (4 patterns cover >80% of company emails) · short with hard line breaks · specific personal touch · non-humble proof · value-first artifact (mock-up, 100-days doc) · bold single CTA on a standalone bolded ask line.

## Thin Modes (flagged)

- **Partnership** — anchor in a complementary audience, channel, product, or event; offer one clear collaboration artifact; make the first yes exploratory and small. One idea, not a menu. (Source coverage is one paragraph — treat as a starting frame, not a tested template.)
- **Customer research** — be honest that it is research; offer a useful counter-gift (summary, benchmark, early access, donation, artifact); never disguise research as a sales call; ask about real behavior and recent decisions, not hypothetical interest (Mom Test).
