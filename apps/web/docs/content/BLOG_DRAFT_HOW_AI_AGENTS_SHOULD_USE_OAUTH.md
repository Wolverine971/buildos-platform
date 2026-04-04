<!-- apps/web/docs/content/BLOG_DRAFT_HOW_AI_AGENTS_SHOULD_USE_OAUTH.md -->

# BLOG DRAFT: How AI Agents Should Use OAuth

**Content Type:** Jab (Technical / Practical)
**Target Audience:** Builders, founders, operators, AI agent developers
**CTA:** Soft - Use BuildOS as the context layer for connected agent workflows
**Word Count Target:** 2,400-3,000 words

---

## Metadata

```yaml
title: 'How AI Agents Should Use OAuth'
slug: 'how-ai-agents-should-use-oauth'
description: 'OAuth is one of the most important protocols for AI agents because it is how they get permission to act inside real systems. Here is how it actually works, which flows matter, what to avoid, and how to use it safely.'
published: false
draft: true
category: 'agent-skills'
tags: ['oauth', 'agent-skills', 'auth', 'security', 'pkce', 'api-integration', 'buildos']
author: 'DJ Wayne'
date: '2026-04-01'
lastmod: '2026-04-03'
```

---

## HOOK

If you want an AI agent to do real work in software, sooner or later it has to get permission.

Not fake permission.
Not "I pasted my password into a prompt" permission.

Real permission.

That usually means OAuth.

OAuth is one of the most important protocols for agents because it is how an agent gets authorized to work inside systems like:

- Google Calendar
- Gmail
- Google Drive
- Slack
- HubSpot
- GitHub

And a lot of teams still handle it badly.

They confuse authentication with authorization.
They use the wrong flow.
They leak tokens.
They ask for too much scope.
They treat refresh tokens like harmless strings.

So if you want an agent to plug into real software safely, you need to understand how OAuth actually works.

---

## THE BIG IDEA

OAuth is not "how to log in."

OAuth is how a client gets limited permission to access a resource on behalf of a user or on its own behalf.

That distinction matters.

For AI agents, OAuth is not just a technical detail. It defines:

- what the agent can access
- who it is acting for
- how long access lasts
- which actions are allowed
- how dangerous a compromise would be

So an agent that does not understand OAuth will usually be too weak, too broad, or too risky.

---

## WHAT OAUTH IS UNDER THE HOOD

At a high level, there are four main parties:

- the **resource owner**
  Usually the user
- the **client**
  The app or agent-enabled system requesting access
- the **authorization server**
  The system that authenticates the user and issues tokens
- the **resource server**
  The API or service the token will be used against

That is the core structure described in the OAuth 2.0 framework.

For an AI agent, the mental model should be:

- the user owns the authority
- the agent does not get to invent authority
- the authorization server issues scoped permission
- the resource server enforces that permission

This is a permission protocol, not a magic trust protocol.

---

## WHAT USUALLY HAPPENS IN PRACTICE

When an AI agent uses OAuth, the common happy path looks like this:

1. the agent or app requests access to a service
2. the user is sent to the authorization server
3. the user signs in and consents
4. the authorization server returns an authorization code
5. the client exchanges that code for tokens
6. the client uses the access token to call the API
7. the client refreshes access when needed

That clean summary hides a lot of detail.

The important detail is this:

the agent should almost never be trusted with raw user credentials.

That is exactly what OAuth is designed to avoid.

---

## THE MOST IMPORTANT QUESTION: WHO IS THE AGENT ACTING FOR

Before choosing a flow, the agent or system has to answer one question:

**Is this agent acting on behalf of a user, or as the application itself?**

That decision changes everything.

### Acting on behalf of a user

Examples:

- create a Google Calendar event for a specific person
- read that person's Gmail
- send a Slack message as part of their workspace activity

This usually means:

- user consent
- delegated authorization
- scoped access tied to that user

### Acting as the application itself

Examples:

- call a backend service owned by the same system
- access app-owned resources
- run server-to-server operations where no user is directly involved

This usually means:

- client credentials
- app-level permissions
- no user consent screen in the moment

If you get this wrong, the whole design gets confused.

---

## WHICH FLOWS MATTER MOST FOR AGENTS

AI agents do not need every OAuth flow equally.

These are the ones that matter most.

### 1. Authorization Code Grant with PKCE

This is the most important user-delegated flow for modern agents.

Use it when:

- the agent needs access to user-owned resources
- the client is public or cannot safely keep a secret
- a browser-based user consent step is acceptable

Why it matters:

- the authorization code flow is the modern default for delegated access
- PKCE protects the authorization code from interception

For agents, this is often the right answer when integrating with user services.

### 2. Client Credentials Grant

Use it when:

- the system is acting as itself
- no end user is granting access in the moment
- the resources are app-owned or server-owned

This is useful for:

- internal system integrations
- backend-to-backend communication
- service-owned operations

But it is easy to misuse.

Do not confuse "my app has a token" with "my app is allowed to act like the user."

Those are different things.

### 3. Device Authorization Grant

This is useful when:

- the acting client has limited input
- there is no proper browser on the device or runtime
- the user needs to authorize on another screen

This can be relevant in some agent scenarios where the runtime cannot directly complete a browser flow cleanly.

### 4. Token Exchange

This is a more advanced pattern.

Use it when:

- one service or component needs to exchange a token for another, narrower token
- delegation chains matter
- a backend needs a token suitable for a downstream service

This is not the first thing most people should implement, but it becomes relevant for more advanced agent architectures.

---

## WHAT AGENTS SHOULD AVOID

There are a few recurring bad ideas.

### Do not ask users for passwords directly

This is one of the biggest conceptual failures.

OAuth exists in part so clients do **not** need to collect the user's credentials directly.

The OAuth Security BCP says the resource owner password credentials grant must not be used.

That matters even more for agents because:

- it increases the attack surface
- it trains users to hand credentials to the wrong layer
- it breaks modern auth expectations like MFA and multi-step flows

### Avoid the implicit flow

The modern best practice is to avoid implicit-style access token issuance in the authorization response unless you have very strong compensating controls.

For most agent builders, the practical rule is simple:

- prefer authorization code
- use PKCE
- do not reach for implicit out of habit

### Do not treat public clients like they can safely hold secrets

If the client is user-distributed, browser-based, or otherwise public, it should not be treated as if a client secret will stay secret.

This is one of the core reasons PKCE matters so much.

---

## WHY PKCE MATTERS SO MUCH

PKCE exists because authorization codes can be intercepted, especially in public-client contexts.

The short version:

1. the client generates a high-entropy `code_verifier`
2. it derives a `code_challenge`
3. it sends the challenge in the authorization request
4. later it proves possession of the original verifier during token exchange

That means stealing the code alone is not enough.

For modern agent integrations that use delegated access, PKCE should be part of your default mental model.

Not a nice-to-have.

Part of the default.

---

## HOW AGENTS SHOULD THINK ABOUT BROWSER HANDOFF

Many agent builders want the whole OAuth flow to be invisible.

That instinct is understandable.
It is also where people start doing dumb things.

For user-delegated OAuth, a browser handoff is usually the right pattern.

The browser is where:

- the user authenticates
- consent happens
- the authorization server can show trustworthy UI

For native and public clients, the best current practice is to use an external browser or equivalent secure browser surface, not an embedded browser that the app fully controls.

For AI agents, that means:

- let the user complete consent in a trusted surface
- capture the result safely
- return the agent to its workflow after authorization finishes

The agent should not try to fake trust where trust needs to be explicit.

---

## WHAT CURRENT PROVIDER GUIDANCE SAYS

As of April 1, 2026, I have not found a broad Google-style document that says, "here is how AI agents should use OAuth."

That is true across most major providers.

Most providers still document OAuth primarily in terms of app types, trust boundaries, and product-specific integration models, not "AI agents."

So in most ecosystems, the best guidance for agents is still:

- follow the provider's current OAuth best practices for your client type
- then adapt that pattern to agent workflows

That said, there are a few provider-specific points worth calling out because they are either highly relevant to agent systems or directly moving toward agent-aware auth.

### Google

Google does not appear to have a dedicated "OAuth for AI agents" guide yet.

What Google does have is strong OAuth guidance by platform and risk model, and it lines up closely with the safest patterns for agents:

- store client credentials and tokens securely
- use incremental authorization where supported
- request the smallest scopes possible
- prompt for scopes in context, not all up front
- use secure, full-featured browsers instead of embedded webviews

Google also has some very practical implementation notes that matter:

- PKCE is strongly recommended for installed app flows
- the `redirect_uri` must exactly match an authorized redirect URI
- custom URI schemes are no longer supported on Android and Chrome apps because of app impersonation risk
- loopback redirects are deprecated on some mobile client types
- manual copy/paste and old out-of-band redirect patterns are no longer supported

For limited-input devices, Google supports the device flow, but notes that it supports only a limited set of scopes and that incremental authorization is not supported for installed apps or devices.

That is a useful reminder for agents: the safest or most convenient runtime pattern may also narrow which scopes and consent patterns are available.

Google also adds an important operational constraint that agent builders should know about:

- if your app requests sensitive or restricted scopes, you should expect OAuth verification requirements
- restricted scopes can require a security assessment
- unverified apps can hit new-user caps and warning screens

That matters for agent products because broad Gmail, Drive, or other high-sensitivity integrations are not just a coding problem. They are also a review, compliance, and rollout problem.

### Slack

Slack's OAuth guidance is increasingly opinionated in a way that is good for agents:

- use the v2 OAuth flow
- prefer granular permissions
- avoid excessive permissions that make installs harder
- verify `state` on the callback
- use token rotation for granular-permission apps

Slack's token rotation guidance is especially relevant. With rotation enabled, access tokens expire every 12 hours and are refreshed through refresh tokens. That is exactly the kind of lifecycle an agent system should already be prepared to handle.

Slack also recently added optional scopes, which is a good fit for agent products that have a core capability set plus extra features that should not block install.

And Slack now has one especially relevant note for agent builders:

- `oauth.v2.user.access` is positioned as working out of the box with MCP authorization flows

Slack specifically calls this out for MCP integrations with desktop IDE clients like Cursor or Claude Code. That is one of the clearest signs that some providers are starting to adapt OAuth docs to agent-shaped tool usage, even if they are not framing the whole thing as "AI agent OAuth" yet.

### GitHub

GitHub's docs are unusually direct here:

- in general, GitHub Apps are preferred over OAuth apps

Why:

- fine-grained permissions
- more control over which repositories the app can access
- short-lived tokens
- ability to act on behalf of a user or as the app itself

For agent builders, that is a very important product-design lesson. Sometimes the right advice is not "use OAuth more carefully." Sometimes the right advice is "use the provider's newer app model instead of a legacy OAuth app."

GitHub also explicitly supports device flow for headless apps, which maps cleanly to CLI-like or headless agent scenarios.

And GitHub is clear that scopes do not grant more permission than the user already has. That is a useful thing to repeat in the blog because people often overestimate what an OAuth scope actually does.

### Microsoft

Microsoft is the clearest exception here because it now has explicit agent-oriented OAuth documentation in Entra Agent ID.

That guidance is useful because it formalizes patterns many agent builders are already moving toward:

- agent auth can involve delegated and autonomous modes
- agent-specific token exchanges can be multi-stage
- some agent entities are treated as confidential clients
- interactive and non-interactive cases should be separated cleanly
- On-Behalf-Of flows matter for downstream API access

Microsoft also recommends using its approved SDKs instead of trying to hand-roll complex agent token flows manually.

It is also worth noting that this guidance is still tied to Microsoft Entra Agent ID, which is currently in preview. So it is a real signal about where the ecosystem is going, but not yet a universal cross-provider standard.

That is worth mentioning because it generalizes beyond Microsoft:

- if the provider gives you hardened auth libraries, use them
- manual token plumbing is where a lot of security mistakes happen

### The practical takeaway

There does not seem to be a broad industry standard yet for "OAuth guidance specifically for AI agents" across major providers.

What does exist is:

- strong provider guidance for app types and trust boundaries
- a few ecosystems that are moving toward more agent-aware identity models
- a few provider docs that are already adapting OAuth to MCP and agent-like clients
- a clear trend toward narrower permissions, shorter token lifetimes, and more explicit consent boundaries

That is exactly the direction agent builders should already be moving.

---

## THREE CONCRETE OAUTH EXAMPLES

This is where the abstract rules become easier to use.

### Example 1: Connect an agent to a user's Google Calendar

The user wants:

- the agent to read their availability
- create events on their behalf
- update their calendar safely

The right shape is:

- authorization code grant
- PKCE
- browser handoff to Google
- delegated scopes
- token storage on the app side, not in the model context

The wrong shape is:

- ask the user for their Google password
- use client credentials and pretend that means user consent happened

This is the classic delegated-user case.

The important lesson is:

- the agent is acting for the user
- the permission should be tied to that user
- the user should see and approve the consent screen

### Example 2: Let the system call its own backend services

Suppose the agent needs to:

- call an internal scheduling service
- read app-owned metadata
- orchestrate backend systems that belong to the same platform

This is usually not a user-delegated OAuth problem.

This is usually:

- client credentials
- app identity
- server-to-server access

The important lesson is:

- do not drag the user through a consent flow for app-owned operations
- do not pretend app-level access is user-level permission

This is one of the cleanest places where teams get confused.

They have a token, so they assume the token means "the agent can do the user thing."

It does not.

It means the app can do the app thing.

### Example 3: Authorize a headless or constrained client

Suppose the agent runtime is:

- a CLI
- a device with limited input
- an agent shell that cannot complete a normal browser redirect cleanly

Now device flow may be the better answer.

The right shape is:

- the runtime gets a device/user code
- the user authorizes in a browser on another device or tab
- the runtime polls until authorization completes

The lesson here is:

- some runtimes are real OAuth clients even when they do not look like web apps
- you should choose the flow that matches the trust boundary and UX constraints, not the one you are most familiar with

### The pattern across all three

The real decision is not:

- "Which OAuth flow do I remember?"

It is:

- who is the actor?
- who owns the authority?
- where does trust actually live?
- what client constraints exist?

If you answer those correctly, the right flow usually becomes much clearer.

---

## THE PRACTICAL CHECKLIST

If you are teaching an agent system how to use OAuth, teach it this checklist.

### 1. Identify the acting model

- acting for a user?
- acting for the application?
- acting through a delegated backend chain?

### 2. Choose the correct flow

- authorization code + PKCE for user-delegated access
- client credentials for app-owned access
- device flow when browser/input constraints exist
- token exchange only when the architecture truly calls for it

### 3. Request the narrowest scope you can

Do not ask for broad access by default.

Ask only for what the workflow actually needs.

### 4. Use exact redirect handling

Modern best practice emphasizes strict redirect URI validation.

Loose redirect handling is how codes and tokens get sent to the wrong place.

### 5. Store tokens like they matter

Because they do.

- encrypt at rest
- never log them
- keep them out of prompt context
- restrict access by role and environment

### 6. Distinguish access tokens from refresh tokens

Access tokens are for calling APIs now.
Refresh tokens are for obtaining new access later.

Refresh tokens deserve more care, not less.

### 7. Plan for re-consent and failure

Tokens expire.
Scopes change.
Users revoke access.
Admin policy changes.

The integration should recover gracefully.

### 8. Keep user identity and client identity clear

One of the easiest mistakes is blending:

- the app identity
- the user identity
- the agent identity

Do not let them collapse into one vague concept.

---

## WHAT AGENTS SHOULD DO WHEN THE FLOW GETS WEIRD

OAuth integrations break in predictable ways.

### Consent was never completed

The agent should know:

- the connection is incomplete
- it should not keep retrying blind API calls
- it should ask for a clean re-auth path

### Token expired

The agent should know:

- try refresh if valid
- if refresh fails, escalate to re-auth

### Scope mismatch

The agent should know:

- the API may be reachable
- but the requested action is not allowed

That is not the same as total connection failure.

### Wrong acting model

This is more architectural.

If you are trying to use a client-credentials model for a user-delegated workflow, you may technically have a token and still be conceptually wrong.

That mistake causes a lot of downstream confusion.

---

## SERVICE ACCOUNTS, DELEGATED ACCESS, AND OTHER REAL-WORLD MESSINESS

In practice, teams often run into provider-specific patterns that sit adjacent to OAuth:

- service accounts
- admin-granted delegation
- workspace-level installs
- app installations with org-level approval

These are important, but they are not all the same thing.

So the right approach is:

- understand the standard OAuth model first
- then understand the provider-specific extension or admin model you are actually using

Do not skip straight to provider quirks without understanding the base model.

---

## WHAT BUILDOS ADDS

The raw OAuth connection is not the whole story.

After the agent is authorized, you still need:

- organized context
- operational memory
- clear ownership
- workflow continuity

That is where BuildOS becomes useful.

BuildOS can hold:

- which systems are connected
- what access was granted
- which projects or workflows depend on those connections
- what tasks or actions came from those tools

So OAuth becomes more than "a token exists somewhere."

It becomes part of a durable operating system for agent work.

---

## THE BIG IDEA

If an AI agent is going to work inside real software, it needs permission to act.

OAuth is the protocol that usually gives it that permission.

So the right way to teach an agent OAuth is:

- understand who it is acting for
- choose the right flow
- prefer authorization code with PKCE for delegated access
- use client credentials only when the app is acting as itself
- avoid dangerous legacy shortcuts
- treat scopes, redirects, and token handling as security decisions

That is how you make the integration useful without making it reckless.

Because the goal is not just to connect the agent.

The goal is to connect it **correctly**.

---

## Research Notes / Official References

- RFC 6749: OAuth 2.0 Authorization Framework
- RFC 7636: PKCE
- RFC 8252: OAuth 2.0 for Native Apps
- RFC 8628: OAuth 2.0 Device Authorization Grant
- RFC 8693: OAuth 2.0 Token Exchange
- RFC 9700: OAuth 2.0 Security Best Current Practice
- Google OAuth best practices: <https://developers.google.com/identity/protocols/oauth2/resources/best-practices>
- Google OAuth overview: <https://developers.google.com/identity/protocols/oauth2>
- Google web server flow redirect validation rules: <https://developers.google.com/identity/protocols/oauth2/web-server>
- Google loopback migration: <https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration>
- Google unverified apps and user caps: <https://support.google.com/cloud/answer/7454865?hl=en>
- Google OAuth app verification help center: <https://support.google.com/cloud/answer/13463073?hl=en>
- Google limited-input device flow: <https://developers.google.com/identity/protocols/oauth2/limited-input-device>
- Slack Installing with OAuth: <https://docs.slack.dev/authentication/installing-with-oauth/>
- Slack token rotation: <https://docs.slack.dev/authentication/using-token-rotation/>
- Slack optional scopes: <https://docs.slack.dev/changelog/2026/03/16/optional-scopes/>
- GitHub differences between GitHub Apps and OAuth apps: <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps>
- GitHub authorizing OAuth apps: <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps>
- GitHub OAuth scopes: <https://docs.github.com/en/developers/apps/scopes-for-oauth-apps>
- Microsoft Entra Agent ID overview: <https://learn.microsoft.com/en-us/entra/agent-id/identity-professional/what-is-microsoft-entra-agent-id>
- Microsoft interactive agent delegated auth: <https://learn.microsoft.com/en-us/entra/agent-id/identity-platform/interactive-agent-request-user-authorization>
- Microsoft interactive agent admin consent: <https://learn.microsoft.com/en-us/entra/agent-id/identity-platform/interactive-agent-request-admin-authorization>
- Microsoft autonomous app OAuth flow: <https://learn.microsoft.com/en-us/entra/agent-id/identity-platform/agent-autonomous-app-oauth-flow>
- Microsoft agent OAuth protocols: <https://learn.microsoft.com/en-us/entra/agent-id/identity-platform/agent-oauth-protocols>
- Microsoft agent On-Behalf-Of flow: <https://learn.microsoft.com/en-us/entra/agent-id/identity-platform/agent-on-behalf-of-oauth-flow>
