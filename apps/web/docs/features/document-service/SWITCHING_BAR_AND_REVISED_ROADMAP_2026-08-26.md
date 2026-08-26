<!-- apps/web/docs/features/document-service/SWITCHING_BAR_AND_REVISED_ROADMAP_2026-08-26.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-26 as the design review of, and revision to,
> [`ORIGINAL_VISION_AND_SYSTEM_DESIGN_2026-08-26.md`](./ORIGINAL_VISION_AND_SYSTEM_DESIGN_2026-08-26.md).
> It records a founder decision, the production evidence behind it, and a scoped roadmap.
> Verify implementation claims against code before relying on them.

# Document Service: The Switching Bar and Revised Roadmap

**Status:** Direction ratified by DJ 2026-08-26. Scope revised. **P0 trust fix and Step 1.5 WS-1
implemented 2026-08-26; WS-2 ADR proposed for DJ ratification** (§5, §8.1); WS-3 follows.
**Supersedes:** the workstream list and phase sequence in §11–§12 of the original vision doc.
**Preserves:** the domain model (§4), relationship authorities (§5), risks (§15), and non-goals (§17)
of the original vision doc, which remain correct.

**Founder decisions, 2026-08-26:**

| Decision                | Call                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Sealed revisions (§5.3) | **Option A** — coalescing kept; the open window shows as in-progress, not as a numbered revision |
| Import (§7)             | **Wanted, but sequenced last** — "an amazing piece to work on at the end"                        |
| Realtime coediting (§4) | **Restored, positioned last** — base version first, better version later                         |
| User interviews         | **No** — replaced by the self-migration eval in §9                                               |

---

## 1. What changed, and why

The original vision doc proposed eight workstreams and six phases toward "a better alternative to
Google Drive and Google Docs." A design review on 2026-08-26 queried production and found that
BuildOS users create almost no documents (evidence in §10). The review's first recommendation was
to narrow the effort to the one document type that is actually load-bearing.

The founder rejected the narrowing on three grounds, and **two and a half of them hold**:

**1. Absence of usage is ambiguous evidence.** _(Conceded.)_ The review read "users create ~12
documents" as absence of demand. It is equally consistent with absence of capability — people
looked at the document surface, did not trust it with real work, and kept that work in Drive. The
data cannot distinguish these. The review overstated its case.

**2. Document trust is table stakes, not a wedge.** _(Half conceded — and the half that stands
changes what to build.)_ Parity with Drive removes an objection; it does not create pull. Nobody
switches products because the new one's editor is as good as the old one's. But people absolutely
_refuse_ to switch when it isn't. That makes this de-risking work, not acquisition work — which
means it should be built to a **finishable floor**, cheaply, and the surplus spent on the layer
Drive structurally cannot match. Hence the Switching Bar in §3.

**3. Project-first hierarchy beats document-first.** _(Fully conceded; this is the strongest
argument and the review under-weighted it.)_ Google Drive is a filesystem cosplaying as meaning.
A folder is a string; the only relationship a document has is its path. A BuildOS document belongs
to a project, and that project has goals, plans, tasks, milestones, state, and activity. The
document is _situated_. Drive cannot follow — not because Google is bad at this, but because Drive
has no ontology to hang it on. This is not competing on Drive's terms; it is a different sport
played with a similar-looking ball.

**4. START HERE is the missing README.** _(Agreed and extended.)_ Every code repository has a
README; every Drive folder has nothing. There is no artifact in Drive that answers "what is in
here, what is current, what is stale, what is missing." BuildOS can maintain that automatically.
This merges the founder's document-management ambition with the ontology advantage, and it is the
centerpiece of the differentiated layer.

**Founder decision on validation:** no user interviews. BuildOS has ~4 consistently active users
besides DJ; interviews would produce noise. §9 specifies the substitute — a falsifiable
self-migration eval that DJ can run alone.

### 1.1 The thesis, restated

> **Google Drive stores your files. BuildOS knows what they are for.**

Not a better Drive. A **project drive**: documents that live inside real project structure, indexed
by an agent that keeps the index true, editable by voice or conversation, and safe enough to hold
work you cannot afford to lose.

Parity is the floor. The ontology is the product.

---

## 2. What the review got wrong, kept, and still disputes

| Review claim                                          | Verdict                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Users create no documents, so demand is absent        | **Wrong** — evidence is ambiguous; capability gap is an equally good explanation |
| Narrow the effort to the START HERE document only     | **Wrong** — too narrow; START HERE is the centerpiece, not the whole scope       |
| Project-first hierarchy is a "reframe"                | **Understated** — it is the thesis                                               |
| Trust kernel is a bug fix, not a workstream           | **Kept** — see §5                                                                |
| Sequencing is inverted (§12 vs §13)                   | **Kept** — visible slice leads                                                   |
| Managed regions already solve open decision #4        | **Kept** — see §6                                                                |
| Realtime coediting (Workstream F) should be deleted   | **Overruled by DJ** — restored as Step 7; see §4                                 |
| "Better than Google Drive" is unfinishable as written | **Still asserted; §3 is the fix**                                                |

---

## 3. The Switching Bar

"Better than Google Drive" cannot be built, because it cannot be finished. Drive is twenty years of
surface area, and DJ-hours are the binding constraint against a Feb 2027 revenue gate. The ambition
survives only if it is converted into a closed list that can be ticked.

**The Switching Bar is the complete definition of done for parity.** When Tier 0–2 are green, the
parity work is over and everything after it is differentiation. Nothing gets added to Tier 0–2
without something being removed.

### Tier 0 — Trust: nothing you write is ever lost

| #   | Item                                                         | State                                                                      |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 0.1 | Version creation is atomic with the document write           | ⚠️ blocking + visibly warned; transactional coupling still owed — §5       |
| 0.2 | Unique constraint on `(document_id, number)`                 | ✅ present since base ontology migration; collision retry added 2026-08-26 |
| 0.3 | Sealed revisions are immutable once shown in history         | ✅ **Option A shipped 2026-08-26**                                         |
| 0.4 | Restore always succeeds and is itself a revision             | ⚠️ exists; needs test coverage                                             |
| 0.5 | Concurrent-write conflict is detected, never silently lost   | ✅ compare-and-swap on `updated_at`                                        |
| 0.6 | Autosave is durable and visibly distinct from "save version" | ⚠️ works; labelling is misleading                                          |

### Tier 1 — Get in and get out

| #   | Item                                                   | State                                 |
| --- | ------------------------------------------------------ | ------------------------------------- |
| 1.1 | Import a single `.md` / `.txt` / `.docx` as a document | ❌ **no import path exists** — see §7 |
| 1.2 | Bulk import: multi-file or folder drop into a project  | ❌ none                               |
| 1.3 | Paste a Google Doc's contents and keep its structure   | ❌ none                               |
| 1.4 | Export PDF / DOCX / HTML                               | ✅ shipped                            |
| 1.5 | Bulk export from a project                             | ❌ none                               |
| 1.6 | Every document has a bookmarkable, shareable URL       | ⚠️ query-param deeplink only          |

### Tier 2 — Find and organize

| #   | Item                                          | State                     |
| --- | --------------------------------------------- | ------------------------- |
| 2.1 | Cross-project document search surface         | ⚠️ API supports it; no UI |
| 2.2 | Recent / owned / unfiled / archived views     | ❌ none                   |
| 2.3 | Move, nest, reorder within a project          | ✅ shipped                |
| 2.4 | Bulk move / archive                           | ❌ none                   |
| 2.5 | Rendering parity: tables, code, images, links | ⚠️ needs an audit pass    |
| 2.6 | Usable on mobile                              | ⚠️ needs an audit pass    |

### Tier 3 — Where Drive cannot follow

| #   | Item                                                                    | State                                            |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| 3.1 | START HERE as a maintained index: what is here, current, stale, missing | ⚠️ managed regions shipped; index content is not |
| 3.2 | Documents situated in the ontology (project, tasks, goals, activity)    | ⚠️ edges exist; authoring loop incomplete        |
| 3.3 | Select → speak or type → anchored proposal diff → apply → revision      | ❌ the signature interaction                     |
| 3.4 | Agent keeps index and managed regions current as work happens           | ⚠️ partial                                       |
| 3.5 | Checklist progress derived from the body, promotable to tasks           | ❌ none                                          |
| 3.6 | Live multi-person editing over the project ontology                     | ❌ Step 7 — see §4                               |

**Count: 24 items. Current audited state: 6 shipped, 9 partial, 9 absent.** That is the real size of
the effort — and it is finishable, which "better than Google Drive" is not.

---

## 4. Deferral list

Nothing is deleted. Everything below is sequenced after the foundation, per the founder's
"lay the structure, then add rounds" direction.

### Last, not cut: Workstream F — realtime collaboration and CRDT

The review recommended deleting this. **The founder overruled it**, on the grounds that live
multi-person editing is where BuildOS becomes materially better than the alternatives, and that a
base version now can be improved later. Ratified: it stays on the roadmap, positioned last, as
Step 7.

Two things worth carrying into that work when it starts:

**One sharpening.** Realtime multiplayer is not unclaimed ground — Google Docs, Notion, Figma, and
Linear all ship it. What is genuinely unclaimed is **multiplayer over a project ontology with agent
proposals in the same document**: two people and an agent working a document that knows which tasks
and goals it belongs to. That is the version worth building, and it is only reachable after Steps
1–5 exist. Building generic multiplayer first would be the boxing match; building it _last_, on top
of the ontology, is not.

**One sequencing constraint, from the original vision doc §15.4 — which still governs.** A CRDT
solves concurrent text operations. It does not produce meaningful history, provenance, or
business-level conflict handling. If it lands before revision semantics are trustworthy, it makes
the trust problem harder, not easier. Step 1 (now complete) was the prerequisite; Steps 2–5 are the
rest of it.

**Scoping a base version, when it comes up.** "Presence and cursors" is a much smaller job than
"merged keystrokes with offline reconciliation." A useful base version is: presence indicators, a
soft lock or section-level claim, and live refresh on the other person's committed change — no
CRDT at all. That delivers most of the felt benefit for two people in a document and defers the
genuinely hard part. Worth a prototype spike before committing to a CRDT provider.

Retained and already shipped: compare-and-swap conflict detection, which is what actually prevents
lost work today and remains correct under any collaboration model.

### Folded in, not deferred: Workstream D — document library

The original doc treated this as a standalone sub-application. It is now Tier 2 items 2.1–2.4,
built on search that already supports cross-project queries. Smaller and earlier.

### 4.1 Parked — what these actually are, in plain terms

Several items carried over from the original vision doc are real but were never explained in terms
of what problem they solve for a user. They are parked here **with their purpose written out**, so a
later decision to build or drop them can be made on the merits rather than on whether the name
sounded important.

**Document Librarian** _(original Workstream G)_
An agent that periodically reads your whole document collection and reports what has gone wrong
with it: two documents that say contradictory things, a document nothing links to, a plan with no
supporting doc, a link that now 404s, a checklist that has been half-done for three months.
_Why you'd want it:_ collections rot silently, and nobody ever schedules time to audit them.
_Why it's parked:_ it needs a corpus to audit. Revisit after §9's migration eval produces one.

**Anchored comments and suggestions**
A comment attached to a specific sentence rather than to the document as a whole — the Google Docs
margin-comment behaviour, including "suggest this edit" that someone else accepts or rejects.
_Why you'd want it:_ it is how review actually happens when more than one person is involved.
_Why it's parked:_ one comment exists in the entire production database, and it pairs naturally
with Step 7 collaboration rather than standing alone.

**Derived projections** _(original vision §4.5)_
Recomputable indexes extracted from the Markdown body — the outline, the checklist and its
progress, which entities the document references, which external URLs it cites, which questions it
raises. The document text stays the single source of truth; these are caches over it, each stamped
with a content hash so a stale one is detectable.
_Why you'd want it:_ it is what lets BuildOS say "5 of 8 complete" or "this doc references 3 tasks"
without you maintaining that by hand, and what lets an agent read one section instead of the whole
file. _Status:_ the outline projection already ships. The rest arrive with Steps 4 and 6 — this is
infrastructure for those, not a separate effort.

**Edit sessions and change events** _(original vision §4.2, §4.4)_
Two record types beneath version history. An _edit session_ groups a burst of related activity
("DJ edited this for 20 minutes"); a _change event_ is the fine-grained append-only log ("title
changed", "agent proposal applied", "restored v4") that is too noisy to show as version history but
is what you need when reconstructing what happened.
_Why you'd want it:_ today, history can tell you a document changed but not the story of how.
_Why it's parked:_ the P0 fix in §5 addressed the part that was actually losing data. The rest is
the full mutation service, worth building when a second write path needs it.

**`DocumentWorkspace` extraction** _(original Workstream C)_
`DocumentModal.svelte` is 4,479 lines and owns most of the document lifecycle. This is the
refactor that pulls a reusable workspace shell out of it.
_Why you'd want it:_ every new document feature currently means another branch in that file.
_Why it's parked:_ refactors are best done under the pressure of a specific feature. Step 3 (the
proposal interaction) is the natural forcing function — do it then, not before.

### 4.2 Promoted, then re-sequenced late: Workstream H interchange

Import was raised to Tier 1 by this review because you cannot switch into a system you cannot move
into. **The founder chose to sequence it last anyway** (§8, Step 6). §7 records the finding and
§8.2 records the consequence for the §9 eval.

---

## 5. P0: the trust fix — IMPLEMENTED 2026-08-26

Ratified as a bug fix, not a workstream. One verified write-path defect, one version-allocation
hardening, and one product decision are now addressed. The base schema already had the canonical
version-number uniqueness constraint; there is no new index prerequisite to deploy.

**What shipped:**

| Change                                                                           | File                                                                                   |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Existing `unique (document_id, number)` constraint verified                      | `supabase/migrations/20250601000001_ontology_system.sql:303–312`                       |
| Redundant audit index removed (no net schema change)                             | `supabase/migrations/20260826190000_drop_duplicate_document_version_index.sql`         |
| Retry on version-number collision, bounded at 5 attempts                         | `packages/shared-agent-ops/src/ontology/versioning.service.ts`                         |
| `isVersionWindowOpen()` helper                                                   | same file                                                                              |
| Version write moved out of background work; failure returned as `versionWarning` | `apps/web/src/routes/api/onto/documents/[id]/+server.ts`                               |
| Same warning on document create                                                  | `apps/web/src/routes/api/onto/documents/create/+server.ts`                             |
| Same warning on task-scoped create and visible editor toast                      | `apps/web/src/routes/api/onto/tasks/[id]/documents/+server.ts`, `DocumentModal.svelte` |
| `is_open` on the versions listing                                                | `apps/web/src/routes/api/onto/documents/[id]/versions/+server.ts`                      |
| Open window renders as "Now / Editing now — not yet sealed"                      | `apps/web/src/lib/components/ontology/DocumentVersionHistoryPanel.svelte`              |
| Coverage for collision retry, bounded give-up, and window sealing                | `packages/shared-agent-ops/src/ontology/versioning.service.test.ts`                    |

**Deploy note:** the retry path depends on uniqueness, but production already has that guarantee
through the table constraint in the base ontology migration. `20260826150000` created a redundant
standalone index because the audit checked by the wrong object name; `20260826190000` removes the
duplicate while retaining the constraint and its backing index.

**Not yet done — the remaining half of 0.1.** True transactional atomicity between the head write
and the version write still does not exist. The head commits first, so a version failure cannot be
rolled back; a warning is now returned to the caller and visibly surfaced by the editor. The
underlying transactional coupling remains. Closing atomicity properly means a Postgres function
that performs both writes in one transaction, which is the mutation service in original vision
§6.3.

The original analysis of all three defects follows.

### 5.1 Version creation is fire-and-forget

`apps/web/src/routes/api/onto/documents/[id]/+server.ts:674` wraps version creation in a
`postSaveWork()` closure, which line 803 fires as `postSaveWork().catch(...)` — **not awaited.** The
HTTP response returns to the client before versioning has run, and the inner
`createOrMergeDocumentVersion(...)` carries its own `.catch()` on top of that. If either throws, the
edit is durable and its history entry silently never existed. History is presented to the user as a
guarantee; it is currently best-effort background work that the request does not even wait for.

The create route at `apps/web/src/routes/api/onto/documents/create/+server.ts:243` has the same
shape — awaited, but inside a `try/catch` that logs and continues.

**Fix:** move head update and version insert into one mutation boundary so a version failure fails
the write. This is §6.3 of the original vision doc, applied to two call sites rather than built as
an architecture program.

### 5.2 Version-number allocation could race even though uniqueness existed

`packages/shared-agent-ops/src/ontology/versioning.service.ts:225` computes
`nextNumber = (latestVersionRow?.number ?? 0) + 1` by reading the latest row, then inserting.
Two concurrent writes can read the same latest number and attempt to insert the same next number.
The original audit missed the table-level `unique (document_id, number)` at
`supabase/migrations/20250601000001_ontology_system.sql:312`, so duplicate rows were already
prevented. The real missing behavior was retrying the losing insert instead of failing it.

**Fix:** retain the existing constraint and retry a bounded number of times on SQLSTATE `23505`.

**Pre-flight already run (2026-08-26):** 423 version rows in production, **0 duplicate
`(document_id, number)` pairs**, consistent with the existing constraint.

### 5.3 Sealed revisions are not sealed — resolved as Option A

The merge path (`versioning.service.ts:185–222`) `UPDATE`s the newest version row in place when the
same actor edits within the 60-minute window. A version the history UI has already displayed can
change underneath the user. This was open decision §14.1 of the original doc, and a **product**
call rather than a bug.

- **Option A — keep coalescing, label the open window.** History still shows every row, but the one
  still absorbing edits is presented as in-progress rather than as a sealed numbered revision.
- **Option B — seal on every meaningful boundary.** No mutation ever; more rows, more history noise
  at 738-character median document length.

**Decision: Option A** (DJ, 2026-08-26).

Implemented as: `isVersionWindowOpen()` in the versioning service, `is_open` on the versions
listing (computed only for the newest row, and only when the listing is not paginated — a
later page can never contain the open version), and a history row that renders `Now` with an
"Editing now — not yet sealed" chip instead of `v7`.

The user-facing promise this creates: **every numbered version in history is final and will not
change under you.** Anything still moving is visibly labelled as such.

---

## 6. Already solved — stop re-deciding these

The original doc's audit missed two shipped primitives, and lists both as open decisions.

### 6.1 Managed regions solve agent-owned block identity, not every checklist identity

`packages/shared-agent-ops/src/ontology/start-here.ts` already defines
agent-owned regions inside otherwise human-owned Markdown, fenced by HTML comments:

```text
<!-- managed:status v=1 -->
…agent-owned content…
<!-- /managed:status -->
```

It ships with a version field for migration, a parse/render/replace helper set
(`renderStartHereManagedRegion`, `insertManagedRegion`, `managedRegionRegex`), logic that treats a
fence as terminating an authored section, and tests in `start-here.test.ts`.

In plain terms: **you already invented the mechanism for "an agent owns this block, the human owns
the rest, and the file is still portable Markdown."** Reuse it for indexes and other agent-owned
projections, and ratify that boundary in an ADR. It does **not** by itself give every freely edited
Markdown checkbox a durable item ID. Stable checklist-item identity remains a Step 5 design choice.

### 6.2 The entity-reference parser exists but never reached documents

`apps/web/src/lib/utils/entity-reference-parser.ts` (mirrored in
`packages/shared-agent-ops/src/utils/entity-reference-parser.ts`) parses the
`[[entity_type:entity_id|display text]]` syntax and is wired into next-step display, the project
edit modal, and comment mentions — but **not** into the document renderer.

Zero of 560 production documents use the syntax. The original doc reads this as "the loop is
incomplete." The sharper reading: the syntax has had zero adoption everywhere it _is_ wired, which
is evidence that hand-typed reference syntax is the wrong authoring affordance. Tier 3.2 should
lead with the `@`-picker, not with the syntax.

---

## 7. The gap the original plan buries: there is no import

**This is the highest-value finding of this review, and it exists because the founder's thesis is
right.** If the goal is that people work in BuildOS instead of Drive, the very first thing they must
be able to do is bring their documents in.

There is **no document import path anywhere in the codebase.** Verified: no `.md`, `.docx`, or
plain-text ingestion route exists under `apps/web/src/routes/api/onto/`. Contacts have a complete
one — `apps/web/src/routes/api/profile/contacts/import/preview/+server.ts` and `.../commit/+server.ts`,
with a preview-then-commit shape worth copying. Documents have nothing.

The original vision doc addresses this in one line, in Workstream H, at position 8 of 8:
"Define Markdown and external-document import behavior."

**You cannot switch to a document system you cannot move into.** Under the ratified thesis, import
is not workstream eight. It is Tier 1, and it comes immediately after the trust fix.

Adjacent capability already shipped that shortens this: `apps/web/src/routes/api/onto/assets/` with
an OCR route at `.../[id]/ocr` already ingests files and extracts text. Import is not greenfield.

**Deliberately out of scope for now:** a Google Drive OAuth integration. No Drive scopes exist in
the codebase today, and adding an OAuth surface is a much larger commitment than file import. Start
with drag-and-drop files and paste; add Drive sync only if the eval in §9 shows file import is the
blocker.

---

## 8. Revised sequence

Founder direction: _"lay the structure for this and get it working really well, then add these
other rounds of things to make it way better."_ The sequence below reflects that — foundation
first, then rounds — with import and collaboration as the final two rounds per §1's decisions.

**Step 1 — Trust fix (P0). ✅ Done 2026-08-26.** Tier 0.1–0.3. No new uniqueness prerequisite;
the base constraint was verified and the redundant audit index is removed by the cleanup migration.

**Step 1.5 — Structural prerequisites. 🔄 WS-1 complete; WS-2 proposed; WS-3 remains.** Three things
Step 2 cannot be built on top of, one of which was a live bug. Specified in full in
[`STEP_1_5_STRUCTURAL_HANDOFF_2026-08-26.md`](./STEP_1_5_STRUCTURAL_HANDOFF_2026-08-26.md);
summarised in §8.1 below. 2–4 days.

**Step 2 — The signature interaction.** Tier 3.3: select → speak or type → anchored proposal diff →
apply → revision. This is §13 of the original doc, unchanged, and the first slice a stranger can be
shown. It exercises anchors, bounded agent context, proposal-first mutation, conflict-aware apply,
and revision boundaries — the highest-risk seams — while being visible. Natural moment to do the
`DocumentWorkspace` extraction (§4.1), under the pressure of a real feature.

**Step 3 — START HERE as a live index.** Tier 3.1 and 3.4, built on the managed regions from §6.1.
The README that Drive does not have.

**Step 4 — Find and organize.** Tier 2. Cross-project search surface, the standard views, bulk
actions, plus the rendering and mobile audits.

**Step 5 — Situate documents in the ontology.** Tier 3.2 and 3.5: the `@`-picker, chip rendering,
checklist projection, promote-to-task.

**Step 6 — Import.** Tier 1.1–1.3, modelled on the contacts preview/commit route. Sequenced here by
founder decision; see §8.2 for what that costs.

**Step 7 — Realtime collaboration.** Presence and section claims first; CRDT only if the base
version proves insufficient. See §4 for scoping.

Step 1 was the prerequisite for all of it. Steps 2–3 are the differentiated product and the part
worth showing people.

### 8.1 Step 1.5 — why it exists

A code audit on 2026-08-26 found three structural facts that Step 2 cannot be built on. Full
implementation spec: [`STEP_1_5_STRUCTURAL_HANDOFF_2026-08-26.md`](./STEP_1_5_STRUCTURAL_HANDOFF_2026-08-26.md).

**WS-1 — Two write paths, one unsafe. ✅ Fixed 2026-08-26.** Document content was written by two
paths. The editor and the _web_ chat go through `/api/onto/documents/[id]`, which compare-and-swaps
on `updated_at`. The **worker chat**, external agent calls, and agent runs go through
`runGatewayWriteOp` → `op-execution-gateway.core.ts:799`, which does `.update(…).eq('id', …)` with
**no concurrency guard** — an agent write silently overwrites whatever the user typed since the
agent read the document. Step 2's "revalidate the base, then apply" needs one kernel; there are
previously two, and one had no concept of a base. Both now use the shared guarded head + version
helper; content-only append/merge conflicts re-read and re-derive once, while unsafe replace or
metadata retries are rejected.

The fix is small: the gateway already read-modify-writes and already has `existingDocument.updated_at`
in hand at the write site — it just never uses it as a guard.

**WS-2 — A proposal has no stable base. 🟡 ADR proposed 2026-08-26.** `onto_documents` has no `head_revision_id` and no
`content_hash`; the only token is `updated_at`, which autosave bumps every ~2s of typing. A proposal
reviewed for thirty seconds would be invalidated by the user's own keystrokes in an unrelated
paragraph. Whole-document CAS is right for WS-1 and wrong here — proposals need anchor-local hashes.
The proposed
[`document patch and anchor contract`](../../../../../docs/architecture/decisions/2026-08-26-document-patch-anchor-contract.md)
chooses hybrid exact-text patches, deterministic local re-anchoring, a generated head content hash,
and proposal-first interactive edits. It awaits DJ ratification before Step 2 code begins.

**WS-3 — No per-turn document event.** `DocumentInteractDock` only fires `onClose(summary)`, and
the `projectDataMutations` store is explicitly session-close-scoped and coarse. Step 2's "watch it
land without losing your place" needs per-turn, document-scoped events. Additive — the per-tool
tracking it needs already exists in `agent-chat-tool-presenter.ts`.

**Not blockers, confirmed present:** the CodeMirror decoration precedent (`voice-widget.ts`), the
diff renderer (`document-diff.ts`), and a review/apply pipeline to borrow from (`proposal-context/`).
The `DocumentWorkspace` extraction is explicitly _not_ a prerequisite — do it under the pressure of
Step 2.

### 8.2 Consequence of sequencing import last

The migration eval in §9 is the only planned test of this effort's central hypothesis, and **it
cannot run without import** — there is no way to get a real corpus into BuildOS by hand at any
useful scale. Putting import at Step 6 therefore means no validation gate until Step 6, and the
tripwire in §9.1 has nothing to fire on until then. That is a real cost of the sequencing, recorded
here rather than discovered later.

**Cheap mitigation, if wanted:** Tier 1.3 alone — paste a document's contents and keep its
structure — is a fraction of the full importer and needs no file handling, `.docx` parsing, or bulk
UI. Slotting just that in after Step 2 would restore a lighter version of the eval without moving
the real import work earlier. **Open for DJ; not assumed.**

---

## 9. The eval: migrate DJ's own Drive

No user interviews. The substitute is stronger for this situation, because **DJ is the only person
with a real document corpus** — 359 of the 560 documents in production.

**The gate:** once import exists (Step 6, or the Tier 1.3 paste-path mitigation in §8.2), DJ imports
his actual working Google Drive documents into BuildOS projects and works out of BuildOS for two
weeks.

**Pass conditions:**

1. Every document he tried to bring in arrived intact and legible.
2. He can find a document he did not remember filing.
3. He did not go back to Drive to do a thing BuildOS could not do.
4. He did not lose a change, and history matched what he believed happened.

**Failure is the valuable outcome.** Each break maps to a numbered Switching Bar item, which turns
"is this good enough to switch to" from an opinion into a checklist with a failing row. That is the
same eval discipline already applied to the agentic chat batteries, pointed at a product question.

Record results as a dated evidence doc in this folder.

### 9.1 Tripwire

This effort rests on one untested hypothesis — _people keep documents in Drive because BuildOS is
not trustworthy enough, not because they do not want them here._ It deserves a predefined kill
condition rather than an open-ended commitment.

> **Tripwire:** once import exists and DJ still reaches for Drive over BuildOS in week 3 of the
> migration eval — with no Switching Bar row explaining why — the capability hypothesis is
> falsified. Stop, keep the trust fix and import (both independently useful), and return the
> remaining hours to activation work.

With import at Step 6 (§8.2), this tripwire cannot fire until late, which is precisely the cost that
section records. If the Tier 1.3 paste-path mitigation is taken, the tripwire becomes available
right after Step 2 instead — which is the main argument for doing it.

---

## 10. Evidence: production, 2026-08-26

Queried against production with the service role. Reproduce before trusting; these are point-in-time.

**Corpus**

- 560 documents total. DJ: 359. Agent-seeded ("Historical Examples"): 125. All other humans: 76.
- Of those 76, **64 are auto-generated project-context / START HERE documents.** User-initiated
  documents by non-DJ humans, ever: **12** — two of which are `test` (8 chars) and an empty
  "Reference Photo Notes."
- Median document length 738 characters; 178 of 560 are empty.
- 5 of 76 non-DJ documents were edited more than five minutes after creation.

**The load-bearing document type**

- 138 `document.context.project` documents across 121 projects; **51 were edited after creation** —
  the highest engagement of any document type. This is the START HERE / README artifact.

**Version history**

- 423 versions across 283 documents. **Median 1 version per document.** 13 documents exceed 3.
- 0 duplicate `(document_id, number)` pairs → the unique constraint in §5.2 can be added cleanly.

**Structure and features**

- 18 of 139 projects have any nesting in the document tree.
- 27 of 128 projects hold more than 3 documents; 13 hold more than 10; max is 53 (DJ's).
- 0 documents use `[[entity:id]]` syntax. 18 use checkboxes. 2 contain images. 14 have external links.

**Collaboration**

- 0 projects have more than one actor in `onto_permissions`.
- 3 of 283 versioned documents have more than one distinct version author.
- 1 comment exists in the entire database.

**Activity, last 30 days**

- 36 documents, 62 tasks, 615 chat sessions created. Of those sessions, 422 belong to the e2e test
  harness and 166 to DJ; roughly 11 across 3 other humans.

---

## 11. Decision ledger

Kept current so neither DJ nor an implementing agent has to re-derive open questions from prose.
**DJ decides §11.1 at the point each one is reached — an implementing agent must not settle them
unilaterally.** §11.2 is delegated.

### 11.1 Awaiting DJ

Each row names what happens **if no decision is made**, so work is never blocked waiting on one.

| Decision                                              | Why it matters                                                                                                                                                                                      | Default if unanswered                            | Decide by               |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------- |
| **Is `updateOntoDocument` live in production?**       | Determines whether Step 1.5 WS-1 is an urgent data-loss fix or routine cleanup. Verified in code that the worker path has no concurrency guard; **not** verified whether the capability is enabled. | Treat as urgent and fix first                    | Before starting WS-1    |
| **Gateway unification approach**                      | Route the gateway through a shared guarded-write helper (better architecture, gives Step 2 its apply path) vs. patch CAS into the gateway alone (faster, less invasive).                            | Shared helper, as specified in the handoff doc   | Start of WS-1           |
| **Unguarded PATCH writes**                            | `documents/[id]/+server.ts` currently allows a write when the client sends no `expected_updated_at`. Tightening it is a behavior change with unknown callers.                                       | Keep current permissive behavior; change nothing | During WS-1             |
| **Direct-apply threshold**                            | Which agent edits are unambiguous enough to skip proposal review. Product judgement, not architecture.                                                                                              | Propose nothing — every agent edit is a proposal | WS-2 ADR review         |
| **Tier 1.3 paste-path mitigation**                    | A minimal paste-import after Step 2 would restore the §9 migration eval and the §9.1 tripwire years earlier than Step 6. See §8.2.                                                                  | No — import stays whole at Step 6                | After Step 2            |
| **Full transactional atomicity** (Tier 0.1 remainder) | The Postgres function that makes head + version one transaction. Currently surfaced-not-silent, which removes data loss but not the coupling.                                                       | Defer until a third write path needs it          | When Step 2 apply lands |
| **Realtime base version scope** (Step 7)              | Presence + section claims (small, most of the felt benefit) vs. a real CRDT (large). See §4.                                                                                                        | Prototype presence first, no CRDT commitment     | Start of Step 7         |
| **P0 migration cleanup**                              | Base uniqueness was already present. `20260826190000` removes only the redundant standalone index created by `20260826150000`.                                                                      | No WS-1 prerequisite                             | Closed                  |

### 11.2 Resolved in the proposed WS-2 ADR

The implementing agent resolved these in the proposed
[`document patch and anchor contract`](../../../../../docs/architecture/decisions/2026-08-26-document-patch-anchor-contract.md);
DJ ratifies the ADR rather than each item. See the
[Step 1.5 handoff](./STEP_1_5_STRUCTURAL_HANDOFF_2026-08-26.md) WS-2.

| Decision                            | Proposed resolution                                                   |
| ----------------------------------- | --------------------------------------------------------------------- |
| Anchor format                       | Heading path + UTF-16 range hints + exact text + 256-unit context     |
| Revalidation and re-anchor rule     | Exact deterministic local search; ambiguity or changed text conflicts |
| `content_hash` on the document head | Stored generated SHA-256 column used as the unchanged-head fast path  |
| Patch representation                | Hybrid versioned JSON with anchored exact-text range replacements     |

### 11.3 Closed

| Decision                                | Resolution                                          |
| --------------------------------------- | --------------------------------------------------- |
| Revision boundary / open-window display | **Option A**, decided and shipped 2026-08-26 — §5.3 |
| Entity-reference trigger                | **Closed** — `@`-picker leads, syntax follows, §6.2 |
| Document library scope                  | **Closed** — folded into Tier 2, §4                 |

### 11.4 Deferred with their workstream

| Decision                                          | Waits on                           |
| ------------------------------------------------- | ---------------------------------- |
| Realtime provider / transport                     | Step 7                             |
| Anchored comment survival across rewrites         | Step 7 (paired with collaboration) |
| Import fidelity — what `.docx` structure survives | Step 6                             |
| Task synchronization direction                    | Step 5                             |
| Cross-project reference permissions               | Step 5                             |
| Stable identity for freely edited checklist items | Step 5                             |
| Explicit checkpoint semantics                     | With full atomicity, §11.1         |
| Consolidation semantics                           | With the Librarian, §4.1           |

---

## 12. What has not changed

These sections of the original vision doc remain correct and govern:

- **§4 target domain model** — head, edit session, immutable revision, change event, projections.
- **§5 relationship authorities** — `doc_structure` owns containment; edges own semantics; inline
  references are derived. This separation is right and is what makes §1.1's thesis buildable.
- **§15 risks** — particularly 15.1 (do not turn Markdown into a hidden block editor), 15.3 (never
  stream agent rewrites into an active editor), and 15.6 (stop growing `DocumentModal.svelte`,
  currently 4,479 lines).
- **§17 non-goals** — all still non-goals.

The vision was not wrong. It was unbounded. §3 is the boundary.
