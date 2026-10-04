<!-- apps/web/src/lib/components/projects/desktop/__fixtures__/ModalStub.svelte -->
<!-- Stands in for the agent chat a desktop card opens (embedded: a region, not a dialog). -->
<script lang="ts">
	let props: Record<string, any> = $props();

	const label = $derived(
		props.documentId
			? `document ${props.documentId} in ${props.projectId}`
			: props.taskId
				? `task ${props.taskId} in ${props.projectId}`
				: props.goalId
					? `goal ${props.goalId} in ${props.projectId}`
					: `chat ${props.initialProjectFocus?.focusType} in ${props.initialProjectFocus?.projectId}`
	);
</script>

<div role={props.embedded ? 'region' : 'dialog'} aria-label={label}>
	<button type="button" onclick={() => (props.onSaved ?? props.onUpdated)?.()}>Save</button>
	<button type="button" onclick={() => props.onClose?.()}>Close</button>
</div>
