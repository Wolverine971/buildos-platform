<!-- docs/plans/NODE_BROTLI_SECURITY_TASKER_2026-10-22.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-10-22; describes the audited state at that moment. Verify current code and deployment evidence before acting.

# BuildOS — Node Brotli security tasker

- **Status:** Open; handoff only, remediation not executed.
- **Priority:** P1 — confirmed affected production image; patch planning first
- **Canonical repository:** `/Users/djwayne/buildos-platform`
- **Target:** Node 22.23.4+ within 22.x for existing Node 22 targets; any retained Node 24 build must be 24.22.1+
- **Deployment scope:** Vercel web and all three Railway worker services

## Assignment and boundaries

DJ requested this Markdown handoff on 2026-10-22 to give to the project agent. Document creation authorizes **docs only**. Once DJ assigns remediation, prepare scoped repository changes and free local validation within that assignment. This file does not itself authorize installation, commits, pushes, deployment, hosted settings changes, service restarts, database writes, messages, paid calls, credential rotation, SSH-key registration or new access. Those actions remain pending explicit owner authorization where required by the assignment.

Read current repository instructions first, record `git status`, and preserve staged, unstaged and untracked user work. Use the canonical checkout; do not duplicate this task in worktrees or sibling repositories. Do not print/read credential contents or environment secret values. Existing authenticated read-only tooling is appropriate; stop at sign-in, new permissions or access setup.

## Security basis

- **CVE-2026-111497:** Node.js Brotli decoder out-of-bounds write with potential remote code execution, rated high by Node.js.
- Fixed releases announced October 21: **22.23.4, 24.22.1, 26.12.1**. Use these or a later verified patched release in the chosen supported line. EOL lines such as 18/20/23/25 are not safe exemptions merely because omitted from the supported-release advisory.
- [Official Node advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
- Native fetch/Undici can transparently decode `Content-Encoding: br` through `node:zlib.createBrotliDecompress`; Axios and node-fetch can also do so. [Official Undici implementation](https://raw.githubusercontent.com/nodejs/undici/v7.30.1/lib/web/fetch/index.js).
- A clean `npm audit`, refreshed lockfile, absence of direct Brotli imports, `process.versions.brotli = "1.2.0"`, or a major-only Node setting does **not** prove this fix. The Node security fix was backported without requiring a Brotli version-string change. Verify exact Node patch/vendor evidence.

## Shared Mac prerequisite — coordinate once

The audit executed `/opt/homebrew/bin/node` (resolved to `/opt/homebrew/Cellar/node@24/24.18.0/bin/node`) and found **24.18.0**; `/opt/homebrew/Cellar/node/26.5.0/bin/node` reported **26.5.0**. Both reported Brotli **1.2.0** and were below the fixed releases. These are shared installations, not per-repository dependencies.

Have DJ/the designated machine-runtime owner coordinate a single update to Node 24.22.1+ and, if retained, 26.12.1+. **Do not race other project agents to install/update shared Node or restart processes.** If no patched approved executable is available, prepare/review the project patch and mark runtime validation blocked. Recheck the actual selected executable; a `.nvmrc` edit does not update a binary or running process.

## Audited project evidence

All paths below are relative to this repository root. Findings are a 2026-10-22 snapshot, not a guarantee about future deployments.

- Root `.nvmrc` selects floating `22`; `apps/web/.nvmrc` pins EOL `20.19.0`. Root/web engines permit `>=20.19.0`; worker engines permit `>=20.9.0`. These admit versions below the security floor.
- Root CI and dependency-audit workflows read `.nvmrc`; nested web docs workflow selects Node 20. Verify whether the nested workflow is actually run; GitHub only auto-discovers root workflows.
- Vercel web adapter explicitly selects `nodejs22.x`. Production deployment `dpl_Gu9wDJBUnbRrV1KGGFaJ2nDHG5z5` used build family `24.x` and function family `nodejs22.x`; current project setting was `22.x`. Exact Vercel patch levels were not exposed.
- Railway production project `queue-worker` (`22ef1ec4-fdb9-41b9-9fdc-c52237427115`) has three services. Chat uses `railway.chat.toml`/Railpack; daily brief uses `railway.toml`/Nixpacks; Libri uses Railpack with a service-level start command. Do not assume one repo config controls all three.
- **Confirmed affected build:** `agentic-chat-worker` deployment `d3a2bd56-74cc-44aa-954e-725c2287a28b`, created 2026-10-21 02:08 UTC, requested and resolved Node **22.23.3** in Railpack metadata and build logs. Four instances reported running; this is build/image evidence, not a live `process.version` measurement in each replica.
- `daily-brief-worker` deployment `f87519f5-88f6-45d0-8bf4-e9441d2c7062` and `libri-worker` deployment `84997d2d-9904-4ae9-beb3-f81754ca0cd8` have **unknown exact Node patches**. All three referenced commit `661d1b7073e8dc21bedf8e399eedcbd19e0c003f` at audit time.
- Live Railway version query was **not executed**: CLI returned “No registered SSH keys found.” Do not add/import a key under this tasker's read-only verification scope. Filtered logs did not establish the other versions; an expanded Libri query timed out.
- Shared `safe-fetch.ts` defaults to global `fetch` and is used by worker `webResearchPort.ts` for public web research. Installed Undici 6.28.0, Axios 1.18.0 and node-fetch 2.7.0 contain native Brotli decoder calls. SSRF guards and post-decompression body limits do not remove decoder exposure.
- Express/body-parser 1.20.6 handles gzip/deflate/identity and rejects other request encodings; inbound Brotli inflation was not established. Outbound fetch is sufficient to require the runtime patch.
- **Separate incident:** OpenRouter's BuildOS key was disabled; credential rotation/recovery was unverified and deployment availability partial. Do not conflate that incident with Brotli, claim recovery from instance status, or inspect/change credentials.

Inspect these files during implementation:

- `AGENTS.md`
- `apps/web/AGENTS.md`
- `package.json`
- `.nvmrc`
- `apps/web/.nvmrc`
- `apps/web/package.json`
- `apps/worker/package.json`
- `apps/web/svelte.config.js`
- `pnpm-lock.yaml`
- `railway.chat.toml`
- `railway.toml`
- `nixpacks.toml`
- `apps/worker/nixpacks.toml`
- `apps/worker/railway.toml`
- `.github/workflows/ci.yml`
- `.github/workflows/dependency-audit.yml`
- `apps/web/.github/workflows/docs.yml`
- `packages/shared-agent-ops/src/web/safe-fetch.ts`
- `packages/shared-agent-ops/src/web/safe-fetch.test.ts`
- `apps/worker/src/workers/agent-run/webResearchPort.ts`

## Hosted runtime verification

For a confirmed Vercel target, keep supported major selectors such as `nodejs22.x` / `nodejs24.x` and `engines.node: "22.x"` / `"24.x"`. **Do not replace them with arbitrary patch runtime strings.** Vercel manages patch rollouts. Confirm rollout/vendor evidence and obtain exact `process.version` from an existing safe diagnostic or an approved implementation that logs only version metadata. Build `node -v` proves the build runtime, not necessarily the server runtime. [Vercel's official version guidance](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Do not label deployment metadata containing only `22.x` or `24.x` as fixed. If the provider has not supplied verifiable evidence, leave production status unknown and report the next required owner action. Static assets/browser JavaScript are separate from build tools and Node server functions; serving precompressed assets is not itself Brotli decoding.

Railway build selection references: [Railpack Node selection/precedence](https://railpack.com/languages/node/) and [Nixpacks Node provider](https://nixpacks.com/docs/providers/node). Railpack can select a patched exact version; Nixpacks documents major-only selectors and requires verification of the package source/resolved executable. A container restart without a patched image does not repair its bundled Node.

## Work order after assignment

1. Read `AGENTS.md`, `apps/web/AGENTS.md`, and deployment topology. Reconfirm the deployed revisions and service-specific effective build settings without fetching secret values.
2. Prepare same-major Node **22.23.4 or later patched 22.x** selection for chat and Libri. Check the effective Railpack override source: `RAILPACK_NODE_VERSION` precedes package engines and version files. An existing exact 22.23.3 override must not silently win over a repo edit.
3. Treat daily brief separately: `nixPkgs = ["nodejs_22"]` does not prove its patch. Nixpacks supports a major selector, not an arbitrary exact patch selector. Verify the actual Nix package source/resolved executable is at least 22.23.4; if it cannot supply that, propose an explicitly patched build/image path for review. Do not blindly set `NIXPACKS_NODE_VERSION=22.23.4`.
4. Align root and web `.nvmrc`, root/web/worker engine policy, and active CI around the selected supported branch/security floor. Remove the web's obsolete 20.19.0 pin and review Node 20 auxiliary workflows. Preserve pnpm 11.7.0 and existing dependency patches unless a demonstrated compatibility issue requires a separate change.
5. Verify Vercel's Node 22 security rollout and its separate build runtime. Keep valid major selectors and add/reuse non-secret exact-version evidence when implementation is assigned.
6. Present the prepared patch, test results, per-service build/runtime versions, rollback plan, and unresolved incident dependencies to DJ. Rebuild/redeploy and any service restart require later owner authorization. Do not run the credential recovery workstream as part of this task.

## Validation and later rollout

- After authorized local changes, run focused free checks: `pnpm --filter @buildos/worker typecheck` and, when web config changes, `pnpm --filter @buildos/web check`. Use the existing `packages/shared-agent-ops/src/web/safe-fetch.test.ts` with the package's focused Vitest command if fetch behavior is changed.
- Build only affected packages through the repository's test gate; inspect generated worker and Vercel runtime metadata. Existing web build scripts generate content/sitemap files: preserve unrelated work and inspect generated diffs.
- Follow `AGENTS.md` worker caps and test-gate rules. Do not run root `pnpm test:run`, `pnpm verify`, or `pnpm pre-push` from a subagent. No paid tests, live model calls or `pnpm agentic:prod-battery` without separate approval for that run.
- After each separately authorized rollout, capture exact Node from chat, daily-brief and Libri processes plus every active replica/image; confirm health/queue processing using non-mutating checks. Verify Vercel web runtime independently. A new deployment ID or healthy status alone is not patch proof.

For local version evidence, this read-only command reports no environment values:

```sh
node -p 'JSON.stringify({node:process.version,brotli:process.versions.brotli,undici:process.versions.undici,execPath:process.execPath})'
```

Use equivalent non-secret version evidence for the **actual** deployed process only through existing authorized access, or after an explicitly authorized deployment of diagnostics. Do not register access, start a shell that exposes environment variables, or run exploit payloads. Record UTC time, command/evidence source, deployment ID, commit, runtime family, exact Node version, and any replicas/route overrides not covered. A successful benign decompression test is a compatibility check, not proof the CVE is fixed.

## Acceptance and handoff

- [ ] Current code/deployment snapshot and pre-existing dirty work are recorded; project paths and package manager are verified.
- [ ] Selected local/build/server Nodes meet the applicable fixed version, with exact executable/vendor evidence rather than a major-only claim.
- [ ] Scope is limited to runtime/config/verification changes required by the assigned remediation; dependency/lockfile churn is justified or absent.
- [ ] Appropriate checks/builds pass on patched Node; pre-existing failures and blocked checks are identified explicitly.
- [ ] Static output, development/build tooling and server functions/processes are classified separately.
- [ ] Proposed production action and rollback plan are concrete; **owner authorization for deployment/settings/restarts/credentials remains pending until explicitly given**.
- [ ] After any later authorized rollout, actual production runtime coverage is verified; unverified hosts, functions, replicas, previews and rollback deployments remain listed as unknown.
- [ ] Chat, daily brief, Libri and Vercel web each have exact-version evidence; SSH/access gaps remain explicitly open until resolved by the owner.
- [ ] The unrelated credential incident is separately reported, not marked resolved by this security patch.

Return the scoped diff, validation results, exact-version evidence table, proposed/authorized rollout status and unresolved blockers to DJ. For a blocker, name the exact action/target, reason, completed coverage, and whether it was denied, pending or had an uncertain outcome. Do not claim patch completion from this tasker's creation or from a successful build alone.

## Remediation prepared — 2026-10-22 (Claude Code)

**Status:** repository patch prepared and locally validated; **not committed, pushed or deployed**. No hosted settings, variables, restarts, installs or credentials were touched. Snapshot: HEAD `a94035939`, 123 pre-existing dirty paths preserved (only overlap considered: `docs/DEPLOYMENT_TOPOLOGY.md` and `docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md`, both left untouched because they carry another session's unstaged edits).

### Corrections to the audit above

- **Libri builds with Nixpacks, not Railpack.** Its service setting says Railpack, but it has no config file, and its build log (deployment `84997d2d`) shows `using build driver nixpacks-v1.41.0` with `setup │ nodejs_22` from the root `nixpacks.toml`.
- **Daily brief and Libri are confirmed affected, not unknown.** Nixpacks v1.41.0 pins nixpkgs `23f9169c4ccce521379e602cc82ed873a1f1b52b` (2025-10-10), whose `pkgs/development/web/nodejs/v22.nix` is **22.19.0**.
- **Chat's 22.23.3 almost certainly comes from a service variable.** Railpack (v0.43.0 source) ranks `RAILPACK_NODE_VERSION` above root `engines.node`. Root engines was `>=20.19.0`, which Railpack would request verbatim, yet all 40 listed chat builds since 2026-10-07 requested exactly `22.23.3`. Variable values were not read, so this is an inference.
- **Root engines `>=20.19.0` meant Node 20 under Railpack.** Railpack keeps only the major of the first `>=` bound, then installs that line's latest release, so without the override chat would have built on 20.20.2 (end of life). `^22.23.4 || …` would have jumped to Node 26. The new range's first bound is the one that matters.
- **The Vercel build ran on 24.x because `apps/web/package.json` engines (`>=20.19.0`) overrides the project's 22.x setting.** Functions run `nodejs22.x` from the adapter.
- Nixpacks also wrote secret-bearing `ARG`/`ENV` lines into its generated Dockerfile (Libri build log warns about `PRIVATE_LIBRI_ASSET_BROKER_TOKEN` by name). Moving to Railpack removes that.

### Exact-version evidence (2026-10-22 ~16:30 UTC)

| Target                                  | Deployment / source                         | Runtime family  | Exact Node                           | Evidence                                                               | Status                                         |
| --------------------------------------- | ------------------------------------------- | --------------- | ------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------- |
| agentic-chat-worker (4 replicas)        | `d3a2bd56`, commit `661d1b707`              | Railpack 0.43.0 | 22.23.3                              | `railpackInfo.resolvedPackages.node` + build log `mise ✓ node@22.23.3` | **Affected** (image; live replicas unmeasured) |
| daily-brief-worker                      | `f87519f5`, `661d1b707`                     | Nixpacks 1.41.0 | 22.19.0                              | build log + nixpkgs `v22.nix` at pinned commit                         | **Affected** (image)                           |
| libri-worker                            | `84997d2d`, `661d1b707`                     | Nixpacks 1.41.0 | 22.19.0                              | same                                                                   | **Affected** (image)                           |
| Vercel web functions                    | `dpl_Gu9wDJBUnbRrV1KGGFaJ2nDHG5z5`          | `nodejs22.x`    | unknown                              | no exact source; no public Vercel rollout note found                   | Unknown                                        |
| Vercel web build                        | same                                        | 24.x            | unknown                              | engines override                                                       | Unknown (build tooling only)                   |
| Local Mac `/opt/homebrew/bin/node`      | Homebrew (upgraded by the thecadre session) | 24.x            | 24.22.1, Brotli 1.2.1 (shared dylib) | `process.versions` + `otool -L`                                        | Patched                                        |
| Local BuildOS MCP servers (5 processes) | started before the upgrade                  | 24.x            | 24.18.0 + Brotli 1.2.0 dylib         | `lsof` mapped binaries                                                 | **Affected until restarted**                   |
| CI                                      | `.nvmrc` `22` (floating)                    | 22.x            | runner-dependent                     | setup-node can use a cached older 22                                   | Fixed by patch                                 |

Upstream: `nodejs.org/dist/index.json` lists v22.23.4 (2026-10-20, security) as the newest 22.x and v24.22.1 as the newest 24.x.

### Prepared patch

- Root and worker `engines.node` → `>=22.23.4 <23 || >=24.22.1 <25 || >=26.12.1` (Railpack builds latest 22.x; pnpm warns on unpatched local Nodes).
- `apps/web/package.json` engines → `22.x` (Vercel major selector; build now matches the 22.x functions and CI).
- `.nvmrc` → `22.23.4` (CI deterministic); deleted EOL `apps/web/.nvmrc` (root file applies).
- `railway.toml` (daily brief) → `builder = "RAILPACK"`, dropped the `nixpacks.toml` watch.
- New `railway.libri.toml` (Railpack; mirrors Libri's live start command, healthcheck 300 s, drain 30 s).
- Root `nixpacks.toml` kept, with a header explaining it only feeds Libri until Libri selects its own file.
- Deleted unused `apps/worker/railway.toml` / `apps/worker/nixpacks.toml` (every service uses root `/`).
- Startup `[runtime]` log line (Node, Brotli, Undici, OpenSSL, Railway replica ID) in all three worker entry points, plus one per server instance in web `hooks.server.ts`. These give exact per-replica evidence after deploy.
- Contract test: all three Railway configs use Railpack; root engines starts at `>=22.23.4`; `.nvmrc` is `22.23.4`.
- Dead nested `apps/web/.github/workflows/docs.yml` (GitHub never runs it) bumped from Node 20 to 22.23.4; docs updated (`RAILWAY_DEPLOYMENT.md`, READMEs, `CLAUDE.md`).
- `safe-fetch.ts` unchanged: a malicious server can send `Content-Encoding: br` regardless of `Accept-Encoding`, and Undici decodes it as data arrives, so only the runtime patch closes the hole.

### Validation (free, local)

- Patched local runtime: Node 24.22.1, Brotli 1.2.1 (Homebrew shared dylib), Undici 7.30.1, OpenSSL 4.0.3.
- `pnpm install --frozen-lockfile --lockfile-only`: passes, `pnpm-lock.yaml` byte-identical. Expected warning: `apps/web` wants `22.x` while local is 24.22.1.
- Line-for-line JS port of Railpack's `resolveToFuzzyVersion`: old `>=20.19.0` → node@20; new range → node@22; `22.23.3` → exact 22.23.3.
- Plain-Node sanity script (no vitest): new runtime formatters plus every new contract-test assertion pass.
- Prettier: all touched files clean.
- **Pending (not run):** worker Vitest (`runtimeVersions`, `queueContracts`, `libriWorkerService`, `chatWorkerService`, `generalWorkerRuntimeLifecycle`), `pnpm --filter @buildos/worker typecheck`, `pnpm --filter @buildos/web check`, and the web Vitest file. `test-gate` refused twice (2/2 machine-wide slots held by the thecadre and 9takes sessions, swap nearly full). Per AGENTS.md the agent waited, retried once, then stopped. Run them when the machine is free. No build was run.

### Rollout plan (each step needs DJ's explicit authorization)

1. **Chat variable:** in Railway → `agentic-chat-worker` → Variables, delete `RAILPACK_NODE_VERSION` if present (the repo range then builds latest 22.x), or set it to `22.23.4`. Also check `daily-brief-worker` and `libri-worker` for `RAILPACK_NODE_VERSION`/`NIXPACKS_NODE_VERSION`. Without this step, chat stays on 22.23.3 whatever the repo says.
2. **Libri config path:** `libri-worker` → Settings → Config-as-code file → `/railway.libri.toml`.
3. **Commit with pathspec and push.** All three Railway services and Vercel rebuild (their watch patterns include root `package.json`).
4. **Verify each service:** `railway deployment list --service <svc> --json` shows `railpackInfo.resolvedPackages.node.resolvedVersion` ≥ 22.23.4, and its requested version should be the engines range, not an exact pin. Then `railway logs --deployment --service <svc> --lines 1000 <id> | grep '\[runtime\]'` gives one line per replica (chat should show 4). `/health` stays green and queue processing continues. For Vercel, run `vercel logs <deployment-url>` after a request and read `[runtime] web node=v22.…`. If Vercel still reports < 22.23.4, the gap is Vercel's rollout; record it as open.
5. **Follow-up:** once Libri builds from `/railway.libri.toml`, delete root `nixpacks.toml` and its mention in the Railway doc.
6. **Local:** restart the Claude/Codex sessions that own the 5 BuildOS MCP server processes so they load Node 24.22.1 (DJ's call; nothing was restarted).

**Rollback:** in Railway, redeploy the previous deployment (`d3a2bd56` / `f87519f5` / `84997d2d`), which restores the vulnerable images. If only the daily-brief Railpack build fails, revert `railway.toml` to `builder = "NIXPACKS"` (still vulnerable, so it's a stopgap only). Vercel: promote the previous production deployment. None of the changes touch data or migrations.

### Open items

- `RAILPACK_NODE_VERSION` on chat is inferred, not read; values were deliberately not fetched.
- Vercel's exact function and build patch stays unknown until the `[runtime]` line appears after deploy.
- Live per-replica versions are unmeasured (no SSH key; none registered). The startup log line closes this after deploy.
- `docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md:842` and `docs/DEPLOYMENT_TOPOLOGY.md` still describe Nixpacks/Node 22 generically; both carry another session's uncommitted edits and were left alone.
- The OpenRouter key incident is separate and untouched; this patch does not resolve it.
