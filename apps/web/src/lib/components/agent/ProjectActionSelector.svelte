<!-- apps/web/src/lib/components/agent/ProjectActionSelector.svelte -->
<!-- INKPRINT Design System: Project action selector with inline entity browsing -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import {
		BriefcaseBusiness,
		ChevronRight,
		ListChecks,
		Target,
		Calendar,
		FileText,
		Flag,
		AlertTriangle,
		ClipboardList,
		Search,
		X,
		Loader
	} from 'lucide-svelte';
	import type { FocusEntitySummary, ProjectFocus } from '@buildos/shared-types';

	type ProjectAction = 'workspace';
	type FocusEntityType = FocusEntitySummary['type'];

	interface Props {
		projectId: string;
		projectName: string;
		onSelectAction: (action: ProjectAction) => void;
		onSelectFocus: (focus: ProjectFocus) => void;
		onBack?: () => void;
	}

	let { projectId, projectName, onSelectAction, onSelectFocus, onBack }: Props = $props();

	const focusTypes: Array<{
		value: FocusEntityType;
		label: string;
		icon: typeof ListChecks;
	}> = [
		{ value: 'task', label: 'Tasks', icon: ListChecks },
		{ value: 'goal', label: 'Goals', icon: Target },
		{ value: 'plan', label: 'Plans', icon: Calendar },
		{ value: 'document', label: 'Documents', icon: FileText },
		{ value: 'milestone', label: 'Milestones', icon: Flag },
		{ value: 'risk', label: 'Risks', icon: AlertTriangle },
		{ value: 'requirement', label: 'Requirements', icon: ClipboardList }
	];

	// --- Metadata display helpers ---

	function formatState(stateKey: string): string {
		return stateKey.replace(/_/g, ' ');
	}

	function stateClasses(state: string): string {
		const s = state.toLowerCase();
		if (['active', 'in_progress'].includes(s))
			return 'bg-accent/10 text-accent border-accent/20';
		if (
			['completed', 'done', 'achieved', 'ready', 'published', 'mitigated', 'closed'].includes(s)
		)
			return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
		if (['blocked', 'occurred', 'missed'].includes(s))
			return 'bg-red-500/10 text-red-600 border-red-500/20';
		if (['in_review'].includes(s)) return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
		return 'bg-muted text-muted-foreground border-border';
	}

	// Priority: lower number = higher priority (matches insight-panel-config.ts getPriorityGroup)
	function priorityClasses(priority: number): string {
		if (priority <= 2) return 'bg-red-500/10 text-red-600 border-red-500/20';
		if (priority === 3) return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
		return 'bg-muted text-muted-foreground border-border';
	}

	function impactClasses(impact: string): string {
		switch (impact) {
			case 'critical':
				return 'bg-red-500/10 text-red-600 border-red-500/20';
			case 'high':
				return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
			case 'medium':
				return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
			default:
				return 'bg-muted text-muted-foreground border-border';
		}
	}

	function formatTypeFamily(typeKey: string): string {
		const parts = typeKey.split('.');
		const meaningful = parts.filter((p) => p !== 'base');
		const label = meaningful[meaningful.length - 1] || parts[0];
		return label.charAt(0).toUpperCase() + label.slice(1);
	}

	function hasEntityMeta(entity: FocusEntitySummary): boolean {
		const m = entity.metadata;
		if (!m) return false;
		if (m.state_key) return true;
		if (m.due_at) return true;
		if (m.priority != null) return true;
		if (m.impact) return true;
		if (m.type_key) return true;
		return false;
	}

	// --- Client-side sorting (matches insight panel patterns) ---

	const TERMINAL_STATES = new Set([
		'completed',
		'done',
		'achieved',
		'closed',
		'missed',
		'abandoned',
		'archived',
		'published'
	]);

	// Matches IMPACT_ORDER from insight-panel-config.ts
	const IMPACT_SORT_ORDER: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };

	function sortEntitiesForSelection(
		items: FocusEntitySummary[],
		type: FocusEntityType
	): FocusEntitySummary[] {
		if (items.length <= 1) return items;

		return [...items].sort((a, b) => {
			// 1. Active items always above terminal items
			const aTerminal = TERMINAL_STATES.has(a.metadata?.state_key ?? '');
			const bTerminal = TERMINAL_STATES.has(b.metadata?.state_key ?? '');
			if (aTerminal !== bTerminal) return aTerminal ? 1 : -1;

			// 2. Entity-specific secondary ordering
			if (type === 'task') {
				// Higher priority first (lower number = higher priority)
				const aPri = a.metadata?.priority ?? 99;
				const bPri = b.metadata?.priority ?? 99;
				if (aPri !== bPri) return aPri - bPri;
			}

			if (type === 'risk') {
				// Higher impact first (critical > high > medium > low)
				const aImp = IMPACT_SORT_ORDER[a.metadata?.impact ?? ''] ?? 5;
				const bImp = IMPACT_SORT_ORDER[b.metadata?.impact ?? ''] ?? 5;
				if (aImp !== bImp) return aImp - bImp;
			}

			if (type === 'milestone') {
				// Soonest due date first
				const aDue = a.metadata?.due_at ? new Date(a.metadata.due_at).getTime() : Infinity;
				const bDue = b.metadata?.due_at ? new Date(b.metadata.due_at).getTime() : Infinity;
				if (aDue !== bDue) return aDue - bDue;
			}

			// 3. Preserve API order (updated_at DESC) for everything else
			return 0;
		});
	}

	// --- Live search highlighting ---

	function highlightMatch(
		text: string,
		query: string
	): Array<{ text: string; highlight: boolean }> {
		const q = query.trim().toLowerCase();
		if (!q) return [{ text, highlight: false }];

		const idx = text.toLowerCase().indexOf(q);
		if (idx === -1) return [{ text, highlight: false }];

		const parts: Array<{ text: string; highlight: boolean }> = [];
		if (idx > 0) parts.push({ text: text.slice(0, idx), highlight: false });
		parts.push({ text: text.slice(idx, idx + q.length), highlight: true });
		if (idx + q.length < text.length)
			parts.push({ text: text.slice(idx + q.length), highlight: false });
		return parts;
	}

	let selectedType = $state<FocusEntityType>('task');
	let entities = $state<FocusEntitySummary[]>([]);
	let sortedEntities = $derived(sortEntitiesForSelection(entities, selectedType));
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
	let searchTerm = $state('');
	let abortController: AbortController | null = null;

	// Live client-side filtering — instant as the user types
	let filteredEntities = $derived.by(() => {
		const q = searchTerm.trim().toLowerCase();
		if (!q) return sortedEntities;
		return sortedEntities.filter((e) => e.name.toLowerCase().includes(q));
	});

	let isSearchActive = $derived(searchTerm.trim().length > 0);

	async function loadEntities(type: FocusEntityType) {
		if (!projectId) return;

		if (abortController) {
			abortController.abort();
		}

		abortController = new AbortController();
		loading = true;
		errorMessage = null;

		try {
			const params = new URLSearchParams({ type });
			const response = await fetch(
				`/api/onto/projects/${projectId}/entities?${params.toString()}`,
				{ signal: abortController.signal }
			);
			if (!response.ok) {
				throw new Error(`Failed with status ${response.status}`);
			}
			const payload = await response.json();
			const data = payload?.data ?? payload ?? [];
			entities = Array.isArray(data) ? data : [];
		} catch (error) {
			if ((error as Error)?.name === 'AbortError') return;
			console.error('[ProjectActionSelector] Failed to load entities:', error);
			errorMessage = 'Unable to load entities for this project.';
			entities = [];
		} finally {
			loading = false;
		}
	}

	function handleEntitySelect(entity: FocusEntitySummary) {
		if (!projectId) return;
		onSelectFocus({
			focusType: selectedType,
			focusEntityId: entity.id,
			focusEntityName: entity.name,
			projectId,
			projectName
		});
	}

	$effect(() => {
		if (!browser || !projectId) return;
		loadEntities(selectedType);
	});

	onDestroy(() => {
		if (abortController) {
			abortController.abort();
		}
	});
</script>

<!-- INKPRINT container with muted background -->
<div class="flex h-full flex-col bg-muted">
	<div class="flex-1 overflow-auto p-3 sm:p-4">
		<!-- Project Workspace card at top -->
		<button
			type="button"
			onclick={() => onSelectAction('workspace')}
			class="group flex w-full items-center gap-2 rounded-lg border border-border bg-card p-3 text-left shadow-ink tx tx-frame tx-weak transition-all duration-200 hover:border-accent hover:shadow-ink-strong active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:rounded-xl sm:p-4"
		>
			<div
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent sm:h-10 sm:w-10"
			>
				<BriefcaseBusiness class="h-3.5 w-3.5 sm:h-5 sm:w-5" />
			</div>
			<div class="min-w-0 flex-1">
				<h3 class="text-sm font-semibold text-foreground">Project Workspace</h3>
				<p class="text-xs text-muted-foreground">
					Chat about the whole project — goals, plans, tasks, anything.
				</p>
			</div>
			<ChevronRight
				class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
			/>
		</button>

		<!-- Divider with label -->
		<div class="my-3 flex items-center gap-3 sm:my-4">
			<div class="h-px flex-1 bg-border"></div>
			<span
				class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground"
			>
				Or focus on something specific
			</span>
			<div class="h-px flex-1 bg-border"></div>
		</div>

		<!-- Entity type tabs -->
		<div
			class="mb-3 flex flex-wrap gap-1.5 sm:gap-2"
		>
			{#each focusTypes as type}
				{@const IconComponent = type.icon}
				{@const isSelected = selectedType === type.value}
				<button
					type="button"
					onclick={() => {
						selectedType = type.value;
						searchTerm = '';
					}}
					aria-pressed={isSelected}
					class={`
						inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold
						shadow-ink transition-all duration-200 pressable
						${
							isSelected
								? 'border-accent bg-accent/10 text-accent'
								: 'border-border bg-card text-muted-foreground hover:border-accent hover:text-foreground'
						}
					`}
				>
					<IconComponent class="h-3 w-3" />
					<span>{type.label}</span>
				</button>
			{/each}
		</div>

		<!-- Live search filter -->
		<div class="relative mb-3">
			<Search
				class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
			/>
			<input
				type="text"
				inputmode="search"
				placeholder={`Filter ${selectedType}s...`}
				class="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-xs text-foreground shadow-ink-inner transition-colors placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring"
				bind:value={searchTerm}
				aria-label={`Filter ${selectedType}s`}
			/>
			{#if isSearchActive}
				<button
					type="button"
					onclick={() => (searchTerm = '')}
					class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Clear filter"
				>
					<X class="h-3.5 w-3.5" />
				</button>
			{/if}
		</div>

		<!-- Entity list -->
		{#if loading}
			<div class="flex items-center justify-center py-12">
				<Loader class="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		{:else if errorMessage}
			<div
				class="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 shadow-ink tx tx-static tx-weak"
				role="alert"
			>
				<p class="text-xs font-semibold text-red-600">Error</p>
				<p class="mt-0.5 text-xs text-red-600/80">{errorMessage}</p>
			</div>
		{:else if entities.length === 0}
			{@const currentType = focusTypes.find((t) => t.value === selectedType)}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				{#if currentType}
					{@const IconComponent = currentType.icon}
					<div
						class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground shadow-ink tx tx-bloom tx-weak"
						aria-hidden="true"
					>
						<IconComponent class="h-5 w-5" />
					</div>
				{/if}
				<p class="text-sm font-semibold text-foreground">
					No {selectedType}s found
				</p>
				<p class="mt-1 text-xs text-muted-foreground">
					This project doesn't have any {selectedType}s yet.
				</p>
			</div>
		{:else if filteredEntities.length === 0}
			<div class="flex flex-col items-center justify-center py-8 text-center">
				<Search class="mb-2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
				<p class="text-sm font-semibold text-foreground">
					No matches
				</p>
				<p class="mt-1 text-xs text-muted-foreground">
					No {selectedType}s match "{searchTerm.trim()}"
				</p>
				<button
					type="button"
					onclick={() => (searchTerm = '')}
					class="mt-2 text-xs font-semibold text-accent hover:underline"
				>
					Clear filter
				</button>
			</div>
		{:else}
			<div class="space-y-1.5" role="list">
				{#each filteredEntities as entity (entity.id)}
					<button
						type="button"
						onclick={() => handleEntitySelect(entity)}
						class="group w-full rounded-lg border border-border bg-card p-2.5 text-left shadow-ink transition-all duration-200 hover:border-accent hover:bg-muted/50 hover:shadow-ink-strong pressable sm:p-3"
					>
						<div class="flex items-center justify-between gap-2">
							<div class="min-w-0 flex-1">
								<p
									class="truncate text-sm font-semibold text-foreground"
									title={entity.name}
								>
									{#if isSearchActive}
										{#each highlightMatch(entity.name, searchTerm) as part}
											{#if part.highlight}<mark
													class="rounded-sm bg-accent/20 text-accent"
													>{part.text}</mark
												>{:else}{part.text}{/if}
										{/each}
									{:else}
										{entity.name}
									{/if}
								</p>
								{#if hasEntityMeta(entity)}
									<div class="mt-1 flex flex-wrap items-center gap-1.5">
										<!-- State badge -->
										{#if entity.metadata?.state_key}
											<span
												class={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${stateClasses(entity.metadata.state_key)}`}
											>
												{formatState(entity.metadata.state_key)}
											</span>
										{/if}

										<!-- Task: priority -->
										{#if selectedType === 'task' && entity.metadata?.priority != null}
											<span
												class={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${priorityClasses(entity.metadata.priority)}`}
											>
												P{entity.metadata.priority}
											</span>
										{/if}

										<!-- Risk: impact level -->
										{#if selectedType === 'risk' && entity.metadata?.impact}
											<span
												class={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${impactClasses(entity.metadata.impact)}`}
											>
												{entity.metadata.impact}
											</span>
										{/if}

										<!-- Goal/Plan: type family -->
										{#if (selectedType === 'goal' || selectedType === 'plan') && entity.metadata?.type_key}
											<span
												class="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
											>
												{formatTypeFamily(entity.metadata.type_key)}
											</span>
										{/if}

										<!-- Due date (tasks, milestones, goals) -->
										{#if entity.metadata?.due_at}
											<span class="text-[10px] font-medium text-muted-foreground">
												Due {new Date(entity.metadata.due_at).toLocaleDateString('en-US', {
													month: 'short',
													day: 'numeric'
												})}
											</span>
										{/if}
									</div>
								{/if}
							</div>
							<ChevronRight
								class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
							/>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
