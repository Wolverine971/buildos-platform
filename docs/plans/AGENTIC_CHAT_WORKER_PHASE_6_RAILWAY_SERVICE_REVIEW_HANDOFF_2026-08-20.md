<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_6_RAILWAY_SERVICE_REVIEW_HANDOFF_2026-08-20.md -->

# Agentic Chat Worker Phase 6 Railway service review handoff

**Prepared:** 2026-08-20  
**Purpose:** independent production review of the new dedicated Railway service, its GitHub source,
Vercel routing, environment-variable contract, worker ownership boundary, and live canary evidence.  
**Repository:** `/Users/djwayne/buildos-platform`  
**Current source revision:** `main` / `origin/main` at
`49dcd5a2b4574ac9efdb456b5c3734c9827e7035`  
**Original Phase 6 brief:**
[`AGENTIC_CHAT_WORKER_PHASE_6_KICKOFF_HANDOFF_2026-08-20.md`](./AGENTIC_CHAT_WORKER_PHASE_6_KICKOFF_HANDOFF_2026-08-20.md)

## 1. Reviewer mission

Independently determine whether the dedicated Agentic Chat worker is correctly isolated, connected,
configured, deployable, observable, and safe to receive the current one-user production canary.

Do not treat this document as proof. Treat it as an inventory of claims and identifiers to verify.
Start read-only. Report findings before changing production state unless the operator explicitly asks
for a fix.

The most important open proof is:

> A real turn reached worker transport and was claimed by the new service, but it failed against a
> stale Railway internal-user allowlist. Both Vercel and Railway allowlists are now corrected and the
> replacement worker is healthy, but no third/post-fix chat turn was sent. A successful post-fix
> end-to-end worker reply is therefore not yet proven.

Sending that final canary creates a chat record and spends a normal model call. Obtain explicit
operator approval immediately before sending it.

## 2. Safety and review rules

- Never print secret values. Presence checks, scopes, counts, and authenticated endpoint outcomes
  are sufficient.
- Do not dump all Railway or Vercel variables into the handoff or terminal transcript.
- Do not send a production chat, restart a service, rotate a secret, change a cohort, or widen
  routing without explicit authorization.
- Preserve the dirty worktree. It contains substantial unrelated user work. Do not stage, revert,
  reformat, or commit anything outside this handoff unless asked.
- Keep the canary cohort at exactly one verified user until the post-fix turn and soak checks pass.
- Keep both mutation capability lists empty.
- Do not repoint `PUBLIC_RAILWAY_WORKER_URL`; general worker routes still depend on it.
- An admitted turn keeps its stored transport. Never replay an in-flight worker turn on legacy.

## 3. Intended production topology

```text
GitHub Wolverine971/buildos-platform (main)
              |
              +--> Railway daily-brief-worker
              |      railway.toml
              |      node apps/worker/dist/index.js
              |      general queue/scheduler/API
              |      Agentic Chat runtime disabled
              |
              +--> Railway agentic-chat-worker
              |      railway.chat.toml
              |      node apps/worker/dist/chat-worker.js
              |      Agentic Chat queue/capacity/health only
              |
              +--> Vercel build-os / build-os.com
                     exact one-user routing cohort
                     PRIVATE_AGENTIC_CHAT_WORKER_URL
                              |
                              +--> authenticated /agentic-chat/capacity
                              +--> worker admission -> shared durable queue
```

The dedicated service and the legacy/general service share the repository and production database,
but they must not share process ownership of the Agentic Chat queue.

## 4. Current identifiers and last verified state

### GitHub and source

| Item                                         | Expected value                                 |
| -------------------------------------------- | ---------------------------------------------- |
| Repository                                   | `Wolverine971/buildos-platform`                |
| Branch                                       | `main`                                         |
| Phase 6 implementation commit                | `768c12d8ec0e1e55990e60dc362a3cde0b90ac8b`     |
| Dedicated Railway config commit/current HEAD | `49dcd5a2b4574ac9efdb456b5c3734c9827e7035`     |
| Config file                                  | [`railway.chat.toml`](../../railway.chat.toml) |

Commit `768c12d8e` added the dedicated entrypoint/service composition, production configuration
validation, chat-only health projection, capacity URL preference, package scripts, and focused
tests. Commit `49dcd5a2b` added only `railway.chat.toml` and was pushed to `origin/main`.

### Railway

| Item                         | Expected value                                          |
| ---------------------------- | ------------------------------------------------------- |
| Project                      | `queue-worker`                                          |
| Project ID                   | `22ef1ec4-fdb9-41b9-9fdc-c52237427115`                  |
| Environment                  | `production`                                            |
| Environment ID               | `a28f09cc-2133-4701-9232-2984106db6ac`                  |
| Dedicated service            | `agentic-chat-worker`                                   |
| Dedicated service ID         | `1e9aab7d-fa38-495a-8869-ac8bfa0c3e11`                  |
| Dedicated public URL         | `https://agentic-chat-worker-production.up.railway.app` |
| Current dedicated deployment | `4a98a334-5544-43fd-9afc-0f7d5203f522`                  |
| Dedicated config path        | `/railway.chat.toml`                                    |
| Dedicated start command      | `node apps/worker/dist/chat-worker.js`                  |
| Dedicated health path        | `/health`                                               |
| Legacy/general service       | `daily-brief-worker`                                    |
| Legacy/general service ID    | `2d57bef9-84ac-4874-947f-c603cfaecc62`                  |
| Current legacy deployment    | `75d1237c-ab21-4cd6-866d-b8b95d84f676`                  |
| Legacy config/start          | `/railway.toml` / `node apps/worker/dist/index.js`      |

At the final readback, both deployments were `SUCCESS`, both reported source commit `49dcd5a2b`,
and both were connected to `Wolverine971/buildos-platform`.

The dedicated deployment reported one replica, zero overlap seconds, 30 drain seconds, health
timeout 300 seconds, and `ON_FAILURE` with three retries. Verify those settings again in Railway.
Also verify that changes to `main` automatically deploy only when the file watch patterns in
`railway.chat.toml` match.

### Vercel

| Item                          | Expected value                                            |
| ----------------------------- | --------------------------------------------------------- |
| Project                       | `build-os`                                                |
| Project ID                    | `prj_9EqtA4G1qu0N2bey7Lq6EsIXaoMU`                        |
| Organization ID               | `team_u1B0wC8esmzKz74z2onl2AUk`                           |
| Root directory                | `apps/web`                                                |
| Current production deployment | `dpl_AgSAG1YLGHztwSyxgmADhBQ35ncb`                        |
| Deployment URL                | `build-r2rvmz5l0-djwayne35gmailcoms-projects.vercel.app`  |
| Production aliases            | `build-os.com`, `www.build-os.com`, `build-os.vercel.app` |

The final readback reported `READY` and source commit `49dcd5a` in the deployment build log.

## 5. What was built and changed

The Phase 6 implementation commit changed these core surfaces:

- `apps/worker/src/chat-worker.ts`: dedicated process entrypoint;
- `apps/worker/src/lib/chatWorkerService.ts`: minimal chat-only HTTP/lifecycle composition;
- `apps/worker/src/config/chatWorkerProfile.ts`: dedicated profile/release handling;
- `apps/worker/src/lib/workerOperationalHealth.ts`: chat-only operational health projection;
- `apps/worker/src/workers/agentic-chat/phase3Config.ts`: explicit production requirements;
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-capacity.server.ts`: prefer the dedicated
  server-only capacity URL while preserving the general-worker fallback;
- `apps/worker/tests/chatWorkerService.test.ts` and
  `apps/worker/tests/agenticChatConsumer.test.ts`: isolation/lifecycle guards;
- `railway.chat.toml`: dedicated build/watch/start/health/restart configuration.

The new entrypoint must not import the combined worker, scheduler, or unrelated processors. The
reviewer should verify both the import boundary and live startup logs.

## 6. Current environment-variable contract

### Dedicated Railway service

The following non-secret values were read back after deployment
`4a98a334-5544-43fd-9afc-0f7d5203f522`:

| Variable                                      | Expected value                                               |
| --------------------------------------------- | ------------------------------------------------------------ |
| `NODE_ENV`                                    | `production`                                                 |
| `AGENTIC_CHAT_WORKER_ENABLED`                 | `true`                                                       |
| `AGENTIC_CHAT_WORKER_PROFILE`                 | `production`                                                 |
| `AGENTIC_CHAT_INTERNAL_USER_IDS`              | exactly the canary user and the e2e harness account below (2026-08-22: two UUIDs) |
| `CHAT_CONCURRENCY`                            | `1`                                                          |
| `CHAT_POLL_INTERVAL_MS`                       | `1000`                                                       |
| `CHAT_WORKER_TIMEOUT_MS`                      | `360000`                                                     |
| `CHAT_PROVIDER_BUDGET_MS`                     | `300000`                                                     |
| `CHAT_STALLED_TIMEOUT_MS`                     | `420000`                                                     |
| `CHAT_DRAIN_TIMEOUT_MS`                       | `22000`                                                      |
| `CHAT_PUBLISHER_TURN_PENDING_SOFT_BYTES`      | `262144`                                                     |
| `CHAT_PUBLISHER_TURN_PENDING_HARD_BYTES`      | `1048576`                                                    |
| `CHAT_PUBLISHER_WORKER_PENDING_SOFT_BYTES`    | `2097152`                                                    |
| `CHAT_PUBLISHER_WORKER_PENDING_HARD_BYTES`    | `8388608`                                                    |
| `CHAT_PUBLISHER_TURN_PENDING_SOFT_EVENTS`     | `32`                                                         |
| `CHAT_PUBLISHER_TURN_PENDING_HARD_EVENTS`     | `128`                                                        |
| `CHAT_PUBLISHER_WORKER_PENDING_SOFT_EVENTS`   | `256`                                                        |
| `CHAT_PUBLISHER_WORKER_PENDING_HARD_EVENTS`   | `1024`                                                       |
| `AGENTIC_CHAT_OPENROUTER_MODEL`               | `deepseek/deepseek-v4-flash`                                 |
| `AGENTIC_CHAT_MUTATION_PROVIDER_CAPABILITIES` | exact empty string                                           |
| `AGENTIC_CHAT_MUTATION_ADAPTER_CAPABILITIES`  | exact empty string                                           |

Required credentials were present at the last check; values were not printed:

- `PUBLIC_SUPABASE_URL`;
- `PRIVATE_SUPABASE_SERVICE_KEY`;
- `PRIVATE_OPENROUTER_API_KEY`;
- `PRIVATE_RAILWAY_WORKER_TOKEN`.

The internal worker cohort must contain exactly (canary user, plus the e2e harness account `76c04859-837c-4d13-88ea-9a39ed15ed81` added 2026-08-21 for paid batteries):

`255735ad-a34b-4ca9-942c-397ed8cc1435`

The legacy `daily-brief-worker` health response must continue to report:

- `agenticChat.enabled = false`;
- `agenticChat.state = disabled`;
- `agenticChat.runtime = null`.

### Vercel production

| Variable                               | Expected state                                                     |
| -------------------------------------- | ------------------------------------------------------------------ |
| `AGENTIC_CHAT_WORKER_ROUTING_ENABLED`  | exact `true`                                                       |
| `AGENTIC_CHAT_WORKER_ROUTING_USER_IDS` | exactly the same one UUID as Railway                               |
| `PRIVATE_AGENTIC_CHAT_WORKER_URL`      | `https://agentic-chat-worker-production.up.railway.app`            |
| `PUBLIC_RAILWAY_WORKER_URL`            | `https://daily-brief-worker-production.up.railway.app`             |
| `PRIVATE_RAILWAY_WORKER_TOKEN`         | present; must authenticate against the dedicated capacity endpoint |
| `AGENTIC_CHAT_TRANSPORT_LEASE_SECRET`  | present in Production scope; never print it                        |
| `AGENTIC_CHAT_WORKER_KILL_EPOCH`       | `0` at the last readback                                           |

`vercel env ls production` showed `AGENTIC_CHAT_TRANSPORT_LEASE_SECRET` as an encrypted Production
variable. A `vercel env run` presence script did not surface its value, while the real worker canary
proved that a valid signed worker lease was issued and admitted. Treat the CLI discrepancy as a
review item: verify the variable name and Production scope in Vercel without exposing its value.

The Vercel routing cohort must contain exactly:

`255735ad-a34b-4ca9-942c-397ed8cc1435`

## 7. Deployment and cutover chronology

1. The Phase 6 source implementation was already on `main` at `768c12d8e`.
2. A new Railway service, `agentic-chat-worker`, was created in the existing `queue-worker`
   project rather than creating a second Railway project.
3. Connecting the repository initially exposed a critical behavior: root `railway.toml`
   overrode a dashboard-only start command and briefly started the general worker entrypoint on the
   new service. The deployment was stopped immediately. No chat ownership overlap was left running.
4. `railway.chat.toml` was added, committed as `49dcd5a2b`, pushed to `main`, and explicitly selected
   by the new service. This is why the config path is a required review gate.
5. The legacy service was redeployed with `AGENTIC_CHAT_WORKER_ENABLED=false`. Its general queue and
   API remained healthy.
6. The dedicated service was deployed from the same exact source revision, health/capacity tested,
   and restart tested. The earlier controlled restart emitted `SIGTERM received; draining dedicated
Agentic Chat worker...` before the replacement became healthy.
7. Vercel received `PRIVATE_AGENTIC_CHAT_WORKER_URL`; routing was then enabled for one user only.
8. The first real chat revealed that the Vercel cohort UUID did not match the signed-in DJ Wayne
   account. The turn stayed on `legacy_sse`.
9. Vercel's cohort was corrected and production deployment `dpl_AgSAG1YLGHztwSyxgmADhBQ35ncb`
   became `READY`.
10. A second real chat selected `worker_realtime`, passed both capacity checks, was admitted, and was
    claimed by the dedicated Railway service. It then failed closed because Railway's separate
    `AGENTIC_CHAT_INTERNAL_USER_IDS` still held the old UUID.
11. Railway's internal cohort was corrected to the same verified user UUID. Dedicated deployment
    `4a98a334-5544-43fd-9afc-0f7d5203f522` passed its health gate.
12. No third chat was sent after the final correction.

## 8. Canary evidence to retain

### Canary 1 — legacy fallback exposed the wrong Vercel cohort

| Field                        | Value                                                                    |
| ---------------------------- | ------------------------------------------------------------------------ |
| Session                      | `823660fb-2120-4dc6-a69b-5f74d7668e0d`                                   |
| Client turn                  | `bcd5439c-2da6-4c0b-bc96-e57700ee8267`                                   |
| Turn run                     | `d1acd45d-39dd-4159-8b92-6693646d07d9`                                   |
| Prompt                       | `Phase 6 deployment check: reply with a one-sentence confirmation only.` |
| Stored mode                  | `legacy_sse`                                                             |
| Stored contract/decision/job | all null                                                                 |
| Terminal state               | `completed`                                                              |
| Audit cost                   | `$0.0010`                                                                |

There was no dedicated capacity request for this turn. That absence led to the cohort comparison and
the Vercel UUID correction.

### Canary 2 — worker path proven, then internal cohort rejected

| Field                  | Value                                              |
| ---------------------- | -------------------------------------------------- |
| Session                | `7ac13236-a155-4473-95a8-f20fe1a8c0f2`             |
| Client turn            | `9624b4a9-8ad4-4b1b-8214-dbc31580593b`             |
| Turn run               | `157c9f19-0b3b-4825-9fe8-3fa3cfa8c794`             |
| Prompt                 | `Reply with exactly: canary complete.`             |
| Stored mode            | `worker_realtime`                                  |
| Stored contract        | `agentic_chat_worker_v1`                           |
| Transport decision     | `5d2c9bda-4132-4a40-9625-a0792352fd22`             |
| Queue job              | `a160a2cb-8441-4855-97f3-c4254468c98c`             |
| Correlation ID         | `52d33b3a-ba85-4b34-bbfa-14d73a6e6623`             |
| Terminal state         | `failed`                                           |
| Failure code           | `internal_cohort_rejected`                         |
| `execution_started_at` | null; rejection occurred before provider execution |

Railway HTTP logs recorded two authenticated `200` requests to `/agentic-chat/capacity`, followed by
a dedicated runtime log claiming and processing the corresponding `agentic_chat_turn` job. This
proves the Vercel transport negotiation, capacity connection, admission, durable queue, and dedicated
claim path. It does not prove a successful post-fix provider turn.

The failed row is expected audit evidence. It is terminal, not a stuck active turn.

## 9. Final health and capacity receipts

At the final health readback, the dedicated service reported:

- `status: healthy`;
- `service: agentic-chat-worker`;
- release `49dcd5a2b4574ac9efdb456b5c3734c9827e7035`;
- runtime state `running`;
- database connected with zero consecutive claim failures;
- Agentic Chat enabled, healthy, and running;
- queue healthy, polling, not processing, and not draining;
- Realtime healthy/idle with zero failures;
- recovery healthy with zero candidates and no error;
- zero active turns.

The legacy service simultaneously reported healthy general operation and Agentic Chat disabled.

Immediately after the final Railway deploy, one authenticated capacity request returned `503`
because exact evidence was unavailable inside the endpoint's 1.5-second deadline. Three bounded
follow-up requests returned `200` in 349 ms, 131 ms, and 109 ms with:

- queue age `0`;
- provider available `true`;
- publisher healthy `true`;
- pending bytes `0`.

This is consistent with the intentional fail-closed/retry design, but the reviewer should determine
whether `503` is rare/transient or persistent enough to cause unnecessary legacy fallbacks.

## 10. Independent review procedure

### A. Source and GitHub

1. Confirm local `main`, `origin/main`, and GitHub `main` resolve to `49dcd5a2b`.
2. Review commits `768c12d8e` and `49dcd5a2b` independently.
3. Confirm `49dcd5a2b` changes only `railway.chat.toml`.
4. Confirm the dedicated entrypoint cannot import/start `index.ts`, `worker.ts`, the scheduler, or
   unrelated processors.
5. Run the focused tests for `chatWorkerService`, the consumer isolation guard, production config,
   and web worker-capacity selection. Run worker/web typechecks in proportion to findings.

Useful read-only commands:

```bash
git status --short
git log -5 --oneline --decorate
git show --stat 768c12d8ec0e1e55990e60dc362a3cde0b90ac8b
git show --stat 49dcd5a2b4574ac9efdb456b5c3734c9827e7035
git show 49dcd5a2b4574ac9efdb456b5c3734c9827e7035 -- railway.chat.toml
```

### B. Railway source and service settings

Verify both services independently. For the dedicated service, require all of these:

- source repository `Wolverine971/buildos-platform`, branch `main`;
- config path `/railway.chat.toml`;
- start command `node apps/worker/dist/chat-worker.js`;
- health path `/health`, timeout 300;
- one replica;
- zero overlap seconds and 30 drain seconds;
- `ON_FAILURE`, three retries;
- current deployment `SUCCESS` and exact release `49dcd5a2b`;
- GitHub automatic deploy behavior plus the expected watch patterns;
- no scheduler/general-queue/general-processor startup lines.

For `daily-brief-worker`, require `/railway.toml`, `dist/index.js`, healthy general operation, and
Agentic Chat disabled.

The compact Railway status query used for this handoff was:

```bash
railway status --json | jq -c '
  .environments.edges[].node.serviceInstances.edges[].node |
  {serviceName, serviceId, source,
   latestDeployment: {
     id: .latestDeployment.id,
     status: .latestDeployment.status,
     commitHash: .latestDeployment.meta.commitHash,
     configFile: .latestDeployment.meta.configFile,
     startCommand: .latestDeployment.meta.serviceManifest.deploy.startCommand,
     healthcheckPath: .latestDeployment.meta.serviceManifest.deploy.healthcheckPath
   }}'
```

### C. Environment variables without secret disclosure

In Railway, compare the 14 production-required numeric variables against section 6, confirm the
worker is enabled in the production profile, confirm the internal cohort has count one and matches
the verified user, and check only boolean presence for credentials.

In Vercel, verify:

```bash
vercel env ls production | rg 'AGENTIC_CHAT|RAILWAY_WORKER|SUPABASE'
```

Then use a local presence/count script through `vercel env run -e production`; do not print secret
values. Confirm the dedicated and general URLs have not been swapped.

An authenticated `200` from the dedicated capacity endpoint is the best proof that the Railway and
Vercel bearer-token values match.

### D. Health, authentication, and capacity

```bash
curl -s https://agentic-chat-worker-production.up.railway.app/health | jq
curl -s https://daily-brief-worker-production.up.railway.app/health | jq
curl -i https://agentic-chat-worker-production.up.railway.app/agentic-chat/capacity
```

The unauthenticated capacity request must return `401`, not capacity evidence. Perform the
authenticated request through a secret-bearing environment such as `railway run`; print only the
status and parsed non-secret evidence fields.

Sample safe probe:

```bash
railway run --service agentic-chat-worker --environment production -- \
  node --input-type=module -e "
    const response = await fetch(
      'https://agentic-chat-worker-production.up.railway.app/agentic-chat/capacity',
      { headers: {
          Authorization: 'Bearer ' + process.env.PRIVATE_RAILWAY_WORKER_TOKEN,
          Accept: 'application/json'
      }}
    );
    const body = await response.json();
    console.log(JSON.stringify({
      status: response.status,
      queueAgeMs: body?.queue?.oldestReadyJobAgeMs ?? null,
      providerAvailable: body?.provider?.available ?? null,
      publisherHealthy: body?.publisher?.healthy ?? null,
      pendingBytes: body?.publisher?.pendingBytes ?? null
    }));
  "
```

### E. Read-only database checks

Use service-role credentials only through an existing secret-bearing environment. Do not print
request payloads, message content, tokens, or user profile data.

Verify:

- canary 1 is terminal `legacy_sse`;
- canary 2 is terminal `worker_realtime` with `internal_cohort_rejected`;
- no `worker_realtime` rows remain `queued` or `running` unexpectedly;
- no queue job is stuck in a claimable/processing state;
- no recovery candidate requires attention;
- no duplicate transport decision or active turn exists for either canary session.

### F. Final post-fix canary — explicit approval required

After all read-only gates pass, request approval for one fresh, text-only General Chat message from
the verified DJ Wayne account. Use a new chat/session and a minimal prompt that does not require the
legacy external-account tool surface.

The successful receipt must show all of the following:

1. `/api/agent/v2/transport` selects `worker_realtime` / `agentic_chat_worker_v1`.
2. Railway receives the capacity check(s) with `200`.
3. The durable turn stores the same worker mode, contract, and a non-null decision/job ID.
4. The dedicated service claims the job.
5. `worker_started_at`, `execution_started_at`, and terminal timestamps are populated.
6. The turn completes without `failure_code`.
7. The browser receives the durable assistant reply.
8. Health returns to zero active turns with a clean queue and no recovery candidate.
9. The legacy service remains chat-disabled throughout.

Do not widen the cohort based only on admission/claim success. Require the completed worker reply.

### G. Deployment and drain behavior

Previous deployment logs showed bounded SIGTERM drain, but an independent reviewer should inspect
the retained logs. Do not trigger another restart without approval. If a restart is authorized,
observe:

- old instance stops claiming before shutdown;
- health becomes non-ready while draining;
- active work reaches terminal truth or recoverable ownership;
- replacement reports the same source revision and dedicated entrypoint;
- no duplicate general-worker process appears.

## 11. Stop-the-line conditions

Do not approve the service or widen traffic if any of these are true:

- the dedicated config path is absent or points to `/railway.toml`;
- the dedicated start command is `dist/index.js` or imports the combined worker;
- both Railway services have Agentic Chat enabled;
- the Vercel and Railway one-user UUIDs differ;
- `PUBLIC_RAILWAY_WORKER_URL` points at the dedicated service;
- either mutation capability list is non-empty;
- authenticated capacity is persistently `503`, malformed, or stale;
- unauthenticated capacity returns evidence instead of `401`;
- a fresh worker turn fails, stalls, or remains active after the client terminates;
- Realtime/polling does not converge to the durable terminal row;
- release/source/config readbacks disagree;
- a deploy starts the scheduler or general processors on the dedicated service.

## 12. Rollback boundary

Ordinary rollback is web-first:

1. Set `AGENTIC_CHAT_WORKER_ROUTING_ENABLED=false` for Vercel Production.
2. Redeploy/read back production so new negotiations return to `legacy_sse`.
3. Leave admitted worker turns owned by `worker_realtime`; wait for terminal truth.
4. Keep the dedicated service running until active turns are zero and recovery is clear.
5. Keep the legacy Railway service's embedded chat runtime disabled; legacy SSE is the web path and
   does not require re-enabling duplicate queue ownership.

Emergency rollback may also increment `AGENTIC_CHAT_WORKER_KILL_EPOCH` so unused worker leases must
renegotiate. Do not rotate it casually and never decrement it.

## 13. Required reviewer deliverable

Return a short evidence-backed report with:

| Area                         | Result                   | Evidence                         |
| ---------------------------- | ------------------------ | -------------------------------- |
| GitHub source and config     | pass/fail                | commit and diff receipts         |
| Railway source/config path   | pass/fail                | service/deployment readback      |
| Dedicated process isolation  | pass/fail                | source guard and startup logs    |
| Legacy ownership disabled    | pass/fail                | health and environment readback  |
| Railway environment contract | pass/fail                | redacted comparison              |
| Vercel environment/routing   | pass/fail                | redacted comparison              |
| Authenticated capacity       | pass/fail                | status/evidence samples          |
| Health/recovery/drain        | pass/fail                | current health and retained logs |
| Database convergence         | pass/fail                | read-only terminal/active counts |
| Post-fix live worker turn    | pass/fail/not authorized | exact turn receipt               |
| Rollback readiness           | pass/fail                | flag/epoch/readback procedure    |

Separate confirmed defects from recommendations. Do not modify production simply to make the report
green; ask for authorization when a finding requires a state change.

## 14. Worktree note

The repository was already heavily dirty with unrelated modified and untracked documentation before
this handoff was created. This handoff is the only file intentionally added by this task. Preserve
all other work exactly as found.

## 15. Review outcome addendum (2026-08-20, independent review)

The independent review is recorded in
[`AGENTIC_CHAT_WORKER_PHASE_6_RAILWAY_SERVICE_REVIEW_REPORT_2026-08-20.md`](./AGENTIC_CHAT_WORKER_PHASE_6_RAILWAY_SERVICE_REVIEW_REPORT_2026-08-20.md).
Corrections to this handoff's record:

- Section 7/8 undercount: **two** worker turns failed `internal_cohort_rejected` before the Railway
  cohort fix (21:57:18Z `157c9f19` and 21:58:38Z `5ab68b82`), not one.
- Two chats were sent after the fix (22:06Z, 22:08Z) but were routed `legacy_sse` by the client
  before negotiation (prepared-prompt/stream-created-session precondition), so they were not
  worker evidence. Fixed in the web client the same day; see report §5.
- The post-fix worker canary **passed** at 22:44:52Z (turn `b560408a`, session `ad176fd4`), sent
  as the second message of a session. Receipt in report §5.
