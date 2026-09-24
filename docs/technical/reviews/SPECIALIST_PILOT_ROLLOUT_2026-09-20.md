<!-- docs/technical/reviews/SPECIALIST_PILOT_ROLLOUT_2026-09-20.md -->
<!-- doc-status: point-in-time -->

# Specialist pilot rollout — September 20, 2026

DJ explicitly authorized production migration application, account-only enablement, and a small
live test. The full research run and Agentic Chat QA gate remain deferred; this is a targeted smoke.

## Schema verification

Production project: `iwifjtlebphefldmwbkh`.

- `20260920010743_agentic_chat_specialist_snapshots_v2` and
  `20260920032259_agentic_chat_document_read_tools_v1` were already applied but missing from the
  migration ledger. Verified all nine final function bodies against local SQL, the table bounds,
  immutability triggers, RLS, and browser-role denial; repaired only those two ledger entries.
- Applied `20260920041644_agentic_chat_specialist_selection_shadow_v1` inside a transaction with
  a five-second lock timeout, then recorded its original version in the ledger. Verified the
  three function bodies, service-only execution, invoker security, and private table access.
- All three versions now appear in the production ledger. No blanket migration push was used.
- Supabase's security advisor reports informational "RLS enabled, no policy" findings for these
  service-only tables. This is intentional: browser roles have no grants and no row policies.

## Deployment and scope

Source revision: `3c787c76d9c886f35588dc9e27cef24982f5e513` (the revision DJ deployed).
No checkout upload or unrelated source changes are part of this rollout.

Railway `agentic-chat-worker` deployment `629435b3-aeee-43ff-a3ca-556ec12a67e4`
replaces `6f466474-5f0c-406a-a8ea-825efdd3032d`. All four new replicas passed health checks;
the four previous replicas exited before the web rollout.

Enabled worker variables:

```text
AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED=true
AGENTIC_CHAT_WORKFLOW_EXECUTION_ENABLED=true
AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED=true
AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED=true
AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS=255735ad-a34b-4ca9-942c-397ed8cc1435
AGENTIC_CHAT_JEV_SPECIALIST_SELECTION=shadow
```

Enabled production web variables:

```text
AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED=true
AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED=true
AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED=true
AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS=255735ad-a34b-4ca9-942c-397ed8cc1435
```

All of these variables were previously absent. The existing ordinary-chat Jev tool selector and
freshness radar settings were left unchanged. Jev specialist selection remains observational;
it cannot choose the executing agents or grant tools. Its cost is additional evaluation telemetry.

Vercel redeploy: `dpl_8jMxWUeePvTN9pWm8aUPM8dnCoeE`,
`build-atq8mrhfr-djwayne35gmailcoms-projects.vercel.app`, created from the existing production
deployment `dpl_6JmTUkaMr9cHDhaqj7qnSy7oxfQc` with current project environment variables.
The deployment reached `READY`; both workflow choices were verified in the signed-in production
composer, and both subsequent requests were admitted through that UI.

## Validation

Fresh focused tests: **28 passed** (14 specialist shadow tests, 14 worker configuration tests).
Earlier implementation validation is recorded in the linked architecture and handoff documents.

Two live production smoke runs completed on **Specialist Pilot Smoke — Synthetic Sep 20**
(`2ec80b3e-5552-42b8-98cb-5b8844311e1e`). This new account-owned fixture contains only three
agent-authored fictional Maple Workshop documents. Automatic approval review rejected submitting
the existing AI Chat Evaluation Framework project's private contents to external model services;
that submission was not retried. The synthetic fixture avoids that private-data transmission.

Saved session: `d104deef-1e63-4dbe-996c-aaa3d066ad52`.
[Open the saved conversation](https://build-os.com/history?id=d104deef-1e63-4dbe-996c-aaa3d066ad52&itemType=chat_session).

| Run                                                          | Result   | Time including queue | Model dispatches | Workflow cost | Jev cost / latency    |
| ------------------------------------------------------------ | -------- | -------------------- | ---------------- | ------------- | --------------------- |
| Document organization `6e87659b-1b09-4634-a46c-ad5102d95f83` | Complete | 36.522 s             | 5                | $0.003512     | $0.000074466 / 201 ms |
| Project review `e9ccc16e-803c-45cc-a88b-3eebcaef2cc3`        | Complete | 27.121 s             | 4                | $0.002815     | $0.000074424 / 224 ms |

Recorded workflow ledger cost plus Jev receipts: **$0.00647589**, under one cent. All nine
workflow dispatches settled; each run has exactly one finished Jev receipt and zero recovery
attempts. Costs here describe these review/selector calls, not unrelated background services.

- The document run used `internal-document-organization:v3` and one immutable three-document
  read batch. All three synthetic bodies were returned untruncated. The organizer found the
  deliberately overlapping workshop description and the stale "materials list still needed"
  note; the answer proposed a grouping and a missing logistics record.
- The ordinary review used `internal-project-review:v1`, with no document-read batch.
- Jev chose `document_read` and `project_review` respectively. Both agree with the requested
  bundles; this two-example smoke is not an accuracy benchmark. Reported model:
  `typesafe/jev-1.13-20260917`. Each selector made one attempt.
- Live progress showed the correct specialist labels and all stages completed. Reloaded during
  the second run, then reopened the saved session through History. Both answers and both completed
  workflow cards restored, with exactly two assistant messages and no additional paid dispatches.
  Opening project chat directly starts a new session; History restores the existing session.
- Before/after hashes and row counts match for the fixture project, documents, tasks, goals,
  plans, milestones, risks, and edges. The workflows made no domain changes.
- The offline shadow report successfully verified the hashes of the two production receipts.

### Quality limitation and next implementation

Functional smoke passed; answer quality has a concrete evidence-sharing gap. The document
organizer sees saved full reads, while the parallel risk reviewer sees inventory/context only.
The editor reconciled that mismatch in the first answer. In the follow-up ordinary review, the
previous run's reads are not part of the new run's authoritative evidence, so the risk reviewer
asked for information the organizer had already read in the prior turn. The answer also exposes
too many internal IDs and implementation terms.

Next: versioned evidence handoffs between specialists, followed by safe evidence reuse across
turns. Pin source run/read hashes and coverage, recheck project access and document freshness,
and distinguish "not supplied to this agent" from "does not exist." Sharing within a document
review needs an explicit dependency/evidence contract; do not silently mutate the frozen v1
parallel graph or treat prior assistant prose as a fresh source. Present document titles and
links instead of raw IDs in the user-facing answer/receipts. Keep Jev observational while this
behavior is improved. This rollout does not implement dynamic specialist routing.

## Rollback

To stop new reviews, set production web `AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED=false` and
redeploy the same source revision. Let already admitted work finish before disabling worker
preparation/execution or rolling back to older binaries.

To stop only Jev specialist observations, set worker
`AGENTIC_CHAT_JEV_SPECIALIST_SELECTION=off` and let Railway redeploy. Saved observations remain.

To return new document reviews to inventory-only mode, disable the web document-read flag and
redeploy; keep the worker read capability enabled until previously admitted read-enabled runs drain.
Leave the additive tables and migration ledger in place during an operational rollback.
