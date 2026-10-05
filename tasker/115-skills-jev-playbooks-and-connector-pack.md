<!-- tasker/115-skills-jev-playbooks-and-connector-pack.md -->

# Tasker 115 — Skills: Jev-chosen playbooks in chat, and a skill pack that travels with the connector

> **Audit 2026-10-04 — ACTIVE.** The lean pass and the route-export fix are pushed and deployed
> (`7f51e54fd`, `df81f97dc`; Vercel + workers green). The "uncommitted / web did not deploy" notes
> below are stale. **Left:** Supabase Auth redirect allow-list check for `/auth/confirm`, the
> post-deploy smoke list (headers, sitemap resubmit, a throwaway Try signup), then Phase 1 tests
> before any ambitious build. **Priority:** P1 for the smoke + allow-list (signup path); P2 for
> Phase 1+. **Recommend:** keep.

**Status:** OPEN. Lean pass done 2026-10-04 (see "Lean pass"). The ambitious work below waits on the
tests in Phase 1 and on DJ's go. · **Opened:** 2026-10-04
**Source:** Skills audit 2026-10-03 (4 agents, prod read-only). Page:
https://claude.ai/artifact/XLkp22kfoUd5ByYYYEDuFV
**Owner code:** `apps/web/src/lib/services/agentic-chat/tools/skills/` (definitions, preload),
`apps/web/src/lib/services/agentic-chat/tools/domains/` (regex router + domain sensing),
`apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts` (preload resolution),
`apps/worker/src/workers/agentic-chat/provider/jev-tool-selector.ts` (Jev),
`apps/web/src/lib/server/agent-skills.ts` + `routes/skills/**` + `routes/agent-skills/**` (public),
`plugins/buildos/` (Claude/Codex plugin).
**Related:** [ChatGPT plugin positioning](../docs/research/chatgpt-plugin-positioning-2026-10-03.md)
(page EZN2K8o2…): its capture / resume / save-back workflows are the same skills as Phase 3.
Lane G of the 09-08 harness audit
(`docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/lane-G-skills-domains.md`): G1 and G8
are still open and land here.

## DJ's ask (2026-10-04)

> "I want to do the ambitious version, but the skills, I haven't used them recently, and I don't
> know how they integrate with Jev yet. Maybe we do the first pass and just do the lean thing first,
> and then we do tests to see if we can make the skills more useful in the chat and upgrade
> everything so that we use Jev like you were saying."

So: lean first (done), then **test before building**. DJ is not yet sold on "playbooks"; the first
deliverable here is evidence and an explainer, not code.

## What the audit found (still true after the lean pass)

- Since commit `439380dc5` (2026-09-04) the worker is the only turn engine and strips `skill_load` /
  `skill_search` (`packages/agentic-chat-runtime/src/worker-tool-policy.ts`). The model cannot pick a
  skill itself. A skill reaches it only as a server preload chosen by
  `resolveWorkerSkillPreload`.
- That choice is a **regex router** (`tools/domains/operational-skill-intent.ts`), which breaks the
  AGENTS.md "never classify language with regex" rule. It missed 27 of 63 write turns (43%) in the
  30 days to 10-03.
- **Jev already runs every turn** and returns `selectedToolNames` and `commissionedWriteToolNames`.
  Offline on the 70 turns that had Jev logs: picking the family playbook from Jev's selected write
  tools caught **21 of 21** write turns; the regex caught 7; `commissionedWriteToolNames` caught 10.
  Extra prompt cost under $0.01 a month. Sample is small and mostly DJ + the test account.
- About 5,900 non-test lines of domain sensing / outcome cards plus the trigger
  `trg_chat_turn_runs_terminal_domain_metadata` still run every turn and write lexical noise
  (e.g. "writing_craft" logged as a missing skill in 177 sessions). `domain_research_queue` has 0 rows.
- ~40 marketing / design / writing ("craft") skills have 3 real-user loads ever and depend on
  reference loads the worker cannot do.
- Real users: 18 non-admin users, 52 chat turns ever. No skill change moves activation at this
  volume; the payoff is writes that land the first time for DJ now and the first cohort later.

## Lean pass (2026-10-04)

Built 2026-10-04, **uncommitted, not deployed**. Checks: web svelte-check 0 errors, worker
typecheck clean, 26 focused web test files (389 tests) + worker contract-example test (20) green,
`agent-skills:check` and `guardrails:local-skills` pass. No paid calls, no migrations.

**Chat**

- Task, document, calendar, plan and project-creation playbooks teach when the worker asks for a
  contract and "declare every write with exact targets, then make only those." The document playbook
  also covers copying `old_text` from a read this turn, `ANCHOR_NOT_FOUND` retries, and never
  editing the auto-maintained START HERE region. New worker test
  `apps/worker/tests/agenticChatSkillContractExamples.test.ts` runs every example through the real
  `validateCompletedProviderCalls`.
- Worker bug fixed (`provider/validation.ts`): an approved reschedule called with `onto_event_id`
  was always rejected as outside the contract.
- `plan_management` rewritten (57 lines) and allowlisted; the operational resolver falls through to
  the next eligible entity. Allowlist: calendar, document, plan, project_audit, task.
- A skill whose declared tools aren't mounted this turn is refused (`tools_unmounted`), e.g.
  `people_context`.
- `project_creation` teaches shell-first creates; the worker's `create_onto_project` description
  says `props` accepts only facets. (The shared base description, used by MCP, is unchanged on purpose.)
- "Try in BuildOS" now sends `requestedSkillId` with the first turn; the server validates it
  against the registry and preloads it as `user_launch`. Navigation's launch params moved onto
  `consumeOneTimeUrlParams`.

**Signup path**

- Root cause was earlier than the audit thought: `normalizeRedirectPath` rejected every Try
  redirect because the drafted prompt carries encoded newlines. Now only the path part is checked
  for control characters; off-site redirects stay blocked.
- New users arriving with a chat launch stay on `/today` (no onboarding bounce). Email
  confirmations return through the new `/auth/confirm?next=…`; Google OAuth state carries the launch.
- `signup_source = 'skill:<id>'` for email and Google signups from a Try link (explicit UTM wins).

**Public pages**

- `/skills/[slug]` canonical → `/agent-skills/[slug]`; downloads send `X-Robots-Tag: noindex` +
  canonical `Link`; previews and one-skill families noindexed; sitemap 167 → 126 URLs.
- Every portable SKILL.md ends with a "More From BuildOS" footer (canonical link with UTM,
  non-bundled skills marked "runs inside BuildOS", connect-agents link); internal leftovers stripped;
  Google Calendar bundle name matches its folder; install steps on the pages.
- "Run this in BuildOS" block on agent-skill articles; Try links on people pages; titles ≤ 60 chars
  with "Claude Code"; calendar article now teaches the wrong-account rule; 308 aliases; `llms.txt`
  repositioned; `/.well-known/agent-skills/index.json` (discovery v0.2.0).

**Plugin and dev skills**

- Plugin install command and manifests point at `Wolverine971/buildos-platform`; `buildos-context`
  lost its non-spec `path:` field and says how clients prefix tool names.
- `scripts/labelFilePaths.ts` now skips `plugins/**/SKILL.md` (it kept re-adding `path:`).
- `guardrails:local-skills` now scans `.agents/skills` and `plugins/*/skills` and follows symlinks.
- `anti-feed` hands drafting to `draft-anti-feed-blog`; `youtube-to-skill` template uses canonical
  blocks, asks for the BuildOS job and data, and uses pnpm.

**Adversarial review fixes (10-04, three read-only reviewers + verification)**

- Login CSRF closed: `/auth/confirm` accepts only the browser-bound PKCE `code`; the `token_hash`
  branch is gone (GoTrue's `email` type also accepts recovery tokens, so a mailed link could sign a
  victim into the sender's account). Pre-existing, not fixed here: `reset-password` still accepts
  recovery token hashes (visible to the user, but the same binding gap).
- `/today` reads the launch params with `untrack` and sets a 1-hour `/today` grace cookie, so the
  one-time URL cleanup (a real `goto`) no longer re-runs the load and bounces a new user to
  `/onboarding` mid-chat.
- Register drops an oversized/malformed `redirect` instead of failing the signup; Google signup
  trims a long launch draft out of the OAuth state cookie (keeps the skill).
- A Try-launched skill now lasts the whole chat: stored as `agent_metadata.launch_skill_id` on the
  session it creates, recovered from history (`skill_preload_source = user_launch`) otherwise.
- `plan_management` no longer teaches `create_onto_plan({ milestone_id })` (the worker rejects it);
  `task_management` dropped the task-link contract example that could never run on global chat.
  The worker test now also checks every outcome has a mounted tool on each surface and every write
  call shown in a playbook uses only admitted arguments.
- Calendar skill wording is portable (BuildOS field names in parentheses); MCP server README repo
  link fixed; `robots.txt` disallows `/skills/try/`.
- Known, left for Phase 2: the regex plan lexicon now matters more (e.g. "push the release call to
  Friday" can pick the plan playbook over calendar); a launched craft skill whose procedure says
  "load X" still can't load children on the worker.

**Deploy incident (10-04)**

- DJ's push `7f51e54fd` (merge `97a8d5004`) carried an invalid route export
  (`export const CHAT_LAUNCH_GRACE_COOKIE` in `today/+page.server.ts`). Vercel's build rejected it, so
  **web did not deploy** (prod web stayed on the previous version; workers deployed fine). Fixed
  locally (`_CHAT_LAUNCH_GRACE_COOKIE`), not yet pushed. New guard `guardrails:route-exports`
  (`apps/web/scripts/check-route-exports.mjs`, in the lint chain) fails on any non-SvelteKit export
  from a route module; svelte-check and vitest never caught this class.
- CI on that push also failed on the migration ledger: `20260930220000_project_fold_foundation.sql`
  is an applied migration edited in place (another session's change, pre-dating this work).
- Review fixes after 15:20 (public-page round 2, `/today` rename, tasker, `legacy-redirects.ts`,
  `robots.txt` is in) are uncommitted.

**Post-deploy check (10-04, after DJ's push `df81f97dc`)**

- Vercel web deploy succeeded; workers deployed.
- Supabase auth (read live via Management API): Site URL `https://build-os.com`; allow-list has
  `https://build-os.com`. GoTrue accepts any redirect whose scheme+host match the Site URL
  (`IsRedirectURLValid`), so `/auth/confirm?next=…` is covered with no change. Every email
  template uses `{{ .ConfirmationURL }}` (PKCE code), confirming the token_hash removal was safe.
  `www.build-os.com` 308s to the apex.
- CI red on `df81f97dc`: the worker surface budget test (project_create 8,230 B > 8,220 B) after
  the `create_onto_project` props sentence. Fixed by tightening the description (404 → 374 chars,
  rule kept); the web "failures" in that run were the suite being cancelled mid-run. Local full
  suites green: worker 3,693 tests, web 5,547 tests. Fix is local, needs a push.
- Also fixed: preload skipped entirely on the `project_create` surface (a task playbook leaked
  there via the any-mounted-tool check; test proven to fail without the guard); "root combo / child
  skill" jargon removed from two article descriptions.

**Before / after deploy**

- Deploy the worker with or before web (the reschedule fix backs the calendar example).
- (Verified 10-04) Supabase redirect allow-list covers `/auth/confirm` via the Site URL host match.
- After deploy: `curl -I` a download for the headers; `npx skills add https://build-os.com`;
  resubmit the sitemap and request reindex of the 8 articles in Search Console; look at the article,
  gallery and a people page at phone width; one throwaway Try signup (email and Google).
- The index holds some of these files staged by another session in pre-format versions; re-add the
  paths before committing.

## Phase 1 — Tests first (free unless marked)

1. **Explainer on DJ's real turns.** An interactive page: pick a recent chat turn, see what Jev
   selected, which playbook the regex picked, which one Jev's tools would pick, and what the model
   then did (contract result, write result). Goal: DJ sees how skills and Jev fit before deciding.
2. **Offline replay, bigger sample.** Re-run the head-to-head on every turn with Jev logs since
   2026-09-19 (and keep it as a script that can re-run): recall and false-positive rate on write
   turns for (a) regex, (b) `commissionedWriteToolNames`, (c) any selected write tool, per family.
   Report token cost of false positives.
3. **Lean-pass effect, from prod logs.** Write-tool failure rate by family and
   `mutation_unfulfilled` by family, 14 days before vs after the lean deploy
   (`chat_tool_executions` keeps 30 days). **Baseline snapshot taken 2026-10-04:**
    - `declare_turn_contract`: 60 calls / 26 failed, all 09-04 → 09-13. **0 calls since 09-14**
      (the worker now asks for a contract only on complex writes, `write-routing.ts`). The audit's
      "41% contract failures" headline describes early September, not today.
    - Since 09-14: `update_onto_document` 21 calls / 9 failed (43%) — 5× "outside the
      independently approved turn contract", plus `ANCHOR_NOT_FOUND`, `MANAGED_REGION_BOUNDARY`
      (START HERE), a structure version conflict. `update_onto_goal` 3 / 1 failed (same contract
      error). `create_onto_task` 13 / 0, `create_onto_goal` 4 / 0.
4. **Does a playbook help at all on today's acting model?** (paid, needs DJ's OK per run.) Same
   battery cases with playbook on vs off, on the model `AGENTIC_CHAT_OPENROUTER_MODEL` names in the
   env file the run reads; estimate from that model's last measured spend before asking.

Exit: DJ picks "Jev-chosen playbooks" or "no playbooks" (or something else) from the evidence.

## Phase 2 — Chat build (only if Phase 1 says yes)

- Choose the playbook from Jev's selection in the worker; delete the regex router and the inline
  cold-email regex in `skill-gate-preload.ts`.
- About 6 short runbooks (≤40 lines, tool names only, contract example first): task, document,
  calendar, plan, research capture (`research_capture`), and one project cleanup / status read
  playbook anchored on `get_project_cleanup` (repurpose `project_audit`; use
  `docs/product/PROJECT_REVIEW_TAXONOMY.md` terms; the consolidation cards will need it).
- Delete the domain-sensing machinery (lane G G1): `domains/` sensing on the chat path, outcome
  cards, session-state / used-signals / research-queue code, the `domain_research_queue` table and
  admin page, the terminal trigger, `chat_turn_runs.first_skill_path`, and the web-lane catalog branch.
  Migration needs `pnpm db:rehearse` and DJ's OK to apply.
- **Decision for DJ:** take the ~40 craft skills out of chat entirely (keep them as public pages)?
  Recommendation: yes.

## Phase 3 — Skill pack that ships with the connector (interview DJ first)

- One BuildOS skill pack for Claude (plugin + Marketplace listing), ChatGPT/Codex (shared plugin
  directory) and `npx skills add build-os.com` (`/.well-known/agent-skills/index.json`): capture,
  resume, save back, weekly review, project cleanup, and "grill me, then save it to BuildOS".
  Installing it = connecting BuildOS. Merge with the ChatGPT plugin work rather than run it twice.
- `/skills` becomes the home of that pack: one page per workflow, each with a working Try path.
- One source file per skill; the chat runbook, public page and download are generated from it
  (today there are up to 5 hand-kept copies and no sync).
- Point `.claude/commands/youtube-to-skill.md` at BuildOS jobs and data, or retire it.
- Dedicated small public repo for the plugin marketplace (today `claude plugin marketplace add`
  clones the whole 262 MB monorepo). Creating a public repo needs DJ's OK.
- Interview DJ before building: what should the first install feel like, and which workflow is the
  wedge?

## Open owner items

- Search Console export (Pages + Queries for `/skills`, `/agent-skills`, `/blogs/source-analyses`,
  last 3 months; "Not indexed" reasons) and Vercel Analytics page views for those paths. Needed to
  confirm the canonical choice made in the lean pass.
- (Resolved 10-04) People-page portraits removed: DJ asked for no faces and no generated
  likenesses. Profiles show initials (`SkillExpertMonogram.svelte`), social cards use the default
  BuildOS image, the 12 re-hosted photos were deleted, and `skill-experts.test.ts` fails if an
  expert regains a portrait or image path.
