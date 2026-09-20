<!-- artifacts/agentic-chat-one-engine-retest-2026-09-04.md -->

# One-engine browser retest — environment preflight

**Follow-up at 13:14–13:29 America/New_York: deployment is now verified and the full browser battery is complete.** Production web and worker both run the merged `main` commit `6d787284c`. The new score is **27/52 (52%, F)**. See [the completed assessment](/Users/djwayne/buildos-platform/artifacts/agentic-chat-postdeploy-6d787284c.md). The earlier blocked preflight below is retained as historical evidence.

Requested September 4, 2026. Previous browser score: 34/52 (65%, D); create/update 11/20 (55%, F). Intended comparison is the same 13 graded scenarios, with fresh synthetic fixtures and first-attempt failures separated from recovery. No new grade until the updated engine is actually under test.

## Verified environment

- At approximately 12:32 America/New_York, production web + agentic-worker GitHub statuses are successful on `e515ae27333c002cc8368c993547f6567fca90e7`; production web deployment record `6258135769` was created at 04:53:37 UTC. Its changes from previously tested `a1771c1f7` are exclusively documentation and test/audit artifacts. It does not contain the one-engine functional changes.
- Current local branch is `one-engine`, HEAD `a3822ca674e50e135d9ff7a78357e5fc9268f063`. GitHub has no remote branch or deployment/status for this HEAD. There are pre-existing uncommitted changes, including prompt-context and generated schema changes; this preflight does not edit them.
- Authenticated BuildOS web UI is running at `http://localhost:5174`. Its process started 12:27:52. Port 5173 belongs to a different project and was not used.
- Local port 3001 process started 12:27:54, cwd `apps/worker`, command `src/index.ts`. `/health` reports `service=daily-brief-worker`, healthy general queue; it does not establish an agentic worker running the branch. No `PRIVATE_AGENTIC_CHAT_WORKER_URL` was found in the local env files inspected (only that allowlisted configuration and non-secret model settings were inspected).
- Branch handoff `docs/technical/reviews/ONE_ENGINE_BRANCH_HANDOFF_2026-09-04.md` explicitly says the live battery is not yet run, turns use a shared hosted queue without a partition, and local chat workers would compete for real users' turns. This makes a branch-matched worker environment necessary for a meaningful retest.

## Browser readiness probe

Submitted through General Chat on localhost:5174:

> Read-only retest readiness check: find the existing project "[QA RETEST a1771c1] Cedar House Renovation" and report its saved budget cap. Do not create or change anything.

The probe completed successfully in 11.4 seconds with one `get_project_overview` call. It returned the saved $85,000 cap and $10,000 contingency, made no mutations, and repeated the old one-day-late permit date. Session: `9db4d921-fd12-4457-8f73-ad3e19f8d2f2`; turn: `65714b8b-d862-4a85-aeda-dcc556a403b4`; shared queue job: `ab57c44c-d4f4-43c2-88d0-edfbc7729985`; execution mode: `worker_realtime`.

At 12:35:43, the actual deployed agentic worker `/health` reports **release `a1771c1f7cc49072e1f686d4f833bf81cc94ab3e`**, queue started `2026-09-04T02:27:02.657Z`, and the old set of 21 advertised mutation tools without calendar writes. This is stronger revision evidence than GitHub's successful status on the later documentation commit. The local browser probe therefore does not establish that the new engine is running. No branch-matched chat worker has been established.

Additional observed health signal: top-level status `healthy`, but Realtime reports `degraded`, zero active channels and 331 consecutive failures. No configuration was changed to address this.

## Retest disposition

### Follow-up: did the push to main succeed?

Yes. Local `origin/main` reflog records **update by push at 2026-09-04 00:48:17 -0400**, to `e515ae273`, and GitHub's current `main` confirms that same SHA. The current local `one-engine` branch is **22 commits ahead of main**, with zero commits on main missing from it, no upstream configured, and no GitHub branch of that name. The new engine commits were not included in the successful main push. Existing uncommitted files are also outside either committed revision.

Railway directly confirms why its GitHub check was green without a new worker release: deployment **`97c4023d-dfc6-4274-823b-57a51afa938b`** for `e515ae273` is **`SKIPPED`**, reason **“No changes to watched files.”** Its last successful worker deployment is **`c8640156-c1dc-4551-b281-bd991e409747`**, commit `a1771c1f7`. The missing step is integrating/pushing the one-engine commits to the deployment branch, not retrying a failed worker build.

**Environment gate blocked; no new grade.** A full battery now would combine the new local web with the old deployed worker. Required next step: deploy matching web and agentic-worker revisions for the `one-engine` branch, or provide an already deployed matching preview pair. A local competing worker is unsuitable because the branch handoff documents that the hosted queue has no partition. Deploying/replacing shared production services requires an explicit user decision; this request only authorized testing.

No new project/tasks/documents/calendar events have been commissioned in this run. No implementation files, services, permissions, queue configuration, or deployment were modified. The complete reusable prompt set is retained in `artifacts/agentic-chat-postdeploy-a1771c1f7-runs.json`. Once the matching environment exists, rerun all 13 graded scenarios with a fresh project, keep dates/constraints/rubric fixed, and compare against 34/52 (65%, D) and create/update 11/20 (55%, F).
