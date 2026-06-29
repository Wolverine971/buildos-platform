<!-- apps/web/src/lib/components/admin/chat/SessionFilters.svelte -->
<script lang="ts">
	import { Search } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	type SortBy = 'updated_at' | 'created_at' | 'last_message_at';
	type SortOrder = 'asc' | 'desc';

	let {
		searchQuery = $bindable(''),
		selectedStatus = $bindable('all'),
		selectedContextType = $bindable('all'),
		selectedSortBy = $bindable<SortBy>('updated_at'),
		selectedSortOrder = $bindable<SortOrder>('desc'),
		onApply
	}: {
		searchQuery: string;
		selectedStatus: string;
		selectedContextType: string;
		selectedSortBy: SortBy;
		selectedSortOrder: SortOrder;
		onApply: () => void;
	} = $props();

	function handleSubmit(event: Event) {
		event.preventDefault();
		onApply();
	}
</script>

<div class="bg-card border border-border rounded-lg p-3 shadow-ink">
	<form onsubmit={handleSubmit} class="flex flex-wrap items-end gap-2">
		<div class="relative flex-1 min-w-[220px]">
			<Search
				class="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
			/>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search by session id, title, or user..."
				class="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-foreground"
			/>
		</div>
		<Select
			bind:value={selectedStatus}
			onchange={(value) => (selectedStatus = String(value))}
			size="md"
			aria-label="Status filter"
		>
			<option value="all">All Statuses</option>
			<option value="active">Active</option>
			<option value="archived">Archived</option>
			<option value="compressed">Compressed</option>
			<option value="failed">Failed</option>
		</Select>
		<Select
			bind:value={selectedContextType}
			onchange={(value) => (selectedContextType = String(value))}
			size="md"
			aria-label="Context filter"
		>
			<option value="all">All Contexts</option>
			<option value="global">Global</option>
			<option value="general">General</option>
			<option value="project">Project</option>
			<option value="project_create">Project Create</option>
			<option value="calendar">Calendar</option>
			<option value="daily_brief">Daily Brief</option>
			<option value="daily_brief_update">Daily Brief Update</option>
			<option value="ontology">Ontology</option>
		</Select>
		<Select
			bind:value={selectedSortBy}
			onchange={(value) =>
				(selectedSortBy = String(value) as 'updated_at' | 'created_at' | 'last_message_at')}
			size="md"
			aria-label="Sort field"
		>
			<option value="updated_at">Sort: Updated</option>
			<option value="created_at">Sort: Created</option>
			<option value="last_message_at">Sort: Last Message</option>
		</Select>
		<Select
			bind:value={selectedSortOrder}
			onchange={(value) => (selectedSortOrder = String(value) as 'asc' | 'desc')}
			size="md"
			aria-label="Sort order"
		>
			<option value="desc">Newest</option>
			<option value="asc">Oldest</option>
		</Select>
		<Button type="submit" variant="primary" size="md" class="pressable">Apply</Button>
	</form>
</div>
