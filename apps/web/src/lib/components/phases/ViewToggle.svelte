<!-- src/lib/components/phases/ViewToggle.svelte -->
<script lang="ts">
	import { GanttChart, Kanban } from 'lucide-svelte';
	import { createEventDispatcher } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let viewMode: 'kanban' | 'timeline' = 'timeline';

	const dispatch = createEventDispatcher();

	function toggleView() {
		const newMode = viewMode === 'kanban' ? 'timeline' : 'kanban';
		dispatch('toggle', newMode);
	}
</script>

<Button
	on:click={toggleView}
	variant="outline"
	size="sm"
	icon={viewMode === 'kanban' ? GanttChart : Kanban}
	iconPosition="left"
>
	{viewMode === 'kanban' ? 'Timeline View' : 'Kanban View'}
</Button>
