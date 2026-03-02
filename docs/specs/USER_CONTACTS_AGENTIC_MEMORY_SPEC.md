<!-- docs/specs/USER_CONTACTS_AGENTIC_MEMORY_SPEC.md -->

# User Contacts Agentic Memory Spec

## Status

| Attribute | Value                                                         |
| --------- | ------------------------------------------------------------- |
| Status    | Draft                                                         |
| Created   | 2026-03-02                                                    |
| Owner     | Platform                                                      |
| Scope     | Personal context, agent memory, conflict-safe contact capture |

---

## Problem

We now store personal context in `user_profiles` and `profile_documents`, but we do not have first-class contact memory.

Current gap:

- Contact details (name, phone, email) are buried in chat text.
- Cross-chat updates are unsafe. Example: chat A has Stacy's phone, chat B has Stacy's email, but we cannot reliably decide if those are the same person.
- Agent flows (call/message reminder, tag in docs, relationship context) need contact retrieval with privacy controls.

This spec defines a conflict-safe, privacy-first contact system that fits the existing profile architecture.

---

## Goals

1. Persist user-owned contacts with multiple methods (phone/email/etc).
2. Capture contact signals from chat over time without silent bad merges.
3. Handle ambiguity explicitly (ask user when uncertain).
4. Support linking to profile memory and optional project/member context.
5. Keep sensitive details private by default and auditable.
6. Enable agentic use cases: "call Stacy tomorrow", "tag Stacy in a doc", "what is Stacy's email?".

---

## Non-goals (MVP)

- Auto-sending outbound SMS/email/calls without explicit user confirmation.
- Full phonebook sync/import UI (Google/Apple contacts).
- Cross-user shared address books.
- Perfect identity resolution without user input in ambiguous cases.

---

## Design Principles

1. Private-by-default: contacts belong to one user account.
2. No silent merges on ambiguity.
3. Strong identifiers win: exact normalized phone/email has highest match priority.
4. Prompt minimization: avoid injecting raw phone/email unless user intent requires it.
5. Audit reads/writes of sensitive methods.
6. Reuse existing patterns: `profile_fragments` style ingestion, `usage_scope` and `sensitivity`, RLS by `auth.uid()`.

---

## Proposed Data Model

### 1) `user_contacts`

Root person record.

```sql
create table if not exists public.user_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  profile_id uuid null references public.user_profiles(id) on delete set null,
  display_name text not null,
  given_name text null,
  family_name text null,
  nickname text null,
  organization text null,
  title text null,
  notes text null,
  relationship_label text null, -- "friend", "client", "teammate", etc.
  linked_user_id uuid null references public.users(id) on delete set null,
  linked_actor_id uuid null references public.onto_actors(id) on delete set null,
  sensitivity text not null default 'sensitive',
  usage_scope text not null default 'profile_only',
  status text not null default 'active', -- active | archived | merged
  merged_into_contact_id uuid null references public.user_contacts(id) on delete set null,
  first_seen_source text not null default 'chat', -- chat | manual | import
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_confirmed_at timestamptz null,
  confidence real not null default 0.7,
  normalized_name text null,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint user_contacts_sensitivity_check
    check (sensitivity in ('standard', 'sensitive')),
  constraint user_contacts_usage_scope_check
    check (usage_scope in ('all_agents', 'profile_only', 'never_prompt')),
  constraint user_contacts_status_check
    check (status in ('active', 'archived', 'merged'))
);
```

Indexes:

- `idx_user_contacts_user_active` on `(user_id, updated_at desc)` where `deleted_at is null`.
- `idx_user_contacts_linked_actor` on `(user_id, linked_actor_id)` where `linked_actor_id is not null and deleted_at is null`.
- `idx_user_contacts_search_vector` gin on `search_vector`.

---

### 2) `user_contact_methods`

Per-contact methods (phone, email, etc), normalized for matching.

```sql
create table if not exists public.user_contact_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  contact_id uuid not null references public.user_contacts(id) on delete cascade,
  method_type text not null, -- phone | email | sms | whatsapp | telegram | website | address | other
  label text null, -- mobile | work | home | etc
  value_raw text not null,
  value_normalized text not null,
  value_hash text not null, -- sha256(value_normalized)
  is_primary boolean not null default false,
  is_verified boolean not null default false,
  verification_source text not null default 'inferred', -- inferred | user_confirmed | import
  confidence real not null default 0.7,
  sensitivity text not null default 'sensitive',
  usage_scope text not null default 'profile_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint user_contact_methods_type_check
    check (method_type in ('phone', 'email', 'sms', 'whatsapp', 'telegram', 'website', 'address', 'other')),
  constraint user_contact_methods_sensitivity_check
    check (sensitivity in ('standard', 'sensitive')),
  constraint user_contact_methods_usage_scope_check
    check (usage_scope in ('all_agents', 'profile_only', 'never_prompt'))
);
```

Indexes:

- `idx_user_contact_methods_contact` on `(contact_id, method_type, updated_at desc)` where `deleted_at is null`.
- `idx_user_contact_methods_user_hash` on `(user_id, method_type, value_hash)` where `deleted_at is null`.
- Unique de-dup guard: `(contact_id, method_type, value_hash)` where `deleted_at is null`.

---

### 3) `user_contact_observations`

Ingestion staging table (chat/manual/import signals), modeled after `profile_fragments`.

```sql
create table if not exists public.user_contact_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source_type text not null, -- chat | manual | import
  source_id uuid null,
  session_id uuid null,
  proposed_display_name text null,
  proposed_method_type text null,
  proposed_method_value text null,
  proposed_method_normalized text null,
  proposed_method_hash text null,
  relationship_label text null,
  confidence real not null default 0.5,
  inference_flags jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  status text not null default 'pending', -- pending | applied | needs_confirmation | dismissed
  resolved_contact_id uuid null references public.user_contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  constraint user_contact_observations_source_check
    check (source_type in ('chat', 'manual', 'import')),
  constraint user_contact_observations_status_check
    check (status in ('pending', 'applied', 'needs_confirmation', 'dismissed')),
  unique (user_id, idempotency_key)
);
```

---

### 4) `user_contact_merge_candidates`

Tracks unresolved "same person?" decisions.

```sql
create table if not exists public.user_contact_merge_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  observation_id uuid null references public.user_contact_observations(id) on delete set null,
  primary_contact_id uuid not null references public.user_contacts(id) on delete cascade,
  secondary_contact_id uuid not null references public.user_contacts(id) on delete cascade,
  reason text not null,
  score real not null,
  status text not null default 'pending', -- pending | confirmed_merge | rejected | snoozed
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by_actor_id uuid null references public.onto_actors(id) on delete set null,
  constraint user_contact_merge_candidates_status_check
    check (status in ('pending', 'confirmed_merge', 'rejected', 'snoozed'))
);
```

---

### 5) `user_contact_links`

Optional relation mapping to profile docs/fragments and project context.

```sql
create table if not exists public.user_contact_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  contact_id uuid not null references public.user_contacts(id) on delete cascade,
  link_type text not null, -- profile_document | profile_fragment | onto_actor | onto_entity
  profile_document_id uuid null references public.profile_documents(id) on delete cascade,
  profile_fragment_id uuid null references public.profile_fragments(id) on delete cascade,
  actor_id uuid null references public.onto_actors(id) on delete set null,
  project_id uuid null references public.onto_projects(id) on delete cascade,
  entity_type text null, -- task | goal | document | milestone | risk | plan | project
  entity_id uuid null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by_actor_id uuid null references public.onto_actors(id) on delete set null,
  constraint user_contact_links_type_check
    check (link_type in ('profile_document', 'profile_fragment', 'onto_actor', 'onto_entity'))
);
```

---

### 6) `user_contact_access_audit`

Audit reads/writes and prompt exposure of sensitive methods.

```sql
create table if not exists public.user_contact_access_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  contact_id uuid null references public.user_contacts(id) on delete set null,
  actor_id uuid null references public.onto_actors(id) on delete set null,
  access_type text not null, -- search | method_read | method_write | merge | link | prompt_injection | action_prepare
  context_type text null, -- chat | profile | api | worker
  reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_contact_access_audit_type_check
    check (access_type in ('search', 'method_read', 'method_write', 'merge', 'link', 'prompt_injection', 'action_prepare'))
);
```

---

## RLS and Security

All contact tables use user-owned RLS:

- `USING (auth.uid() = user_id)`
- `WITH CHECK (auth.uid() = user_id)`

Additional rules:

1. Service role allowed for worker pipelines only.
2. No cross-user reads.
3. In shared project contexts, raw methods remain private unless contact is explicitly linked to project member identity and share-approved.
4. Contact methods are `sensitive` by default.

---

## Normalization Rules

### Email

- trim, lowercase, Unicode normalize (NFKC).
- reject invalid email format.

### Phone

- normalize to E.164 (libphonenumber).
- use user locale/country fallback if no country code provided.
- keep `value_raw` for display, normalized for matching.

### Name

- `normalized_name`: lowercase, trim, collapse whitespace, remove punctuation accents.

---

## Conflict-Safe De-conflict Pipeline

### Ingestion

`chatSessionClassifier` currently calls `processProfileSignals`. Add `processContactSignals` immediately after it.

`processContactSignals`:

1. Extract contact observations from user/assistant turns.
2. Insert into `user_contact_observations` with deterministic `idempotency_key`.
3. Resolve each observation using match scoring.

### Match scoring

Strong matches:

- exact `method_type + value_hash`: +1.0.

Weak matches:

- exact normalized name: +0.45.
- fuzzy name similarity high: +0.25.
- same relationship label/org context: +0.1.

Conflict penalties:

- existing contact with same name but conflicting strong method: -0.4.
- multiple candidates within tie threshold: force ambiguity path.

### Resolution thresholds

1. Single high-confidence candidate (`>= 0.9`) and no conflicts:
   auto-attach method to existing contact.
2. Mid-confidence (`0.65-0.89`) or competing candidates:
   create `user_contact_merge_candidates` and mark observation `needs_confirmation`.
3. No viable candidate:
   create new contact as unconfirmed (`confidence` from observation).

No silent merges if two contacts are plausible.

---

## Ambiguity UX Contract

When ambiguity exists, assistant asks one concise clarification:

"I found two possible Stacy contacts. Is `Stacy (555-1234)` the same person as `Stacy Chen (stacy@...)`?"

Behavior:

- If user confirms same: merge contacts and methods.
- If user says different: keep separate; mark candidate `rejected`.
- If no response: candidate stays pending and is surfaced later by contact resolution endpoint/UI.

---

## Agentic Behavior Rules

### Prompt injection and retrieval

Default prompt view for contacts:

- include contact names and relationship labels.
- do not include raw phone/email unless user intent requires direct contact action.

Examples requiring raw methods:

- "what is Stacy's number?"
- "email Stacy now"
- "set a reminder to text Alex"

### Action safety

For external actions (call/message/email):

1. resolve exact contact first.
2. require explicit method confirmation when multiple methods exist.
3. never auto-send by memory capture alone.

---

## Linking Strategy

### Profile linkage

- `profile_documents` and `profile_fragments` can link contacts through `user_contact_links`.
- This enables "people chapter" style organization without embedding raw methods in chapter content.

### Project/member linkage

- Optional `linked_actor_id` and `linked_user_id` on `user_contacts` when contact is a BuildOS collaborator.
- If linked to actor, project tagging can map to existing mention pipeline where appropriate.
- If not linked, contact tagging should stay private unless explicit share action is confirmed.

---

## API Surface (MVP)

### User profile contacts

- `GET /api/profile/contacts`
  list contacts (methods optionally redacted by default).
- `POST /api/profile/contacts`
  create/upsert contact and methods.
- `PATCH /api/profile/contacts/[id]`
  update contact metadata and methods.
- `DELETE /api/profile/contacts/[id]`
  soft delete/archive.

### Conflict resolution

- `GET /api/profile/contacts/candidates`
  list pending merge/identity candidates.
- `POST /api/profile/contacts/candidates/[id]/resolve`
  resolve with `confirmed_merge | rejected | snoozed`.

### Linking

- `POST /api/profile/contacts/[id]/links`
  create link rows to profile docs/fragments or project context.

---

## Agent Tool Surface (MVP)

Add utility tools:

1. `search_user_contacts`
   query by name/relationship/method type.
2. `upsert_user_contact`
   write/update contact details from user intent.
3. `resolve_user_contact_candidate`
   apply user clarification to merge candidate.
4. `link_user_contact`
   attach contact to profile/project context entities.

---

## Example Flow: "Stacy phone in chat A, email in chat B"

1. Chat A observation:
   `name=Stacy`, `phone=+1...`.
   No match -> create contact `Stacy` + phone method.
2. Chat B observation:
   `name=Stacy`, `email=stacy@...`.
3. Resolver finds:
   name similarity to existing Stacy, but no strong shared identifier.
4. Create merge candidate (`needs_confirmation`) instead of silent merge.
5. Assistant asks confirmation in next relevant interaction.
6. User confirms same person -> methods unified under one contact.
7. If user rejects -> keep separate contacts.

---

## Rollout Plan

### Phase 1

- schema + RLS + updated_at/search triggers.
- basic contacts CRUD endpoints.
- `processContactSignals` worker ingestion.
- merge candidate generation and resolve endpoints.
- audit logging.

### Phase 2

- agent tools for contact search/upsert/resolve/link.
- prompt exposure guardrails (redacted by default).
- contact linking to profile docs/fragments.

### Phase 3

- project tagging integration with private-share controls.
- optional outbound connectors (SMS/email) with explicit confirmation UX.
- optional encryption-at-field layer for `value_raw`.

---

## Testing Requirements

1. Unit tests:
   normalization (email/phone), scoring, threshold behavior, no-silent-merge guarantees.
2. Integration tests:
   RLS isolation, CRUD, candidate resolution, worker idempotency.
3. Agent tests:
   ambiguity prompt behavior, explicit-action gating, redacted vs non-redacted retrieval.
4. Regression scenario:
   two "Stacy" contacts with conflicting identifiers across sessions.

---

## Open Decisions

1. Should contact names appear to collaborators in shared docs by default, or remain owner-only unless explicitly shared?
2. Is shared-method support needed (same phone reused for two contacts), or should we force one active contact per method hash?
3. Do we want field-level encryption in MVP, or phase it after core conflict-safe behavior ships?
