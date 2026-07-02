---
date: 2026-05-21
title: Project Forking — Lightweight Spec
status: draft / side-task
parent_strategy: docs/brainstorms/2026-05-21-buildos-canvas-strategy-and-phased-plan.md
target_phase: Phase C (4-12 weeks)
path: docs/brainstorms/2026-05-21-project-forking-spec.md
---

# Project Forking — Lightweight Spec

## The idea in one paragraph

A BuildOS project should be **forkable, like a GitHub repository**. A user can publish their project as a public template-project. Other users can fork it into their own workspace, getting a deep copy of the project structure, documents, tasks, and metadata — but as their own independent project they can modify freely. This is the _marketplace_ half of the template story (alongside BuildOS-authored _scaffold_ templates) and the mechanism by which cultural transmission happens between BuildOS users.

## Why this matters

Cultural transmission in maturing categories happens through templates, not documentation (LoL pro players publishing builds, chess opening repertoires, photography presets). BuildOS's marketplace layer requires a forking mechanic. Without it, even if Tim Ferriss publishes his BuildOS book workflow, there's no way for fans to _adopt_ it as their own.

Forking is also architecturally elegant, but **not** because it is literally the same database/RPC path as human project invites. The shared part should be the user-facing intake surface: "accept this project into my workspace." The backend operation is different.

## Architectural insight

Repo audit correction: the existing `accept_project_invite` system is token-based and actor-aware, but its current job is membership. It accepts an invite and inserts/restores `onto_project_members` for an existing project. It does **not** deep-copy a project graph.

So the architecture is:

- Shared **project intake UX**
- Shared actor attribution / authorization concepts
- Separate backend operations for membership, scaffold instantiation, agent-spawned projects, and public-project forks

The unification:

- **Peer invite:** Alice invites Bob to her project. Backend: existing invite acceptance grants membership on one project.
- **Template start:** BuildOS offers a scaffold to a new user. Backend: instantiate a new project from a canonical scaffold project/spec.
- **Agent-spawned project:** an agent proposes/spawns a project for the user. Backend: instantiate a new project attributed to the agent actor and accepted by the user.
- **Fork:** a user forks a public project. Backend: clone a public project snapshot into the user's workspace.

One UI surface, four delivery modes, multiple backend operations.

## Core requirements

### What gets forked (deep copy)

- Project metadata (name, description, type_key, facets, public display metadata)
- Goals and plans
- All documents in the project
- All tasks (with structure, but reset state — see below)
- Edges/relationships between forked entities
- Public-safe project-level context (anything that defines "how this project works")
- Attribution: `forked_from` reference to source project + author

V1 should be explicit about the supported entity set. Recommended v1: project, goals, plans, documents, tasks, and edges among those copied entities. Milestones, risks, assets, events, comments, and briefs can either be excluded or added deliberately after privacy/cost review.

### What does NOT get forked

- Actor associations (the original collaborators don't come with the fork)
- Real-time state (active sessions, presence, in-flight changes)
- Sensitive data (anything marked private at the document or block level)
- Task completion state (forked tasks start as not-yet-done)
- AI conversation history (the new owner starts their own conversations)
- Time-stamped events (calendar entries, briefs from prior dates)
- Project members, comments, notifications, activity logs, and external-agent call history
- Non-public assets or source snapshots unless explicitly approved for publication

### Publishing flow (origin side)

1. Project owner clicks "Publish project" or "Make project forkable"
2. System creates a reviewable public snapshot, not a live pointer to the working project
3. System surfaces a privacy/safety review: which documents, blocks, assets, source metadata, and task details contain private data, secrets, unsafe content, or prompt-injection risks?
4. Owner sets:
    - Public title and description (can differ from private project name)
    - Attribution preferences (display name, link to creator profile)
    - Fork permissions (open to all, link-only, requires sign-in, etc.)
5. System generates a public project URL + canonical source version
6. Project appears in BuildOS's discovery surface (when ready)

### Forking flow (consumer side)

1. User lands on a public project page (via link or discovery)
2. User clicks "Fork to my workspace"
3. System creates a deep copy with `forked_from` reference
4. New project lands in user's workspace, owned by user
5. AI can immediately assist with "you've forked [project] — what part of this would you like to customize for your situation?"
6. Forked project is fully editable; changes don't affect the origin

### Required backend model

Do not overload `onto_project_invites` for this.

V1 needs an explicit fork/source model, either as dedicated tables or fields:

- Public project source/snapshot id
- Source project id
- Source version number or immutable snapshot timestamp
- Source author actor id / display attribution
- Forked project id
- Forking actor id
- Forked at timestamp
- Copy job status and error payload
- Entity id map from source ids to fork ids for debugging and provenance

The clone operation should be idempotent per request id so a retry does not create duplicate forked projects.

### Attribution and provenance

- Every forked project displays `Forked from [Original by Author]` on the project page
- A small attribution badge persists even after extensive customization
- Origin author can see fork count (vanity metric) but not who forked or what they did with it
- If origin author wants to keep updating the public version, they edit a _parallel_ canonical version, not the project they originally published — preventing accidental updates

### Version awareness (v2, not v1)

- v1: forks are static snapshots. No update propagation.
- v2: forks can optionally subscribe to upstream updates with a manual review step ("origin has new version — see changes")
- v2: branching / suggesting changes back to origin (probably never; this isn't GitHub)

## What this is NOT

- Not a real-time collaboration mechanism — that's the peer-invite flow
- Not a remix marketplace with creator monetization (v3+ maybe; not now)
- Not a code repository — it's a project structure repository
- Not GitHub. We're borrowing the metaphor, not the full feature surface.

## UX surfaces (rough sketch)

1. **Project settings → Sharing & Publishing**: toggle visibility, set fork permissions
2. **Public project page** (`buildos.app/p/{public-id}` or similar): read-only view + "Fork" CTA
3. **Discovery surface** (in-app): browseable list of public projects with filters/search
4. **My Forks** view: list of projects the user has forked, with link back to origin
5. **Fork dialog**: confirms fork, lets user rename, lets AI offer adaptation suggestions

## Open questions for the spec

1. **What's the canonical visibility model?** Three states (private, link-only, public-discoverable) or four (add: org-only)?
2. **Do forks count toward the origin author's metrics in some visible way?** Fork count could be a reputation signal — useful for surfacing high-quality public projects.
3. **Can a fork be re-published as a public project?** Probably yes, with attribution preserved. This is how communal evolution happens.
4. **What about AI conversation context from the origin?** Should the fork start with _some_ AI context (e.g. "this project is a book-writing template inspired by Tim Ferriss") or completely fresh?
5. **How does forking interact with the BuildOS scaffold templates?** A scaffold template is functionally just a public project authored by BuildOS — can it be implemented as such, or does it need separate UI?
6. **What's the cost model?** Forks create N deep copies of context. If 1,000 users fork the same project, that's 1,000x the storage. Need a cost-aware approach (deduplication of unchanged blocks? lazy materialization?).
7. **Is there a "soft fork" — view-only mode where the user can interact with AI about the project without forking?** Could be valuable for browse-before-commit.

## Success criteria

- A user can fork a public project in <10 seconds, no friction
- A forked project is fully usable and modifiable from minute 1
- Attribution is clear without being intrusive
- The same project-intake UX can route peer invites, template starts, agent-spawned projects, and forks to the correct backend operation
- Forking never grants membership on the source project
- Forking preserves source version/provenance and resets user-specific state
- AI can assist with adapting a forked project to the new owner's specific situation

## Estimated scope (rough)

- v1 (basic forking, no version sync): ~4-6 weeks of focused eng + design work
- v2 (update propagation, soft fork): ~2-3 additional weeks
- Discovery surface + browsing UI: ~2 weeks
- AI adaptation flow: ~2 weeks
- Total to ship a usable v1 with discovery: ~7-10 weeks

This is a side task per the parent strategy doc. Don't block Phase A or Phase B on it; build alongside.
