<!-- docs/technical/implementation/BUILDOS_EXTERNAL_AGENT_AUTH_FLOW_SPEC.md -->

# BuildOS External Agent Auth Flow Spec

## Purpose

This document defines how external agents should authenticate to BuildOS.

It answers one product and architecture question:

How should agents like OpenClaw identify themselves when calling a user's BuildOS agent?

## Short Answer

The right v1 abstraction is:

- a user generates a BuildOS key for an external agent installation
- the external agent stores that key as a secret
- the external agent uses that key as bearer auth when calling BuildOS
- BuildOS maps that key to a specific caller identity and user BuildOS agent

That is the right abstraction for OpenClaw and also the right generic abstraction for other external agents.

## Core Decision

BuildOS should expose a user-generated `BuildOS agent key` as the user-facing concept.

Internally, that key maps to:

- one `external_agent_callers` row
- one `provider`
- one `caller_key`
- one hashed bearer token
- one user-scoped permission policy

So the public concept is:

- "Generate a BuildOS key for this agent"

But the internal model remains:

- `caller_key` = stable public caller identity
- `bearer token` = secret BuildOS key
- `token_hash` = stored secret material

## Why This Is The Right Abstraction

This keeps the trust boundary explicit:

- the human authorizes the connection in BuildOS
- the external agent proves who it is with a BuildOS-issued secret
- BuildOS decides what that caller can access

It also avoids a bad abstraction:

- OpenCLaw should not authenticate as "the user"
- OpenCLaw should authenticate as "a caller that this user registered"

That is cleaner for revocation, audit, scope restriction, and future multi-agent support.

## Generic Auth Model

### 1. Human Creates Caller Credentials In BuildOS

The user is authenticated in BuildOS and creates a caller registration.

The user chooses:

- provider, for example `openclaw`
- caller identity, for example `openclaw:workspace:abc123`
- optional project scope restrictions

BuildOS then:

- ensures the user's internal BuildOS agent exists
- creates or updates the caller registration
- mints a bearer token
- stores only `token_hash` and `token_prefix`
- returns the raw bearer token exactly once

This bearer token is the `BuildOS key`.

### 2. External Agent Stores The BuildOS Key

The user plugs that key into the external agent runtime.

The agent runtime should store it as a secret, not as normal prompt text.

### 3. External Agent Dials BuildOS

The agent sends:

- `Authorization: Bearer <buildos_key>`
- `POST /api/agent-call/buildos`
- method `call.dial`

The request also includes:

- `callee_handle`
- `client.provider`
- `client.caller_key`
- requested scope

BuildOS then:

- authenticates the bearer token
- resolves the caller row
- checks the client descriptor matches the authenticated caller
- resolves the user BuildOS agent being called
- accepts or rejects the call

### 4. External Agent Uses Accepted Tools

After acceptance, the external agent uses:

- `tools/list`
- `tools/call`
- `call.hangup`

The key remains the caller credential.

The call session remains the execution/session credential.

## Current BuildOS Mapping

This repo already has the core pieces for this model:

- `POST /api/agent-call/callers`
  creates or rotates a caller credential for the logged-in user
- `GET /api/agent-call/callers`
  lists existing caller registrations without returning raw secrets
- `POST /api/agent-call/buildos`
  handles `call.dial`, `tools/list`, `tools/call`, and `call.hangup`

Relevant BuildOS records:

- `user_buildos_agents`
- `external_agent_callers`
- `agent_call_sessions`

So the user-facing "generate a BuildOS key" flow is already aligned with the current implementation.

## OpenClaw Compatibility

## Research Conclusion

Yes, this model fits OpenClaw well.

The reason is that OpenClaw's current architecture is built around typed tools, plugins, config-managed credentials, and secret references.

Based on the OpenClaw docs:

- tools are typed functions the agent calls
- plugins can register agent tools
- plugins can carry plugin-scoped env vars
- plugin or config credentials can use SecretRefs
- gateway and other OpenClaw HTTP APIs also use bearer-token auth patterns

This means OpenClaw already has a natural place to hold a BuildOS-issued secret.

## Recommended OpenClaw Integration Shape

OpenClaw should connect to BuildOS through a dedicated BuildOS plugin tool, not by freeform prompting around shell commands.

The plugin should read:

- `BUILDOS_BASE_URL`
- `BUILDOS_AGENT_TOKEN`
- `BUILDOS_CALLEE_HANDLE`
- optionally `BUILDOS_CALLER_KEY`

The plugin tool should then call BuildOS directly over HTTPS with bearer auth.

That is a cleaner fit than:

- shelling out to `curl`
- asking the model to handcraft HTTP requests repeatedly
- treating BuildOS like a model provider

## Why A Plugin Tool Is Better For OpenClaw

OpenClaw's own docs emphasize:

- tools are typed functions
- plugins register additional tools
- tool allowlists/denylists are first-class policy

So the clean OpenClaw integration is:

- BuildOS plugin registers or proxies the direct tools returned by BuildOS
- those tools encapsulate the BuildOS call protocol
- the model only sees typed BuildOS actions

Examples:

- `list_onto_projects`
- `search_onto_projects`
- `get_onto_project_details`
- `list_onto_tasks`
- `create_onto_task`
- `update_onto_task`

OpenClaw may prefix those names locally if needed to avoid conflicts, but the BuildOS
`tools/call` request should use the BuildOS tool name returned by `tools/list`.

The plugin can hide `call.dial` and session reuse internally if desired.

## How The User Should Configure OpenClaw

The likely good user flow is:

1. User clicks "Generate BuildOS key" in BuildOS.
2. BuildOS returns:
    - a bearer token
    - the callee handle
    - caller metadata
3. User pastes that secret into OpenClaw plugin configuration.
4. OpenClaw stores it via:
    - env vars
    - plugin-scoped env
    - SecretRef-backed config
5. The OpenClaw plugin uses that secret for outbound BuildOS calls.

## OpenClaw Storage Fit

OpenClaw docs indicate several workable storage paths:

- env var substitution in config
- SecretRef objects using `env`, `file`, or `exec`
- plugin-scoped env vars
- plugin-level API key fields when supported by the plugin

So BuildOS does not need to invent a special OpenClaw-only auth mechanism.

It only needs to mint a normal bearer token that OpenClaw can store safely.

## What The BuildOS Key Should Mean

The BuildOS key should identify:

- the user who authorized the integration
- the external runtime/provider
- the specific agent installation or workspace

It should not identify:

- a whole OpenClaw deployment globally
- the human user session directly
- an anonymous external process

That means the stable identity should be:

- `provider = "openclaw"`
- `caller_key = "openclaw:workspace:<workspace-or-agent-id>"`

And the secret should be:

- one BuildOS bearer token tied to that caller row

## Recommended User-Facing Language

Use this language in the product:

- `BuildOS Agent Key`
- `Connect External Agent`
- `Caller Name` or `Agent Installation`
- `Allowed Projects`

Avoid exposing internal terms as the primary UI:

- `external_agent_callers`
- `caller_key`
- `token_hash`

Those are implementation details.

## Security Properties

This model gives us the right v1 properties:

- one key per external agent installation
- rotation without changing the caller identity
- revocation without touching the user account
- project scoping at issuance time
- auditability through call sessions
- no direct Supabase credentials to the external agent

## What Not To Do

Do not make OpenClaw authenticate with:

- the user's normal BuildOS session cookie
- raw Supabase keys
- a shared global BuildOS secret for all users
- an unscoped "OpenClaw master token"

Do not make the BuildOS key mean:

- "all OpenClaw installs for this user"

It should mean:

- "this specific registered caller for this user"

## V1 Recommendation

Ship this as the v1 auth model:

- user-generated BuildOS key
- one key per caller installation
- bearer token over HTTPS
- stored hashed in BuildOS
- stored as secret in OpenClaw
- optional project scope restriction at issuance time

This works for OpenClaw now and generalizes cleanly to other external agents later.

## Next Product Layer

The next product steps should be:

1. Add a BuildOS UI for generating, rotating, and revoking agent keys.
2. Show the exact OpenClaw configuration values to paste:
    - base URL
    - bearer token
    - callee handle
    - caller key
3. Build an OpenClaw plugin that wraps the BuildOS call protocol in typed tools.
4. Add revocation and token rotation UX in BuildOS.
5. Later, add approvals/challenge flows for higher-risk write actions.

## Source Notes

This recommendation is consistent with OpenClaw documentation showing:

- bearer-token auth for OpenClaw gateway HTTP APIs
- plugin-registered agent tools as the primary extension mechanism
- plugin-scoped env and SecretRef-backed config for credentials

Reference docs reviewed:

- `https://docs.openclaw.ai/gateway/tools-invoke-http-api`
- `https://docs.openclaw.ai/gateway/authentication`
- `https://docs.openclaw.ai/gateway/secrets`
- `https://docs.openclaw.ai/plugins/building-plugins`
- `https://docs.openclaw.ai/gateway/configuration-reference`
