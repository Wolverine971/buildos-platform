<!-- docs/marketing/social-media/buildos-agent-keys-twitter-posts.md -->

# BuildOS Agent Keys Twitter Posts

## Personal Account

I just got something working that feels important:

an external AI agent can now call into BuildOS, identify itself, and operate within a scoped permission boundary.

Not “AI talks to AI.”
More like:

- who is calling?
- which user’s BuildOS agent are they calling?
- what projects can they access?
- do they have read-only or read/write scope?

That means OpenClaw can connect to BuildOS, discover tools progressively, and work against real project state without getting the whole system dumped into context.

I think this is the right abstraction for agent infrastructure:
a secure call layer with scoped capabilities, not a loose chatbot bridge.

## BuildOS Account (Thread)

### Tweet 1

BuildOS now supports agent keys for external AI agents.

You can connect an agent like OpenClaw to your BuildOS workspace and control:

- which projects it can access
- whether it is read-only or read/write
- which BuildOS operations it is allowed to use

### Tweet 2

The model is simple:

an external agent “calls” your BuildOS agent
BuildOS checks who is calling
then accepts, rejects, or limits the session

From there, the agent can discover tools progressively and act within its granted scope.

### Tweet 3

This is the foundation for humans, BuildOS agents, and external agents working together on shared state — without giving away the whole system.

If you are building multi-agent workflows, this is where things start to get real.

---

# LinkedIn Posts

## Personal Account

I just got something working that feels important.

An external AI agent can now call into BuildOS, identify itself, and operate within a scoped permission boundary.

Not "AI talks to AI."
More like:

- Who is calling?
- Which user's BuildOS agent are they calling?
- What projects can they access?
- Do they have read-only or read/write scope?

That means an agent like OpenClaw can connect to BuildOS, discover tools progressively, and work against real project state — without getting the whole system dumped into context.

I think this is the right abstraction for agent infrastructure: a secure call layer with scoped capabilities, not a loose chatbot bridge.

The multi-agent future isn't agents talking freely to each other. It's agents authenticating, scoping, and collaborating within boundaries that humans set.

## BuildOS Account

BuildOS now supports agent keys — a secure way for external AI agents to connect to your workspace.

Here's how it works:

An external agent "calls" your BuildOS agent. BuildOS checks who is calling, then accepts, rejects, or limits the session.

From there, the agent can discover tools progressively and act within its granted scope. You control:

- Which projects it can access
- Whether it's read-only or read/write
- Which BuildOS operations it's allowed to use

This is the foundation for humans, BuildOS agents, and external agents working together on shared state — without giving away the whole system.

If you're building multi-agent workflows, this is where things start to get real.
