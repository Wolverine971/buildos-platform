# Template Creation Flow Redesign – Work Log & Design Spec

**Owner:** Codex AI Pair (GPT‑5)  
**Last Updated:** 2025-11-07  
**Scope:** `/apps/web/src/routes/ontology/templates/new` + supporting services/components  
**Tracking Requirements:** User request (Nov 2025) to overhaul template creation so `type_key` selection is catalog-aware, realm-first, and brain-dump assisted.

---

## 1. Executive Summary

The template creation experience moves from a free-form form builder to a guided, catalog-aware wizard:

1. **Scope-first gating** ensures admins start with the entity type they want (project / plan / task / output / document / goal / …).
2. **Realm (sector) selection** reuses `metadata.realm` buckets and highlights available coverage before any template data loads.
3. **Domain → Deliverable → Variant builder** enforces the `{domain}.{deliverable}.{variant}` contract, removes manual parent selection, and auto-fills basic info.
4. **Single-turn analyzer modal** lets admins brain-dump requirements when no template fits, returning primary and alternative suggestions plus “net-new” recommendations; retries mark previous suggestions as rejected.
5. **Autofill + read-only inheritance** hydrate Metadata, Facets, FSM, and Schema from selected templates.

---

## 2. Objectives

- Gate the flow on **scope → realm** (reusing `metadata.realm`) before anything else.
- Force `type_key` assembly via `{domain}.{deliverable}.{variant}` picker; no free-form parents.
- Provide a **single-turn brain-dump modal** that routes through an analyzer endpoint to suggest domain/deliverable/variant with confidence plus alternatives.
- Autofill metadata/facets/FSM/schema from the chosen template and display inheritance read-only.
- Allow admins to reject suggestions, redo the dump, and signal “prior suggestions rejected” to the analyzer.

---

## 3. Design Specification

### 3.1 Progressive Data Loading Contract

1. **Initial Load (`GET /ontology/templates/new`)**
    - Return minimal bootstrap data: authenticated user info, list of available scopes (static), optional feature flags.
    - Do **not** ship the entire template catalog yet.

2. **Scope Selection (Client)**
    - Once user selects a scope, trigger `GET /api/onto/templates/catalog-meta?scope={scope}`.
    - Response includes:
        ```ts
        type ScopeCatalogMeta = {
        	scope: string;
        	realms: Array<{
        		realm: string;
        		template_count: number;
        		exemplar_names: string[];
        	}>;
        	summary: {
        		total_templates: number;
        		abstract: number;
        		concrete: number;
        	};
        };
        ```
    - UI renders realm tiles with counts before deeper data loads.

3. **Realm Selection**
    - When a realm tile is chosen, request `GET /api/onto/templates/catalog-cascade?scope={scope}&realm={realm}`.
    - Response includes distinct sets for domain, deliverable, variant plus lightweight template descriptors:
        ```ts
        type CatalogCascade = {
        	scope: string;
        	realm: string;
        	domains: Array<{ slug: string; label: string; template_count: number }>;
        	deliverables: Array<{ slug: string; label: string; domains: string[] }>;
        	variants: Array<{ slug: string; label: string; parent: string }>;
        	templates: Array<{
        		id: string;
        		type_key: string;
        		domain: string;
        		deliverable: string;
        		variant?: string;
        		status: 'active' | 'draft' | 'deprecated';
        		is_abstract: boolean;
        		summary: string;
        		facet_defaults?: Facets;
        	}>;
        };
        ```
    - Client caches cascade data per (scope, realm) pair to avoid re-fetching.

4. **Existing Template Detail Fetch**
    - Selecting a specific template (or domain/deliverable combination) triggers `GET /api/onto/templates/by-type/{type_key}?scope={scope}` which returns the fully resolved template (existing endpoint).
    - Result hydrates TemplateBasics + Metadata + Facet Defaults + FSM + Schema editors.

5. **Analyzer Submission**
    - When admin invokes brain-dump modal, client POSTs to `/api/onto/templates/analyze` with:
        ```ts
        {
          scope: 'project',
          realm: 'creative',
          brain_dump: string,
          rejected_suggestions?: boolean,
          prior_context?: {
            domain?: string;
            deliverable?: string;
          }
        }
        ```
    - Response contract:
        ```ts
        {
          primary: TemplateSuggestion;
          alternatives: TemplateSuggestion[];
          new_template_options: TemplateSuggestion[];
        }
        ```
        where `TemplateSuggestion` includes `{ domain, deliverable, variant?, parent_template_id?, confidence: number, rationale: string }`.

### 3.2 UI Flow & Components

| Step                          | Component(s)                                                       | Data Source                              | Notes                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Scope Select               | `ScopeSelector.svelte`                                             | Static list                              | Buttons or segmented control; selecting a scope kicks off `catalog-meta` fetch.                                                                               |
| 2. Realm Picker               | `RealmPicker.svelte`                                               | `/catalog-meta`                          | Show counts + summary; disable realms with zero templates but allow “Create new realm entry” path.                                                            |
| 3. Type Key Builder           | `TemplateTypeKeyBuilder.svelte`, `TemplateSelectionSidebar.svelte` | `/catalog-cascade` + optional `/by-type` | Domain → Deliverable → Variant selectors (cascading). Provide search/autocomplete. Sidebar previews selected template or indicates “new variant/deliverable”. |
| 4. Analyzer Modal             | `TemplateAnalyzerModal.svelte`                                     | `/templates/analyze`                     | Single text area, processing spinner, cards for primary/alternate/new suggestions. Retry CTA sets `rejected_suggestions = true`.                              |
| 5. Template Basics            | Updated `TemplateForm.svelte`                                      | Builder output + `/by-type` detail       | Shows name/status/abstract toggle; type_key displayed read-only; inherits from selection summary.                                                             |
| 6. Metadata/Facets/FSM/Schema | Existing editors                                                   | Resolved template data                   | Pre-populated; highlight origin (cloned vs new).                                                                                                              |

Navigation is linear: Step headers stay but Step 1 now encapsulates scope/realm/builder; Step 2 begins metadata, etc.

### 3.3 Analyzer Experience

1. **Launch Conditions:** Shown when (a) cascade returns zero templates for selected realm, or (b) admin clicks “Need help finding a template?”.
2. **Submission:** Textarea → Submit. Modal enters `processing` state (spinner + descriptive text).
3. **Results Layout:**
    - Primary suggestion card pinned at top with confidence meter.
    - Alternate suggestions list (2–3 items) with quick actions (“Use suggestion”, “Preview template”).
    - Net-new options for domain/deliverable/variant combos that don’t exist yet; selecting them seeds builder with `domain`/`deliverable`/`variant` but marks `is_new_*`.
4. **Retry / Feedback:** “Show me different suggestions” button closes cards, reopens textarea with prior text pre-filled and sets `rejected_suggestions = true` in the next request.
5. **Telemetry:** Store analyzer response metadata (selected suggestion id, confidence, rejection) for auditing.

### 3.4 API & Service Changes

| Endpoint                                                | Purpose                                                           | Notes                                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /api/onto/templates/catalog-meta`                  | Scope-level counts grouped by realm                               | Backed by Supabase query aggregating templates by `scope` + `metadata->>realm`.                                    |
| `GET /api/onto/templates/catalog-cascade`               | Distinct domain/deliverable/variant lists + lightweight templates | Use SQL to split `type_key` into parts; include only requested scope+realm.                                        |
| `POST /api/onto/templates/analyze`                      | LLM-backed classifier                                             | Uses `smart-llm-service` with existing prompts + new context for cascade snapshot; handles `rejected_suggestions`. |
| (Existing) `GET /api/onto/templates/by-type/[type_key]` | Resolved template details                                         | Reused unchanged.                                                                                                  |

Server load file `+page.server.ts` now only ensures auth and returns feature flags; client handles progressive fetches.

### 3.5 Data Contracts

```ts
type BuilderSelection = {
	scope: string;
	realm: string;
	domain: {
		slug: string;
		label: string;
		isNew?: boolean;
	};
	deliverable: {
		slug: string;
		label: string;
		isNew?: boolean;
	};
	variant?: {
		slug: string;
		label: string;
		isNew?: boolean;
	};
	parent_template_id?: string; // always populated when existing template chosen
	inherited_template?: ResolvedTemplate; // optional cache
};

type TemplateBasicsPayload = {
	name: string;
	status: 'draft' | 'active' | 'deprecated';
	is_abstract: boolean;
	type_key: string; // derived
	scope: string;
	parent_template_id?: string | null;
};
```

### 3.6 Error & Edge States

- **Catalog fetch failure:** Show inline alert and retry CTA; disable downstream steps until resolved.
- **Realm with zero templates:** Auto-open analyzer modal with messaging (“No templates in this realm yet; describe what you need”).
- **Analyzer timeout:** Provide fallback suggestion (“Create entirely new template”) plus ability to retry.
- **Builder mismatch:** If admin tries to skip variant while parent requires one, show validation error and highlight variant selector.

---

## 4. Work Breakdown & Status

| Area                 | Tasks                                                                        | Status         |
| -------------------- | ---------------------------------------------------------------------------- | -------------- |
| **Docs & Spec**      | Capture flow redesign, decision log, open questions                          | 🟡 In Progress |
| **Server Data**      | Expand `+page.server.ts` to deliver scope/realm catalog + resolved templates | ⏳ Pending     |
| **UI Flow**          | Scope selector, realm picker, type-key builder, selection sidebar            | ⏳ Pending     |
| **Analyzer Modal**   | UX for brain dump, processing state, suggestion cards, retry signal          | ⏳ Pending     |
| **API**              | `/api/onto/templates/analyze` (LLM-backed) + catalog cascade helpers         | ⏳ Pending     |
| **Form Integration** | Remove parent dropdown, bind builder output, autofill editors                | ⏳ Pending     |

Legend: ✅ Done · 🟡 In Progress · ⏳ Pending · 🔴 Blocked

---

## 5. Immediate Next Steps

1. Finalize functional spec updates per clarified requirements (sector = `metadata.realm`, no manual parent overrides, single-turn analyzer with retries).
2. Outline data contracts for new builder/analyzer components (props, events, API payloads).
3. Begin implementing scope/realm/catalog load pipeline in `+page.server.ts`.

---

## 6. Notes & Decisions

- **Realm Taxonomy:** Reuse existing `metadata.realm` buckets; UI should surface counts per realm to highlight gaps.
- **Parent Assignment:** Builder determines parent; UI will show read-only inheritance summary. No arbitrary selection.
- **Analyzer Flow:** Single submission → processing state → choices (primary + alternates + “net-new” suggestions). Provide “Redo with feedback” option that sets `rejected_suggestions: true` in follow-up requests.
- **Progressive Loading:** Scope choice precedes realm data, realm choice precedes catalog cascade; avoids shipping entire catalog up front.

---

## 7. Open Questions / Risks

- Need to confirm acceptable latency budget for analyzer endpoint (LLM call) to size UI loading states.
- Determine how much of the template catalog snapshot we can send client-side without bloating payloads. May need paginated or scope-limited data structure.

---

## 8. Progress Log

- **2025-11-07:** Added progressive catalog service helpers plus `GET /api/onto/templates/catalog-meta` and `GET /api/onto/templates/catalog-cascade` endpoints. Server load for `/ontology/templates/new` now only returns auth + scope options, deferring template data to the new APIs.
- **2025-11-07:** Implemented the new scope → realm → type key builder UI with `ScopeSelector`, `RealmPicker`, and `TemplateTypeKeyBuilder` components. Step 1 now locks `type_key` via builder output, hides manual parent selection, and wires TemplateForm to the generated type key.
- **2025-11-07:** Added the Template Analyzer flow: `/api/onto/templates/analyze`, `TemplateAnalyzerModal`, and client-side integration that pipes analyzer suggestions back into the builder (including new domain/deliverable/variant selections with proper flags).
- **2025-11-07:** Builder selections now prefill Metadata, Facet Defaults, FSM, and Schema editors whenever a parent template is chosen (and clear them when creating net-new templates), so downstream steps open with inherited structures ready to edit.
- **2025-11-07:** Polished Scope selection cards (consistent padding, responsive border states, long-label wrapping) to match BuildOS design tokens and avoid text overflow.
- **2025-11-07:** Users can now launch the analyzer at each level (new realm, domain, or deliverable) with context-aware prompts; analyzer requests include the target level so the LLM can focus on the missing taxonomy layer, and the builder auto-updates realm/domain selections even when they’re net-new.

_(Update this log whenever notable progress or decisions occur.)_
