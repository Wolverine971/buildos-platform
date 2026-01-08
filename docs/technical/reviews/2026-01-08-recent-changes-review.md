<!-- docs/technical/reviews/2026-01-08-recent-changes-review.md -->

# Recent Changes Review (2026-01-08)

## Scope

- Git window: most recent commit (b1fb6406).
- Focused on graph reorganization service + API endpoints added in this commit.

## Findings

### Medium

- Document nodes with a semantic connection to another document will have containment edges deleted, because `shouldSkipContainment` only checks for `connection.kind === 'document'` and ignores intent/rel. A semantic-only doc connection triggers containment planning, but `resolveConnections` does not add containment parents for that connection, resulting in an empty desired containment set and deletion of existing `has_part` edges. (`apps/web/src/lib/services/ontology/graph-reorganizer.ts:186`)
- Default `semantic_mode` is `replace_auto`, so reorganizing nodes without providing semantic targets will remove existing auto-managed semantic edges (supports_goal/targets_milestone/references/produces/depends_on). This is easy to trigger when callers only want containment updates and omit semantic connections. Consider defaulting to `preserve` or requiring explicit semantic_mode per request. (`apps/web/src/lib/services/ontology/graph-reorganizer.ts:411`, `apps/web/src/routes/api/onto/projects/[id]/reorganize/+server.ts:89`)
- Connections accept any `rel`/`intent` values without validation or trimming. Mistyped `rel` values are silently ignored, but `replace_auto` still clears existing semantic edges, causing unexpected deletions. Validate `rel` against supported relationship types (and trim) or reject unknown intent strings. (`apps/web/src/routes/api/onto/projects/[id]/reorganize/+server.ts:47`)

### Low

- Edge loading/deletion is keyed only by `src_id`/`dst_id` without filtering by kind. If two entities of different kinds ever share the same UUID, the reorg plan can include and delete edges for the wrong entity. Filtering by `src_kind`/`dst_kind` for the node set would avoid this class of collision. (`apps/web/src/lib/services/ontology/graph-reorganizer.ts:391`, `apps/web/src/lib/services/ontology/graph-reorganizer.ts:418`)
