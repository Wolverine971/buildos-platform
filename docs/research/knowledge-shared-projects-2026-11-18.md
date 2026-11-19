<!-- docs/research/knowledge-shared-projects-2026-11-18.md -->

# Knowledge graph in shared projects: who owns Kyle, and who can see what

**Date:** 2026-11-18 · **For:** DJ · **Tracker:** tasker/160 ("Parked: shared projects", line 211)
**Status:** research only. Nothing built, no migrations, no paid calls. Prod numbers came from
read-only SELECTs.

---

## 1. TL;DR

- **Recommendation: everyone keeps their own private graph, and each project gets a read-only
  view of everyone's graphs.** A name is filed for **the person who typed it**, not the task's
  creator. Inside a shared project, a name's card shows three things: what the project's own text
  says (members can already see this today), your own entry, and the facts other members' entries
  hold that are safe to share by default (job title, employer, website, LinkedIn: anything that
  came from the public web). Contact details are hidden until you **Ask**. The owner approves on
  the card or in the /people inbox, and the default grant lasts "while you're both in this
  project".
- **Why:** this matches your "it has to be by who inserted it" instinct. It never moves an entry
  from one person to another, which the database already forbids. When someone leaves, cleanup
  happens automatically because a live membership check replaces a copy. It reuses
  `people_requests`, `decide_people_request`, the people emails and the access-history pattern,
  so most of the request-and-grant system already exists.
- **Don't build** project-owned entries ("this project's people" as a third owner type) or a
  team-wide graph yet. Both add a third ownership type to every guard, policy, search and merge,
  and production has 1 sharing owner and 0 active collaborators.
- **Public org facts (website, industry, location) get researched once and shared with every
  user**, as tasker 164 C.7 already plans. Facts about people are never shared globally; the DB
  trigger already enforces this.
- **Today the whole problem is hypothetical.** 5 shared projects, all yours. 7 collaborators,
  none signed in for 30 days. The last collaborator task was written in Feb 2026, and it named
  nobody. So the first build (lean) should be small and correct by construction, not a big UI.

---

## 2. What exists today

### The model (code)

| Piece                                   | Where                                                                                                                                                | What it means for sharing                                                                                                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two scopes, public and private          | `supabase/migrations/20261116230000_knowledge_graph.sql:8-15`, CHECKs `:132`, `:164`, `:256`                                                         | Every row is either global (no owner) or owned by one user. No project or shared scope.                                                                                                                        |
| Owner and scope can never change        | same file `:471-498` (`knowledge_entities_guard`)                                                                                                    | Ownership can't move. Sharing has to be layered on top, not done by re-owning.                                                                                                                                 |
| Per-predicate "may be public" list      | `:53-54`, seed `:80-104`; `educated_at` `20261118120000:16-19`                                                                                       | Person facts are **never** public: `headline`, `works_at`, `educated_at`, `email`, `phone`, `birthday`, `note`, `knows` all have no person kinds in `shareable_subject_kinds`. Org facts mostly can be public. |
| Fact guard                              | `:359-417` (public check `:405-407`)                                                                                                                 | A private fact can only describe or point at the owner's own private entities, or at public ones.                                                                                                              |
| Record links (name ↔ task/doc)         | `:319-335`, RLS `:583-587`                                                                                                                           | Owner-only. Index leads with `owner_user_id` (`:335`), so "who else linked this task" has no index.                                                                                                            |
| RLS                                     | `:530-592`                                                                                                                                           | `scope = 'public' OR owner_user_id = auth.uid()` on entities, facts, keys and sources. Simple and fast.                                                                                                        |
| Service-role viewer check               | `knowledge_viewer` `:640-658`; `knowledge_search` `:663-729`; `knowledge_list` `20261117010000:23-118`                                               | Chat and MCP pass `p_viewer`. A signed-in caller can't pass someone else's id.                                                                                                                                 |
| In-code choke point                     | `packages/shared-agent-ops/src/knowledge/knowledge-store.ts:1-5`, `:184-193` (`this.visible = scope.eq.public,owner_user_id.eq.<user>`)              | Every chat and MCP read goes through this one filter. Sharing must change it here and in the SQL functions together.                                                                                           |
| Circles                                 | `20261118100000_knowledge_circles_identity.sql:1-42`, `circles.ts:1-15`                                                                              | **Not a sharing primitive.** It's a per-user label (inner / public / unknown) that tunes the identity check. It's still useful as a hint: "public"-circle entries are the safe ones to share.                  |
| Who a task's names are filed for        | trigger `20261007120000_task_entities.sql:170-186` → `extractTaskEntitiesWorker.ts:357-363` → `taskEntityKnowledgeSync.ts:19-46`                     | The **task creator** (fallback: the project creator). If you edit Sam's task and add "Kyle", Kyle is filed in **Sam's** graph.                                                                                 |
| Removed-member rule                     | `taskEntityKnowledgeSync.ts:5-7`, `:76-107`                                                                                                          | When someone can no longer open the project, the worker stops filing names for them.                                                                                                                           |
| Project-level layer that already exists | `onto_task_entities` RLS `20261007120000_task_entities.sql:110-121`                                                                                  | Every project member already sees the names, phones and emails **written in the task text** (the task-only card). This already works as a project layer.                                                       |
| Task card lookup                        | `apps/web/src/lib/server/task-entities/task-entity-store.ts:86-107` (owner-only links), `:123-194` (quote → name → own exact name)                   | Collaborators get their own entries only. On a collaborator's task, the owner sees the task-only card.                                                                                                         |
| Doc mentions                            | `apps/web/src/routes/api/knowledge/mentions/+server.ts:1-10`, `:38-45`                                                                               | Owner-only links. A collaborator reading the same doc sees only names in their own graph.                                                                                                                      |
| "Add to People"                         | `apps/web/src/routes/api/knowledge/from-task-entity/+server.ts:1-10`                                                                                 | Already files a collaborator-written name into **the caller's** own graph. This is the "copy what's in the text" escape hatch.                                                                                 |
| Chat capture                            | `apps/worker/src/workers/chat/checkpoint/knowledgeCapture.ts:1-20`                                                                                   | Writes to the chat user's private graph. Risk: once shared facts appear in chat, this could copy them into the viewer's graph (see §4.7).                                                                      |
| MCP / chat ops                          | `packages/shared-agent-ops/src/gateway/op-execution-gateway.knowledge.ts:1-15`, `:143-158`; `agentic-chat-runtime/src/tools/knowledge-reads.ts:1-10` | Built from the trusted `context.userId`. Connections limited to selected projects are **refused** on all knowledge tools.                                                                                      |

### Sharing and request code to reuse

| Existing                                                                                                                            | Where                                                                                          | Reuse for                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `people_requests` (from, to, status pending/approved/declined/blocked/canceled, `decision jsonb`, 14-day expiry, `via = web/agent`) | `20261023140000_people_layer_foundation.sql:119-160`                                           | The request row. Add `kind = 'knowledge'` with `requested_items [{entity_id, what}]`.                                                                                                                              |
| `kind` + `requested_items`, merge-into-pending                                                                                      | `20261023200000_people_rejoin_requests.sql:20-45`, `20261023235900_agent_access_wall.sql:1-45` | The same pattern: a second ask merges into the pending one. Note `uq_people_requests_pending_pair` (`foundation:142`) is one pending row per pair, so a new migration must add `kind` to it or merge across kinds. |
| `decide_people_request` (signed-in recipient only; revoked from `service_role`)                                                     | `foundation:579`, `:816`                                                                       | Same rule: only a human owner in a live session can approve. Agents can ask but can never approve.                                                                                                                 |
| Request emails (no requester free text in emails)                                                                                   | `apps/web/src/lib/server/people/people-emails.ts:1-20`                                         | "Sam asked about Kyle" email and the approval email.                                                                                                                                                               |
| `project_access_events` (trigger-written history)                                                                                   | `20261024000500_project_access_events.sql:1-50`                                                | The audit trail for knowledge grants.                                                                                                                                                                              |
| MCP permission requests (`pending/applied/denied/expired`, `once/always/deny/scoped`, 24 h expiry)                                  | `20260930185213_agent_permission_requests.sql:1-40`                                            | The grant-duration vocabulary (once / always / scoped).                                                                                                                                                            |
| Live rule instead of data copy                                                                                                      | agent wall "standing approval" (`agent_access_wall.sql:11-14`)                                 | Project-scoped grants should be a live membership check, so turning one off reverts at once.                                                                                                                       |
| Member agent setting `agent_access off/read/write`                                                                                  | `foundation` §2                                                                                | Gates whether a member's agents can see project-shared knowledge.                                                                                                                                                  |
| Access helper `current_actor_has_project_member_access(project, 'read')`                                                            | `20260514000500_add_project_member_access_helper.sql:46`                                       | Membership check inside the new read function.                                                                                                                                                                     |

### Real numbers (production, 2026-11-18; counts only)

|                                                   |                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users / live projects                             | 130 / 131                                                                                                                                                                 |
| Shared projects (≥1 active non-owner member)      | **5**, all owned by **1** person; 1 project has ≥2 collaborators                                                                                                          |
| Collaborators                                     | 7 distinct, all **editor + agents write**; **0 signed in in the last 30 days**; 0 removed memberships                                                                     |
| Tasks in shared projects                          | 94; **7 by collaborators** (2 projects), all written 2026-02-10 → 02-23                                                                                                   |
| Names in collaborator-written tasks               | **0** people, 0 orgs, 0 phones/emails                                                                                                                                     |
| Names in shared-project tasks (all owner-written) | 4 people, 6 orgs                                                                                                                                                          |
| Docs in shared projects                           | 81 (2 by collaborators)                                                                                                                                                   |
| Knowledge graph                                   | **1 user** has entries: 578 private entities, **0 public**; 209 private facts, 0 public                                                                                   |
| Record links                                      | 1,060 (592 task, 468 doc); **10 task + 3 doc links in shared projects** (8 entries), 0 held by a non-owner                                                                |
| Facts by predicate                                | works_at 81, **email 51, phone 28**, located_in 10, description 8, headline 7, homepage 6, industry 6, founded 1, profile_url 1, address 1 → **~38% are contact details** |
| Circles                                           | inner 372, public 113, unknown 93                                                                                                                                         |
| Research spend to date                            | 6 runs, 26 entries done, **$0.17** total; ~$0.003/entry since Serper (tasker 164:390-392)                                                                                 |
| `people_requests` ever                            | **0**                                                                                                                                                                     |
| Same name held by 2+ users                        | n/a (one user has a graph)                                                                                                                                                |

**Takeaway:** the risk is about the future (a consultant and a client team in one project, the
"consultant client updates" lead from the PULL work), not about current data. Nothing that exists
today needs migrating to the new rules.

---

## 3. The options

**Scenario used throughout.** You own **Wayne Strategies**. Sam (editor) adds a task: _"Pitch
Kyle Kulinski on a Secular Talk sponsorship — booking@… / 555-…"_. You already have Kyle in your
People: works at Secular Talk (found by research, with a source URL), a personal email from your
LinkedIn import, and a note.

### Option A — Private graphs only, filed by author (today, refined)

- **You:** Kyle in Sam's task opens your own Kyle card (your exact-name match already does this,
  `task-entity-store.ts:170-193`), with "In this task: booking@…". Sam's notes are invisible to
  you.
- **Sam:** Kyle is filed into Sam's graph from the text. Sam's card shows only what the task
  says, so Sam never benefits from your research. If Sam clicks Find more, Sam pays to research
  Kyle again.
- **Data model:** no change. One fix: file for the **editor who introduced the name**, not the
  task creator. The trigger has `auth.uid()` for web writes, and `onto_project_logs.changed_by_actor_id`
  covers agent and worker writes. The worker files only the newly inserted names (`plan.insert`)
  for that editor.
- **Privacy risk:** none new. **Complexity:** ~0.5 day.
- **Real products:** Salesforce with Private org-wide defaults: only the owner sees a contact
  unless a sharing rule opens it.
- **Verdict:** this is the right base layer but not enough on its own. Collaboration gets no
  benefit from the graph.

### Option B — Project lens: visibility follows the source _(recommended base)_

- **You:** your card for Kyle, plus a line **"In this project: Sam also has Kyle"** if Sam's entry
  holds shareable facts you don't.
- **Sam:** Sam's card shows the task text, plus **"From DJ's People: Works at Secular Talk ·
  secular-talk.com · LinkedIn"** (public-web facts, with sources). It also shows **"DJ has
  contact details for Kyle · Ask"**. Your LinkedIn-import email and your note never show.
- **Data model:**
    - No new ownership and **no change to the existing RLS policies** on knowledge tables.
    - One server function, `knowledge_project_lens(p_project, p_record_kind, p_record_ids, p_viewer)`,
      `SECURITY DEFINER`. It checks `knowledge_viewer()` and project read access once, then returns
      entries **other active members** have linked to those records, with the facts that are shared
      by default (§5) and a per-category "requestable" count.
    - New index: `knowledge_record_links (record_kind, record_id) INCLUDE (owner_user_id, entity_id)`.
    - Default sharing is computed live from predicate + fact source + both people's current
      membership. Nothing is copied.
- **Privacy risk:** tells collaborators that a member has an entry for a name **that's already
  written in the shared project**. Low risk, and it's the same thing Google Docs reveals when
  you hit a file you can't open. Facts from your _other_ projects' tasks never show; links to
  them are excluded (§5).
- **Complexity:** ~2–3 days including card UI.
- **Real products:** Attio: people and company records and attributes are shared across the
  workspace by default, but emails stay private unless you choose to share them. Affinity: who
  you talked to and when is shared, while email bodies stay hidden by default.

### Option C — Project-owned entries ("this project's people")

- **You and Sam** both see one shared "Kyle" owned by the project. Either of you can edit it.
  Your private Kyle is linked to it with a "same as" link.
- **Data model:** a third scope, `project`, with `project_id` on entities, facts, keys and
  sources. Every guard (`:359-502`), every RLS policy (`:530-592`), `knowledge_search`,
  `knowledge_list`, `knowledge_merge_entities`, the store's `visible` filter, research writes and
  chat capture would need a project branch. Merges become three-way: private ↔ project ↔ public.
- **Privacy risk:** high. Whose phone number is it? If Sam types your private number into the
  project Kyle, it's out. Project folds and deletes take the people with them (the project fold
  policy would need a decision for every table).
- **Complexity:** 2–3 weeks, plus ongoing tax on every knowledge feature.
- **Real products:** folk shared groups (contacts are private after import, and you share chosen
  groups with teammates); HubSpot and Attio workspace CRMs.
- **Verdict:** right for a sales team on a shared CRM, wrong for a thinking environment where
  people bring their own networks. Revisit if teams become a paid tier.

### Option D — Team / workspace graph

- One graph per company (Attio, HubSpot, Affinity). BuildOS has no team or workspace layer
  (people layer is person-to-person). **Out of scope.** It would be a pricing and product
  decision before it's a data-model one.

### Option E — Per-entry grants (Google Docs for People) _(recommended request mechanism)_

- **Sam** clicks **Ask** on "DJ has contact details for Kyle". **You** get a card badge, an
  /people inbox row and an email. You choose: share contact details / share everything except
  notes / don't share, and for how long. Sam's card fills in live. Revoke any time from "Who can
  see Kyle" on your card.
- **Data model:** `knowledge_shares`, owner-only RLS (see §4.4).
- **Privacy risk:** low, because the owner decides each grant. The main risk is copying out
  (chat capture, "Add to my People"), covered in §4.7.
- **Complexity:** ~3–4 days on top of B, reusing `people_requests` and `decide_people_request`.
- **Real products:** Google Drive request access: optional message, owner email with an inline
  approve and role picker, a dot on Share, and the requester notified of the result. Notion page
  access requests go to the page creator's inbox. HubSpot field-level permissions and Salesforce
  field-level security apply per field even when the record is shared.

### Recommendation: A + B + E, plus the public org layer

Ownership comes from A (by author). The default experience is B (the project lens). Anything
beyond the defaults goes through E (Ask and grant). Public org facts are researched once for
everyone (tasker 164 C.7). This keeps two owner types (public, private) everywhere and adds one
side table and one read function.

---

## 4. Request-and-grant design (for the recommended option)

### 4.1 What the requester sees

| State                        | Sam's card for Kyle (in Wayne Strategies)                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| No ask yet                   | Task text facts · "From DJ's People" shared facts · **"DJ has 2 contact details · Ask"** (category and count only, never the values) |
| Pending                      | "Contact details · asked DJ 2 h ago · Cancel". Nothing else changes.                                                                 |
| Granted                      | Values appear inline, labelled "shared by DJ · while you're both in Wayne Strategies".                                               |
| Declined                     | "DJ kept these private." The Ask button goes away for that entry. Re-asking stays silent, like the people-layer block.               |
| Expired (14 days unanswered) | Back to "Ask" (same expiry as `people_requests`).                                                                                    |
| Revoked or lapsed            | Values disappear on the next read. No message unless Sam reopens the card ("No longer shared").                                      |

### 4.2 What the owner sees

- **On the Kyle card:** a badge reading "Sam asked for contact details", with **Share** / **Not
  now**. Share opens a small sheet:
    - **What:** Contact details (default) · Everything except notes · pick facts (checkboxes per
      fact).
    - **How long:** While you're both in Wayne Strategies (default) · Always · 30 days.
- **/people inbox:** the same request row, via `list_people_requests` with `kind = 'knowledge'`.
- **Email:** "Sam asked about someone in your People in Wayne Strategies" with a link. The
  entity's name stays out of the email, matching the no-free-text rule in `people-emails.ts`.
- **"Who can see Kyle"** on every card you own: the project lens (which projects, by default)
  and each grant, each with Revoke.
- **Profile → People & agents hub:** a "Shared knowledge" list of all live grants with bulk revoke
  (tasker 141 hub).

### 4.3 States

`requested → approved (grant created) | declined | expired | canceled`; a grant moves from
`active → revoked | lapsed (membership ended or expires_at passed)`. Lapsing is **computed at
read time**, not by a cron. The read function checks that both people are still active members
of the grant's project, which is the live-rule approach from the agent wall.

### 4.4 Data sketch (not SQL)

- `people_requests`: add `kind = 'knowledge'`, use `project_id` for the context project and
  `requested_items = [{ entity_id, what: 'contact' | 'all' | fact_ids }]`. A new migration widens
  `uq_people_requests_pending_pair` to include `kind`; old migration files stay untouched. A
  second ask from the same person merges into the pending row, as upgrade requests do.
- `knowledge_shares`: `id, owner_user_id, entity_id, project_id NULL, grantee_user_id NULL`
  (exactly one of the two), `predicates text[]` (or `fact_ids uuid[]` for a pick list),
  `expires_at NULL, revoked_at NULL, source_request_id, created_at`. RLS: the owner manages their
  rows, and the grantee can read rows naming them. Indexes: `(project_id, entity_id) WHERE
revoked_at IS NULL`, `(grantee_user_id, entity_id) WHERE revoked_at IS NULL`. - Sharing **by predicate** rather than by fact id means an updated phone number flows through
  automatically, and revocation is one row.
- `knowledge_share_events`: trigger-written history (`requested, granted, declined, revoked,
lapsed`), built like `project_access_events`. No per-read logging, because HubSpot and
  Salesforce don't log reads either and it would cost a write on every card open.
- **No change** to `knowledge_entities`, `knowledge_facts`, their guards or their RLS. Shared
  reads go only through `knowledge_project_lens` and a sibling, `knowledge_shared_entity(p_entity,
p_viewer)`. Both are `SECURITY DEFINER`, check `auth.uid()` through `knowledge_viewer()`, are
  `GRANT`ed to `authenticated` and `service_role`, and are rehearsed with `--role-probe`.

### 4.5 Agents and MCP

- **One code path.** Add `KnowledgeStore.sharedView(entityIds, { projectId })`, which calls the
  same two functions with `p_viewer = this.userId`. Chat (`knowledge-reads.ts`) and MCP
  (`op-execution-gateway.knowledge.ts`) get identical rules. Never widen `this.visible`
  (`knowledge-store.ts:192`); shared rows stay out of the generic filter.
- **Member agent setting applies.** If a member's `agent_access` in the project is `off`, their
  agents get no project-lens or project-scoped grant data. `read` and `write` both read the lens.
  No agent ever writes to someone else's entry.
- **Project-limited connections** (`projectScopeMode === 'selected'`, refused today at
  `op-execution-gateway.knowledge.ts:152`): the lean build keeps refusing them. The ambitious
  build lets them read only the lens of their selected projects, never the personal graph.
- **Asking via agent:** agents may create the request (`people_requests.via = 'agent'` exists).
  Only a signed-in human approves (`decide_people_request` stays revoked from `service_role`).
- **Model context:** shared facts reach the model labelled `shared_by` and `scope:
'project:<name>' | 'grant'`, so replies say "DJ's notes say…" rather than presenting them as
  the viewer's own facts.

### 4.6 Notifications

| Event          | Owner                                                                    | Requester                                                                                     |
| -------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Ask            | Card badge + /people inbox + email (transactional, like people requests) | Toast "Asked DJ"                                                                              |
| Approve        | —                                                                        | Toast if online + email "DJ shared details about someone in Wayne Strategies" + card fills in |
| Decline        | —                                                                        | Silent (card shows "kept private" on next open)                                               |
| Revoke / lapse | —                                                                        | Silent                                                                                        |

### 4.7 Copy-out guards

Copying shared data out is where these systems actually leak. Two guards:

1. **"Add to my People"** on a shared entry copies only (a) what the project text says (this is
   what `from-task-entity` does today) and (b) facts with a **public web source**. Granted
   contact details are never copied, so revoking still works. Google Docs "Make a copy" goes
   further, but contact details are more sensitive than doc content.
2. **Chat capture** (`knowledgeCapture.ts`): drop any candidate fact whose normalized value
   equals a shared, non-owned fact surfaced in this chat. Tool results carry a structured
   `shared` flag and the comparison is on normalized phone, email and URL values. This compares
   structured values; it is not language classification, so the no-regex rule doesn't apply.

### 4.8 Two people, two Kyles: dedupe without leaking

- **Never merge across owners.** The DB already forbids it (`:479-494`).
- **Same-Kyle signals between users, in order:** (1) both entries are linked to the **same task
  or doc with the same quote**, which is the strongest signal and needs no private data; (2) a
  matching **public** key (LinkedIn URL, domain, YouTube id); (3) the same exact name on the same
  record.
- **Never match across users by email or phone keys.** Those keys are private
  (`knowledge_entity_keys_contact_private`, `:165-167`). Using them would tell Sam "someone in
  your project has this number".
- **Display:** the viewer's own entry always leads. Others' shared facts appear in an "Also in
  this project" section. The viewer can "Add to mine" field by field, with public-source facts
  only.

---

## 5. Fact-level sharing rules (inside a shared project)

Default for the **project lens**: what a fellow active member sees on an entry another member
filed, when the entry is linked to a task or doc **in that project**.
**shared** = shown by default · **request** = "Ask" · **owner-only** = never in the lens or
requestable (only an explicit fact pick by the owner) · **never** = cannot leave the owner's graph.

**Source rule first:** a fact whose source is **this project's own task or doc** is always
_shared_, because members can already read it in the text (`onto_task_entities` RLS). A fact from
a **private source** (contacts import, chat, MCP, user-typed, another project's records) drops
one level: _shared_ becomes _request_.

| Predicate                                                                          | Subject    | Default (public-web source) | Notes                                           |
| ---------------------------------------------------------------------------------- | ---------- | --------------------------- | ----------------------------------------------- |
| name, kind, summary line                                                           | any        | shared                      | Name is already in the project text             |
| `alias`                                                                            | any        | shared                      |                                                 |
| `description`                                                                      | any        | shared                      |                                                 |
| `headline`                                                                         | person     | shared                      | e.g. "CEO at Palantir"                          |
| `works_at` (current)                                                               | person     | shared                      | Past roles: request                             |
| `homepage`, `profile_url`, `url`, `thumbnail_url`                                  | any        | shared                      |                                                 |
| `located_in`                                                                       | org, event | shared                      | Person: request (where someone lives)           |
| `industry`, `founded`, `part_of`, `about`, `features`, `published_*`, `owns` (org) | org/media  | shared                      | Also eligible for the global public layer (§6)  |
| `owns`                                                                             | person     | shared                      | e.g. their channel                              |
| `educated_at`                                                                      | person     | request                     | Often public, but personal history              |
| `email`, `phone`                                                                   | person     | **request**                 | 38% of today's facts                            |
| `email`, `phone`, `address`                                                        | org, place | shared                      | Business switchboard / office                   |
| `address`                                                                          | person     | request                     |                                                 |
| `related_to`                                                                       | any        | request                     | Often carries private context in qualifiers     |
| `birthday`                                                                         | person     | **never**                   | Already never-public by trigger                 |
| `note`                                                                             | any        | **never**                   | The owner's own words                           |
| `knows`                                                                            | person     | **never**                   | About the owner's relationships, not about Kyle |
| Record links to **other** projects ("In your work")                                | —          | **never**                   | Would reveal other projects exist               |
| Research hints ("Not this one"), merge candidates, circle                          | —          | **never**                   | Owner's working state                           |
| Facts with status `suggested` / `disputed`                                         | any        | owner-only                  | Unverified; don't spread them                   |

Grants (§4) can open any _request_ row. _Never_ rows can't be requested. If you truly want to
share a note, the fact-pick list could allow it later as an explicit owner action; it's left out
of v1.

---

## 6. Enrichment: who pays and who sees results

1. **Whoever clicks Find more pays from their own daily cap** ($0.50 per user, $5 for admins,
   tasker 164:136). Results go into **their own** entry. If they only had a lens view, "Find more"
   first creates their own entry ("Add to my People"). Nobody can spend another member's budget,
   and there is no "research on DJ's behalf".
2. **The owner's research on a shared entry** flows to the project through the §5 defaults:
   public-web professional facts become visible, contact details stay request-only.
3. **Research public org facts once and share them with every user** (tasker 164 C.7). A fact is
   promoted to `scope = 'public'` only when the subject kind and predicate allow it (the trigger
   already enforces this) and the source is the org's own site or two independent sources.
   Research checks the public layer first and skips the search when it's fresh (< 6 months).
   **People are never promoted**; `shareable_subject_kinds` blocks it at the DB.
4. **Caching:** cache fetched **pages by URL** across users, since public pages are public. Never
   share a cache of **search queries** built from private anchors (employer from an import, a
   hint label), because the query itself can leak a private relationship.
5. **Cost reality:** about $0.003 per entry after Serper (tasker 164:390-392). The public org
   layer is mainly about **consistency and speed** (one canonical Secular Talk) rather than
   saving money. All research to date cost $0.17.

---

## 7. Build plans

### Lean (~4–5 days): correct by construction, useful on day one

1. **File by author.** The trigger passes the editor's user id. The worker files newly inserted
   names for the editor and leaves existing ones alone. Covers the "you edit Sam's task" case.
   (~0.5 d, free tests.)
2. **Project lens read.** Migration adds `knowledge_project_lens` and the record-link index.
   `KnowledgeStore.sharedView`. Task cards and the doc reader call it **only when the project has
   other active members** (126 of 131 projects never make the call). Cards get an "From DJ's
   People" section showing only the _shared_ rows from §5. (~2 d)
3. **Ask (contact details only, project-scoped).** `people_requests.kind = 'knowledge'`,
   `knowledge_shares` (project grants only), approve and decline on the card and in the /people
   inbox, the two emails, Revoke on the card. (~2 d)
4. **Agents read the lens's shared rows only.** Granted contact details stay in the UI until the
   capture guard exists. Two-account check in `supabase/tests/` (owner, collaborator, removed
   collaborator). (~0.5 d)

### Ambitious (~2–3 weeks): the full picture

1. Everything in lean, plus **fact picking and durations** (Always / 30 days / per person) and
   "Everything except notes".
2. **"Who can see Kyle"** panel, a **Shared knowledge** list in the Profile hub, and
   `knowledge_share_events` history.
3. **Public org layer:** promotion rules, research checks the public layer first, URL page cache,
   and a "Same Secular Talk" join so every user's org entry can show the public facts.
4. **Agents get granted details**, with the chat-capture copy-out guard and `shared_by` labels.
   Project-limited MCP connections can read the lens of their selected projects. MCP
   `request_knowledge_access` tool.
5. **"People in this project" tab** on the project page: the lens across every task and doc in
   one list. This would be the consultant demo ("everyone this client engagement touches, and
   who knows them").
6. Same-Kyle "Also in this project" merges by shared record and quote and by public keys, with
   "Add to mine" per field.

---

## 8. Open decisions for DJ

1. **File names for whoever typed them, not the task's creator?** If you add "Kyle" to Sam's
   task, Kyle goes into _your_ People. **Recommend: yes.**
2. **Inside a shared project, show other members' public-web facts (title, employer, website,
   LinkedIn) by default, with contact details only on Ask?** The alternative is that everything
   is Ask-only. **Recommend: show by default.** This is how Attio and Affinity work, and these
   facts are public anyway.
3. **Default grant length: "while you're both in this project" or "always"?** **Recommend:
   while you're both in the project.** Leaving cleans up with no extra work; "Always" stays
   available in the share sheet.
4. **Show that a hidden detail exists ("DJ has 2 contact details · Ask")?** Without it, nobody
   knows there's anything to ask for. **Recommend: yes**, showing category and count only, and
   only inside a project you both share.
5. **Promote verified public org facts to a shared layer every user reads, researched once?**
   People are never included. **Recommend: yes, in the ambitious round** (tasker 164 C.7).

Not proposed: project-owned entries (Option C) or a team graph (Option D). Say so if you want
either pitched properly.

---

## 9. Sources

- Google Drive request access: [Learn more about access to Google files](https://support.google.com/docs/answer/14743550) ·
  [If a file won't open](https://support.google.com/drive/answer/53355?hl=en) ·
  [Respond to access requests more efficiently (Workspace Updates, 2023)](https://workspaceupdates.googleblog.com/2023/06/respond-to-access-requests-for-google-workspace-files-efficiently.html) ·
  [Drive API: pending access proposals](https://developers.google.com/workspace/drive/api/guides/pending-access?authuser=0)
- Notion: [Manage members & guests (access requests to page creator's inbox)](https://notion.com/help/add-members-admins-guests-and-groups)
- Attio: [Shared data](https://attio.com/help/reference/users-and-permissions/shared-data) ·
  [Sharing and permissions](https://attio.com/help/reference/productivity-collaborating/sharing-and-permissions) ·
  [Manage access to objects](https://attio.com/help/reference/managing-your-data/objects/manage-access-to-objects) ·
  [Email and calendar privacy](https://attio.com/help/reference/how-to-guides/manage-email-and-calendar-privacy-across-your-workspace)
- Affinity: [Setting up your privacy preferences](https://support.affinity.co/s/article/Setting-up-your-privacy-preferences-in-Affinity) ·
  [Enterprise permissions](https://support.affinity.co/s/article/Enterprise-permissions-enterprise-only) ·
  [Internal vs external contacts](https://support.affinity.co/s/article/Internal-vs-External-Contacts)
- HubSpot: [Sensitive data in HubSpot tools (field-level permissions)](https://knowledge.hubspot.com/account-security/sensitive-data-in-hubspot-tools?tab=suite)
- Salesforce: [Tips and Hints for Sharing Data](https://developer.salesforce.com/docs/atlas.en-us.salesforce_sharing_cheatsheet.meta/salesforce_sharing_cheatsheet/sharing_cheatsheet.htm) ·
  [Trailhead: control access to records](https://trailhead.salesforce.com/content/learn/modules/data_security/data_security_records)
- folk: [Groups (private / shared / shared with everyone)](https://developer.folk.app/core-concepts/groups) ·
  [Invite your teammates](https://help.folk.app/en/articles/4970711-invite-your-teammates)
- Clay: [Reusing saved enrichment data (no credits for reused values)](https://university.clay.com/docs/reusing-saved-enrichment-data) ·
  [Credit usage](https://university.clay.com/docs/credit-usage) ·
  [Community: credits attributed to table owner](https://community.clay.com/x/support/985m65d8erup/understanding-credit-tracking-in-clay-workbooks) (community post, unofficial)
