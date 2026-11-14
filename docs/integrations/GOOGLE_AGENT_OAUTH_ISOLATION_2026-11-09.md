<!-- docs/integrations/GOOGLE_AGENT_OAUTH_ISOLATION_2026-11-09.md -->

# Separate Google clients for agents

Updated November 9, 2026. Code and a rehearsed migration are in this checkout. Both new Google
agent clients have been created with the user's approval. Existing human clients are unchanged.
The four new credential values are staged in the gitignored, owner-only
`.env.google-agents.local` file; downloaded credential JSON files are also owner-only.
The production migration, deployment environment changes, and application deployment have
**not** been applied by this change.

## Behavior

Existing Google sign-in, Gmail, Calendar connections, source IDs, calendar mappings, and human
refresh tokens remain intact. Human routes continue using their existing OAuth clients.

BuildOS agents use separately consented Gmail and Calendar clients. Profile → Email and
Profile → Calendar show an **Agent access** control for each connected account (including
legacy Calendar). Enabling it asks Google for an additional grant for the same Google identity.
There is no valid way to transfer an existing refresh token to a different OAuth client; users
must approve the new agent grant once. Until then agent reads/writes fail closed. Human reads,
edits and existing deterministic sync continue using their original connections.

Agentic Chat, Agent Run's supported legacy Calendar path, Calendar analysis, Gmail relevance,
and email project updates select agent authorization explicitly. Queued agent Calendar writes
carry `googleAgentAccess: true`, including restricted guest-task writes and cleanup. Human
jobs retain their existing behavior. Jobs queued by older releases have no purpose marker;
drain those jobs before cutting over, or inspect and requeue identified agent jobs with the
marker. Do not infer job purpose from free text or blanket-label human sync jobs as agents.

Agent grants and short-lived OAuth state live in server-only tables. Consent is bound to the
signed-in BuildOS user, original connection, exact Google subject, client, callback, nonce and
PKCE verifier. Tokens use AES-GCM with a separate namespace and identity-bound authenticated
data. Disabling agent access removes only companion grants and pending consent locally;
human tokens are never revoked or rewritten. Human disconnect/disable/identity replacement
also removes its companion grant. No Google revocation call is made for agent disable, because
revocation can affect other clients in the same Google project.

## Google Auth Platform setup

Created these two **Web application** clients in project **buildos-gmail-read** (`941207291119`):

| Client name                       | Classification | Server environment variables                                                             |
| --------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| BuildOS Gmail Agent Production    | AI agent       | `PRIVATE_GMAIL_AGENT_CLIENT_ID`, `PRIVATE_GMAIL_AGENT_CLIENT_SECRET`                     |
| BuildOS Calendar Agent Production | AI agent       | `PRIVATE_GOOGLE_CALENDAR_AGENT_CLIENT_ID`, `PRIVATE_GOOGLE_CALENDAR_AGENT_CLIENT_SECRET` |

Created client IDs:

- Gmail agent: `941207291119-r7saebh3ue85bm7ubbt311loqndijt61.apps.googleusercontent.com`
- Calendar agent: `941207291119-f5rb52ojv5k3nf636pfa9vagl7a8c0e5.apps.googleusercontent.com`

Both clients have these authorized redirect URIs:

```text
https://build-os.com/auth/google/agent/callback
https://www.build-os.com/auth/google/agent/callback
```

Register development callbacks on separate development clients, not the production clients.

Leave these existing clients and their settings unchanged:

- BuildOS Gmail Read Production: `941207291119-35qo94dl1icsk2mgcnnqcj7fdrhk12bs.apps.googleusercontent.com`
- BuildOS Calendar Production: `941207291119-4f644ih723toi36hg95075m54i6l8m29.apps.googleusercontent.com`
- Google sign-in client (separate project `924402611458`).

Gmail agent consent requests `openid`, `email`, and `gmail.readonly`. Calendar agent consent
requests `openid`, `email`, `calendar.events`, `calendar.events.freebusy`,
`calendar.calendarlist.readonly`, and `calendar.app.created` (each API scope uses the
`https://www.googleapis.com/auth/` prefix). Existing Google app publishing, test-user and
scope verification requirements still apply. No Google-hosted MCP endpoint is introduced.

[Google's classification guidance](https://support.google.com/cloud/answer/15549257?hl=en#agentic-client)
requires distinct clients for agent and human workflows. The notice names November 11 for
Google-hosted Workspace MCP enforcement and November 12 for classification becoming permanent.
The integration here uses REST; these dates do not establish a current BuildOS outage.

## Deployment order

1. Rehearse and apply only this additive migration, then record it. Do not replay other pending migrations.

    ```sh
    pnpm db:rehearse supabase/migrations/20261109180053_google_agent_oauth_isolation.sql --check supabase/tests/google_agent_oauth_isolation.check.sql --role-probe
    supabase db query --linked -f supabase/migrations/20261109180053_google_agent_oauth_isolation.sql
    supabase migration repair --status applied 20261109180053 --linked
    ```

2. Add the four new agent client variables to the web host and all workers that run these
   integrations. Use the same client per integration on web and worker. Preserve all existing
   human client IDs/secrets and encryption keys. `PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1` and
   `PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1` must match web and worker; legacy-account agent
   grants also use the Calendar **V1** key. Do not rotate keys during this rollout.
3. Deploy web and workers together after draining or identifying old agent sync jobs. This is
   an intentional authorization cutover: agents require the new consent immediately. Deploying
   without the new configuration leaves human flows working and agent access unavailable.
4. In Profile, enable Agent access once for each desired Gmail/Calendar account. Choose the
   same Google account as the displayed connection. Confirm ordinary human connection state,
   calendar selections and mappings remain unchanged.
5. Verify with ordinary, free integration reads using separately consented grants. Any live
   agent/model test still needs the repository's per-run cost approval. Check both web and
   worker paths before claiming live validation.

## Validation and recovery

The rehearsal includes actual SQL fixtures for all three connection kinds, owner/subject
isolation, one-time state claims, cancelled callbacks, human-token preservation, disconnect
cleanup and client-role permissions. Standing archive, project-lock, project-coverage and
account-deletion checks also run. The existing unrelated anonymous-role probe failure is
unchanged; authenticated-role probes pass.

Validation completed: shared package builds and declarations, worker typecheck, web
`svelte-check` (zero errors/warnings), focused free tests, and the fixture/role-probe migration
rehearsal all pass. No live OAuth exchange, production migration, or paid model test ran.

Free focused tests cover consent, refresh, wrong account/client/scopes, refresh races, gateway
isolation, Calendar tools, queued credential purpose, callback/session/origin checks and the
existing human OAuth services. No production client or token is used by these tests.

For a problematic agent grant, use its **Disable** control and approve again. Leave the human
connection intact. Do not change an agent client ID after grants exist: tokens are bound to
that ID and will require fresh agent consent. Rolling back the application code restores the
old mixed-client behavior, so it is not a compliant long-term recovery. Keep the additive
tables and human credentials in place; resolve agent configuration or consent instead.
