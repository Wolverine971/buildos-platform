<!-- docs/architecture/decisions/2026-08-26-document-patch-anchor-contract.md -->

# Document patch and anchor contract

**Date:** 2026-08-26
**Status:** Ratified by DJ 2026-08-26 (including the proposal-review-always product call)
**Deciders:** DJ (product threshold); document-service implementation owner (technical contract)
**Related:**

- [Document-service Step 1.5 handoff](../../../apps/web/docs/features/document-service/STEP_1_5_STRUCTURAL_HANDOFF_2026-08-26.md)
- [Document-service roadmap](../../../apps/web/docs/features/document-service/SWITCHING_BAR_AND_REVISED_ROADMAP_2026-08-26.md)
- [Original document-service vision](../../../apps/web/docs/features/document-service/ORIGINAL_VISION_AND_SYSTEM_DESIGN_2026-08-26.md)
- [Project Knowledge Layer design](../../../apps/web/docs/technical/architecture/PROJECT_KNOWLEDGE_LAYER_DESIGN_2026-06-16.md)

## Context

The signature document interaction is select → speak or type an instruction → review an anchored
diff → apply → revision. A proposal can remain open while the user continues editing the document,
so it needs to distinguish an unrelated edit elsewhere from a change to the passage it intends to
replace.

`onto_documents.updated_at` cannot provide that distinction. The editor autosaves after a two-second
debounce, and every content save advances the timestamp. A whole-document timestamp guard would
therefore invalidate proposals during ordinary typing even when the selected passage is untouched.
The guard remains necessary at the final write boundary, but it is not the proposal's semantic base.

The existing `outline.content_hash` is not sufficient either. `outline` is explicitly a best-effort,
recomputable cache; it may be null or stale. The repository already has useful primitives to build
on:

- `hashDocumentContent()` computes SHA-256 over exact raw Markdown and treats null as an empty
  string.
- `extractOutline()` derives GFM heading ids, heading text, hierarchy, and JavaScript string offsets
  from live content.
- `document-diff.ts` renders line and word differences, but is a presentation utility rather than a
  safe apply format.
- the Step 1.5 WS-1 guarded write performs the final compare-and-swap and awaited version write.
- managed-region helpers provide a separate mutation path for fenced, agent-owned Markdown blocks.

The contract must preserve portable Markdown. It must not turn the document into a hidden block
model or round-trip user content through a Markdown AST serializer.

## Decision

### 1. Use a versioned, hybrid anchored-text patch

The persisted proposal payload is `DocumentPatchV1`. It contains one or more exact text-range
replacements plus structural and textual anchors:

```ts
type DocumentPatchV1 = {
	schema_version: 1;
	project_id: string;
	document_id: string;
	base_content_hash: string;
	operations: DocumentPatchOperationV1[];
	patch_hash: string;
};

type HeadingPathSegmentV1 = {
	level: 1 | 2 | 3 | 4 | 5 | 6;
	text: string;
	slug: string;
	sibling_ordinal: number;
};

type DocumentPatchAnchorV1 = {
	heading_path: HeadingPathSegmentV1[];
	base_range: { from: number; to: number };
	section_range: { from: number; to: number };
	before_markdown: string;
	before_hash: string;
	prefix: string;
	suffix: string;
};

type DocumentPatchOperationV1 = {
	op_id: string;
	kind: 'replace_range';
	anchor: DocumentPatchAnchorV1;
	replacement_markdown: string;
};
```

`replace_range` also represents insertion (`before_markdown === ''`) and deletion
(`replacement_markdown === ''`). `heading_path: []` means the document root or pre-heading preamble.

The two ranges are offsets in UTF-16 code units, matching JavaScript string slicing and CodeMirror
positions. `base_range` is document-relative; `section_range` is relative to the anchored section.
They are fast-path hints, never sufficient identity on their own.

`prefix` and `suffix` contain up to 256 UTF-16 code units immediately adjacent to the replaced
range. They remain exact raw Markdown: no trimming, newline conversion, Unicode normalization, or
rendered-text conversion. The bounded size is enough to disambiguate ordinary repeated passages
without making every proposal carry the surrounding document.

The heading path is derived from a fresh parse of the proposal base. Each segment includes the
heading level, plain text, current GFM slug, and zero-based ordinal among same-text sibling headings.
The slug helps with the common path; text, level, hierarchy, and ordinal prevent a slug alone from
being treated as durable identity. All of these remain anchors, not permanent block ids.

### 2. Hash exact raw Markdown with SHA-256

All hashes are lowercase hexadecimal SHA-256 values over UTF-8 bytes:

- `base_content_hash` hashes the complete base Markdown. Null content is the empty string, matching
  `hashDocumentContent()`.
- `before_hash` hashes `before_markdown`.
- `patch_hash` hashes canonical JSON containing `schema_version`, `project_id`, `document_id`,
  `base_content_hash`, and `operations`. Object keys are sorted recursively; array order is
  preserved; `patch_hash` itself is excluded.

The patch hash binds the exact payload the user reviewed to the payload sent for apply. It is an
integrity and concurrency token, not a signature or authorization mechanism.

### 3. Add a first-class generated `content_hash` to the document head

Add `onto_documents.content_hash` as a stored generated column over `coalesce(content, '')`, using
the database's `pgcrypto` SHA-256 implementation and lowercase hex encoding. It is a fast path:
when the current head hash equals `base_content_hash`, apply can verify the stored ranges directly
without re-anchoring.

The column is generated rather than written by application mutation paths. BuildOS currently has
more than one writer, and restore, maintenance, direct SQL, or a future importer must not be able to
forget the hash. The existing hash inside `outline` remains useful for detecting a stale outline,
but it is not proposal authority.

The migration must verify that `pgcrypto` is installed in the expected schema before using a
schema-qualified `digest` call. Supabase's current migrations use `extensions.digest`, while the
base ontology migration originally created the extension without an explicit schema. After the
migration, generated database types must expose `content_hash` as readable but not insertable or
updatable. No index is added initially because apply already reads the document by primary key and
compares the hash from that row.

PostgreSQL requires generated-column expressions to use immutable functions and computes a stored
generated column on writes. The migration must prove the exact expression on the target PostgreSQL
version before it lands; see the official
[generated columns](https://www.postgresql.org/docs/current/ddl-generated-columns.html) and
[pgcrypto](https://www.postgresql.org/docs/current/pgcrypto.html) documentation.

### 4. Revalidate locally, then re-anchor deterministically

Apply reads the live document head and validates the patch hash before considering any operation.

If `current.content_hash === base_content_hash`:

1. verify every range is in bounds;
2. verify `content.slice(from, to) === before_markdown` and its SHA-256 equals `before_hash`;
3. verify operations do not overlap; and
4. apply all replacements from the highest offset to the lowest.

If the whole-document hash differs, resolve each operation against a fresh parse of the current
Markdown. Do not trust the stored outline cache or its old offsets.

For a non-empty replacement target:

1. Resolve the exact heading hierarchy by level, text, and sibling ordinal, using the slug as a
   corroborating hint rather than sole identity.
2. If the original document range still falls inside that section, still contains
   `before_markdown`, and exactly matches every non-empty stored context window, accept it.
3. Otherwise enumerate exact occurrences of `before_markdown` in the resolved section. Accept a
   sole occurrence. If there are multiple occurrences, accept only one candidate that exactly
   matches every non-empty stored prefix and suffix window.
4. If the heading path no longer resolves, search the whole document only when exactly one
   occurrence matches `before_markdown` and every non-empty context window. This handles a moved or
   renamed heading without guessing.

For an insertion, `before_markdown` is empty and cannot identify a position. Resolve the heading
path and require exactly one boundary where both non-empty context windows match. An insertion with
no usable adjacent context is not auto-applicable.

There is no fuzzy text matching, semantic similarity, or model-assisted apply fallback in v1. If
the selected text changed, the anchor is absent, or more than one candidate remains, the proposal
conflicts and must be regenerated. Re-anchoring is for untouched text that moved around unrelated
edits; it is not a three-way merge.

### 5. Apply a multi-operation proposal atomically at the head-write boundary

All operations are resolved before any mutation. They must target the same document, have unique
`op_id` values, remain non-overlapping after re-anchoring, and pass managed-region checks. A failure
in any operation rejects the entire patch; partial document proposals are not applied.

After producing the next complete Markdown value, apply calls the WS-1 guarded document-write
helper with the `updated_at` read during revalidation and requests an explicit version boundary.
If that compare-and-swap loses, apply may perform one bounded re-read and repeat the complete
revalidation/re-anchor process. A second loss is a conflict. This preserves anchor-local tolerance
without weakening the final lost-update guard.

The existing 60-minute open-version policy remains unchanged. This ADR does not solve the remaining
transactional gap between the head write and its version row; until that work lands, the existing
successful-write-with-visible-`versionWarning` contract still applies.

### 6. Fail closed with stable conflict reasons

The apply service returns HTTP 409 with one stable machine-readable reason when it cannot safely
apply:

- `BASE_TEXT_CHANGED`
- `ANCHOR_NOT_FOUND`
- `ANCHOR_AMBIGUOUS`
- `OVERLAPPING_OPERATIONS`
- `MANAGED_REGION_BOUNDARY`
- `WRITE_RACE`

The UI keeps the reviewed proposal visible and explains that the target section changed while it
was being reviewed. It offers regeneration against the current document; it does not silently
discard, partially apply, or ask the model to improvise a merge.

### 7. Proposal review is the default for model-authored content

No LLM-authored interactive document-content edit in the new Step 2 flow skips proposal review in
v1. **Ratified by DJ 2026-08-26.** A direct-apply threshold may be introduced later, per edit type,
from the conflict/telemetry data this ADR requires — not by pre-deciding now.

Deterministic maintenance of an explicitly agent-owned managed region remains outside this
interactive proposal contract and may continue to apply directly with compare-and-swap. A generic
patch may not touch a managed-region fence or any content inside the region; managed content must
use the existing parse/render/replace helper so the ownership boundary stays intact.

This ratifies managed regions as the mechanism for agent-owned blocks. It does not assign durable
identity to arbitrary human-authored paragraphs or checklist items, and it does not close the
separate Step 5 checklist-identity decision.

Existing agent write APIs are a compatibility surface, not evidence that future interactive edits
may bypass review. Migrating or restricting those callers is Step 2 rollout work and must be
measured separately rather than changed by this ADR alone.

## Consequences

### Positive

- Unrelated autosaves no longer invalidate a proposal solely because `updated_at` changed.
- The fast path is one document read and exact range validation; re-anchoring is paid only when
  content changed.
- Exact Markdown survives proposal creation and apply without AST serialization drift.
- The user approves one hash-bound payload, and multi-operation patches are all-or-nothing.
- Generated head hashes cannot drift when a less-common writer bypasses an application helper.
- Conflicts are conservative and explainable rather than model-dependent.

### Negative

- A generated SHA-256 adds computation to every content write, although no extra application round
  trip is required.
- Some safe-looking edits will still conflict when headings or nearby repeated passages are changed
  enough to make identity ambiguous.
- Exact anchors do not survive a rewrite of the selected passage; v1 intentionally regenerates the
  proposal instead of attempting a semantic merge.
- Offset and context semantics must be identical across proposal creation, apply, and tests,
  especially around Unicode and line endings.
- This contract does not provide stable block identity for comments, collaboration, or checklist
  items.

## Alternatives considered

1. **Use `updated_at` or the whole-document hash as the only proposal base.** Rejected because an
   unrelated autosave would conflict with every open proposal.
2. **Use unified diffs as the apply format.** Rejected because line-oriented hunks are useful for
   display but brittle around small Markdown movement and duplicate lines.
3. **Patch a parsed Markdown AST.** Rejected for v1 because serializer round-trips can rewrite
   formatting the user did not select. It also creates hidden block semantics before the product
   needs them.
4. **Write `content_hash` in every mutation service.** Rejected because correctness would depend on
   every current and future writer remembering a derived field.
5. **Fuzzy or semantic re-anchoring.** Rejected because an apply path must be deterministic and
   auditable. The model may generate a fresh proposal, but it may not reinterpret an approved one.
6. **Assign permanent IDs to every Markdown block.** Rejected because it compromises portability
   and expands Step 2 into a block-editor migration.

## Implementation boundaries

After ratification, implementation should proceed in this order:

1. Add the generated head `content_hash`, verify it materializes for existing rows, regenerate
   database types, and prove JS/SQL hash parity with Unicode, CRLF, empty, and large Markdown
   fixtures.
2. Add shared pure functions for canonical patch hashing, anchor capture, re-anchor resolution,
   overlap detection, and descending-offset application. Test them without a database first.
3. Persist the immutable proposal payload and the hash shown during review.
4. Build the apply service on the WS-1 guarded write and version boundary.
5. Reuse `document-diff.ts` for the visual review while keeping the persisted patch independent of
   that renderer.
6. Add telemetry for fast-path applies, successful re-anchors, conflicts by reason, and regeneration.

The ADR does not choose the proposal table shape, agent prompt, UI component boundary, or realtime
transport. Those are Step 2 and WS-3 implementation decisions once this contract is ratified.

## Verification requirements

- Applying against an unchanged head uses the original range and produces the expected Markdown.
- An unrelated edit before or after the selected passage re-anchors and applies successfully.
- A moved section with unchanged target text and exact context re-anchors successfully.
- Changed selected text, duplicate ambiguous text, and a deleted heading produce stable conflicts.
- Insertions require a unique exact boundary.
- Multiple replacements apply in descending order and cannot overlap or partially succeed.
- Any touch of a managed region through the generic patch path is rejected.
- A compare-and-swap loss retries revalidation once and then fails closed.
- Canonical patch hashes and content hashes match in browser, server, and PostgreSQL fixtures.
- Review approval of one `patch_hash` cannot apply a mutated payload.

## Ratification point

DJ was asked to ratify or override one product call before Step 2 implementation: **no
LLM-authored interactive content edit skips proposal review in v1.** The remaining choices in this
ADR are technical contract decisions delegated by the document-service roadmap.

**Ratified by DJ 2026-08-26.** This ADR is now the governing contract for Step 2; WS-3 (per-turn
document mutation events) is the remaining Step 1.5 prerequisite before Step 2 code begins.
