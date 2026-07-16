<!-- docs/marketing/campaigns/creator-acquisition/04-measurement-scorecard.md -->

# Creator Acquisition Measurement Scorecard

**Campaign:** `writer_memory_2026_07`
**Review rhythm:** update Friday; complete final decision after Week 4 and seven-day return windows

## Measurement Principle

Measure the full handoff:

```text
social response -> landing visit -> registration -> real capture -> useful structure -> seven-day return
```

A high-reach post with no qualified creator response or activation is a content result, not a campaign success.

## Baseline — Complete Before Publishing

Use the most recent comparable 90-day window available on each platform. Record `N/A` rather than inventing missing metrics.

| Surface/account         | Followers | Posts published | Median reach/impressions | Non-follower reach | Qualified comments/replies | Shares/sends | Saves/bookmarks | Profile visits | Link clicks/DMs | Notes |
| ----------------------- | --------: | --------------: | -----------------------: | -----------------: | -------------------------: | -----------: | --------------: | -------------: | --------------: | ----- |
| Instagram — DJ          |           |                 |                          |                    |                            |              |                 |                |                 |       |
| Instagram — BuildOS     |           |                 |                          |                    |                            |              |                 |                |                 |       |
| LinkedIn — DJ           |           |                 |                          |                N/A |                            |              |                 |                |                 |       |
| LinkedIn — BuildOS Page |           |                 |                          |                N/A |                            |              |                 |                |                 |       |
| X — DJ                  |           |                 |                          |                N/A |                            |              |                 |                |                 |       |
| X — BuildOS             |           |                 |                          |                N/A |                            |              |                 |                |                 |       |

## UTM Convention

Use the same campaign name across platforms.

```text
utm_source=instagram|linkedin|x
utm_medium=organic_social
utm_campaign=writer_memory_2026_07
utm_content=w{week}_{concept}_{format}_{account}
```

Examples:

```text
?utm_source=instagram&utm_medium=organic_social&utm_campaign=writer_memory_2026_07&utm_content=w1_reentry_reel_dj
?utm_source=linkedin&utm_medium=organic_social&utm_campaign=writer_memory_2026_07&utm_content=w1_reentry_receipt_dj
?utm_source=x&utm_medium=organic_social&utm_campaign=writer_memory_2026_07&utm_content=w1_cold_manuscript_image_dj
```

The application already has first-touch UTM/referrer capture. Verify end-to-end attribution before relying on it.

## Post Log

One row per public post or Trial Reel.

| Date | Week | Surface/account | URL | Concept      | Format | Proof asset | CTA | Reach/impressions | Non-follower % | Qualified responses | Shares/sends | Saves/bookmarks | Profile visits | Link clicks/DMs | Activated users | Decision |
| ---- | ---: | --------------- | --- | ------------ | ------ | ----------- | --- | ----------------: | -------------: | ------------------: | -----------: | --------------: | -------------: | --------------: | --------------: | -------- |
|      |    1 |                 |     | Re-entry tax |        |             |     |                   |                |                     |              |                 |                |                 |                 |          |

## Relationship / Fieldwork Log

| Date | Person | Segment | Source surface | Stage before -> after | Conversation/setup completed | Key verbatim language | Product friction | Next action | Activation status |
| ---- | ------ | ------- | -------------- | --------------------- | ---------------------------- | --------------------- | ---------------- | ----------- | ----------------- |
|      |        | Writer  |                | 0 -> 1                | no                           |                       |                  |             | not started       |

## Activation Funnel

Use this as the desired event model. Mark instrumentation status during the activation assessment.

| Funnel step                   | Event / evidence                                            | Current status            | Required properties                  |
| ----------------------------- | ----------------------------------------------------------- | ------------------------- | ------------------------------------ |
| Social attribution captured   | first-touch UTM/referrer                                    | exists; verify            | source, medium, campaign, content    |
| Registration begins/completes | registration event/user row                                 | verify                    | campaign, audience=writer            |
| Onboarding begins             | `onboarding_started`                                        | exists; verify properties | source, audience, intent             |
| Real capture submitted        | proposed `first_capture_submitted`                          | instrumentation TBD       | capture length, project type, source |
| Useful structure generated    | proposed `first_structure_generated`                        | instrumentation TBD       | latency, quality rating, project ID  |
| User recognizes/acts on value | proposed `first_project_reviewed` or accepted/edited entity | instrumentation TBD       | action type, time-to-value           |
| User returns                  | proposed `first_project_reopened`                           | instrumentation TBD       | hours since last visit, state viewed |
| Durable activation            | reopened within 7 days + useful state/next move             | derived definition        | campaign, audience, project ID       |

## Weekly Scorecard

| Metric                            | Week 1 | Week 2 | Week 3 | Week 4 | Total/decision |
| --------------------------------- | -----: | -----: | -----: | -----: | -------------- |
| Real receipts shipped             |        |        |        |        |                |
| LinkedIn posts shipped            |        |        |        |        |                |
| Instagram assets shipped          |        |        |        |        |                |
| X tests shipped                   |        |        |        |        |                |
| Executed audience touches         |        |        |        |        |                |
| Two-way creator conversations     |        |        |        |        |                |
| Setup sessions completed          |        |        |        |        |                |
| Qualified landing visits          |        |        |        |        |                |
| Real first projects activated     |        |        |        |        |                |
| Seven-day returns                 |      — |        |        |        |                |
| Permissioned proof stories        |        |        |        |        |                |
| Concepts repeated back unprompted |        |        |        |        |                |

## Qualitative Concept Echo Log

The strongest signal is the audience adopting the language without being led.

| Date | Person/source | Phrase they used | Prompted or unprompted | Concept      | Interpretation |
| ---- | ------------- | ---------------- | ---------------------- | ------------ | -------------- |
|      |               |                  | unprompted             | Re-entry tax |                |

## Experiment Rules

Run one primary hypothesis per comparison.

| Experiment             | Hypothesis                                                                                   | Control                        | Variant                  | Primary KPI                                   | Decision window                     | Keep/iterate/kill rule                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------ | --------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| IG audience transition | Writer proof can find relevant non-followers without confusing the existing audience         | Standard follower-visible Reel | Trial Reel first         | Qualified non-follower reach and shares/sends | Platform comparison window + 7 days | Keep if it produces qualified engagement; iterate hook if reach exists but no writer signal |
| LinkedIn format        | Proof-supported Writer posts create better qualified response than text-only worldview posts | Text-only post                 | Receipt Post             | Qualified comments/DMs                        | 7 days each                         | Keep proof-first if qualified response improves, regardless of raw impressions              |
| X graph repair         | Writer searches/replies produce more qualified response than current AI-megastar engagement  | Current target mix             | Writer List/search block | Qualified replies/profile visits              | 4 weeks                             | Keep X only if it produces repeatable qualified signals                                     |
| CTA                    | A useful setup offer produces stronger action than a broad question                          | Diagnostic question            | Setup slot               | Qualified DM/setup                            | 7 days                              | Keep the CTA that creates activated users, not the most comments                            |

Do not compare unrelated topics, different audiences, and different formats and call the result an algorithm test.

## Friday Decision

For each concept/post, select one:

- **KEEP:** qualified creators responded and the handoff progressed.
- **ITERATE HOOK:** reach occurred but the intended audience did not self-identify.
- **ITERATE PROOF:** pain resonated but viewers did not understand what BuildOS changed.
- **ITERATE HANDOFF:** social response/clicks occurred but activation failed.
- **KILL:** the minimum test shipped and neither audience nor product signal appeared.

## End-Of-Pilot Decision

| Question                                                                     | Evidence | Decision |
| ---------------------------------------------------------------------------- | -------- | -------- |
| Did manuscript writers recognize the re-entry problem?                       |          |          |
| Which phrase did they naturally repeat?                                      |          |          |
| Which surface produced qualified conversations?                              |          |          |
| Which surface produced activated users?                                      |          |          |
| Did the product create a remembered-project moment?                          |          |          |
| Did at least two writers return within seven days?                           |          |          |
| Is the blocker reach, message, proof, handoff, or product activation?        |          |          |
| Continue Writer, narrow the subsegment, fix activation, or move to YouTuber? |          |          |
