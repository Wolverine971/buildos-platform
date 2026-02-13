<!-- apps/web/src/lib/components/ontology/EntityListItem.CORRECTED.svelte -->
<!--
	CORRECTED Universal Entity List Item Component

	Uses proper Inkprint weight system:
	- Weight provides: border, shadow, radius, bg, motion
	- Texture provides: semantic overlay pattern
	- Color overrides: entity-specific tints with ! prefix
	- Spacing: separate layer (px-3 py-2.5)

	Key difference from previous version:
	- Applies wt-* class (provides foundation)
	- Uses ! prefix to override border-color and bg
	- Lets weight system control radius, shadow, motion
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

	// Entity configuration (weight-aware)
	const entityConfig = {
		project: {
			icon: FolderKanban,
			iconColor: 'text-emerald-500',
			texture: 'tx tx-frame tx-weak', // Canon, structure
			weight: 'wt-card', // Elevated, important
			borderOverride: '!border-emerald-500',
			bgOverride: '!bg-emerald-50/50 dark:!bg-emerald-900/10',
			hoverOverride: 'hover:!bg-emerald-100/50 dark:hover:!bg-emerald-900/20'
		},
		goal: {
			icon: Target,
			iconColor: 'text-amber-500',
			texture: 'tx tx-bloom tx-weak', // Ideation, expansion
			weight: 'wt-paper', // Standard working
			borderOverride: '!border-l-4 !border-amber-500',
			bgOverride: '!bg-amber-50/50 dark:!bg-amber-900/10',
			hoverOverride: 'hover:!bg-amber-100/50 dark:hover:!bg-amber-900/20'
		},
		milestone: {
			icon: Flag,
			iconColor: 'text-emerald-500',
			texture: 'tx tx-frame tx-weak', // Canon achievement
			weight: 'wt-paper', // Standard (can upgrade to wt-card when completed)
			borderOverride: '!border-emerald-500/30',
			bgOverride: '', // Use weight's default bg
			hoverOverride: 'hover:!bg-emerald-50/30 dark:hover:!bg-emerald-900/10'
		},
		plan: {
			icon: Calendar,
			iconColor: 'text-indigo-500',
			texture: 'tx tx-grain tx-weak', // Execution, progress
			weight: 'wt-paper',
			borderOverride: '!border-l-4 !border-indigo-500',
			bgOverride: '!bg-indigo-50/50 dark:!bg-indigo-900/10',
			hoverOverride: 'hover:!bg-indigo-100/50 dark:hover:!bg-indigo-900/20'
		},
		task: {
			icon: ListChecks,
			iconColor: 'text-muted-foreground',
			texture: 'tx tx-grain tx-weak', // Work, execution
			weight: 'wt-ghost', // Default to ghost, varies by state
			borderOverride: '',
			bgOverride: '',
			hoverOverride: 'hover:!bg-muted/30'
		},
		risk: {
			icon: AlertTriangle,
			iconColor: 'text-red-500',
			texture: 'tx tx-static tx-weak', // Blockers, noise
			weight: 'wt-paper', // Default, escalates to wt-card for high severity
			borderOverride: '!border-dashed !border-red-500/40',
			bgOverride: '!bg-red-50/40 dark:!bg-red-900/10',
			hoverOverride: 'hover:!bg-red-100/50 dark:hover:!bg-red-900/20'
		},
		requirement: {
			icon: FileCheck,
			iconColor: 'text-violet-500',
			texture: 'tx tx-thread tx-weak', // Dependencies, relationships
			weight: 'wt-paper',
			borderOverride: '!border-dotted !border-violet-500/40',
			bgOverride: '!bg-violet-50/40 dark:!bg-violet-900/10',
			hoverOverride: 'hover:!bg-violet-100/50 dark:hover:!bg-violet-900/20'
		},
		document: {
			icon: FileText,
			iconColor: 'text-sky-500',
			texture: 'tx tx-frame tx-weak', // Reference, structure
			weight: 'wt-paper',
			borderOverride: '!border-sky-500/30',
			bgOverride: '!bg-sky-50/40 dark:!bg-sky-900/10',
			hoverOverride: 'hover:!bg-sky-100/50 dark:hover:!bg-sky-900/20'
		},
		event: {
			icon: Clock,
			iconColor: 'text-blue-500',
			texture: 'tx tx-frame tx-weak', // Scheduled, structured
			weight: 'wt-paper',
			borderOverride: '!border-blue-500/30',
			bgOverride: '!bg-blue-50/40 dark:!bg-blue-900/10',
			hoverOverride: 'hover:!bg-blue-100/50 dark:hover:!bg-blue-900/20'
		}
	};

	// Task state-specific configuration
	const taskStateConfig = $derived.by(() => {
		if (type !== 'task' || !state) return null;

		switch (state) {
			case 'done':
			case 'completed':
				return {
					icon: CheckCircle2,
					iconColor: 'text-emerald-500',
					weight: 'wt-card', // Completed = elevated
					borderOverride: '!border-emerald-500/30',
					bgOverride: '!bg-emerald-50/30 dark:!bg-emerald-900/10',
					hoverOverride: 'hover:!bg-emerald-100/40 dark:hover:!bg-emerald-900/20'
				};
			case 'in_progress':
			case 'active':
				return {
					icon: CircleDot,
					iconColor: 'text-amber-500',
					weight: 'wt-paper', // Active = standard
					borderOverride: '!border-amber-500/30',
					bgOverride: '!bg-amber-50/30 dark:!bg-amber-900/10',
					hoverOverride: 'hover:!bg-amber-100/40 dark:hover:!bg-amber-900/20'
				};
			default:
				return {
					icon: Circle,
					iconColor: 'text-muted-foreground',
					weight: 'wt-ghost', // Todo = ephemeral
					borderOverride: '',
					bgOverride: '',
					hoverOverride: 'hover:!bg-muted/30'
				};
		}
	});

	// Risk severity-specific weight escalation
	const riskSeverityConfig = $derived.by(() => {
		if (type !== 'risk' || !severity) return null;

		const isHighSeverity = severity === 'high' || severity === 'critical';
		return {
			weight: isHighSeverity ? 'wt-card' : 'wt-paper',
			borderOverride: isHighSeverity
				? '!border-dashed !border-red-600'
				: '!border-dashed !border-red-500/40',
			bgOverride: isHighSeverity
				? '!bg-red-50 dark:!bg-red-900/20'
				: '!bg-red-50/40 dark:!bg-red-900/10',
			hoverOverride: isHighSeverity
				? 'hover:!bg-red-100 dark:hover:!bg-red-900/30'
				: 'hover:!bg-red-100/50 dark:hover:!bg-red-900/20',
			iconClass: isHighSeverity ? 'animate-pulse' : ''
		};
	});

	// Merge base config with state/severity overrides
	const visual = $derived.by(() => {
		const base = entityConfig[type];

		// Task state overrides
		if (taskStateConfig) {
			return {
				...base,
				...taskStateConfig,
				texture: base.texture // Keep base texture
			};
		}

		// Risk severity overrides
		if (riskSeverityConfig) {
			return {
				...base,
				...riskSeverityConfig,
				iconColor: base.iconColor // Keep base icon color
			};
		}

		return base;
	});

	const Icon = $derived(visual.icon);

	// Text styling for completed tasks
	const titleClass = $derived(
		type === 'task' && (state === 'done' || state === 'completed')
			? 'text-sm text-muted-foreground line-through truncate'
			: 'text-sm font-medium text-foreground truncate'
	);

	// Combine all classes
	const buttonClasses = $derived(
		[
			'w-full flex items-center gap-3 text-left',
			'px-3 py-2.5', // Spacing (separate layer)
			visual.weight, // Weight provides: border, shadow, radius, bg, motion
			visual.texture, // Texture provides: semantic pattern
			visual.borderOverride, // Entity-specific border color
			visual.bgOverride, // Entity-specific bg tint
			visual.hoverOverride, // Entity-specific hover state
			'transition-colors', // Only override transition-property, not duration
			'pressable',
			className
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<button type="button" {onclick} class={buttonClasses}>
	<Icon class="w-4 h-4 shrink-0 {visual.iconColor} {visual.iconClass || ''}" />
	<div class="min-w-0 flex-1">
		<p class={titleClass}>{title}</p>
		{#if metadata}
			<p class="text-xs text-muted-foreground">{metadata}</p>
		{/if}
	</div>
</button>
