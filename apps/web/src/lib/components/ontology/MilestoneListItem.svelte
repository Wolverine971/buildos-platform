<!-- apps/web/src/lib/components/ontology/MilestoneListItem.svelte -->
<!--
	Milestone List Item - Standards-Compliant Nested Design

	PRINCIPLE: Proper nesting with maintained readability.

	Design (per SPACING_BORDER_STANDARDS.md - Compact/Nested pattern):
	- Edge-to-edge (no rounded corners - structural element)
	- Emerald hover (semantic color identity for milestones)
	- Icons provide state-based semantic color
	- Compact/Nested spacing (px-3 py-1.5 = 12px/6px when compact)
	- Gap: gap-2 (8px - proper icon+text pairing)
	- Icons: w-3.5 h-3.5 (14px - Compact tier)
	- Text: text-xs (12px - comfortable reading)
	- Clean, readable, properly subordinate to parent goals

	Visibility patterns:
	- Svelte conditionals ({#if}) for logic-based visibility
	- CSS classes for responsive/hover visibility (hidden/flex sm:hidden, group-hover:flex)
-->
<script lang="ts">
	import { Circle, CircleDot, CheckCircle2, XCircle, MoreHorizontal, Check } from 'lucide-svelte';
	import { resolveMilestoneState } from '$lib/utils/milestone-state';

	interface Milestone {
		id: string;
		title: string;
		due_at: string | null;
		state_key?: string | null;
		props?: Record<string, unknown> | null;
	}

	interface Props {
		milestone: Milestone;
		onEdit: (id: string) => void;
		onToggleComplete?: (id: string, currentState: string) => void;
		compact?: boolean;
	}

	let { milestone, onEdit, onToggleComplete, compact = false }: Props = $props();

	const resolvedState = $derived(resolveMilestoneState(milestone));
	const effectiveState = $derived(resolvedState.state);

	const stateVisuals = $derived.by(() => {
		const state = effectiveState;

		if (state === 'completed') {
			return {
				icon: CheckCircle2,
				iconColor: 'text-emerald-500',
				isCompleted: true,
				isMissed: false
			};
		}

		if (resolvedState.isMissed) {
			return {
				icon: XCircle,
				iconColor: 'text-destructive',
				isCompleted: false,
				isMissed: true
			};
		}

		if (state === 'in_progress') {
			return {
				icon: CircleDot,
				iconColor: 'text-accent',
				isCompleted: false,
				isMissed: false
			};
		}

		return {
			icon: Circle,
			iconColor: 'text-muted-foreground',
			isCompleted: false,
			isMissed: false
		};
	});

	const StateIcon = $derived(stateVisuals.icon);
	const canToggle = $derived(
		onToggleComplete && effectiveState !== 'completed' && effectiveState !== 'missed'
	);

	function formatDueDate(dateString: string | null): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '';

		const now = new Date();
		const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Tomorrow';
		if (diffDays === -1) return 'Yesterday';
		if (diffDays > 0 && diffDays <= 7) return `In ${diffDays}d`;
		if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)}d ago`;

		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	const formattedDueDate = $derived(formatDueDate(milestone.due_at));

	function handleToggleComplete(e: MouseEvent) {
		e.stopPropagation();
		if (onToggleComplete) {
			onToggleComplete(milestone.id, effectiveState);
		}
	}

	function handleRowClick() {
		onEdit(milestone.id);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onEdit(milestone.id);
		}
	}
</script>

<!-- Clean edge-to-edge list item with emerald hover -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	onclick={handleRowClick}
	onkeydown={handleKeyDown}
	role="button"
	tabindex="0"
	class="w-full flex items-center gap-2 text-left cursor-pointer px-3 py-2 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition-colors group"
	class:py-1.5={compact}
	aria-label="Edit milestone: {milestone.title}"
>
	<StateIcon class="w-3.5 h-3.5 shrink-0 {stateVisuals.iconColor}" />

	<div class="min-w-0 flex-1">
		<p
			class="text-xs truncate"
			class:text-muted-foreground={stateVisuals.isCompleted || !stateVisuals.isMissed}
			class:text-foreground={stateVisuals.isMissed ||
				(!stateVisuals.isCompleted && !stateVisuals.isMissed)}
			class:line-through={stateVisuals.isCompleted}
		>
			{milestone.title}
		</p>
	</div>

	{#if formattedDueDate}
		<span
			class="text-xs shrink-0"
			class:text-destructive={resolvedState.isMissed}
			class:text-muted-foreground={!resolvedState.isMissed}
		>
			{formattedDueDate}
		</span>
	{/if}

	<!-- Toggle complete button - appears on hover (CSS), logic-gated (Svelte) -->
	{#if canToggle}
		<button
			type="button"
			onclick={handleToggleComplete}
			class="hidden group-hover:flex items-center justify-center w-4 h-4 rounded-md shrink-0 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 transition-colors pressable"
			aria-label="Mark {milestone.title} as complete"
			title="Mark as complete"
		>
			<Check class="w-2.5 h-2.5" />
		</button>
	{/if}

	<!-- Mobile edit button - always visible on mobile (CSS responsive) -->
	<button
		type="button"
		onclick={(e) => {
			e.stopPropagation();
			onEdit(milestone.id);
		}}
		class="flex sm:hidden items-center justify-center w-4 h-4 rounded-md shrink-0 hover:bg-muted text-muted-foreground transition-colors pressable"
		aria-label="Edit {milestone.title}"
	>
		<MoreHorizontal class="w-3 h-3" />
	</button>
</div>
