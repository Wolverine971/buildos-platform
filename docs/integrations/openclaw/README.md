<!-- docs/integrations/openclaw/README.md -->

# OpenClaw Integration

Documentation for connecting OpenClaw to BuildOS through the BuildOS agent call gateway.

## Quick Links

- [Non-Technical Setup Guide](./setup.md)

## Current Status

The BuildOS side of the OpenClaw integration is live.

Users can:

- generate a `BuildOS Agent Key`
- revoke or rotate that key
- scope access to specific projects
- expose a read-only BuildOS tool surface to OpenClaw

The missing piece is the OpenClaw-side connector/plugin that uses those credentials automatically.

That means:

- BuildOS is ready
- key generation is ready
- the public `/integrations` page is updated
- OpenClaw still needs a BuildOS plugin or wrapper tool before a user can simply say "connect to BuildOS"

## Important Safety Rule

Do **not** paste a live `BUILDOS_AGENT_TOKEN` into normal agent chat.

Treat it like a password.

If a token was pasted into Telegram, chat, or logs, rotate it immediately from:

- `/profile?tab=agent-keys`

## Scope

Use these docs when:

- onboarding a user to the OpenClaw integration
- explaining why pasting keys into chat does not work yet
- preparing the OpenClaw-side connector
- documenting the user setup flow
