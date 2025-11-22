<!-- apps/web/src/routes/ontology/templates/new/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import TemplateForm from '$lib/components/ontology/templates/TemplateForm.svelte';
	import MetadataEditor from '$lib/components/ontology/templates/MetadataEditor.svelte';
	import FacetDefaultsEditor from '$lib/components/ontology/templates/FacetDefaultsEditor.svelte';
	import FsmEditor from '$lib/components/ontology/templates/FsmEditor.svelte';
	import SchemaBuilder from '$lib/components/ontology/templates/SchemaBuilder.svelte';
	import ScopeSelector from '$lib/components/ontology/templates/ScopeSelector.svelte';
	import RealmPicker from '$lib/components/ontology/templates/RealmPicker.svelte';
	import TemplateTypeKeyBuilder from '$lib/components/ontology/templates/TemplateTypeKeyBuilder.svelte';
	import TemplateAnalyzerModal from '$lib/components/ontology/templates/TemplateAnalyzerModal.svelte';
	import type { PageData } from './$types';
	import type {
		ScopeCatalogMeta,
		CatalogCascade,
		BuilderSelection,
		CatalogCascadeTemplate,
		TemplateAnalyzerSuggestion,
		TemplateBrainDumpPlan
	} from '$lib/types/template-builder';
	import type { ResolvedTemplate } from '$lib/services/ontology/template-resolver.service';
	import type { TemplateMetadata } from '$lib/types/onto';
	import type { FsmDefinition } from '$lib/components/ontology/templates/fsm-editor.types';
	import type {
		JsonSchemaDefinition,
		JsonSchemaType
	} from '$lib/components/ontology/templates/schema-builder.types';

	type AnalyzerLevel = 'realm' | 'domain' | 'deliverable';
	type AnalyzerContext = {
		level: AnalyzerLevel;
		scope: string | null;
		realm: string | null;
		domain: string | null;
	};

	let { data }: { data: PageData } = $props();

	type BuilderScopeCategory = 'autonomous' | 'project_derived';
	type BuilderFocus = 'scope' | 'realm' | 'type';
	type ScopeDefinition = {
		label: string;
		description: string;
		category: BuilderScopeCategory;
		typeKeyPattern: string;
		facetUsage?: string;
		llmCue: string;
	};

	const scopeCategoryMeta: Record<
		BuilderScopeCategory,
		{
			title: string;
			description: string;
		}
	> = {
		autonomous: {
			title: 'Autonomous Entities',
			description:
				'Need their own taxonomy because they can be templated, filtered, and instantiated outside a single project.'
		},
		project_derived: {
			title: 'Project-Derived Entities',
			description:
				'Inherit meaning from the parent project; only add type keys when the schema diverges.'
		}
	};

	const facetPrimer = {
		context: 'Who or what perspective the template serves.',
		scale: 'How big or complex the effort is.',
		stage: 'Where the entity is in its lifecycle.'
	};

	const scopeCopy: Record<string, ScopeDefinition> = {
		project: {
			label: 'Projects',
			description: 'Top-level workspaces',
			category: 'autonomous',
			typeKeyPattern: '{domain}.{deliverable}[.{variant}]',
			facetUsage: 'context / scale / stage',
			llmCue: 'Describe the fundamental kind of work being created.'
		},
		plan: {
			label: 'Plans',
			description: 'Collections of tasks and phases',
			category: 'autonomous',
			typeKeyPattern: 'plan.{type}[.{variant}]',
			facetUsage: 'context / scale / stage',
			llmCue: 'Explain how this plan organizes work regardless of project.'
		},
		task: {
			label: 'Tasks',
			description: 'Actionable work items',
			category: 'autonomous',
			typeKeyPattern: 'task.{type} (optional)',
			facetUsage: 'context / scale',
			llmCue: 'Use when the task should be reusable outside a single project.'
		},
		output: {
			label: 'Outputs',
			description: 'Deliverables and artifacts',
			category: 'autonomous',
			typeKeyPattern: 'deliverable.{type}[.{variant}]',
			facetUsage: 'context / stage',
			llmCue: 'Describe the artifact that leaves the system.'
		},
		document: {
			label: 'Documents',
			description: 'Knowledge bases & docs',
			category: 'autonomous',
			typeKeyPattern: 'document.{type}',
			facetUsage: 'context / stage',
			llmCue: 'Explain how this knowledge is structured independent of a project.'
		},
		goal: {
			label: 'Goals',
			description: 'Objectives and outcomes',
			category: 'autonomous',
			typeKeyPattern: 'goal.{type}',
			facetUsage: 'context / scale',
			llmCue: 'Clarify the measurable outcome this goal template represents.'
		},
		requirement: {
			label: 'Requirements',
			description: 'Project requirements',
			category: 'project_derived',
			typeKeyPattern: 'Inherit project semantics',
			facetUsage: 'context',
			llmCue: 'Tie requirements back to the parent project type.'
		},
		risk: {
			label: 'Risks',
			description: 'Risk tracking templates',
			category: 'project_derived',
			typeKeyPattern: 'risk.{type} (optional)',
			facetUsage: 'context',
			llmCue: 'Only specialize when different risk schemas are required.'
		},
		milestone: {
			label: 'Milestones',
			description: 'Key checkpoints',
			category: 'project_derived',
			typeKeyPattern: 'Inherit project lifecycle',
			facetUsage: 'stage',
			llmCue: 'Anchor milestone language to the project FSM.'
		},
		metric: {
			label: 'Metrics',
			description: 'Measurement templates',
			category: 'project_derived',
			typeKeyPattern: 'Inherit measurement intent',
			facetUsage: 'scale',
			llmCue: 'Describe what is being measured inside the project.'
		}
	};

	const scopeOptions = data.builderScopes.map((scope) => ({
		value: scope,
		label: scopeCopy[scope]?.label ?? scope,
		description:
			scopeCopy[scope]?.description && scopeCopy[scope]?.typeKeyPattern
				? `${scopeCopy[scope]?.description} - ${scopeCopy[scope]?.typeKeyPattern}`
				: (scopeCopy[scope]?.description ?? 'Template scope')
	}));

	const groupedScopesByCategory = $derived.by(() => {
		const base: Record<BuilderScopeCategory, string[]> = {
			autonomous: [],
			project_derived: []
		};
		for (const scope of data.builderScopes) {
			const entry = scopeCopy[scope];
			if (entry) {
				base[entry.category].push(scope);
			}
		}
		return base;
	});

	const scopeCategoryEntries = $derived(
		Object.entries(scopeCategoryMeta).map(([key, meta]) => ({
			key: key as BuilderScopeCategory,
			meta,
			scopes: groupedScopesByCategory[key as BuilderScopeCategory] ?? []
		}))
	);

	const slugToLabel = (slug: string) =>
		slug.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

	const scopeMetaCache = new Map<string, ScopeCatalogMeta>();
	const cascadeCache = new Map<string, CatalogCascade>();
	const resolvedTemplateCache = new Map<string, ResolvedTemplate>();

	let scopeMetaRequestId = $state(0);
	let cascadeRequestId = $state(0);
	let resolvedTemplateRequestId = $state(0);

	// Form state
	let saving = $state(false);
	let error = $state<string | null>(null);
	let validationErrors = $state<Array<{ field: string; message: string }>>([]);

	// Step tracking for wizard
	let currentStep = $state(1);
	const totalSteps = 5;

	// Component references
	let metadataEditorRef = $state<any>();
	let facetEditorRef = $state<any>();
	let fsmEditorRef = $state<any>();
	let schemaBuilderRef = $state<any>();

	// Collected form data
	let basicFormData = $state<any>(null);

	// Builder + catalog state
	let selectedScope = $state<string | null>(null);
	let scopeMeta = $state<ScopeCatalogMeta | null>(null);
	let scopeMetaLoading = $state(false);
	let scopeMetaError = $state<string | null>(null);

	const selectedScopeDefinition = $derived(
		selectedScope ? (scopeCopy[selectedScope] ?? null) : null
	);

	let selectedRealm = $state<string | null>(null);
	let catalogCascade = $state<CatalogCascade | null>(null);
	let cascadeLoading = $state(false);
	let cascadeError = $state<string | null>(null);

	let builderSelection = $state<BuilderSelection | null>(null);
	let builderTemplateSummary = $state<CatalogCascadeTemplate | null>(null);

	let resolvedParentTemplate = $state<ResolvedTemplate | null>(null);
	let resolvedTemplateLoading = $state(false);
	let resolvedTemplateError = $state<string | null>(null);

	let analyzerModalOpen = $state(false);
	let analyzerContext = $state<AnalyzerContext | null>(null);
	let pendingMetadataPrefill = $state<TemplateMetadata | null | undefined>(undefined);
	let pendingFacetPrefill = $state<Record<string, string> | null | undefined>(undefined);
	let pendingFsmPrefill = $state<FsmDefinition | null | undefined>(undefined);
	let pendingSchemaPrefill = $state<JsonSchemaDefinition | null | undefined>(undefined);
	let lastPrefillKey = $state<string | null>(null);
	let builderFocus = $state<BuilderFocus>('scope');
	let editingTemplateId = $state<string | null>(null);

	const isEditingExisting = $derived(Boolean(editingTemplateId));

	const steps = [
		{ number: 1, name: 'Scope & Type Key', description: 'Select scope, realm, and type key' },
		{ number: 2, name: 'Metadata', description: 'Description, realm, and keywords' },
		{ number: 3, name: 'Facet Defaults', description: 'Context, scale, and stage' },
		{ number: 4, name: 'State Machine', description: 'FSM states and transitions' },
		{ number: 5, name: 'JSON Schema', description: 'Property structure and validation' }
	];

	$effect(() => {
		if (pendingMetadataPrefill === undefined) return;
		if (metadataEditorRef?.setMetadata) {
			metadataEditorRef.setMetadata(pendingMetadataPrefill ?? {});
			pendingMetadataPrefill = undefined;
		}
	});

	$effect(() => {
		if (pendingFacetPrefill === undefined) return;
		if (facetEditorRef?.setFacetDefaults) {
			facetEditorRef.setFacetDefaults(pendingFacetPrefill ?? {});
			pendingFacetPrefill = undefined;
		}
	});

	$effect(() => {
		if (pendingFsmPrefill === undefined) return;
		if (fsmEditorRef?.setFsm) {
			fsmEditorRef.setFsm(pendingFsmPrefill);
			pendingFsmPrefill = undefined;
		}
	});

	$effect(() => {
		if (pendingSchemaPrefill === undefined) return;
		if (schemaBuilderRef?.setSchema) {
			schemaBuilderRef.setSchema(pendingSchemaPrefill);
			pendingSchemaPrefill = undefined;
		}
	});

	function schedulePrefillFromTemplate(template: ResolvedTemplate | null, force = false) {
		const templateId = template?.id ?? 'new';
		const templateRealm = (template?.metadata?.realm as string | undefined) ?? 'realm:unset';
		const realmKey = selectedRealm ?? templateRealm;
		const nextKey = `${templateId}:${realmKey}`;
		if (!force && nextKey === lastPrefillKey) {
			return;
		}
		lastPrefillKey = nextKey;

		if (template) {
			const metadataSource =
				(template.metadata as
					| (TemplateMetadata & { custom?: Record<string, unknown> })
					| undefined) ?? {};
			let metadata: any;
			try {
				metadata = structuredClone(metadataSource);
			} catch {
				metadata = { ...metadataSource };
			}
			if (selectedRealm) {
				metadata.realm = selectedRealm;
			} else if (templateRealm !== 'realm:unset' && !metadata.realm) {
				metadata.realm = templateRealm;
			}
			pendingMetadataPrefill = metadata;

			const facetsSource =
				(template.facet_defaults as Record<string, string> | undefined) ?? {};
			try {
				pendingFacetPrefill = structuredClone(facetsSource);
			} catch {
				pendingFacetPrefill = { ...facetsSource };
			}

			try {
				pendingFsmPrefill = template.fsm ? structuredClone(template.fsm) : null;
			} catch {
				pendingFsmPrefill = template.fsm ? { ...template.fsm } : null;
			}

			try {
				pendingSchemaPrefill = template.schema
					? (structuredClone(template.schema) as JsonSchemaDefinition)
					: null;
			} catch {
				pendingSchemaPrefill = template.schema ? template.schema : null;
			}
		} else {
			const metadata: TemplateMetadata = {};
			if (selectedRealm) {
				metadata.realm = selectedRealm;
			}
			pendingMetadataPrefill = metadata;
			pendingFacetPrefill = {};
			pendingFsmPrefill = null;
			pendingSchemaPrefill = null;
		}
	}

	const builderReady = $derived(
		Boolean(builderSelection?.domain?.slug && builderSelection?.deliverable?.slug)
	);

	const computedTypeKey = $derived.by(() => {
		if (!builderSelection?.domain?.slug || !builderSelection?.deliverable?.slug) {
			return '';
		}

		return [
			builderSelection.domain.slug,
			builderSelection.deliverable.slug,
			builderSelection.variant?.slug
		]
			.filter(Boolean)
			.join('.');
	});

	const templateFormInitialData = $derived.by(() => {
		if (isEditingExisting && resolvedParentTemplate) {
			return {
				...resolvedParentTemplate,
				scope: resolvedParentTemplate.scope ?? selectedScope ?? undefined
			};
		}

		if (!builderReady || !computedTypeKey || !selectedScope) {
			return null;
		}

		const displayName =
			builderTemplateSummary?.name ??
			computedTypeKey
				.split('.')
				.map((part) => part.replace(/_/g, ' '))
				.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
				.join(' ');

		return {
			name: displayName,
			scope: selectedScope,
			type_key: computedTypeKey,
			status: 'draft',
			parent_template_id: builderSelection?.parent_template_id ?? null,
			is_abstract: false
		};
	});

	const templateFormKey = $derived(
		isEditingExisting
			? `edit-${editingTemplateId ?? 'pending'}`
			: `${computedTypeKey || 'empty'}-${builderSelection?.parent_template_id ?? 'base'}`
	);
	const finalCtaLabel = $derived(isEditingExisting ? 'Update Template' : 'Create Template');

	async function fetchJson<T>(url: string): Promise<T> {
		const response = await fetch(url);
		const payload = await response.json().catch(() => ({}));

		if (!response.ok) {
			throw new Error(payload.error || payload.message || 'Request failed');
		}

		if (payload?.success !== undefined) {
			return (payload.data ?? null) as T;
		}

		return payload as T;
	}

	function resetBuilderState() {
		selectedRealm = null;
		catalogCascade = null;
		builderSelection = null;
		builderTemplateSummary = null;
		cascadeError = null;
		cascadeLoading = false;
		resolvedParentTemplate = null;
		resolvedTemplateError = null;
		resolvedTemplateLoading = false;
		basicFormData = null;
		lastPrefillKey = null;
		editingTemplateId = null;
		builderFocus = selectedScope ? 'realm' : 'scope';
		schedulePrefillFromTemplate(null, true);
	}

	function clearScopeSelection() {
		selectedScope = null;
		scopeMeta = null;
		scopeMetaError = null;
		scopeMetaLoading = false;
		resetBuilderState();
	}

	function focusBuilderSection(section: BuilderFocus) {
		builderFocus = section;
	}

	function ensureRealmMetaEntry(realmSlug: string) {
		if (!realmSlug) return;
		if (!scopeMeta) return;
		if (scopeMeta.realms.some((entry) => entry.realm === realmSlug)) {
			return;
		}
		scopeMeta = {
			...scopeMeta,
			realms: [
				{ realm: realmSlug, template_count: 0, exemplar_names: [] },
				...scopeMeta.realms
			]
		};
	}

	function openAnalyzer(level: AnalyzerLevel) {
		if (!selectedScope) {
			error = 'Select a scope first.';
			return;
		}

		if (level !== 'realm' && !selectedRealm) {
			error = 'Select a realm first.';
			return;
		}

		if (level === 'deliverable' && !builderSelection?.domain?.slug) {
			error = 'Select a domain before creating a new deliverable.';
			return;
		}

		analyzerContext = {
			level,
			scope: selectedScope,
			realm: level === 'realm' ? null : selectedRealm,
			domain: level === 'deliverable' ? (builderSelection?.domain?.slug ?? null) : null
		};
		analyzerModalOpen = true;
	}

	function closeAnalyzer() {
		analyzerModalOpen = false;
		analyzerContext = null;
	}

	async function handleScopeSelect(scope: string) {
		if (selectedScope === scope) return;
		selectedScope = scope;
		scopeMeta = scopeMetaCache.get(scope) ?? null;
		scopeMetaError = null;
		resetBuilderState();
		await loadScopeMeta(scope);
	}

	async function loadScopeMeta(scope: string) {
		if (!scope) return;
		if (scopeMetaCache.has(scope)) {
			scopeMeta = scopeMetaCache.get(scope)!;
			return;
		}

		scopeMetaLoading = true;
		scopeMetaError = null;
		const requestId = ++scopeMetaRequestId;

		try {
			const meta = await fetchJson<ScopeCatalogMeta>(
				`/api/onto/templates/catalog-meta?scope=${scope}`
			);
			scopeMetaCache.set(scope, meta);
			if (requestId === scopeMetaRequestId) {
				scopeMeta = meta;
			}
		} catch (err) {
			console.error('[Template Builder] Failed to load scope metadata:', err);
			if (requestId === scopeMetaRequestId) {
				scopeMetaError = err instanceof Error ? err.message : 'Failed to load scope data';
				scopeMeta = null;
			}
		} finally {
			if (requestId === scopeMetaRequestId) {
				scopeMetaLoading = false;
			}
		}
	}

	async function handleRealmSelect(realm: string) {
		if (!selectedScope) return;
		if (selectedRealm === realm) return;

		selectedRealm = realm;
		builderFocus = 'type';
		const cacheKey = `${selectedScope}:${realm}`;
		catalogCascade = cascadeCache.get(cacheKey) ?? null;
		cascadeError = null;
		builderSelection = {
			scope: selectedScope,
			realm
		};
		builderTemplateSummary = null;
		resolvedParentTemplate = null;
		resolvedTemplateError = null;
		lastPrefillKey = null;
		schedulePrefillFromTemplate(null, true);
		await loadCatalogCascade(selectedScope, realm);
	}

	async function loadCatalogCascade(scope: string, realm: string) {
		const cacheKey = `${scope}:${realm}`;
		if (cascadeCache.has(cacheKey)) {
			catalogCascade = cascadeCache.get(cacheKey)!;
			return;
		}

		cascadeLoading = true;
		cascadeError = null;
		const requestId = ++cascadeRequestId;

		try {
			const cascade = await fetchJson<CatalogCascade>(
				`/api/onto/templates/catalog-cascade?scope=${scope}&realm=${realm}`
			);
			cascadeCache.set(cacheKey, cascade);
			if (requestId === cascadeRequestId) {
				catalogCascade = cascade;
			}
		} catch (err) {
			console.error('[Template Builder] Failed to load cascade:', err);
			if (requestId === cascadeRequestId) {
				cascadeError =
					err instanceof Error ? err.message : 'Failed to load catalog details';
				catalogCascade = null;
			}
		} finally {
			if (requestId === cascadeRequestId) {
				cascadeLoading = false;
			}
		}
	}

	function handleBuilderSelectionChange(selection: BuilderSelection) {
		builderSelection = { ...selection };
		if (!selection.parent_template_id) {
			builderTemplateSummary = null;
			resolvedParentTemplate = null;
			resolvedTemplateError = null;
			lastPrefillKey = null;
			schedulePrefillFromTemplate(null, true);
		}
	}

	async function handleTemplatePick(template: CatalogCascadeTemplate | null) {
		builderTemplateSummary = template;
		editingTemplateId = template?.id ?? null;
		if (!template) {
			builderSelection = builderSelection
				? { ...builderSelection, parent_template_id: undefined, parent_type_key: undefined }
				: builderSelection;
			resolvedParentTemplate = null;
			lastPrefillKey = null;
			schedulePrefillFromTemplate(null, true);
			return;
		}

		if (!builderSelection) return;
		builderSelection = {
			...builderSelection,
			parent_template_id: template.id,
			parent_type_key: template.type_key
		};

		await loadResolvedTemplate(template.type_key);
	}

	async function loadResolvedTemplate(typeKey: string) {
		if (!typeKey || !selectedScope) return;

		if (resolvedTemplateCache.has(typeKey)) {
			resolvedParentTemplate = resolvedTemplateCache.get(typeKey)!;
			return;
		}

		resolvedTemplateLoading = true;
		resolvedTemplateError = null;
		const requestId = ++resolvedTemplateRequestId;

		try {
			const detail = await fetchJson<{
				template: ResolvedTemplate;
			}>(`/api/onto/templates/by-type/${typeKey}?scope=${selectedScope}`);

			if (detail?.template) {
				resolvedTemplateCache.set(typeKey, detail.template);
				if (requestId === resolvedTemplateRequestId) {
					resolvedParentTemplate = detail.template;
					schedulePrefillFromTemplate(detail.template, true);
				}
			}
		} catch (err) {
			console.error('[Template Builder] Failed to resolve template:', err);
			if (requestId === resolvedTemplateRequestId) {
				resolvedTemplateError =
					err instanceof Error ? err.message : 'Failed to load template';
				resolvedParentTemplate = null;
			}
		} finally {
			if (requestId === resolvedTemplateRequestId) {
				resolvedTemplateLoading = false;
			}
		}
	}

	async function handleAnalyzerSuggestionSelection(
		event: CustomEvent<
			TemplateAnalyzerSuggestion & {
				scope: string | null;
				realm: string | null;
				targetLevel?: AnalyzerLevel | null;
				structuredPlan?: TemplateBrainDumpPlan | null;
			}
		>
	) {
		const suggestion = event.detail;
		if (!suggestion) return;

		const targetLevel = suggestion.targetLevel ?? analyzerContext?.level ?? null;
		let suggestionScope =
			suggestion.scope ??
			analyzerContext?.scope ??
			selectedScope ??
			builderSelection?.scope ??
			null;

		if (!suggestionScope) {
			return;
		}

		if (suggestionScope !== selectedScope) {
			await handleScopeSelect(suggestionScope);
			suggestionScope = selectedScope;
		}

		let realmSlug =
			suggestion.realm ??
			analyzerContext?.realm ??
			selectedRealm ??
			builderSelection?.realm ??
			null;
		if (realmSlug) {
			ensureRealmMetaEntry(realmSlug);
			if (realmSlug !== selectedRealm && selectedScope) {
				await handleRealmSelect(realmSlug);
			} else if (selectedScope && selectedRealm && !catalogCascade) {
				await loadCatalogCascade(selectedScope, selectedRealm);
			}
		}

		const effectiveScope = selectedScope ?? suggestionScope;
		const effectiveRealm = selectedRealm ?? realmSlug;

		if (!effectiveScope) {
			return;
		}

		if (effectiveRealm) {
			realmSlug = effectiveRealm;
		} else if (targetLevel !== 'realm') {
			return;
		}

		builderSelection = {
			scope: effectiveScope,
			realm: realmSlug ?? 'new_realm',
			domain: {
				slug: suggestion.domain,
				label: slugToLabel(suggestion.domain),
				isNew: suggestion.is_new_domain
			},
			deliverable: {
				slug: suggestion.deliverable,
				label: slugToLabel(suggestion.deliverable),
				isNew: suggestion.is_new_deliverable
			},
			variant: suggestion.variant
				? {
						slug: suggestion.variant,
						label: slugToLabel(suggestion.variant),
						isNew: suggestion.is_new_variant
					}
				: undefined,
			parent_template_id: suggestion.parent_template_id,
			parent_type_key: suggestion.parent_type_key
		};
		editingTemplateId = suggestion.parent_template_id ?? null;

		if (suggestion.parent_template_id) {
			const existingTemplate =
				catalogCascade?.templates.find(
					(template) => template.id === suggestion.parent_template_id
				) ?? null;

			if (existingTemplate) {
				builderTemplateSummary = existingTemplate;
			} else if (suggestion.parent_type_key) {
				builderTemplateSummary = {
					id: suggestion.parent_template_id,
					name: slugToLabel(suggestion.parent_type_key),
					type_key: suggestion.parent_type_key,
					domain: suggestion.domain,
					deliverable: suggestion.deliverable,
					variant: suggestion.variant,
					status: 'active',
					is_abstract: false,
					summary: suggestion.rationale,
					facet_defaults: {}
				};
			} else {
				builderTemplateSummary = null;
			}
		} else {
			builderTemplateSummary = null;
			editingTemplateId = null;
		}

		if (suggestion.parent_type_key) {
			await loadResolvedTemplate(suggestion.parent_type_key);
		} else {
			resolvedParentTemplate = null;
			resolvedTemplateError = null;
			resolvedTemplateLoading = false;
			lastPrefillKey = null;
			schedulePrefillFromTemplate(null, true);
		}

		if (!suggestion.parent_template_id) {
			prefillFromStructuredPlan(suggestion.structuredPlan ?? null);
		}

		basicFormData = null;
		closeAnalyzer();
	}

	function prefillFromStructuredPlan(plan?: TemplateBrainDumpPlan | null) {
		if (!plan) return;

		const metadata: TemplateMetadata = {};
		const realmValue = plan.realm ?? selectedRealm ?? undefined;
		if (realmValue) {
			metadata.realm = realmValue;
		}

		const description = plan.metadata?.summary ?? plan.metadata?.description;
		if (description) {
			metadata.description = description;
		}

		if (plan.metadata?.keywords?.length) {
			metadata.keywords = plan.metadata.keywords;
		}

		if (plan.metadata?.output_type) {
			metadata.output_type = plan.metadata.output_type;
		}

		if (plan.metadata?.typical_scale) {
			metadata.typical_scale = plan.metadata.typical_scale;
		}

		if (Object.keys(metadata).length) {
			pendingMetadataPrefill = metadata;
		}

		const facetDefaults: Record<string, string> = {};
		const contextFacet = plan.facet_defaults?.context?.[0];
		if (contextFacet) facetDefaults.context = contextFacet;
		const scaleFacet = plan.facet_defaults?.scale?.[0];
		if (scaleFacet) facetDefaults.scale = scaleFacet;
		const stageFacet = plan.facet_defaults?.stage?.[0];
		if (stageFacet) facetDefaults.stage = stageFacet;

		if (Object.keys(facetDefaults).length) {
			pendingFacetPrefill = facetDefaults;
		}

		const fsmDefinition = convertPlanFsmToDefinition(plan);
		if (fsmDefinition) {
			pendingFsmPrefill = fsmDefinition;
		}

		const schemaDefinition = convertPlanSchemaToJsonSchema(plan);
		if (schemaDefinition) {
			pendingSchemaPrefill = schemaDefinition;
		}
	}

	function convertPlanFsmToDefinition(plan?: TemplateBrainDumpPlan | null): FsmDefinition | null {
		const fsm = plan?.fsm;
		if (!fsm || (!fsm.states?.length && !fsm.transitions?.length)) {
			return null;
		}

		const states: FsmDefinition['states'] = {};
		for (const [index, state] of (fsm.states ?? []).entries()) {
			const label = state.label?.trim() || state.key || `State ${index + 1}`;
			const key = slugify(state.key ?? label);
			if (!key || !label) continue;
			states[key] = {
				label,
				metadata: {
					initial: Boolean(state.initial),
					final: Boolean(state.final),
					description: state.description ?? undefined
				}
			};
		}

		if (!Object.keys(states).length) {
			return null;
		}

		const transitions = (fsm.transitions ?? [])
			.map((transition, index) => {
				const from = slugify(transition.from);
				const to = slugify(transition.to);
				if (!from || !to) return null;
				return {
					id: transition.id ?? `llm_transition_${index + 1}`,
					from,
					to,
					on: transition.on ?? transition.label ?? 'progress',
					label: transition.label ?? transition.on ?? 'progress',
					guard: transition.guard,
					actions: transition.actions ?? []
				};
			})
			.filter((transition): transition is NonNullable<typeof transition> =>
				Boolean(transition)
			);

		return {
			states,
			transitions,
			metadata: fsm.metadata ?? {}
		};
	}

	function convertPlanSchemaToJsonSchema(
		plan?: TemplateBrainDumpPlan | null
	): JsonSchemaDefinition | null {
		const schema = plan?.schema;
		if (!schema || !schema.length) {
			return null;
		}

		const properties: JsonSchemaDefinition['properties'] = {};
		const required: string[] = [];

		for (const field of schema) {
			if (!field.field) continue;
			const key = slugify(field.field);
			if (!key) continue;
			const type = mapPlanSchemaType(field.type);
			properties[key] = {
				type,
				description: field.description
			};
			if (field.enum?.length) {
				properties[key].enum = field.enum;
			}
			if (field.required) {
				required.push(key);
			}
		}

		if (!Object.keys(properties).length) {
			return null;
		}

		const definition: JsonSchemaDefinition = {
			type: 'object',
			properties,
			additionalProperties: false
		};

		if (required.length) {
			definition.required = required;
		}

		return definition;
	}

	function mapPlanSchemaType(type?: string): JsonSchemaType {
		const normalized = (type ?? '').toLowerCase();
		switch (normalized) {
			case 'number':
			case 'float':
			case 'decimal':
				return 'number';
			case 'integer':
			case 'int':
				return 'integer';
			case 'boolean':
			case 'bool':
				return 'boolean';
			case 'array':
				return 'array';
			case 'object':
			case 'json':
				return 'object';
			default:
				return 'string';
		}
	}

	function slugify(value?: string | null): string {
		if (!value) return '';
		return value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/_+/g, '_')
			.replace(/^_+|_+$/g, '');
	}

	async function handleBasicFormSubmit(event: CustomEvent) {
		basicFormData = event.detail;
		currentStep = 2; // Move to metadata step
	}

	async function handleMetadataNext() {
		currentStep = 3; // Move to facets step
	}

	async function handleFacetNext() {
		currentStep = 4; // Move to FSM step
	}

	async function handleFsmNext() {
		currentStep = 5; // Move to Schema step
	}

	async function handleFinalSubmit() {
		if (!basicFormData) {
			error = 'Basic form data is missing';
			return;
		}
		if (isEditingExisting && !editingTemplateId) {
			error = 'Unable to determine which template to update.';
			return;
		}

		try {
			saving = true;
			error = null;
			validationErrors = [];

			// Collect all form data
			const metadata = metadataEditorRef?.getMetadata() || {};
			const facetDefaults = facetEditorRef?.getFacetDefaults() || {};
			const fsm = fsmEditorRef?.getFsm() || null;
			const schema = schemaBuilderRef?.getSchema() || null;

			const templateData = {
				...basicFormData,
				metadata,
				facet_defaults: facetDefaults,
				fsm,
				schema
			};

			// Submit to API
			const targetUrl = isEditingExisting
				? `/api/onto/templates/${editingTemplateId}`
				: '/api/onto/templates';
			const response = await fetch(targetUrl, {
				method: isEditingExisting ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(templateData)
			});

			const result = await response.json();

			if (!response.ok) {
				if (result.details?.validationErrors) {
					validationErrors = result.details.validationErrors;
					error = 'Please fix validation errors and try again';
				} else {
					error = result.error || 'Failed to create template';
				}
				return;
			}

			// Success! Redirect to templates page
			goto('/ontology/templates');
		} catch (err) {
			console.error('[Template Creation] Error:', err);
			error = err instanceof Error ? err.message : 'An unexpected error occurred';
		} finally {
			saving = false;
		}
	}

	function handleCancel() {
		goto('/ontology/templates');
	}

	function goToStep(step: number) {
		if (step < currentStep) {
			currentStep = step;
		}
	}
</script>

<svelte:head>
	<title>New Template | Ontology | BuildOS</title>
</svelte:head>

<div class="max-w-6xl mx-auto">
	<!-- Mobile Back Button - Only visible on mobile -->
	<div class="lg:hidden mb-3">
		<button
			type="button"
			onclick={handleCancel}
			class="inline-flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:text-indigo-200"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 19l-7-7m0 0l7-7m-7 7h18"
				/>
			</svg>
			<span>Back to Templates</span>
		</button>
	</div>

	<!-- Header -->
	<header class="mb-3">

		<h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
			Create New Template
		</h1>
		<p class="text-base sm:text-lg text-gray-600 dark:text-gray-400">
			Step {currentStep} of {totalSteps}: {steps.find((s) => s.number === currentStep)?.name}
		</p>
	</header>

	<!-- Progress Indicator -->
	<div class="mb-3">
		<div class="flex items-center justify-between">
			{#each steps as step}
				<button
					type="button"
					onclick={() => goToStep(step.number)}
					disabled={step.number > currentStep}
					class="flex flex-col items-center gap-2 flex-1 {step.number > currentStep
						? 'opacity-50 cursor-not-allowed'
						: 'cursor-pointer hover:opacity-80'}"
				>
					<div
						class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors {step.number ===
						currentStep
							? 'bg-blue-600 dark:bg-blue-500 text-white'
							: step.number < currentStep
								? 'bg-green-600 dark:bg-green-500 text-white'
								: 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}"
					>
						{#if step.number < currentStep}
							<svg
								class="w-5 h-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 13l4 4L19 7"
								/>
							</svg>
						{:else}
							{step.number}
						{/if}
					</div>
					<div class="text-center hidden sm:block">
						<div
							class="text-xs font-semibold {step.number === currentStep
								? 'text-blue-600 dark:text-blue-400'
								: step.number < currentStep
									? 'text-green-600 dark:text-green-400'
									: 'text-gray-500 dark:text-gray-500'}"
						>
							{step.name}
						</div>
						<div class="text-xs text-gray-500 dark:text-gray-400">
							{step.description}
						</div>
					</div>
				</button>
				{#if step.number < totalSteps}
					<div
						class="flex-1 h-0.5 mx-2 {step.number < currentStep
							? 'bg-green-600 dark:bg-green-500'
							: 'bg-gray-200 dark:bg-gray-700'}"
					></div>
				{/if}
			{/each}
		</div>
	</div>

	<!-- Error Display -->
	{#if error}
		<div
			class="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
		>
			<p class="text-sm text-red-800 dark:text-red-300 font-medium">{error}</p>
		</div>
	{/if}

	{#if validationErrors.length > 0}
		<div
			class="mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
		>
			<p class="text-sm text-amber-800 dark:text-amber-300 font-medium mb-2">
				Validation Errors:
			</p>
			<ul class="list-disc list-inside space-y-1">
				{#each validationErrors as valError}
					<li class="text-sm text-amber-700 dark:text-amber-400">
						<strong>{valError.field}:</strong>
						{valError.message}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Step Content -->
	<div class="space-y-3">
		{#if currentStep === 1}
			{@const scopePanelOpen = builderFocus === 'scope'}
			{@const realmPanelEnabled = Boolean(selectedScope)}
			{@const realmPanelOpen = realmPanelEnabled && builderFocus === 'realm'}
			{@const typePanelEnabled = Boolean(selectedScope && selectedRealm)}
			{@const typePanelOpen = typePanelEnabled && builderFocus === 'type'}
			<div class="space-y-3">
				<section
					class="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3"
				>
					<header class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p
								class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400"
							>
								Step 1 · Scope
							</p>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-50">
								Choose the entity family
							</h3>
						</div>
					</header>
					{#if scopePanelOpen}
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Pick whether this template stands on its own or inherits from a project.
						</p>
						<ScopeSelector
							options={scopeOptions}
							selected={selectedScope}
							onSelect={handleScopeSelect}
						/>
						{#if scopeMetaError}
							<p class="text-sm text-red-600 dark:text-red-400">
								{scopeMetaError}
							</p>
						{/if}
						{#if selectedScopeDefinition}
							<div
								class="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/70 p-4 space-y-2 text-sm text-gray-600 dark:text-gray-300"
							>
								<p class="font-semibold text-gray-800 dark:text-gray-100">
									{selectedScopeDefinition.description}
								</p>
								<p>
									Type key pattern:
									<code class="font-mono text-xs"
										>{selectedScopeDefinition.typeKeyPattern}</code
									>
								</p>
								{#if selectedScopeDefinition.facetUsage}
									<p>Facet emphasis: {selectedScopeDefinition.facetUsage}</p>
								{/if}
								<p class="text-xs text-gray-500 dark:text-gray-400">
									LLM cue: {selectedScopeDefinition.llmCue}
								</p>
							</div>
						{/if}
						<details
							class="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 p-4 text-sm"
							open={!selectedScope}
						>
							<summary
								class="flex items-center justify-between cursor-pointer text-gray-800 dark:text-gray-200 font-semibold"
							>
								Entity categories primer
								<span class="text-xs font-normal text-gray-500 dark:text-gray-400"
									>Autonomy map</span
								>
							</summary>
							<div class="mt-3 grid gap-3 md:grid-cols-2">
								{#each scopeCategoryEntries as category}
									<div
										class="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-3 space-y-1"
									>
										<p
											class="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400 flex items-center justify-between"
										>
											<span>{category.meta.title}</span>
											{#if category.scopes.length}
												<span
													class="font-normal text-[11px] text-gray-500 dark:text-gray-500"
												>
													{category.scopes.length} scopes
												</span>
											{/if}
										</p>
										<p class="text-xs text-gray-500 dark:text-gray-400">
											{category.meta.description}
										</p>
									</div>
								{/each}
							</div>
						</details>
					{:else if selectedScope}
						<button
							type="button"
							class="w-full rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-4 py-3 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition"
							title={selectedScopeDefinition?.description ?? ''}
							onclick={() => focusBuilderSection('scope')}
						>
							<div class="text-left">
								<p
									class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400"
								>
									Scope
								</p>
								<p class="text-base font-semibold text-gray-900 dark:text-gray-50">
									{scopeCopy[selectedScope]?.label ?? slugToLabel(selectedScope)}
								</p>
							</div>
							<span class="text-xs font-semibold text-blue-600 dark:text-blue-400">
								Change
							</span>
						</button>
					{/if}
				</section>
				<section
					class={`rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3 ${selectedScope ? '' : 'opacity-60 pointer-events-none'}`}
				>
					<header class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p
								class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400"
							>
								Step 2 · Realm
							</p>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-50">
								Set the sector / perspective
							</h3>
						</div>
					</header>
					{#if !realmPanelEnabled}
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Select a scope to unlock realm suggestions.
						</p>
					{:else if realmPanelOpen}
						<div class="flex flex-wrap items-center justify-between gap-3">
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Filter templates by realm before picking the domain/deliverable.
							</p>
							<div class="flex items-center gap-3">
								{#if scopeMeta?.summary}
									<span class="text-xs text-gray-500 dark:text-gray-400">
										{scopeMeta.summary.concrete_templates} concrete templates
									</span>
								{/if}
								<Button
									variant="ghost"
									size="sm"
									onclick={() => openAnalyzer('realm')}
								>
									New realm idea
								</Button>
							</div>
						</div>
						<RealmPicker
							realms={scopeMeta?.realms ?? []}
							selected={selectedRealm}
							onSelect={handleRealmSelect}
							loading={scopeMetaLoading}
						/>
						{#if !scopeMetaLoading && scopeMeta && scopeMeta.realms.length === 0}
							<div
								class="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400"
							>
								No realms for this scope yet. Use the analyzer once available to
								propose a new one.
							</div>
						{/if}
					{:else}
						<button
							type="button"
							class="w-full rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-4 py-3 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition"
							onclick={() => focusBuilderSection('realm')}
							title={`Realm: ${slugToLabel(selectedRealm ?? '')}`}
						>
							<div class="text-left">
								<p
									class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400"
								>
									Realm
								</p>
								<p class="text-base font-semibold text-gray-900 dark:text-gray-50">
									{slugToLabel(selectedRealm ?? '')}
								</p>
							</div>
							<span class="text-xs font-semibold text-blue-600 dark:text-blue-400">
								Change
							</span>
						</button>
					{/if}
				</section>
				<section
					class={`rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3 ${selectedScope && selectedRealm ? '' : 'opacity-60 pointer-events-none'}`}
				>
					<header class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p
								class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400"
							>
								Step 3 · Type key
							</p>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-50">
								Lock the domain · deliverable · variant
							</h3>
						</div>
					</header>
					{#if !typePanelEnabled}
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Select a realm to load domains, deliverables, and variants.
						</p>
					{:else if typePanelOpen}
						<div class="flex flex-wrap gap-2 justify-end text-xs">
							<Button
								variant="ghost"
								size="sm"
								onclick={() => openAnalyzer('domain')}
								disabled={!selectedRealm}
							>
								New domain idea
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => openAnalyzer('deliverable')}
								disabled={!builderSelection?.domain}
							>
								New deliverable idea
							</Button>
						</div>
						<TemplateTypeKeyBuilder
							scope={selectedScope}
							realm={selectedRealm}
							cascade={catalogCascade}
							selection={builderSelection}
							loading={cascadeLoading}
							onSelectionChange={handleBuilderSelectionChange}
							onTemplateSelect={handleTemplatePick}
							onRequestAnalyzer={() => openAnalyzer('deliverable')}
							onCreateDomain={() => openAnalyzer('domain')}
							onCreateDeliverable={() => openAnalyzer('deliverable')}
						/>
						{#if cascadeError}
							<p class="text-sm text-red-600 dark:text-red-400">
								{cascadeError}
							</p>
						{/if}
						{#if builderReady && templateFormInitialData}
							{#if isEditingExisting && (builderTemplateSummary || resolvedParentTemplate)}
								<div
									class="rounded-2xl border border-blue-100 dark:border-blue-500/30 bg-blue-50/70 dark:bg-blue-500/10 p-4 text-sm text-blue-900 dark:text-blue-100 space-y-2"
								>
									<p class="font-semibold">
										Editing predefined template
										{builderTemplateSummary?.name ??
											resolvedParentTemplate?.name ??
											computedTypeKey}
									</p>
									<div class="flex flex-wrap gap-2">
										<Button
											variant="ghost"
											size="sm"
											onclick={() => handleTemplatePick(null)}
										>
											Convert to new template
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onclick={() => focusBuilderSection('type')}
										>
											Pick another template
										</Button>
									</div>
								</div>
							{/if}
						{:else}
							<div
								class="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400"
							>
								Select a domain and deliverable to generate the type key before
								continuing.
							</div>
						{/if}
					{:else}
						<button
							type="button"
							class="w-full rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-4 py-3 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition"
							onclick={() => focusBuilderSection('type')}
						>
							<div class="text-left">
								<p
									class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400"
								>
									Computed type key
								</p>
								<p
									class={`font-mono text-sm ${
										builderReady
											? 'text-gray-900 dark:text-gray-50'
											: 'text-gray-500 dark:text-gray-400'
									}`}
								>
									{#if builderReady && (computedTypeKey || templateFormInitialData?.type_key)}
										{computedTypeKey || templateFormInitialData?.type_key}
									{:else}
										Select domain · deliverable
									{/if}
								</p>
							</div>
							<span class="text-xs font-semibold text-blue-600 dark:text-blue-400">
								{builderReady ? 'Adjust' : 'Resume'}
							</span>
						</button>
					{/if}
				</section>

				{#if builderReady && templateFormInitialData}
					<section
						class="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-4"
					>
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p
									class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400"
								>
									Type key ready
								</p>
								<p class="font-mono text-base text-gray-900 dark:text-gray-50">
									{computedTypeKey || templateFormInitialData.type_key}
								</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									{scopeCopy[selectedScope ?? '']?.label ??
										slugToLabel(selectedScope ?? '')}
									{#if selectedRealm}
										· {slugToLabel(selectedRealm)}
									{/if}
								</p>
							</div>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => focusBuilderSection('type')}
							>
								Adjust type key
							</Button>
						</div>
						{#key templateFormKey}
							<TemplateForm
								mode={isEditingExisting ? 'edit' : 'create'}
								availableParents={[]}
								initialData={templateFormInitialData}
								loading={saving}
								lockTypeKey={true}
								showParentField={false}
								showScopeField={false}
								showTypeKeyField={false}
								hideHeader={true}
								onsubmit={handleBasicFormSubmit}
								on:cancel={handleCancel}
							/>
						{/key}
					</section>
				{/if}
			</div>
		{:else if currentStep === 2}
			<MetadataEditor
				loading={saving}
				bind:this={metadataEditorRef}
				lockedRealm={selectedRealm}
				scopeLabel={selectedScopeDefinition?.label ??
					(selectedScope ? slugToLabel(selectedScope) : null)}
				scopeDescription={selectedScopeDefinition?.description ?? null}
				scopeFacetUsage={selectedScopeDefinition?.facetUsage ?? null}
				scopeTypeKeyPattern={selectedScopeDefinition?.typeKeyPattern ?? null}
			/>
			<div class="flex flex-col sm:flex-row gap-3">
				<Button
					variant="secondary"
					size="md"
					fullWidth={true}
					onclick={() => (currentStep = 1)}
					disabled={saving}
					class="sm:flex-1"
				>
					Back
				</Button>
				<Button
					variant="primary"
					size="md"
					fullWidth={true}
					onclick={handleMetadataNext}
					disabled={saving}
					class="sm:flex-1"
				>
					Next
				</Button>
			</div>
		{:else if currentStep === 3}
			<div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)] items-start">
				<FacetDefaultsEditor loading={saving} bind:this={facetEditorRef} />
				<aside
					class="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-950/20 p-4 space-y-3 text-sm text-emerald-900 dark:text-emerald-100"
				>
					<p
						class="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-200 font-semibold"
					>
						Facet quick reference
					</p>
					<p class="text-emerald-900/80 dark:text-emerald-50">
						Default facets describe how the instance shows up without renaming the
						entity.
					</p>
					<ul class="space-y-2">
						{#each Object.entries(facetPrimer) as [facetKey, description]}
							<li
								class="border border-emerald-100 dark:border-emerald-900/40 rounded-xl px-3 py-2 bg-white/80 dark:bg-emerald-950/30"
							>
								<p
									class="text-xs font-semibold uppercase text-emerald-800 dark:text-emerald-200"
								>
									{facetKey}
								</p>
								<p class="text-xs text-emerald-900/80 dark:text-emerald-100">
									{description}
								</p>
							</li>
						{/each}
					</ul>
				</aside>
			</div>
			<div class="flex flex-col sm:flex-row gap-3">
				<Button
					variant="secondary"
					size="md"
					fullWidth={true}
					onclick={() => (currentStep = 2)}
					disabled={saving}
					class="sm:flex-1"
				>
					Back
				</Button>
				<Button
					variant="primary"
					size="md"
					fullWidth={true}
					onclick={handleFacetNext}
					disabled={saving}
					class="sm:flex-1"
				>
					Next
				</Button>
			</div>
		{:else if currentStep === 4}
			<FsmEditor loading={saving} bind:this={fsmEditorRef} />
			<div class="flex flex-col sm:flex-row gap-3">
				<Button
					variant="secondary"
					size="md"
					fullWidth={true}
					onclick={() => (currentStep = 3)}
					disabled={saving}
					class="sm:flex-1"
				>
					Back
				</Button>
				<Button
					variant="primary"
					size="md"
					fullWidth={true}
					onclick={handleFsmNext}
					disabled={saving}
					class="sm:flex-1"
				>
					Next
				</Button>
			</div>
		{:else if currentStep === 5}
			<SchemaBuilder loading={saving} bind:this={schemaBuilderRef} />
			<div class="flex flex-col sm:flex-row gap-3">
				<Button
					variant="secondary"
					size="md"
					fullWidth={true}
					onclick={() => (currentStep = 4)}
					disabled={saving}
					class="sm:flex-1"
				>
					Back
				</Button>
				<Button
					variant="primary"
					size="md"
					fullWidth={true}
					onclick={handleFinalSubmit}
					disabled={saving}
					class="sm:flex-1"
				>
					{saving
						? isEditingExisting
							? 'Updating Template...'
							: 'Creating Template...'
						: finalCtaLabel}
				</Button>
			</div>
		{/if}
	</div>
</div>

<TemplateAnalyzerModal
	isOpen={analyzerModalOpen}
	scope={analyzerContext?.scope ?? selectedScope}
	realm={analyzerContext?.realm ?? selectedRealm}
	domain={analyzerContext?.domain ?? builderSelection?.domain?.slug ?? null}
	targetLevel={analyzerContext?.level ?? null}
	on:suggestionSelected={handleAnalyzerSuggestionSelection}
	onClose={closeAnalyzer}
/>
