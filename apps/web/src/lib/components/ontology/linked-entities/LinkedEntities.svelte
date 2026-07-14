<!-- apps/web/src/lib/components/ontology/linked-entities/LinkedEntities.svelte -->
<!--
	Self-contained component for displaying and managing entity relationships.

	Performance optimizations:
	- Accepts optional initialLinkedEntities prop from parent /full endpoint
	- Defers available entities fetching until user clicks "Add"
	- Caches loaded available entities per kind

	Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md

	Usage:
	<LinkedEntities
		sourceId={task.id}
		sourceKind="task"
		projectId={projectId}
		initialLinkedEntities={dataFromFullEndpoint?.linkedEntities}
		onEntityClick={(kind, id) => openModal(kind, id)}
		onLinksChanged={() => refreshParent()}
	/>
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type {
		EntityKind,
		LinkedEntitiesResult,
		LinkedEntity,
		AvailableEntity
	} from './linked-entities.types';
	import { ENTITY_SECTIONS, ALLOWED_LINKS } from './linked-entities.types';
	import {
		fetchLinkedEntities,
		fetchAvailableEntities,
		linkEntities,
		unlinkEntity
	} from './linked-entities.service';
	import { Check, ChevronDown, Pencil } from 'lucide-svelte';
	import LinkedEntitiesSection from './LinkedEntitiesSection.svelte';
	import LinkPickerModal from './LinkPickerModal.svelte';

	interface Props {
		sourceId: string;
		sourceKind: EntityKind;
		projectId: string;
		/** Pre-loaded linked entities from parent /full endpoint - skips initial fetch */
		initialLinkedEntities?: LinkedEntitiesResult;
		onLoaded?: (linkedEntities: LinkedEntitiesResult) => void;
		onEntityClick?: (kind: EntityKind, id: string) => void;
		onLinksChanged?: () => void;
		allowedEntityTypes?: EntityKind[];
		readOnly?: boolean;
		compactEditToggle?: boolean;
		collapsible?: boolean;
		defaultExpanded?: boolean;
	}

	let {
		sourceId,
		sourceKind,
		projectId,
		initialLinkedEntities,
		onLoaded,
		onEntityClick,
		onLinksChanged,
		allowedEntityTypes,
		readOnly = false,
		compactEditToggle = false,
		collapsible = false,
		defaultExpanded = true
	}: Props = $props();

	interface SourceSession {
		sourceId: string;
		sourceKind: EntityKind;
		projectId: string;
		epoch: number;
	}

	function emptyLinkedEntities(): LinkedEntitiesResult {
		return {
			tasks: [],
			plans: [],
			goals: [],
			milestones: [],
			documents: [],
			risks: [],
			events: [],
			requirements: []
		};
	}

	function emptyAvailableEntitiesCache(): Record<EntityKind, AvailableEntity[]> {
		return {
			task: [],
			plan: [],
			goal: [],
			milestone: [],
			document: [],
			risk: [],
			event: [],
			requirement: []
		};
	}

	function normalizeLinkedEntities(value: LinkedEntitiesResult): LinkedEntitiesResult {
		return {
			tasks: value.tasks ?? [],
			plans: value.plans ?? [],
			goals: value.goals ?? [],
			milestones: value.milestones ?? [],
			documents: value.documents ?? [],
			risks: value.risks ?? [],
			events: value.events ?? [],
			requirements: value.requirements ?? []
		};
	}

	// State
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let linkedEntities = $state<LinkedEntitiesResult>(emptyLinkedEntities());

	// Track which kinds have been loaded for available entities
	let loadedAvailableKinds = $state<Set<EntityKind>>(new Set());
	let availableEntitiesCache = $state<Record<EntityKind, AvailableEntity[]>>(
		emptyAvailableEntitiesCache()
	);
	let loadingAvailableKind = $state<EntityKind | null>(null);
	let linksEditMode = $state(false);
	let linkExpansionOverride = $state<boolean | null>(null);

	// Link picker modal state
	let showLinkPicker = $state(false);
	let linkPickerKind = $state<EntityKind>('task');

	// Plain request ownership state: these values coordinate async work but are not rendered.
	let sourceSessionEpoch = 0;
	let linkedEntitiesLoadRequestId = 0;
	let linkedEntitiesLoadController: AbortController | null = null;
	let availableLoadRequestId = 0;
	let availableLoadController: AbortController | null = null;
	let linkPickerOpenRequestId = 0;

	// Filter sections based on ALLOWED_LINKS rules and optional allowedEntityTypes prop
	const visibleSections = $derived.by(() => {
		// Start with sections that are allowed by the ALLOWED_LINKS rules for this source kind
		const allowedByRules = ALLOWED_LINKS[sourceKind] || [];
		let sections = ENTITY_SECTIONS.filter((s) => allowedByRules.includes(s.kind));

		// Further filter by allowedEntityTypes prop if specified (intersection)
		if (allowedEntityTypes && allowedEntityTypes.length > 0) {
			sections = sections.filter((s) => allowedEntityTypes.includes(s.kind));
		}

		return sections;
	});

	// Reactive mapping of entities by kind - fixes Svelte 5 reactivity with function calls
	const entitiesByKind = $derived.by(() => ({
		task: linkedEntities.tasks,
		plan: linkedEntities.plans,
		goal: linkedEntities.goals,
		milestone: linkedEntities.milestones,
		document: linkedEntities.documents,
		risk: linkedEntities.risks,
		event: linkedEntities.events,
		requirement: linkedEntities.requirements
	}));

	// Reactive mapping of available counts by kind
	const availableCountByKind = $derived.by(() => {
		const counts: Record<EntityKind, number> = {
			task: -1,
			plan: -1,
			goal: -1,
			milestone: -1,
			document: -1,
			risk: -1,
			event: -1,
			requirement: -1
		};
		for (const kind of [
			'task',
			'plan',
			'goal',
			'milestone',
			'document',
			'risk',
			'event',
			'requirement'
		] as EntityKind[]) {
			if (!loadedAvailableKinds.has(kind)) {
				counts[kind] = -1;
			} else {
				const available = availableEntitiesCache[kind] || [];
				counts[kind] = available.filter((e) => !e.isLinked).length;
			}
		}
		return counts;
	});

	function captureSourceSession(): SourceSession {
		return { sourceId, sourceKind, projectId, epoch: sourceSessionEpoch };
	}

	function hasValidSource(session: SourceSession): boolean {
		return Boolean(session.sourceId && session.sourceKind && session.projectId);
	}

	function isCurrentSourceSession(session: SourceSession): boolean {
		return (
			session.epoch === sourceSessionEpoch &&
			session.sourceId === sourceId &&
			session.sourceKind === sourceKind &&
			session.projectId === projectId &&
			hasValidSource(session)
		);
	}

	function isAbortError(value: unknown): boolean {
		return value instanceof DOMException
			? value.name === 'AbortError'
			: value instanceof Error && value.name === 'AbortError';
	}

	function cancelLinkedEntitiesLoad() {
		linkedEntitiesLoadRequestId += 1;
		linkedEntitiesLoadController?.abort();
		linkedEntitiesLoadController = null;
	}

	function cancelAvailableLoad() {
		availableLoadRequestId += 1;
		availableLoadController?.abort();
		availableLoadController = null;
	}

	function invalidateSourceSession(session: SourceSession) {
		if (session.epoch !== sourceSessionEpoch) return;
		sourceSessionEpoch += 1;
		cancelLinkedEntitiesLoad();
		cancelAvailableLoad();
		linkPickerOpenRequestId += 1;
	}

	function resetSourceView() {
		isLoading = false;
		error = null;
		linkedEntities = emptyLinkedEntities();
		loadedAvailableKinds = new Set();
		availableEntitiesCache = emptyAvailableEntitiesCache();
		loadingAvailableKind = null;
		linksEditMode = false;
		linkExpansionOverride = null;
		showLinkPicker = false;
	}

	function isCurrentLinkedEntitiesLoad(
		session: SourceSession,
		requestId: number,
		controller: AbortController
	): boolean {
		return (
			isCurrentSourceSession(session) &&
			requestId === linkedEntitiesLoadRequestId &&
			controller === linkedEntitiesLoadController &&
			!controller.signal.aborted
		);
	}

	// Source props own the full view lifecycle. Cleanup invalidates work before the replacement
	// effect runs, so even transports that ignore abort cannot write across source identities.
	$effect(() => {
		const requestedSourceId = sourceId;
		const requestedSourceKind = sourceKind;
		const requestedProjectId = projectId;
		const requestedInitialLinkedEntities = initialLinkedEntities;

		cancelLinkedEntitiesLoad();
		cancelAvailableLoad();
		linkPickerOpenRequestId += 1;
		sourceSessionEpoch += 1;
		const session: SourceSession = {
			sourceId: requestedSourceId,
			sourceKind: requestedSourceKind,
			projectId: requestedProjectId,
			epoch: sourceSessionEpoch
		};

		resetSourceView();

		if (hasValidSource(session)) {
			if (requestedInitialLinkedEntities) {
				linkedEntities = normalizeLinkedEntities(requestedInitialLinkedEntities);
			} else {
				untrack(() => void loadData(session));
			}
		}

		return () => invalidateSourceSession(session);
	});

	async function loadData(session = captureSourceSession()): Promise<boolean> {
		if (!isCurrentSourceSession(session)) return false;

		cancelLinkedEntitiesLoad();
		const requestId = linkedEntitiesLoadRequestId;
		const controller = new AbortController();
		linkedEntitiesLoadController = controller;
		const onLoadedForRequest = onLoaded;
		isLoading = true;
		error = null;

		try {
			// Performance: skip fetching available entities on initial load.
			const result = await fetchLinkedEntities(
				session.sourceId,
				session.sourceKind,
				session.projectId,
				{ includeAvailable: false, signal: controller.signal }
			);

			if (!isCurrentLinkedEntitiesLoad(session, requestId, controller)) return false;
			linkedEntities = normalizeLinkedEntities(result.linkedEntities);
			onLoadedForRequest?.(result.linkedEntities);
			return true;
		} catch (err) {
			if (!isCurrentLinkedEntitiesLoad(session, requestId, controller)) return false;
			if (isAbortError(err)) return false;

			const message = err instanceof Error ? err.message : 'Failed to load linked entities';
			error = message;
			console.error('[LinkedEntities] Load error:', err);
			return false;
		} finally {
			if (isCurrentLinkedEntitiesLoad(session, requestId, controller)) {
				linkedEntitiesLoadController = null;
				isLoading = false;
			}
		}
	}

	/**
	 * Lazy-load available entities for a specific kind when user clicks "Add"
	 */
	async function loadAvailableForKind(
		kind: EntityKind,
		session = captureSourceSession()
	): Promise<AvailableEntity[] | null> {
		if (!isCurrentSourceSession(session)) return null;

		// Return cached if already loaded
		if (loadedAvailableKinds.has(kind)) {
			return availableEntitiesCache[kind];
		}

		cancelAvailableLoad();
		const requestId = availableLoadRequestId;
		const controller = new AbortController();
		availableLoadController = controller;
		loadingAvailableKind = kind;

		try {
			// Get IDs of already-linked entities of this kind
			const linkedIds = entitiesByKind[kind].map((e) => e.id);

			const entities = await fetchAvailableEntities(
				session.sourceId,
				session.sourceKind,
				session.projectId,
				kind,
				linkedIds,
				{ signal: controller.signal }
			);

			if (
				!isCurrentSourceSession(session) ||
				requestId !== availableLoadRequestId ||
				controller !== availableLoadController ||
				controller.signal.aborted
			) {
				return null;
			}

			// Cache the results
			availableEntitiesCache[kind] = entities;
			loadedAvailableKinds = new Set([...loadedAvailableKinds, kind]);

			return entities;
		} catch (err) {
			if (
				!isCurrentSourceSession(session) ||
				requestId !== availableLoadRequestId ||
				controller !== availableLoadController ||
				controller.signal.aborted
			) {
				return null;
			}
			if (isAbortError(err)) return null;

			const message =
				err instanceof Error ? err.message : 'Failed to load available entities';
			toastService.error(message);
			console.error('[LinkedEntities] Load available error:', err);
			return [];
		} finally {
			if (
				isCurrentSourceSession(session) &&
				requestId === availableLoadRequestId &&
				controller === availableLoadController
			) {
				availableLoadController = null;
				if (loadingAvailableKind === kind) loadingAvailableKind = null;
			}
		}
	}

	async function handleAddClick(kind: EntityKind) {
		const session = captureSourceSession();
		if (!isCurrentSourceSession(session)) return;
		const openRequestId = ++linkPickerOpenRequestId;

		// Load available entities for this kind if not already loaded
		if (!loadedAvailableKinds.has(kind)) {
			const result = await loadAvailableForKind(kind, session);
			if (result === null) return;
		}

		if (!isCurrentSourceSession(session) || openRequestId !== linkPickerOpenRequestId) return;
		linkPickerKind = kind;
		showLinkPicker = true;
	}

	async function handleRemoveLink(entity: LinkedEntity, kind: EntityKind) {
		const session = captureSourceSession();
		if (!isCurrentSourceSession(session)) return;
		const onLinksChangedForRequest = onLinksChanged;

		// Optimistic update: find and remove the entity
		const backup = { ...linkedEntities };

		// Remove from all arrays
		for (const key of Object.keys(linkedEntities) as (keyof LinkedEntitiesResult)[]) {
			linkedEntities[key] = linkedEntities[key].filter((e) => e.edge_id !== entity.edge_id);
		}

		try {
			await unlinkEntity({
				sourceId: session.sourceId,
				sourceKind: session.sourceKind,
				projectId: session.projectId,
				linkedEntity: entity,
				linkedKind: kind
			});
			if (!isCurrentSourceSession(session)) return;

			toastService.success('Link removed');
			// Invalidate available cache since something was unlinked
			loadedAvailableKinds = new Set();
			onLinksChangedForRequest?.();
		} catch (err) {
			if (!isCurrentSourceSession(session)) return;

			// Revert on error
			linkedEntities = backup;
			const message = err instanceof Error ? err.message : 'Failed to remove link';
			toastService.error(message);
		}
	}

	async function handleLinksAdded(targetIds: string[]) {
		if (targetIds.length === 0) return;
		const session = captureSourceSession();
		if (!isCurrentSourceSession(session)) return;
		const targetKind = linkPickerKind;
		const onLinksChangedForRequest = onLinksChanged;

		try {
			await linkEntities({
				sourceId: session.sourceId,
				sourceKind: session.sourceKind,
				targetIds,
				targetKind,
				projectId: session.projectId
			});
			if (!isCurrentSourceSession(session)) return;

			toastService.success(
				`Linked ${targetIds.length} ${targetIds.length === 1 ? 'item' : 'items'}`
			);

			// Reload linked entities to get fresh data with edge IDs
			await loadData(session);
			if (!isCurrentSourceSession(session)) return;

			// Invalidate available cache since something was linked
			loadedAvailableKinds = new Set();
			onLinksChangedForRequest?.();
		} catch (err) {
			if (!isCurrentSourceSession(session)) return;

			const message = err instanceof Error ? err.message : 'Failed to create links';
			toastService.error(message);
		} finally {
			if (isCurrentSourceSession(session) && linkPickerKind === targetKind) {
				showLinkPicker = false;
			}
		}
	}

	// Reactive getter for available entities (used by modal)
	const availableForSelectedKind = $derived(availableEntitiesCache[linkPickerKind] || []);
	const effectiveReadOnly = $derived(readOnly || (compactEditToggle && !linksEditMode));
	const contentVisible = $derived(!collapsible || (linkExpansionOverride ?? defaultExpanded));
	const linkedTotal = $derived.by(() => {
		return visibleSections.reduce((total, section) => {
			return total + (entitiesByKind[section.kind]?.length ?? 0);
		}, 0);
	});
	const linkedTypeSummary = $derived.by(() => {
		if (error) return 'Links unavailable';

		const summaries: string[] = [];

		for (const section of visibleSections) {
			const count = entitiesByKind[section.kind]?.length ?? 0;
			if (count === 0) continue;
			summaries.push(`${count} ${count === 1 ? section.label : section.labelPlural}`);
		}

		if (summaries.length === 0) return 'No linked entities';

		const visibleSummaries = summaries.slice(0, 3);
		const extraCount = summaries.length - visibleSummaries.length;
		return `${linkedTotal} linked · ${visibleSummaries.join(', ')}${extraCount > 0 ? ` +${extraCount} more` : ''}`;
	});

	function toggleContent() {
		if (!collapsible) return;
		const nextExpanded = !contentVisible;
		linkExpansionOverride = nextExpanded;
		if (!nextExpanded) {
			linksEditMode = false;
		}
	}
</script>

<div class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden">
	<!-- Header -->
	<div class="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border bg-muted">
		<div class="flex items-center justify-between gap-2">
			{#if collapsible}
				<button
					type="button"
					class="min-w-0 flex-1 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable"
					onclick={toggleContent}
					aria-expanded={contentVisible}
				>
					<span class="flex min-w-0 items-center gap-1.5 sm:gap-2">
						<ChevronDown
							class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform {contentVisible
								? ''
								: '-rotate-90'}"
						/>
						<span class="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-accent rounded-full"></span>
						<span
							class="truncate text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide"
						>
							Linked Entities
						</span>
					</span>
					<span class="mt-0.5 block truncate text-[11px] text-muted-foreground">
						{isLoading ? 'Loading links...' : linkedTypeSummary}
					</span>
				</button>
			{:else}
				<h3
					class="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 sm:gap-2"
				>
					<span class="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-accent rounded-full"></span>
					Linked Entities
				</h3>
			{/if}

			{#if compactEditToggle && !readOnly && contentVisible}
				<button
					type="button"
					class="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable"
					onclick={() => (linksEditMode = !linksEditMode)}
					aria-pressed={linksEditMode}
				>
					{#if linksEditMode}
						<Check class="h-3 w-3" />
						Done
					{:else}
						<Pencil class="h-3 w-3" />
						Edit
					{/if}
				</button>
			{/if}
		</div>
	</div>

	<!-- Content -->
	{#if contentVisible}
		<div class="divide-y divide-border">
			{#if isLoading}
				<!-- Skeleton Loading State -->
				{#each visibleSections as section, i (section.kind)}
					<div
						class="px-3 py-2 flex items-center justify-between tx tx-pulse tx-weak"
						style="animation-delay: {i * 50}ms"
					>
						<div class="flex items-center gap-2">
							<div
								class="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded bg-muted animate-pulse"
							></div>
							<div
								class="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded bg-muted animate-pulse"
							></div>
							<div
								class="h-3 sm:h-4 w-14 sm:w-16 rounded bg-muted animate-pulse"
							></div>
							<div
								class="h-2.5 sm:h-3 w-5 sm:w-6 rounded bg-muted animate-pulse"
							></div>
						</div>
						<div class="w-4 h-4 sm:w-5 sm:h-5 rounded bg-muted animate-pulse"></div>
					</div>
				{/each}
			{:else if error}
				<!-- Error State -->
				<div class="px-3 sm:px-4 py-4 sm:py-6 text-center tx tx-static tx-weak">
					<p class="text-xs sm:text-sm text-destructive">{error}</p>
					<button
						type="button"
						class="mt-2 text-[10px] sm:text-xs text-accent hover:underline pressable"
						onclick={() => loadData()}
					>
						Try again
					</button>
				</div>
			{:else}
				<!-- Loaded State -->
				{#each visibleSections as section (section.kind)}
					<LinkedEntitiesSection
						config={section}
						entities={entitiesByKind[section.kind]}
						availableToLinkCount={availableCountByKind[section.kind]}
						isLoadingAvailable={loadingAvailableKind === section.kind}
						readOnly={effectiveReadOnly}
						onAdd={handleAddClick}
						onRemove={handleRemoveLink}
						{onEntityClick}
					/>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<!-- Link Picker Modal -->
{#if showLinkPicker}
	<LinkPickerModal
		kind={linkPickerKind}
		availableEntities={availableForSelectedKind}
		onClose={() => (showLinkPicker = false)}
		onConfirm={handleLinksAdded}
	/>
{/if}
