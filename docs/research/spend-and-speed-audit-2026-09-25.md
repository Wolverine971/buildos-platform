<!-- docs/research/spend-and-speed-audit-2026-09-25.md -->

# Spend and speed audit (2026-09-25)

Scope: where BuildOS LLM money and time go, and which fixes are cheap. Sources:

- `llm_usage_logs` (prod, 14 days);
- `chat_turn_runs` (7 days);
- OpenRouter `/credits` and `/key`;
- Railway variables.

All reads were free, and nothing was changed.

## Where the money is

| Bucket                                                          | Amount          | Share         |
| --------------------------------------------------------------- | --------------- | ------------- |
| OpenRouter key, last 7 days (`/key` `usage_weekly`)             | **$11.71**      | 100%          |
| Prod logged spend, last 7 days (`llm_usage_logs`)               | about $0.9      | about 8%      |
| **Unlogged: dev servers, gates, pilots, evals, agent sessions** | **about $10.8** | **about 92%** |

- The same key (`sk-or-v1-e1129…`) is in production (Railway) and in `.env`, `.env.local`,
  `apps/web/.env`, `apps/worker/.env` and `.env.agentic-gate.local`.
- Account usage was $169.15 on 09-23 and $174.29 on 09-25: $5.14 in 2 days against about $0.56
  logged.
- The balance hit **$0.86** on 09-23, and live chat would stop at zero.
- Attribution per caller needs a management key, or separate keys.

**Prod logged spend, 14 days: $1.08**

| Share    | Item                                                | Detail                                                                    |
| -------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| 40%      | Chat acting passes (DeepSeek v4/v4.1 flash)         | 11.6–17K input tokens per pass, 48–54% cached                             |
| 20%      | Daily brief on `google/gemini-3.7-flash`            | Logged as `other`: no `operationType`                                     |
| 12%      | Semantic mutation reviewer on `openai/gpt-5.6-luna` | About $0.0045 per call, p50 3.6 s                                         |
| 11%      | Project loops                                       | Drift, brief, doc organization, outdated docs, task conflicts             |
| about 6% | Jev                                                 | Tool selection 3.8%, context finder 1.2%, email scan 0.9%, freshness 0.8% |

## Waste found

1. **Shared key for prod and dev (about 92% of spend unattributed).** There's no attribution and
   no cap, and a dev loop can drain production. This has happened before: the $42 GPT-6 Astra
   incident on 09-13, and the balance at $0.86 on 09-23.
2. **Daily brief truncation (a user-visible bug).** `ontologyBriefGenerator.ts` calls
   `profile: 'quality'`, which resolves to Gemini 3.7 Flash, a reasoning model. The executive
   summary has `maxTokens: 600`, re-engagement 1200 and analysis 2000. Reasoning uses about
   700–1,100 tokens.
    - **22 of 44 calls ended with `finishReason: length`**, some with only about 115 characters
      of content.
    - That wasted $0.086 of $0.22, and briefs shipped with cut-off summaries.
3. **Project loops re-run on unchanged projects.** About 44% of runs (49 of 114) had no task,
   document, goal or plan updated in the prior 24 h. That's about $0.068 of $0.138.
4. **Minor:** a handful of failed calls, and the untagged operation above.

## Where the time is (chat)

- Turns take **p50 22.9 s, p90 91.7 s**, with about **4 acting passes per turn**.
- Per pass: v4.1-flash p50 2.8 s (p90 10 s); v4-flash p50 5.5 s (p90 22 s). Production switched
  to v4.1-flash on 09-24. It's faster, but costs about 2× per input token and 6× per output
  token.
- The luna reviewer adds p50 3.6 s to write turns. Jev calls take 250–370 ms and run in
  parallel.
- Latency is the number of passes × about 3 s. Each extra pass re-sends about 15K prompt
  tokens.

## Recommendations (value ÷ effort)

1. **Split OpenRouter keys: prod / local dev / gates and pilots / agent sessions, each with a
   credit limit.** No code change; update the env files. This fixes attribution and the risk
   of a prod outage.
2. **Daily brief: turn reasoning off (or use DeepSeek flash) for the brief calls, and tag
   `operationType`.** A few lines. It fixes cut-off summaries and saves about 40% of that op.
3. **Fingerprint-gate the project loops.** Skip a loop when no record in the project changed
   since its last successful run. It's deterministic and free, and saves about 45% of loop
   spend. Same "precompute before paying a model" idea as Jev.
4. **Cut passes, the main speed and cost lever for chat:**
    - Measure context finder `on` for DJ. The 09-25 audit found 18 of 21 tool reads were already
      in the selected evidence. If passes drop, roll it out (plus fixes 1–2 in
      `CONTEXT_FINDER_2026-09-22.md`).
    - Next Jev step: **prefetch predicted reads.** Execute the read tools and record reads that
      Jev and the finder predict before the first pass, so pass 1 can answer.
5. **Reviewer:** investigate a Jev pre-check that skips the luna review for low-risk, fully
   specified writes. It costs 12% of spend and about 3.6 s per write turn. Needs a safety
   review first: the reviewer guards writes.
