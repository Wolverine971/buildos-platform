<!-- apps/web/docs/technical/components/hyperplexed/ADMIN_CHAT_TOOL_EVENT_DETAIL_AUDIT_2026-08-03.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-03; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Admin Chat Tool Event Detail — Hyperplexed Audit

> Surface: the expanded tool-call cards inside `/admin/chat/sessions?chat_session_id=…`.
> Captured and implemented 2026-08-03 from the supplied authenticated dark-mode screenshot, a
> region-by-region static markup pass, and the persisted event payload shapes.
>
> Prior art: stacks on the admin-console audit's Session Audit row and its S1/S5/S6 fixes. This pass
> is narrower: it audits the information hierarchy inside one dense tool event rather than the
> surrounding session modal.

## Regions

1. Collapsed tool-call summary
2. Expanded request
3. Expanded response
4. Error state
5. Technical metadata and raw payloads

## Tier 1 — cheap, high-impact (alignment/padding/labels)

- **Expanded card:** identifiers and storage-shaped metadata appeared before the request and result,
  so the first viewport answered “how was this persisted?” before “what happened?” Metadata now lives
  under `Technical details`; Request and Response own the primary scan path. → P4
- **Labels:** `Arguments`, `Result`, and `Raw Tool Payload` described implementation fields instead of
  the operator's task. They are now `Request`, `Response`, `Full request`, `Full response`, and
  `Raw event payload`. → P6
- **Assistant-message traces:** `arguments_preview` and `result_preview` were skipped by the display
  selectors, leaving the useful request/response trapped inside escaped JSON in the raw event. The
  selectors now recover those fields and the presenter decodes JSON strings before display. → P6+P1
- **Collapsed summary:** source provenance competed with status and duration while the actual query was
  hidden. Provenance moved to technical details and the decoded request headline now joins the operation
  under the tool name. → P4+P6
- **Geometry:** inner panels used the third, bare `rounded` radius. All new/modified inner controls use
  `rounded-md` within the outer `rounded-lg` tool card. → P2

## Tier 2 — structural within the surface (declutter/hierarchy)

- **Request/response:** both now have a default simple view that promotes human text, a bounded set of
  labeled facts, and up to four meaningful records. Complete JSON remains one disclosure away instead of
  being the only representation. → P4+P8
- **Tool-search responses:** query, result count, operation name, summary, and domain/kind/entity metadata
  are promoted from the encoded `matches` array. Additional matches are counted and remain in Full response.
  → P4+P6
- **Technical payloads:** IDs, linked execution/message rows, and the raw event are retained without
  competing with the task view. Each long payload has bounded vertical overflow, wrapping, and its own
  explicit disclosure. → P1
- **Interaction:** native disclosure summaries now have visible keyboard focus, 44px minimum height, fixed
  icon containers, and reduced-motion-safe chevrons. → P9+P11+P13
- **Responsive density:** Request and Response stack by default and become a two-column comparison only at
  extra-large widths, avoiding narrow half-columns inside the modal. → P1

## Tier 3 — polish/signature

- No signature effect was added. This is an operational, high-density inspection surface; the earned
  polish is faster information retrieval, not ornament.

## Shipped implementation

- Added a pure payload presenter that decodes preview JSON, extracts high-signal facts, summarizes common
  result collections, and caps the simple view.
- Added a reusable `ToolPayloadPanel` for the simple/full request and response presentation.
- Reworked `ConversationToolCallCard` so request/response come first and technical details are progressive.
- Extended tool lifecycle selection to include assistant-trace `arguments_preview` and `result_preview`.
- Added focused presenter and lifecycle regression tests using the screenshot's tool-search payload shape.

## Verification

- ✅ Focused Vitest: 4 files / 11 tests, including component disclosure behavior.
- ✅ Official Svelte autofixer run on both touched Svelte components with no reported issues.
- ✅ `pnpm --filter @buildos/web check`: 0 errors / 0 warnings.
- ⬜ Authenticated after-state capture at desktop and iPhone widths in light and dark mode.
