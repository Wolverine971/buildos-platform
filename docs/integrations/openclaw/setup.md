<!-- docs/integrations/openclaw/setup.md -->

# OpenClaw to BuildOS Setup Guide

This guide is written for non-technical users.

## The Short Version

To connect OpenClaw to BuildOS, you need three things:

1. A BuildOS key generated inside BuildOS
2. A place inside OpenClaw to store that key safely
3. A BuildOS connector tool inside OpenClaw that knows how to use the key

Right now:

- BuildOS can generate the key
- BuildOS can accept the connection
- OpenClaw still needs the BuildOS connector tool

So if you paste a token into normal OpenClaw chat, it will not work by itself.

## What The Different Values Mean

When BuildOS generates a key, it gives you values like these:

```env
BUILDOS_BASE_URL=https://build-os.com
BUILDOS_AGENT_TOKEN=boca_your_secret_here
BUILDOS_CALLEE_HANDLE=buildos:user:YOUR_USER_ID
BUILDOS_CALLER_KEY=openclaw:workspace:your-workspace
```

What they mean:

- `BUILDOS_BASE_URL`
    - where BuildOS lives
- `BUILDOS_AGENT_TOKEN`
    - the secret key
    - this is the password-like value
- `BUILDOS_CALLEE_HANDLE`
    - the BuildOS agent identity being called
    - think of this like the "phone number"
- `BUILDOS_CALLER_KEY`
    - the OpenClaw workspace identity
    - think of this like caller ID

## Important Rule

Do **not** paste `BUILDOS_AGENT_TOKEN` into normal Telegram or OpenClaw chat.

Why:

- chat is not the secure storage layer
- the model may not have a real BuildOS tool installed
- the token may end up exposed in logs or chat history

If you already pasted a real token into chat:

1. go to `/profile?tab=agent-keys`
2. find that caller
3. rotate the key or revoke it
4. use the new key instead

## What A User Should Do

### Step 1. Generate the BuildOS key

Inside BuildOS:

1. Open `Profile`
2. Open the `Agent Keys` tab
3. Choose `OpenClaw`
4. Give it an installation name
5. Optionally limit it to specific projects
6. Click `Generate BuildOS Key`

BuildOS will show:

- the one-time secret key
- the BuildOS callee handle
- the caller key
- an env snippet you can copy

Copy those values immediately.

### Step 2. Put those values into OpenClaw secrets or env

OpenClaw needs to store the values as secrets or environment variables.

Use:

- `BUILDOS_BASE_URL`
- `BUILDOS_AGENT_TOKEN`
- `BUILDOS_CALLEE_HANDLE`
- `BUILDOS_CALLER_KEY`

Do **not** store them by pasting them into ordinary conversation.

They need to live in:

- OpenClaw env configuration
- OpenClaw secret configuration
- or a BuildOS plugin config inside OpenClaw

### Step 3. Install or enable the BuildOS connector in OpenClaw

This is the missing step right now.

OpenClaw needs a BuildOS connector tool or plugin that:

1. reads the BuildOS env values
2. calls BuildOS over HTTPS
3. opens a BuildOS call session
4. lists scoped BuildOS tools
5. registers or proxies those typed tools for the model

Without that connector, OpenClaw only sees raw text and will say something like:

- "I do not have a direct tool to connect to BuildOS"

That is expected.

### Step 4. Ask OpenClaw to use the BuildOS tool

Once the BuildOS connector exists in OpenClaw, the user prompt should be simple:

> Connect to my BuildOS workspace and list my projects.

Or:

> Use BuildOS to get a snapshot of my marketing project.

At that point, the user should **not** need to paste tokens into chat anymore.

## What OpenClaw Needs To Do Internally

This is the simple version of what the connector must do:

1. Send a request to BuildOS with the BuildOS key
2. Ask to dial the user BuildOS agent
3. If BuildOS accepts the call, ask what tools are available
4. Use the direct tools returned by BuildOS
5. Hang up when finished

The BuildOS endpoint is:

```text
POST /api/agent-call/buildos
```

The request uses:

```text
Authorization: Bearer <BUILDOS_AGENT_TOKEN>
```

## The Best User Experience

The ideal user flow should be:

1. user clicks `Generate BuildOS Key`
2. BuildOS shows a copy block
3. user pastes the block into OpenClaw secret/config setup
4. user enables the BuildOS connector
5. user says:
    - "connect to BuildOS"
    - "show my projects"
    - "get my marketing project snapshot"

That is the seamless version.

## What To Paste Into OpenClaw Today

If you need a plain-English instruction block for OpenClaw setup, use this:

```text
BuildOS connection setup:

1. Do not store BuildOS credentials in normal chat memory.
2. Store these values as secrets or environment variables:
   - BUILDOS_BASE_URL
   - BUILDOS_AGENT_TOKEN
   - BUILDOS_CALLEE_HANDLE
   - BUILDOS_CALLER_KEY
3. Use the BuildOS connector or plugin to call:
   POST /api/agent-call/buildos
4. Authenticate with:
   Authorization: Bearer <BUILDOS_AGENT_TOKEN>
5. First call method:
   call.dial
6. After acceptance:
   - tools/list
   - tools/call with the direct tool name returned by tools/list
   - call.hangup
7. Never ask the user to paste the secret token into normal conversation after setup.
```

## What To Paste Into OpenClaw Chat After The Connector Exists

Use this user-friendly prompt:

```text
Use the BuildOS connector.

Connect to my BuildOS workspace using the configured BuildOS credentials.
If the call is accepted, list the available BuildOS tools and then use the direct project-list tool to list my visible projects.
Do not ask me to paste secrets into chat.
If BuildOS is not configured yet, tell me exactly which configuration value is missing.
```

## What To Tell Users Right Now

If a user asks why it did not work, the correct explanation is:

```text
BuildOS is ready, but OpenClaw still needs a BuildOS connector tool.
Your key should be stored in OpenClaw config or secrets, not pasted into chat.
Once the connector is installed, OpenClaw will be able to call BuildOS directly.
```
