<!-- docs/research/web-navigation-2026-09-22/README.md -->
<!-- doc-status: point-in-time -->

# BuildOS web access: current state + Jev link navigation

September 22, 2026. Free measurements only; the paid Jev/LLM navigation runs have **not** been run.

## Verdict

BuildOS chat can **search** (Tavily) and **read a single page** (plain HTTP fetch, no JavaScript). It **cannot click**:
`web_visit` only opens URLs the user typed or a search returned
(`apps/worker/src/workers/agent-run/webUrlCapabilityLedger.ts`: "page content never grants
capabilities"), and the worker strips `include_links`, so the model never sees a page's links
(`apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts`, `web_visit` argument rewrite).

## Production evidence (chat_tool_executions, last 90 days)

14 web calls in ~4 sessions: 9 `web_search`, 5 `web_visit`. Search took 3.9–7.4 s per call; visits took 0.2–0.5 s.
3 calls were blocked by the provenance rule, and every block came from the model trying to follow a link:

- 2026-09-20: found the NAACCC event calendar, then tried to open the Italia's Corner lunch
  event → blocked. The URL it tried (`…italias-corner-1875533`) was **invented**, because it never
  saw the page's links. It reached the real page (`…italia-s-corner-1874154`) through two more searches.
- 2026-09-08: tried `mailchimp.com/pricing/` from memory → blocked → searched again.

## Visit quality on 40 real sites (`visit-probe.ts`, production code path)

| Result (39 valid; one of my URLs was a stale 404)                                                   | Sites |
| --------------------------------------------------------------------------------------------------- | ----: |
| Useful content returned                                                                             |    25 |
| Bot-blocked, 403 (AP News, BBB, Angi, Home Depot; OpenAI only blocks our user agent)                |     5 |
| JS app: real content not in the HTML (Reddit, YouTube, SAM.gov listings, X, Instagram, Squarespace) |     6 |
| **Our own bug:** ASP.NET page returned empty (eMMA, MDOT, both Maryland procurement)                |     2 |
| Over the 2 MB cap (Amazon)                                                                          |     1 |

- **`<form>` bug:** `stripHtmlToText` (worker) and `STRIP_BLOCK_TAGS` (web parser) discard all text inside
  `<form>`. ASP.NET/SharePoint sites wrap the entire body in one form, so MDOT returns "The page
  did not contain readable text" (5.7K chars of real text exist) and eMMA returns "DOM is busy".
- **No reader extraction in the worker:** worker visits return whole-body text, so navigation menus fill the
  start of the 6K-char default window (median ~1K chars; Stripe pricing 4.9K; Baltimore procurement 4.1K
  of a 76-language picker). The web app has a reader parser; the worker does not use it.
- **No paging:** 11/39 pages have more main content than one visit can return (max 12K), and there
  is no way to read further.
- **No links:** median page has ~103 same-site links; the model receives 0.

## Proposal: Jev picks the link, code follows it

```text
code: fetch page (robots.txt, per-host spacing, honest UA) → reader text + every link (label, path, nearby text)
Jev:  page_has_answer (Noul) · next_link (Choice over the page's links) · needs_browser (Noul)
code: stop / follow best link / backtrack to the next-best link (best-first, ≤5 fetches)
main LLM: receives only the final page + breadcrumb trail
```

Why this fits BuildOS's security model: the egress rule exists so an injected page cannot make the
model **write** a URL containing private data. Here no model writes a URL: every candidate is copied
verbatim from the page's HTML, and Jev can only answer the choice it is given. The residual leak is which link was chosen (log2(N)
bits), sent to a site the page itself linked to.

Economics (dry run, 20 tasks): a Jev hop is ~5.8K tokens ≈ **$0.00024**, ~0.3–0.5 s (from prior
Jev measurements). Pages with >200 links are split into several Choice questions in one request
(MDN: 484 links → 3 questions, ~23K tokens, under Jev's 32K/64K limits).

## Harness

Run from `apps/worker`:

```sh
node --import tsx ../../docs/research/web-navigation-2026-09-22/visit-probe.ts            # free
node --import tsx ../../docs/research/web-navigation-2026-09-22/navigator.ts --dry-run    # free
node --import tsx ../../docs/research/web-navigation-2026-09-22/navigator.ts --nav keyword # free baseline
node --import tsx ../../docs/research/web-navigation-2026-09-22/navigator.ts --nav jev     # PAID, needs DJ OK
node --import tsx ../../docs/research/web-navigation-2026-09-22/navigator.ts --nav llm     # PAID, needs DJ OK
```

- `tasks.ts`: 20 goals (Bid Desk portals, pricing, docs, the two production failures). Targets are
  checked in code and never sent to a model.
- Dry run: 20/20 start pages fetched, target one click away on 18.
- Keyword baseline (no model): **3/20** found; 7/20 reached the target page without recognizing it.
- Politeness: robots.txt respected (e.g. 61 disallowed HN links filtered), 1 s between requests to one host,
  `BuildOS-AgentRun/1.0` UA, ≤5 fetches per task, $0.25 hard budget per run.

Not navigable by links: GitHub's repo page served to bots has no releases link, and robots.txt
blocks `/tree/`. SAM.gov, YouTube, and Reddit need their APIs, not a crawler.

## Comparison run: Jev vs a chat LLM (2026-09-22, ≈$0.09 total)

Same 20 tasks, same harness, same fetched pages; only the decider changes. Recordings:
`navigator-jev-2026-09-22T20-05-18-001Z.json`, `navigator-llm-2026-09-22T20-14-12-441Z.json`.
Replay page: https://claude.ai/artifact/WD7xgfq8BsatJBLhbx23XV (private to DJ).

|                                                     | Jev (`typesafe/jev-1.13`)         | DeepSeek (`deepseek-v4.1-flash`) |
| --------------------------------------------------- | --------------------------------- | -------------------------------- |
| Right page, strict URL grader                       | 11/20                             | 16/20                            |
| Right page, + best-page fallback + 2 hand-graded    | 16/20 (17 without the 0.15 floor) | 17/20                            |
| Opened the right page at some point                 | 18/20                             | 18/20                            |
| Decision latency p50 / p90                          | 0.30 s / 0.45 s                   | 2.9 s / 11.6 s                   |
| Median task, fetch + decide                         | 1.7 s                             | 11.5 s                           |
| Median task, wall clock (robots + 1 s/host spacing) | 3.5 s                             | 14.4 s                           |
| Model cost, all 20 tasks                            | $0.018                            | $0.064                           |

Read: Jev's link picks are nearly always right (Supabase: 66%, 36%, 89%, 99% on four correct
clicks in a row). Its weak spot is deciding to stop: it saw the answer page and kept going (Procore 32%,
Svelte 49%, MDOT 16%, Mailchimp 12%). The production navigator handles that three ways: a
best-page-seen fallback, per-passage relevance scores over larger page text, and an excerpt built
from the passages Jev rated relevant. Both navigators miss the same two tasks: Anne Arundel's bid list is an Oracle
Cloud app with 19 characters of server-rendered text (Jev: needs_browser 71%), which is the case the
Tavily tier exists for.

## Production build (uncommitted, 2026-09-22)

`web_navigate(url, goal, max_pages≤8)` is a new read tool in the web research group:

- `packages/shared-agent-ops/src/web/`: `page-reader.ts` (reader text + links; keeps `<form>`
  content), `polite-fetcher.ts` (robots.txt, 1–5 s per-host spacing, SSRF-checked DNS, honest UA),
  `tavily-extract.ts` (browser tier), and `web-navigator.ts` (best-first loop, escalation, time budget,
  best-guess fallback, step events).
- `apps/worker/src/workers/agentic-chat/tools/web-navigate.ts`: Jev request/parse, trail wording,
  and the worker port. Each step streams as a `tool_progress` semantic event, capped at 16 per call.
- Web: `ThinkingBlock.svelte` renders the step trail under the tool row, and restored sessions
  rebuild it from the result.
- Egress: `web_navigate` may start only from a user URL or a ledger-known URL. Every page it loads
  enters the ledger, so `web_visit` can reopen it.
- `web_visit` in the worker now uses the same reader, which fixes the empty MDOT page (0 → 4,193
  chars).

Pending, each needing DJ's approval to spend: a rerun of these 20 tasks on the production navigator
(≈$0.02), live chat smoke turns, and `pnpm agentic:gate`.
