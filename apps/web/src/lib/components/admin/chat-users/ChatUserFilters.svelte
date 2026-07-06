<!-- apps/web/src/lib/components/admin/chat-users/ChatUserFilters.svelte -->
<script lang="ts">
	import { Search, SlidersHorizontal, X } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import type {
		ClassificationFilter,
		EntityActionFilter,
		ErrorFilter,
		ToolBucketFilter,
		UsersResponse
	} from './chat-user-types';
	import { formatMs } from './chat-user-ui';

	interface Props {
		filterOptions?: UsersResponse['filter_options'] | null;
		searchDraft?: string;
		selectedContextType?: string;
		selectedProjectId?: string;
		selectedTopic?: string;
		selectedErrors?: ErrorFilter;
		selectedToolBucket?: ToolBucketFilter;
		selectedClassification?: ClassificationFilter;
		selectedEntityAction?: EntityActionFilter;
		slowThresholdMs?: string;
		onApplySearch: () => void;
		onResetFilters: () => void;
		onFilterChange: () => void;
	}

	type ActiveFilterChip = {
		key: string;
		label: string;
		clear: () => void;
	};

	let {
		filterOptions = null,
		searchDraft = $bindable(''),
		selectedContextType = $bindable('all'),
		selectedProjectId = $bindable('all'),
		selectedTopic = $bindable('all'),
		selectedErrors = $bindable('all' as ErrorFilter),
		selectedToolBucket = $bindable('all' as ToolBucketFilter),
		selectedClassification = $bindable('all' as ClassificationFilter),
		selectedEntityAction = $bindable('all' as EntityActionFilter),
		slowThresholdMs = $bindable('10000'),
		onApplySearch,
		onResetFilters,
		onFilterChange
	}: Props = $props();

	let filtersOpen = $state(false);
	let activeChips = $derived(activeFilterChips());

	function commitFilterChange() {
		onFilterChange();
	}

	function projectLabel(projectId: string): string {
		return (
			filterOptions?.projects.find((project) => project.project_id === projectId)?.name ??
			projectId
		);
	}

	function slowThresholdLabel(value: string): string {
		const parsed = Number.parseInt(value, 10);
		return Number.isFinite(parsed) ? formatMs(parsed) : value;
	}

	function activeFilterChips(): ActiveFilterChip[] {
		const chips: ActiveFilterChip[] = [];
		if (selectedContextType !== 'all') {
			chips.push({
				key: 'context_type',
				label: `Context: ${selectedContextType}`,
				clear: () => {
					selectedContextType = 'all';
					commitFilterChange();
				}
			});
		}
		if (selectedProjectId !== 'all') {
			chips.push({
				key: 'project_id',
				label: `Project: ${projectLabel(selectedProjectId)}`,
				clear: () => {
					selectedProjectId = 'all';
					commitFilterChange();
				}
			});
		}
		if (selectedTopic !== 'all') {
			chips.push({
				key: 'topic',
				label: `Topic: ${selectedTopic}`,
				clear: () => {
					selectedTopic = 'all';
					commitFilterChange();
				}
			});
		}
		if (selectedErrors !== 'all') {
			chips.push({
				key: 'errors',
				label: selectedErrors === 'only' ? 'Errors only' : 'No errors',
				clear: () => {
					selectedErrors = 'all';
					commitFilterChange();
				}
			});
		}
		if (selectedToolBucket !== 'all') {
			chips.push({
				key: 'tool_bucket',
				label: `Tools: ${selectedToolBucket}`,
				clear: () => {
					selectedToolBucket = 'all';
					commitFilterChange();
				}
			});
		}
		if (selectedClassification !== 'all') {
			chips.push({
				key: 'classification',
				label: `Classification: ${selectedClassification}`,
				clear: () => {
					selectedClassification = 'all';
					commitFilterChange();
				}
			});
		}
		if (selectedEntityAction !== 'all') {
			chips.push({
				key: 'entity_action',
				label: `Entity: ${selectedEntityAction}`,
				clear: () => {
					selectedEntityAction = 'all';
					commitFilterChange();
				}
			});
		}
		if (slowThresholdMs !== '10000') {
			chips.push({
				key: 'slow_threshold_ms',
				label: `Slow: ${slowThresholdLabel(slowThresholdMs)}`,
				clear: () => {
					slowThresholdMs = '10000';
					commitFilterChange();
				}
			});
		}
		return chips;
	}
</script>

<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grid tx-weak">
	<div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
		<TextInput
			bind:value={searchDraft}
			icon={Search}
			type="search"
			placeholder="Search users, topics, projects, tools"
			aria-label="Search chat users"
			onkeydown={(event) => {
				if (event.key === 'Enter') onApplySearch();
			}}
		/>
		<Button
			onclick={onApplySearch}
			variant="secondary"
			size="sm"
			icon={Search}
			class="pressable"
		>
			Search
		</Button>
		<Button
			onclick={() => (filtersOpen = !filtersOpen)}
			variant="secondary"
			size="sm"
			icon={SlidersHorizontal}
			class="pressable"
			aria-expanded={filtersOpen}
		>
			Filters{#if activeChips.length > 0}
				({activeChips.length}){/if}
		</Button>
		<Button onclick={onResetFilters} variant="ghost" size="sm" class="pressable">Reset</Button>
	</div>

	{#if activeChips.length > 0}
		<div class="mt-3 flex flex-wrap gap-1.5">
			{#each activeChips as chip (chip.key)}
				<button
					type="button"
					class="inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onclick={chip.clear}
				>
					<span>{chip.label}</span>
					<X class="h-3 w-3" />
				</button>
			{/each}
		</div>
	{/if}

	{#if filtersOpen}
		<div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
			<Select
				bind:value={selectedContextType}
				onchange={(value) => {
					selectedContextType = String(value);
					commitFilterChange();
				}}
				size="sm"
				aria-label="Filter by context type"
			>
				<option value="all">All Contexts</option>
				{#each filterOptions?.context_types ?? [] as contextType}
					<option value={contextType}>{contextType}</option>
				{/each}
			</Select>
			<Select
				bind:value={selectedProjectId}
				onchange={(value) => {
					selectedProjectId = String(value);
					commitFilterChange();
				}}
				size="sm"
				aria-label="Filter by project"
			>
				<option value="all">All Projects</option>
				{#each filterOptions?.projects ?? [] as project}
					<option value={project.project_id}>{project.name ?? project.project_id}</option>
				{/each}
			</Select>
			<Select
				bind:value={selectedTopic}
				onchange={(value) => {
					selectedTopic = String(value);
					commitFilterChange();
				}}
				size="sm"
				aria-label="Filter by topic"
			>
				<option value="all">All Topics</option>
				{#each filterOptions?.topics ?? [] as topic}
					<option value={topic}>{topic}</option>
				{/each}
			</Select>
			<Select
				bind:value={selectedErrors}
				onchange={(value) => {
					selectedErrors = String(value) as ErrorFilter;
					commitFilterChange();
				}}
				size="sm"
				aria-label="Filter by errors"
			>
				<option value="all">All Error States</option>
				<option value="only">Errors Only</option>
				<option value="none">No Errors</option>
			</Select>
			<Select
				bind:value={selectedToolBucket}
				onchange={(value) => {
					selectedToolBucket = String(value) as ToolBucketFilter;
					commitFilterChange();
				}}
				size="sm"
				aria-label="Filter by tool use"
			>
				<option value="all">All Tool Use</option>
				<option value="none">No Tools</option>
				<option value="some">Any Tools</option>
				<option value="heavy">Heavy Tools</option>
			</Select>
			<Select
				bind:value={selectedClassification}
				onchange={(value) => {
					selectedClassification = String(value) as ClassificationFilter;
					commitFilterChange();
				}}
				size="sm"
				aria-label="Filter by classification"
			>
				<option value="all">All Classification</option>
				<option value="classified">Classified</option>
				<option value="missing">Missing</option>
				<option value="stale">Stale</option>
			</Select>
			<Select
				bind:value={selectedEntityAction}
				onchange={(value) => {
					selectedEntityAction = String(value) as EntityActionFilter;
					commitFilterChange();
				}}
				size="sm"
				aria-label="Filter by entity action"
			>
				<option value="all">All Entity Impact</option>
				<option value="created">Created</option>
				<option value="updated">Updated</option>
				<option value="deleted">Deleted</option>
			</Select>
			<Select
				bind:value={slowThresholdMs}
				onchange={() => commitFilterChange()}
				size="sm"
				aria-label="Slow response threshold"
			>
				<option value="5000">Slow: 5s</option>
				<option value="10000">Slow: 10s</option>
				<option value="20000">Slow: 20s</option>
				<option value="30000">Slow: 30s</option>
			</Select>
		</div>
	{/if}
</div>
