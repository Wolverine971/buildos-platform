<!-- apps/web/src/lib/components/ontology/EntityListItem.svelte -->
<!--
	Universal Entity List Item Component

	Simplified version using:
	- CSS custom properties for entity-specific colors (no !important)
	- data-entity-type attribute for targeting
	- Inkprint semantic tokens where possible
	- Clean separation: weight system + entity colors
-->
<script lang="ts">
	import {
		FolderKanban,
		Target,
		Flag,
		Calendar,
		ListChecks,
		Circle,
		CircleDot,
		CheckCircle2,
		AlertTriangle,
		FileCheck,
		FileText,
		Clock
	} from 'lucide-svelte';

	type EntityType =
		| 'project'
		| 'goal'
		| 'milestone'
		| 'plan'
		| 'task'
		| 'risk'
		| 'requirement'
		| 'document'
		| 'event';

	interface Props {
		type: EntityType;
		title: string;
		metadata?: string;
		state?: string | null;
		severity?: 'low' | 'medium' | 'high' | 'critical';
		onclick?: () => void;
		class?: string;
	}

	let {
		type,
		title,
		metadata,
		state,
		severity,
		onclick,
		class: className = ''
	}: Props = $props();

	// Entity configuration - simplified, no color overrides
	const entityConfig: Record<
		EntityType,
		{
			icon: typeof FolderKanban;
			texture: string;
			weight: string;
			hasLeftAccent?: boolean;
			hasDashedBorder?: boolean;
			hasDottedBorder?: boolean;
		}
	> = {
		project: {
			icon: FolderKanban,
			texture: 'tx tx-frame tx-weak',
			weight: 'wt-card'
		},
		goal: {
			icon: Target,
			texture: 'tx tx-bloom tx-weak',
			weight: 'wt-paper',
			hasLeftAccent: true
		},
		milestone: {
			icon: Flag,
			texture: 'tx tx-frame tx-weak',
			weight: 'wt-paper'
		},
		plan: {
			icon: Calendar,
			texture: 'tx tx-grain tx-weak',
			weight: 'wt-paper',
			hasLeftAccent: true
		},
		task: {
			icon: ListChecks,
			texture: 'tx tx-grain tx-weak',
			weight: 'wt-ghost'
		},
		risk: {
			icon: AlertTriangle,
			texture: 'tx tx-static tx-weak',
			weight: 'wt-paper',
			hasDashedBorder: true
		},
		requirement: {
			icon: FileCheck,
			texture: 'tx tx-thread tx-weak',
			weight: 'wt-paper',
			hasDottedBorder: true
		},
		document: {
			icon: FileText,
			texture: 'tx tx-frame tx-weak',
			weight: 'wt-paper'
		},
		event: {
			icon: Clock,
			texture: 'tx tx-frame tx-weak',
			weight: 'wt-paper'
		}
	};

	// Get effective state for tasks
	const effectiveTaskState = $derived.by(() => {
		if (type !== 'task') return null;
		if (state === 'done' || state === 'completed') return 'completed';
		if (state === 'in_progress' || state === 'active') return 'active';
		return 'todo';
	});

	// Get effective severity for risks
	const effectiveSeverity = $derived.by(() => {
		if (type !== 'risk') return null;
		return severity === 'high' || severity === 'critical' ? 'high' : 'normal';
	});

	// Determine icon based on state
	const Icon = $derived.by(() => {
		if (type === 'task') {
			if (effectiveTaskState === 'completed') return CheckCircle2;
			if (effectiveTaskState === 'active') return CircleDot;
			return Circle;
		}
		return entityConfig[type].icon;
	});

	// Determine weight based on state
	const weight = $derived.by(() => {
		const base = entityConfig[type].weight;
		if (type === 'task') {
			if (effectiveTaskState === 'completed') return 'wt-card';
			if (effectiveTaskState === 'active') return 'wt-paper';
			return 'wt-ghost';
		}
		if (type === 'risk' && effectiveSeverity === 'high') {
			return 'wt-card';
		}
		return base;
	});

	// Text styling for completed tasks
	const isCompleted = $derived(type === 'task' && effectiveTaskState === 'completed');

	// Build border style classes
	const borderStyle = $derived.by(() => {
		const config = entityConfig[type];
		if (config.hasLeftAccent) return 'border-l-4';
		if (config.hasDashedBorder) return 'border-dashed';
		if (config.hasDottedBorder) return 'border-dotted';
		return '';
	});

	// Animation class for high severity risks
	const iconAnimation = $derived(
		type === 'risk' && effectiveSeverity === 'high' ? 'animate-pulse' : ''
	);
</script>

<button
	type="button"
	{onclick}
	data-entity-type={type}
	data-entity-state={effectiveTaskState}
	data-entity-severity={effectiveSeverity}
	class="entity-list-item w-full flex items-center gap-3 text-left px-3 py-2.5 {weight} {entityConfig[
		type
	].texture} {borderStyle} transition-colors pressable {className}"
>
	<Icon class="entity-icon w-4 h-4 shrink-0 {iconAnimation}" />
	<div class="min-w-0 flex-1">
		<p
			class="text-sm truncate"
			class:font-medium={!isCompleted}
			class:line-through={isCompleted}
			class:text-foreground={!isCompleted}
			class:text-muted-foreground={isCompleted}
		>
			{title}
		</p>
		{#if metadata}
			<p class="text-xs text-muted-foreground">{metadata}</p>
		{/if}
	</div>
</button>

<style>
	/* Entity-specific colors using CSS custom properties */
	/* No !important needed - specificity is handled by data attributes */

	/* Project - emerald (structure, canonical) */
	.entity-list-item[data-entity-type='project'] {
		--entity-color: var(--color-emerald-500, #10b981);
		border-color: var(--entity-color);
		background-color: color-mix(in srgb, var(--entity-color) 5%, transparent);
	}
	.entity-list-item[data-entity-type='project']:hover {
		background-color: color-mix(in srgb, var(--entity-color) 10%, transparent);
	}
	.entity-list-item[data-entity-type='project'] .entity-icon {
		color: var(--entity-color);
	}

	/* Goal - amber (aspiration, ideation) */
	.entity-list-item[data-entity-type='goal'] {
		--entity-color: var(--color-amber-500, #f59e0b);
		border-color: var(--entity-color);
		background-color: color-mix(in srgb, var(--entity-color) 5%, transparent);
	}
	.entity-list-item[data-entity-type='goal']:hover {
		background-color: color-mix(in srgb, var(--entity-color) 10%, transparent);
	}
	.entity-list-item[data-entity-type='goal'] .entity-icon {
		color: var(--entity-color);
	}

	/* Milestone - emerald (achievement) */
	.entity-list-item[data-entity-type='milestone'] {
		--entity-color: var(--color-emerald-500, #10b981);
		border-color: color-mix(in srgb, var(--entity-color) 30%, transparent);
	}
	.entity-list-item[data-entity-type='milestone']:hover {
		background-color: color-mix(in srgb, var(--entity-color) 5%, transparent);
	}
	.entity-list-item[data-entity-type='milestone'] .entity-icon {
		color: var(--entity-color);
	}

	/* Plan - indigo (execution, progress) */
	.entity-list-item[data-entity-type='plan'] {
		--entity-color: var(--color-indigo-500, #6366f1);
		border-color: var(--entity-color);
		background-color: color-mix(in srgb, var(--entity-color) 5%, transparent);
	}
	.entity-list-item[data-entity-type='plan']:hover {
		background-color: color-mix(in srgb, var(--entity-color) 10%, transparent);
	}
	.entity-list-item[data-entity-type='plan'] .entity-icon {
		color: var(--entity-color);
	}

	/* Task - varies by state */
	.entity-list-item[data-entity-type='task'] {
		--entity-color: var(--color-slate-400, #94a3b8);
	}
	.entity-list-item[data-entity-type='task']:hover {
		background-color: var(--color-muted, hsl(var(--muted)));
	}
	.entity-list-item[data-entity-type='task'] .entity-icon {
		color: var(--entity-color);
	}

	/* Task - active state */
	.entity-list-item[data-entity-type='task'][data-entity-state='active'] {
		--entity-color: var(--color-amber-500, #f59e0b);
		border-color: color-mix(in srgb, var(--entity-color) 30%, transparent);
		background-color: color-mix(in srgb, var(--entity-color) 5%, transparent);
	}
	.entity-list-item[data-entity-type='task'][data-entity-state='active']:hover {
		background-color: color-mix(in srgb, var(--entity-color) 10%, transparent);
	}

	/* Task - completed state */
	.entity-list-item[data-entity-type='task'][data-entity-state='completed'] {
		--entity-color: var(--color-emerald-500, #10b981);
		border-color: color-mix(in srgb, var(--entity-color) 30%, transparent);
		background-color: color-mix(in srgb, var(--entity-color) 5%, transparent);
	}
	.entity-list-item[data-entity-type='task'][data-entity-state='completed']:hover {
		background-color: color-mix(in srgb, var(--entity-color) 10%, transparent);
	}

	/* Risk - red (danger, blockers) */
	.entity-list-item[data-entity-type='risk'] {
		--entity-color: var(--color-red-500, #ef4444);
		border-color: color-mix(in srgb, var(--entity-color) 40%, transparent);
		background-color: color-mix(in srgb, var(--entity-color) 5%, transparent);
	}
	.entity-list-item[data-entity-type='risk']:hover {
		background-color: color-mix(in srgb, var(--entity-color) 10%, transparent);
	}
	.entity-list-item[data-entity-type='risk'] .entity-icon {
		color: var(--entity-color);
	}

	/* Risk - high severity */
	.entity-list-item[data-entity-type='risk'][data-entity-severity='high'] {
		border-color: var(--entity-color);
		background-color: color-mix(in srgb, var(--entity-color) 8%, transparent);
	}
	.entity-list-item[data-entity-type='risk'][data-entity-severity='high']:hover {
		background-color: color-mix(in srgb, var(--entity-color) 15%, transparent);
	}

	/* Requirement - violet (dependencies) */
	.entity-list-item[data-entity-type='requirement'] {
		--entity-color: var(--color-violet-500, #8b5cf6);
		border-color: color-mix(in srgb, var(--entity-color) 40%, transparent);
		background-color: color-mix(in srgb, var(--entity-color) 5%, transparent);
	}
	.entity-list-item[data-entity-type='requirement']:hover {
		background-color: color-mix(in srgb, var(--entity-color) 10%, transparent);
	}
	.entity-list-item[data-entity-type='requirement'] .entity-icon {
		color: var(--entity-color);
	}

	/* Document - sky (reference) */
	.entity-list-item[data-entity-type='document'] {
		--entity-color: var(--color-sky-500, #0ea5e9);
		border-color: color-mix(in srgb, var(--entity-color) 30%, transparent);
		background-color: color-mix(in srgb, var(--entity-color) 5%, transparent);
	}
	.entity-list-item[data-entity-type='document']:hover {
		background-color: color-mix(in srgb, var(--entity-color) 10%, transparent);
	}
	.entity-list-item[data-entity-type='document'] .entity-icon {
		color: var(--entity-color);
	}

	/* Event - blue (scheduled) */
	.entity-list-item[data-entity-type='event'] {
		--entity-color: var(--color-blue-500, #3b82f6);
		border-color: color-mix(in srgb, var(--entity-color) 30%, transparent);
		background-color: color-mix(in srgb, var(--entity-color) 5%, transparent);
	}
	.entity-list-item[data-entity-type='event']:hover {
		background-color: color-mix(in srgb, var(--entity-color) 10%, transparent);
	}
	.entity-list-item[data-entity-type='event'] .entity-icon {
		color: var(--entity-color);
	}

	/* Dark mode adjustments */
	:global(.dark) .entity-list-item {
		background-color: color-mix(in srgb, var(--entity-color) 8%, transparent);
	}
	:global(.dark) .entity-list-item:hover {
		background-color: color-mix(in srgb, var(--entity-color) 15%, transparent);
	}
</style>
