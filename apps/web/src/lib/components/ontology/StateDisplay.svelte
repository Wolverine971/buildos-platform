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
		state: string;
		entityKind:
			| 'project'
			| 'plan'
			| 'task'
			| 'output'
			| 'document'
			| 'goal'
			| 'milestone'
			| 'risk';
		class?: string;
	}

	let { state, entityKind, class: className = '' }: Props = $props();

	const stateLabel = $derived.by(() => {
		// Format state for display (replace underscores, capitalize)
		return state
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	});

	const badgeClass = $derived.by(() => {
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
						return 'bg-accent/20 text-accent';
					case 'done':
					case 'completed':
					case 'achieved':
					case 'published':
					case 'closed':
					case 'mitigated':
						return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
					case 'blocked':
					case 'missed':
					case 'occurred':
					case 'abandoned':
					case 'cancelled':
						return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
					case 'review':
						return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
					default:
						return 'bg-muted text-muted-foreground';
				}
		}
	});
</script>

<span
	class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {badgeClass} {className}"
>
	{stateLabel}
</span>
