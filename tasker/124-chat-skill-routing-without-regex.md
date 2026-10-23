<!-- tasker/124-chat-skill-routing-without-regex.md -->

# 124 — Chat skill routing without regex

**Status:** PARKED by DJ (2026-10-18): investigate later; decide what we want before building  
**Priority:** P2 · **Opened:** 2026-10-18 · **Wake condition:** DJ picks it up, or a misrouted
skill shows up in a real chat

## The problem

AGENTS.md: "Do not decide what a user message or model reply means with regex or keyword lists."
Agentic chat admission still does exactly that to decide which skill or playbook the model gets.
The agentic chat teardown (artifact `6pa2L6AK…`, finding "Regex reads the user's message in two
places") flagged it. It is bigger than one pattern, so it is parked here instead of fixed inline.

### Where it lives

`apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.ts` (958 lines), called from
`agentic-chat-v2/turn-preparation.ts` (`senseDomains`) and `tools/domains/skill-gate-preload.ts`:

1. **Lexical domain scorer.** `senseDomains` scores the message against domain ids, names and alias
   vocabulary. An alias hit or two "discriminative" tokens open the **skill-load gate**, which tells
   the model it must call `skill_load` before answering (`GATED_NEXT_STEP`) or preloads the skill
   into the prompt (`skill-gate-preload.ts`).
2. **Regex guards that close the gate** (`resolveSkillGateSuppression`): `DIRECT_READ_*`,
   `STATUS_RECALL_PATTERN`, `CRAFT_VERB_PATTERN` (lines ~124-137), `NARROW_EDIT_*` (~154-171).
   They exist because the scorer misfired. The file's own comments: a Gmail read and "search my
   email for the invoice from Stripe" both preloaded a cold-email playbook; "where are we at with
   this book?" preloaded a blog-marketing one.
3. **"Is this a request?"** `EXPLICIT_SKILL_REQUEST_PATTERN` (~182-194), a verb list
   (help/draft/write/plan/review/audit/campaign…).
4. **Native outcome-card signals** (~212-255): `PROJECT_AUDIT_*`, `PROJECT_FORECAST_*`,
   `PROJECT_HEALTH_SIGNAL_PATTERN` push the project audit and slip-forecast cards with 0.9
   confidence.

Related, same rule: `apps/worker/src/workers/agentic-chat/provider/write-routing.ts:242-261` sends a
write to review when the message matches "verbatim", "word for word", "exact … text" and similar.
That one fails safe (it only adds a review), but it reads the user's language with regex all the
same.

### Why it matters

It silently changes what the model sees: a skill preloaded into the prompt, or an instruction that a
skill load is mandatory. Misfires are invisible to the user and only show up as an odd answer. Every
fix so far has been another regex guard on top of the scorer.

## Structured channels that already exist

- **Jev's structured commission** (worker) already picks a write playbook for the turn
  (`provider/turn-rules.ts`, `state.writeCommission.recordTurnRulesPlaybook`). It is a stateless
  decision call that runs on every turn anyway.
- **Explicit UI choice:** `resolveUserLaunchSkillPreload` (the user picked a skill) and
  `resolveFocusedTableSkillPreload` (the focus is a table). Both are structured and fine.
- **The model's own tools:** `skill_search` / `skill_load` let the acting model fetch a skill when
  it decides it needs one.

## Questions for the investigation

1. **How often does each path fire in production, and on what?** Read user-message metadata
   (`SKILL_PRELOADED_ID_METADATA_KEY`), `gate_suppressed_by` telemetry and
   `chat_prompt_snapshots` (14-day window) for the last two weeks. List gate opens, preloads and
   suppressions with the message. Free, read-only.
2. **Would Jev have picked the same thing?** For those turns, compare the lexical choice with
   Jev's playbook choice (Jev already logs its commission). If Jev agrees on the good ones and
   avoids the misfires, the lexical layer can go.
3. **Options to weigh:**
    - A. Delete the lexical gate and preload. Rely on Jev's playbook choice plus the model's own
      `skill_search` / `skill_load`.
    - B. Fold domain/skill choice into Jev's existing structured output: one more field on a call
      that already runs, so no extra model call.
    - C. Keep the scorer only as an advisory candidate list (no gate, no forced load, no preload),
      the "small and harmless when it misfires" exception AGENTS.md allows.
    - For write-routing: carry "store this verbatim" as a structured field (a Jev commission flag
      or an argument on the write tool) instead of matching the message.
4. **What breaks if the gate disappears?** Which skills depend on being force-loaded (marketing
   playbooks, project audit/forecast cards)? Do their battery cases still pass?

## Validation when it is built

Free first: replay the stored turns from question 1 through the new routing offline and diff the
chosen skill. Then one paid `pnpm agentic:prod-battery` run, with DJ's approval and a cost estimate
based on the acting model (`--preflight-only` reports it; the last full run was about $0.33).

## Exit condition

No user or model language is classified with regex or keyword lists on the skill and write-routing
paths, verified by the replay and a battery run. Or DJ decides to keep one path under the AGENTS.md
exception and documents why.
