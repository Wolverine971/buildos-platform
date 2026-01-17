<!-- apps/web/src/lib/components/ontology/MilestoneListItem.svelte -->
<!--
	Compact Milestone List Item Component

	Displays a milestone row within a goal's milestone section.
	Shows state icon, title, due date, and provides click-to-edit.

	Visual States:
	- Pending: hollow circle, muted text
	- In Progress: half-filled circle, primary text
	- Completed: filled circle with check, success color
	- Missed: hollow circle with X, destructive color

	Documentation:
	- Milestones Under Goals Spec: /thoughts/shared/research/2026-01-16_milestones-under-goals-ux-proposal.md
	- Inkprint Design System: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
-->
<script lang="ts">
	import { Circle, CircleDot, CheckCircle2, XCircle, MoreHorizontal, Check } from 'lucide-svelte';

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

	// Get effective state (check both state_key and props.state_key for compatibility)
	const effectiveState = $derived(
		milestone.state_key || (milestone.props?.state_key as string) || 'pending'
	);

	// Determine if milestone is past due
	const isPastDue = $derived.by(() => {
		if (!milestone.due_at) return false;
		const dueDate = new Date(milestone.due_at);
		const now = new Date();
		return dueDate < now && effectiveState !== 'completed';
	});

	// Get visual properties based on state
	const stateVisuals = $derived.by(() => {
		const state = effectiveState;

		if (state === 'completed') {
			return {
				icon: CheckCircle2,
				iconColor: 'text-emerald-500',
				textColor: 'text-muted-foreground',
				textDecoration: 'line-through',
				label: 'Completed'
			};
		}

		if (state === 'missed' || (isPastDue && state !== 'in_progress')) {
			return {
				icon: XCircle,
				iconColor: 'text-destructive',
				textColor: 'text-foreground',
				textDecoration: '',
				label: 'Missed'
			};
		}

		if (state === 'in_progress') {
			return {
				icon: CircleDot,
				iconColor: 'text-accent',
				textColor: 'text-foreground',
				textDecoration: '',
				label: 'In Progress'
			};
		}

		// Default: pending
		return {
			icon: Circle,
			iconColor: 'text-muted-foreground',
			textColor: 'text-muted-foreground',
			textDecoration: '',
			label: 'Pending'
		};
	});

	const StateIcon = $derived(stateVisuals.icon);

	// Format due date
	function formatDueDate(dateString: string | null): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '';

		const now = new Date();
		const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		// Show relative for near dates
		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Tomorrow';
		if (diffDays === -1) return 'Yesterday';
		if (diffDays > 0 && diffDays <= 7) return `In ${diffDays}d`;
		if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)}d ago`;

		// Otherwise show date
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	const formattedDueDate = $derived(formatDueDate(milestone.due_at));

	// Handle quick complete toggle
	function handleToggleComplete(e: MouseEvent) {
		e.stopPropagation();
		if (onToggleComplete) {
			onToggleComplete(milestone.id, effectiveState);
		}
	}

	// Handle row click
	function handleRowClick() {
		onEdit(milestone.id);
	}

	// Handle keyboard navigation
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onEdit(milestone.id);
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	onclick={handleRowClick}
	onkeydown={handleKeyDown}
	role="button"
	tabindex="0"
	class="
		w-full flex items-center gap-1.5 px-2 text-left cursor-pointer
		hover:bg-accent/5 transition-colors
		group focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset
		{compact ? 'py-0.5' : 'py-1'}
	"
>
	<!-- State Icon (tiny) -->
	<StateIcon class="w-2.5 h-2.5 shrink-0 {stateVisuals.iconColor}" />

	<!-- Content -->
	<div class="min-w-0 flex-1">
		<p
			class="text-[10px] truncate {stateVisuals.textColor} {stateVisuals.textDecoration}"
		>
			{milestone.title}
		</p>
	</div>

	<!-- Due date badge (compact, always inline) -->
	{#if formattedDueDate}
		<span
			class="text-[9px] shrink-0 {isPastDue && effectiveState !== 'completed'
				? 'text-destructive'
				: 'text-muted-foreground/60'}"
		>
			{formattedDueDate}
		</span>
	{/if}

	<!-- Quick action: Toggle complete (hover only on desktop) -->
	{#if onToggleComplete && effectiveState !== 'completed' && effectiveState !== 'missed'}
		<button
			type="button"
			onclick={handleToggleComplete}
			class="
				hidden group-hover:flex
				items-center justify-center
				w-4 h-4 rounded shrink-0
				bg-emerald-500/10 hover:bg-emerald-500/20
				text-emerald-500 transition-colors
			"
			aria-label="Mark as complete"
			title="Mark as complete"
		>
			<Check class="w-2.5 h-2.5" />
		</button>
	{/if}

	<!-- Mobile: Show menu trigger -->
	<button
		type="button"
		onclick={(e) => {
			e.stopPropagation();
			onEdit(milestone.id);
		}}
		class="
			flex sm:hidden
			items-center justify-center
			w-4 h-4 rounded shrink-0
			hover:bg-muted
			text-muted-foreground transition-colors
		"
		aria-label="Edit milestone"
	>
		<MoreHorizontal class="w-3 h-3" />
	</button>
</div>
