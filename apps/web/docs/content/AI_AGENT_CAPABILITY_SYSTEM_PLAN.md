<!-- apps/web/docs/content/AI_AGENT_CAPABILITY_SYSTEM_PLAN.md -->

# BuildOS AI Agent Capability System Plan

## Purpose

Move from a simple "skills library" concept to a scalable capability system that can grow across:

- skills
- tools
- plugins
- stacks
- BuildOS-native operating workflows

The important shift is this:

- a **skill** teaches judgment and workflow
- a **tool** gives an agent an executable capability surface
- a **plugin** packages access to a system or ecosystem
- a **stack** combines multiple skills, tools, and plugins into an end-to-end workflow

If these layers are kept distinct, the system scales cleanly. If they are blurred together, the library turns into a messy pile of docs.

---

## Core Model

### 1. Skills

Skills answer:

- what this is for
- when to use it
- how to think about it
- how to do it well
- what to recommend
- what can go wrong

Skills are mostly instructional and strategic.

Examples:

- OAuth 2.0 for agents
- research workflows
- Google Calendar for agents
- marketing strategy for agents
- Gmail thread handling
- human approval loops

### 2. Tools

Tools answer:

- what an agent can actually call
- what inputs it accepts
- what outputs it returns
- what permissions it needs
- what safety constraints apply

Tools are the typed capability surface.

Examples:

- `calendar.list_events`
- `calendar.create_event`
- `gmail.create_draft`
- `drive.search_files`
- `hubspot.upsert_contact`

### 3. Plugins

Plugins answer:

- how a toolset gets packaged for an ecosystem
- how auth is configured
- how capabilities are exposed
- how installation and distribution work

Plugins are the bridge between an agent platform and an external system.

Examples:

- Google Workspace plugin
- Slack plugin
- Stripe plugin
- HubSpot plugin

### 4. Stacks

Stacks answer:

- how multiple skills, tools, and plugins work together in a real workflow
- what order they run in
- where BuildOS adds structure, memory, and context

Examples:

- Founder assistant stack
- Sales follow-up stack
- Product delivery stack
- Support triage stack

### 5. BuildOS Layer

BuildOS should be framed as the operating layer that:

- stores durable context
- coordinates cross-tool workflows
- turns raw actions into ongoing project state
- makes the stack coherent over time

That is the differentiation.

---

## Public Positioning

The public system should be explained like this:

- skills teach agents how to work
- tools let agents do the work
- plugins connect those tools to outside systems
- stacks combine them into practical operating workflows
- BuildOS is where the work compounds into durable context

This lets you help people whether they use BuildOS or not, while still making BuildOS the strongest reference implementation.

---

## Recommended Taxonomy

Every published item should have a clear type.

### Content Types

- `skill`
- `tool`
- `plugin`
- `stack`
- `foundation`

### Recommended Meaning

- `foundation`: reusable concepts that support many systems
- `skill`: high-level or implementation guidance for a domain
- `tool`: executable capability reference
- `plugin`: packaging and integration guide
- `stack`: multi-system recipe

### Example

For Google Calendar, the capability tree might look like:

- Foundation: OAuth 2.0 for agents
- Skill: Google Calendar for agents
- Tool: `calendar.list_events`, `calendar.create_event`, `calendar.update_event`
- Plugin: Google Workspace plugin
- Stack: Gmail + Calendar + BuildOS founder assistant stack

---

## Relationship Model

This is the cleanest way to think about composition:

```text
Foundation concepts
  -> Skills
      -> Tools
          -> Plugins
              -> Stacks
                  -> BuildOS operating workflows
```

And from an agent point of view:

```text
Skill = "How should I approach this?"
Tool = "What can I call?"
Plugin = "How do I get access to this ecosystem?"
Stack = "How do these capabilities combine?"
BuildOS = "Where does this become ongoing context and execution?"
```

---

## Capability Surface

Use the internal phrase **capability surface** consistently.

That term is useful because it separates:

- knowledge and judgment
- executable calls
- access boundaries

The public-facing translation can be:

- skills teach the agent
- tools expose a capability surface
- plugins package and authorize that capability surface

This lines up well with the repo's internal thinking around typed capability manifests and narrow, safe tool exposure.

---

## Scaling Rule

Do not publish future content as a flat stream of unrelated articles.

Instead, every major ecosystem should become a capability cluster.

Each cluster should eventually support:

1. one or more foundation pages
2. one flagship skill page
3. one tool reference page or tool family page
4. one plugin/integration page
5. one or more stack recipes

This rule should apply both to:

- provider-bound clusters like Google Workspace or Slack
- softer strategic clusters like research or marketing

### Example Cluster: Google Workspace

1. OAuth 2.0 for agents
2. Google Calendar for agents
3. Google Calendar tool reference
4. Google Workspace plugin setup
5. Founder assistant stack with Gmail + Calendar + BuildOS

### Example Cluster: Research

1. Research-first heuristics for agents
2. Tavily vs Perplexity vs Brave comparison
3. Search tool reference or capability map
4. Browser automation guide with Puppeteer
5. Research stack with BuildOS as evidence and context layer

### Example Cluster: Marketing

1. Brand foundation for AI agents
2. Brand strategy and prioritization skill
3. Promotion workflow tool pages
4. Distribution/plugin guides where relevant
5. Marketing operating stack with BuildOS

This gives you a repeatable publishing machine instead of random topic selection.

---

## Recommended Site Structure

### Near-Term

Keep using the blog system, but introduce a richer internal content model.

Use one category first:

- `agent-skills`

Then differentiate items by frontmatter such as:

- `contentType`
- `capabilityFamily`
- `providers`
- `toolNames`
- `pluginNames`
- `stackWith`

### Mid-Term

Create dedicated hubs:

- `/skills`
- `/tools`
- `/plugins`
- `/stacks`

These should not be four disconnected products. They should be four filtered views on one capability system.

---

## Recommended Metadata Model

For scale, each published item should eventually carry:

- `contentType`
- `capabilityFamily`
- `skillType`
- `providers`
- `toolNames`
- `pluginNames`
- `stackWith`
- `prerequisites`
- `permissions`
- `reviewCadenceDays`
- `staleAfterDays`
- `testedAgainst`
- `lastValidatedAt`

### Why This Matters

Without consistent metadata, you cannot later build:

- capability indexes
- related-content linking
- plugin landing pages
- tool references grouped by provider
- stale-content warnings
- stack maps

---

## Authoring Contract By Layer

Each layer should have a distinct authoring pattern.

### Skill Pages

Focus on:

- judgment
- implementation guidance
- recommendations
- edge cases
- BuildOS integration

### Tool Pages

Focus on:

- method or capability name
- inputs and outputs
- auth and permission requirements
- idempotency and retries
- example calls
- failure modes

### Plugin Pages

Focus on:

- setup and installation
- auth configuration
- capability groups exposed
- safety model
- versioning and ecosystem notes

### Stack Pages

Focus on:

- sequence of actions
- how multiple systems work together
- what state lives where
- why BuildOS is useful as the coordination layer

---

## Plugin Strategy

Plugins should not be described as just another article topic.

They are a packaging concept and a platform concept.

Your public content should explain plugins at three levels:

### 1. Concept Level

What a plugin is:

- a packaged connector to an ecosystem
- a place to declare auth, capabilities, and boundaries

### 2. Implementation Level

How a plugin works:

- install path
- auth flow
- capability manifest
- safety and permission boundaries

### 3. Workflow Level

Why a plugin matters:

- it turns isolated API calls into reusable agent infrastructure

This matters because many readers will understand APIs but not yet understand how to package those APIs cleanly for agents.

---

## Tool Strategy

Tools should be treated as durable contracts, not loose examples.

That means tool content should emphasize:

- typed inputs
- typed outputs
- narrow scope
- clear safety constraints
- explicit read/write boundaries

This is where you can borrow from your own internal tool definitions and capability-surface thinking.

A strong public tool page should make it obvious:

- what the tool does
- what it does not do
- when it is safe to call
- when human approval is required

---

## BuildOS Differentiation

BuildOS should not be positioned as "another plugin."

BuildOS is the orchestration and context layer that sits above the plugin and tool layer.

The narrative should be:

- plugins connect external systems
- tools expose actions
- skills teach usage
- BuildOS turns those actions into ongoing operational memory

This applies beyond hard integrations.

For research:

- BuildOS can hold source notes, decisions, and synthesis over time

For marketing:

- BuildOS can hold brand strategy, priorities, experiments, and learnings over time

That is a much stronger framing than "BuildOS also has integrations."

---

## Reference Systems

Two useful external reference points for public positioning are:

- `gstack` for stackable skill systems and workflow composition
- `OpenClaw` for external-agent discovery, typed capability surfaces, and progressive tool access

They should be used as thinking tools and comparison anchors, not as the center of the BuildOS story.

---

## Publishing Sequence

### Phase 1

Establish the conceptual model publicly:

- what skills are
- what tools are
- what plugins are
- how they work together

### Phase 2

Publish the first capability cluster:

- OAuth 2.0 for agents
- Google Calendar skill
- Google Calendar tool reference
- Google Workspace plugin guide
- Google Workspace + BuildOS stack recipe

### Phase 3

Repeat the cluster model for:

- Gmail
- Drive and Docs
- Slack
- Linear
- Stripe
- HubSpot

---

## Recommendation

The scalable system is not "more skill articles."

It is:

- a capability taxonomy
- a repeatable content cluster model
- a typed tool mindset
- a plugin packaging layer
- a clear BuildOS orchestration story

That gives you a system that can grow without losing coherence.
