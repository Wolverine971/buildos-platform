<!-- apps/web/src/lib/components/ontology/StateDisplay.svelte -->
<!--
	State Display Component

	Simple component to display entity state as a badge.
	Replaces the FSMStateBar component after FSM simplification.

	Usage:
	<StateDisplay state="active" entityKind="project" />
-->
<script lang="ts">
	import { getProjectStateBadgeClass } from '$lib/utils/ontology-badge-styles';
	import { getPlanStateBadgeClass } from '$lib/utils/ontology-badge-styles';

	interface Props {
		state?: string;
		entityKind: 'project' | 'plan' | 'task' | 'document' | 'goal' | 'milestone' | 'risk';
		class?: string;
	}

	let { state, entityKind, class: className = '' }: Props = $props();

	const stateLabel = $derived.by(() => {
		// Format state for display (replace underscores, capitalize)
		if (!state) return 'Unknown';
		return state
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	});

	const badgeClass = $derived.by(() => {
		if (!state) return 'bg-muted text-muted-foreground';

		switch (entityKind) {
			case 'project':
				return getProjectStateBadgeClass(state);
			case 'plan':
				return getPlanStateBadgeClass(state);
			default:
				// Default badge styling based on common state values
				switch (state) {
					case 'todo':
					case 'draft':
					case 'pending':
					case 'identified':
						return 'bg-muted text-muted-foreground';
					case 'in_progress':
					case 'active':
					case 'ready':
						return 'bg-accent/20 text-accent';
					case 'done':
					case 'completed':
					case 'achieved':
					case 'published':
					case 'closed':
					case 'mitigated':
						return 'bg-success/15 text-success';
					case 'blocked':
					case 'missed':
					case 'occurred':
					case 'abandoned':
					case 'cancelled':
						return 'bg-destructive/15 text-destructive';
					case 'review':
					case 'in_review':
						return 'bg-warning/15 text-warning';
					case 'archived':
						return 'bg-muted text-muted-foreground';
					default:
						return 'bg-muted text-muted-foreground';
				}
		}
	});
</script>

<span
	class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {badgeClass} {className}"
>
	{stateLabel}
</span>
