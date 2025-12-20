<!-- apps/web/src/lib/components/ontology/graph/NodeDetailsPanel.svelte -->
<!--
	Node Details Panel - Displays comprehensive information about a selected graph node.

	Features:
	- Type-specific content sections (project, goal, milestone, plan, task, document, risk, decision)
	- Inkprint Design System styling with semantic textures
	- Rich metadata display with proper hierarchy
	- Responsive layout for panel integration
	- State badges with color coding
-->
<script lang="ts">
	import {
		X,
		ExternalLink,
		FolderKanban,
		ListChecks,
		Calendar,
		Target,
		Flag,
		Layers,
		FileText,
		Link2,
		Users,
		AlertTriangle,
		Scale,
		Clock,
		CheckCircle2,
		Circle,
		CalendarDays,
		Lightbulb,
		Shield,
		BookOpen
	} from 'lucide-svelte';
	import type { GraphNode, NodeType } from './lib/graph.types';

	interface Props {
		node: GraphNode | null;
		onClose: () => void;
		/** Whether to show the external link button (hide for public/demo views) */
		showDetailLink?: boolean;
	}

	let { node, onClose, showDetailLink = true }: Props = $props();

	// Type configuration with icons, colors, and textures
	const typeConfig: Record<
		NodeType | 'unknown',
		{
			icon: typeof FolderKanban;
			color: string;
			bgColor: string;
			borderColor: string;
			texture: string;
			label: string;
		}
	> = {
		project: {
			icon: FolderKanban,
			color: 'text-slate-600 dark:text-slate-300',
			bgColor: 'bg-slate-100 dark:bg-slate-800',
			borderColor: 'border-slate-300 dark:border-slate-600',
			texture: 'tx tx-frame tx-weak',
			label: 'Project'
		},
		goal: {
			icon: Target,
			color: 'text-amber-600 dark:text-amber-400',
			bgColor: 'bg-amber-50 dark:bg-amber-950/50',
			borderColor: 'border-amber-200 dark:border-amber-800',
			texture: 'tx tx-bloom tx-weak',
			label: 'Goal'
		},
		milestone: {
			icon: Flag,
			color: 'text-emerald-600 dark:text-emerald-400',
			bgColor: 'bg-emerald-50 dark:bg-emerald-950/50',
			borderColor: 'border-emerald-200 dark:border-emerald-800',
			texture: 'tx tx-grain tx-weak',
			label: 'Milestone'
		},
		plan: {
			icon: Calendar,
			color: 'text-indigo-600 dark:text-indigo-400',
			bgColor: 'bg-indigo-50 dark:bg-indigo-950/50',
			borderColor: 'border-indigo-200 dark:border-indigo-800',
			texture: 'tx tx-thread tx-weak',
			label: 'Plan'
		},
		task: {
			icon: ListChecks,
			color: 'text-slate-600 dark:text-slate-400',
			bgColor: 'bg-slate-50 dark:bg-slate-900/50',
			borderColor: 'border-slate-200 dark:border-slate-700',
			texture: 'tx tx-grain tx-weak',
			label: 'Task'
		},
		output: {
			icon: Layers,
			color: 'text-purple-600 dark:text-purple-400',
			bgColor: 'bg-purple-50 dark:bg-purple-950/50',
			borderColor: 'border-purple-200 dark:border-purple-800',
			texture: 'tx tx-bloom tx-weak',
			label: 'Output'
		},
		document: {
			icon: FileText,
			color: 'text-sky-600 dark:text-sky-400',
			bgColor: 'bg-sky-50 dark:bg-sky-950/50',
			borderColor: 'border-sky-200 dark:border-sky-800',
			texture: 'tx tx-frame tx-weak',
			label: 'Document'
		},
		risk: {
			icon: AlertTriangle,
			color: 'text-red-600 dark:text-red-400',
			bgColor: 'bg-red-50 dark:bg-red-950/50',
			borderColor: 'border-red-200 dark:border-red-800',
			texture: 'tx tx-static tx-weak',
			label: 'Risk'
		},
		decision: {
			icon: Scale,
			color: 'text-violet-600 dark:text-violet-400',
			bgColor: 'bg-violet-50 dark:bg-violet-950/50',
			borderColor: 'border-violet-200 dark:border-violet-800',
			texture: 'tx tx-frame tx-weak',
			label: 'Decision'
		},
		unknown: {
			icon: Circle,
			color: 'text-muted-foreground',
			bgColor: 'bg-muted',
			borderColor: 'border-border',
			texture: '',
			label: 'Node'
		}
	};

	const config = $derived(typeConfig[(node?.type as NodeType) ?? 'unknown'] ?? typeConfig.unknown);

	// State badge configuration
	const stateConfig: Record<string, { color: string; bgColor: string; label: string }> = {
		// Project states
		planning: { color: 'text-slate-700 dark:text-slate-300', bgColor: 'bg-slate-100 dark:bg-slate-800', label: 'Planning' },
		active: { color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-100 dark:bg-amber-900/50', label: 'Active' },
		completed: { color: 'text-emerald-700 dark:text-emerald-300', bgColor: 'bg-emerald-100 dark:bg-emerald-900/50', label: 'Completed' },
		cancelled: { color: 'text-red-700 dark:text-red-300', bgColor: 'bg-red-100 dark:bg-red-900/50', label: 'Cancelled' },
		// Task states
		todo: { color: 'text-slate-700 dark:text-slate-300', bgColor: 'bg-slate-100 dark:bg-slate-800', label: 'To Do' },
		in_progress: { color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-100 dark:bg-amber-900/50', label: 'In Progress' },
		done: { color: 'text-emerald-700 dark:text-emerald-300', bgColor: 'bg-emerald-100 dark:bg-emerald-900/50', label: 'Done' },
		blocked: { color: 'text-red-700 dark:text-red-300', bgColor: 'bg-red-100 dark:bg-red-900/50', label: 'Blocked' },
		// Goal states
		defined: { color: 'text-slate-700 dark:text-slate-300', bgColor: 'bg-slate-100 dark:bg-slate-800', label: 'Defined' },
		achieved: { color: 'text-emerald-700 dark:text-emerald-300', bgColor: 'bg-emerald-100 dark:bg-emerald-900/50', label: 'Achieved' },
		abandoned: { color: 'text-red-700 dark:text-red-300', bgColor: 'bg-red-100 dark:bg-red-900/50', label: 'Abandoned' },
		// Plan states
		draft: { color: 'text-slate-700 dark:text-slate-300', bgColor: 'bg-slate-100 dark:bg-slate-800', label: 'Draft' },
		// Risk states
		identified: { color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-100 dark:bg-amber-900/50', label: 'Identified' },
		mitigated: { color: 'text-emerald-700 dark:text-emerald-300', bgColor: 'bg-emerald-100 dark:bg-emerald-900/50', label: 'Mitigated' },
		occurred: { color: 'text-red-700 dark:text-red-300', bgColor: 'bg-red-100 dark:bg-red-900/50', label: 'Occurred' },
		closed: { color: 'text-slate-700 dark:text-slate-300', bgColor: 'bg-slate-100 dark:bg-slate-800', label: 'Closed' },
		// Document states
		review: { color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-100 dark:bg-amber-900/50', label: 'In Review' },
		published: { color: 'text-emerald-700 dark:text-emerald-300', bgColor: 'bg-emerald-100 dark:bg-emerald-900/50', label: 'Published' }
	};

	// Helper functions
	function readString(metadata: Record<string, unknown> | undefined, ...keys: string[]): string | null {
		if (!metadata) return null;
		for (const key of keys) {
			const value = metadata[key];
			if (typeof value === 'string' && value.length > 0) {
				return value;
			}
		}
		return null;
	}

	function readNumber(metadata: Record<string, unknown> | undefined, ...keys: string[]): number | null {
		if (!metadata) return null;
		for (const key of keys) {
			const value = metadata[key];
			if (typeof value === 'number') {
				return value;
			}
		}
		return null;
	}

	function formatDate(dateStr: string | null | undefined): string {
		if (!dateStr) return '';
		try {
			const date = new Date(dateStr);
			return date.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return dateStr;
		}
	}

	function formatDateTime(dateStr: string | null | undefined): string {
		if (!dateStr) return '';
		try {
			const date = new Date(dateStr);
			return date.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit'
			});
		} catch {
			return dateStr;
		}
	}

	function truncateText(text: string | null | undefined, maxLength: number): string {
		if (!text) return '';
		return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
	}

	function getDetailUrl(current: GraphNode | null): string | null {
		if (!current) return null;
		const meta = current.metadata;
		switch (current.type) {
			case 'project':
				return `/projects/${current.id}`;
			case 'task':
			case 'plan':
			case 'goal':
			case 'milestone':
			case 'document':
			case 'risk':
			case 'decision': {
				const projectId = readString(meta, 'projectId', 'project_id');
				return projectId ? `/projects/${projectId}` : null;
			}
			case 'output': {
				const projectId = readString(meta, 'projectId', 'project_id');
				return projectId ? `/projects/${projectId}/outputs/${current.id}/edit` : null;
			}
			default:
				return null;
		}
	}

	// Derived values
	const detailUrl = $derived(getDetailUrl(node));
	const meta = $derived(node?.metadata ?? {});
	const state = $derived(readString(meta, 'state', 'state_key', 'stateKey') ?? 'unknown');
	const stateStyle = $derived(stateConfig[state] ?? stateConfig.draft);
	const description = $derived(readString(meta, 'description', 'desc'));
	const typeKey = $derived(readString(meta, 'typeKey', 'type_key'));

	// Type-specific derived values
	// Project
	const projectContext = $derived(readString(meta, 'context', 'facet_context'));
	const projectScale = $derived(readString(meta, 'scale', 'facet_scale'));
	const projectStage = $derived(readString(meta, 'stage', 'facet_stage'));

	// Goal
	const goalText = $derived(readString(meta, 'goal'));
	const targetDate = $derived(readString(meta, 'targetDate', 'target_date'));
	const completedAt = $derived(readString(meta, 'completedAt', 'completed_at'));

	// Milestone
	const milestoneText = $derived(readString(meta, 'milestone'));
	const dueAt = $derived(readString(meta, 'dueAt', 'due_at'));
	const milestoneCompletedAt = $derived(readString(meta, 'completedAt', 'completed_at'));

	// Plan
	const planText = $derived(readString(meta, 'plan'));

	// Task
	const priority = $derived(readNumber(meta, 'priority'));
	const taskDueAt = $derived(readString(meta, 'dueAt', 'due_at'));
	const taskStartAt = $derived(readString(meta, 'startAt', 'start_at'));
	const taskCompletedAt = $derived(readString(meta, 'completedAt', 'completed_at'));

	// Document
	const content = $derived(readString(meta, 'content'));
	const documentTitle = $derived(readString(meta, 'title'));

	// Risk
	const probability = $derived(readNumber(meta, 'probability'));
	const impact = $derived(readString(meta, 'impact'));
	const riskContent = $derived(readString(meta, 'content'));
	const mitigatedAt = $derived(readString(meta, 'mitigatedAt', 'mitigated_at'));

	// Decision
	const rationale = $derived(readString(meta, 'rationale'));
	const decisionAt = $derived(readString(meta, 'decisionAt', 'decision_at'));

	// Props (extra metadata)
	const props = $derived(meta.props as Record<string, unknown> | undefined);
</script>

<div class="h-full flex flex-col bg-card border-l border-border shadow-ink-inner {config.texture}">
	<!-- Header with type icon and close button -->
	<header class="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
		<div
			class="flex items-center justify-center w-10 h-10 rounded-xl {config.bgColor} border {config.borderColor} flex-shrink-0 shadow-ink"
		>
			<svelte:component this={config.icon} class="w-5 h-5 {config.color}" />
		</div>
		<div class="flex-1 min-w-0">
			<h2 class="text-base font-semibold text-foreground truncate" title={node?.label}>
				{node?.label ?? 'Untitled'}
			</h2>
			<div class="flex items-center gap-2 mt-0.5">
				<span class="text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground font-medium">
					{config.label}
				</span>
				{#if state !== 'unknown'}
					<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[0.6rem] font-medium {stateStyle.bgColor} {stateStyle.color}">
						{stateStyle.label}
					</span>
				{/if}
			</div>
		</div>
		<button
			type="button"
			class="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition pressable"
			onclick={onClose}
			aria-label="Close details panel"
		>
			<X class="w-4 h-4" />
		</button>
	</header>

	<!-- Connection Stats -->
	<div class="flex border-b border-border bg-background/50">
		<div class="flex-1 flex items-center gap-2 px-4 py-2.5 border-r border-border">
			<Link2 class="w-3.5 h-3.5 text-muted-foreground" />
			<span class="text-sm font-semibold text-foreground">{node?.connectedEdges ?? 0}</span>
			<span class="text-[0.65rem] text-muted-foreground uppercase tracking-wide">edges</span>
		</div>
		<div class="flex-1 flex items-center gap-2 px-4 py-2.5">
			<Users class="w-3.5 h-3.5 text-muted-foreground" />
			<span class="text-sm font-semibold text-foreground">{node?.neighbors ?? 0}</span>
			<span class="text-[0.65rem] text-muted-foreground uppercase tracking-wide">neighbors</span>
		</div>
	</div>

	<!-- Scrollable Content Area -->
	<div class="flex-1 overflow-y-auto">
		<!-- Description Section (if present) -->
		{#if description}
			<div class="px-4 py-3 border-b border-border/50">
				<p class="text-[0.65rem] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-1.5">
					Description
				</p>
				<p class="text-sm text-foreground leading-relaxed">
					{truncateText(description, 300)}
				</p>
			</div>
		{/if}

		<!-- Type-Specific Content -->
		{#if node?.type === 'project'}
			<!-- Project Details -->
			<div class="px-4 py-3 space-y-3 border-b border-border/50">
				{#if projectContext || projectScale || projectStage}
					<div>
						<p class="text-[0.65rem] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-2">
							Facets
						</p>
						<div class="flex flex-wrap gap-1.5">
							{#if projectContext}
								<span class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-muted text-muted-foreground border border-border">
									<BookOpen class="w-3 h-3" />
									{projectContext}
								</span>
							{/if}
							{#if projectScale}
								<span class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-muted text-muted-foreground border border-border">
									<Layers class="w-3 h-3" />
									{projectScale}
								</span>
							{/if}
							{#if projectStage}
								<span class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-muted text-muted-foreground border border-border">
									<Flag class="w-3 h-3" />
									{projectStage}
								</span>
							{/if}
						</div>
					</div>
				{/if}
			</div>

		{:else if node?.type === 'goal'}
			<!-- Goal Details -->
			<div class="px-4 py-3 space-y-3 border-b border-border/50">
				{#if goalText}
					<div>
						<p class="text-[0.65rem] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-1.5">
							Goal Statement
						</p>
						<p class="text-sm text-foreground leading-relaxed italic">
							"{truncateText(goalText, 250)}"
						</p>
					</div>
				{/if}
				<div class="flex flex-wrap gap-4">
					{#if targetDate}
						<div class="flex items-center gap-2">
							<CalendarDays class="w-3.5 h-3.5 text-amber-500" />
							<div>
								<p class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Target</p>
								<p class="text-xs font-medium text-foreground">{formatDate(targetDate)}</p>
							</div>
						</div>
					{/if}
					{#if completedAt}
						<div class="flex items-center gap-2">
							<CheckCircle2 class="w-3.5 h-3.5 text-emerald-500" />
							<div>
								<p class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Achieved</p>
								<p class="text-xs font-medium text-foreground">{formatDate(completedAt)}</p>
							</div>
						</div>
					{/if}
				</div>
			</div>

		{:else if node?.type === 'milestone'}
			<!-- Milestone Details -->
			<div class="px-4 py-3 space-y-3 border-b border-border/50">
				{#if milestoneText}
					<div>
						<p class="text-[0.65rem] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-1.5">
							Milestone Details
						</p>
						<p class="text-sm text-foreground leading-relaxed">
							{truncateText(milestoneText, 250)}
						</p>
					</div>
				{/if}
				<div class="flex flex-wrap gap-4">
					{#if dueAt}
						<div class="flex items-center gap-2">
							<Clock class="w-3.5 h-3.5 text-amber-500" />
							<div>
								<p class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Due</p>
								<p class="text-xs font-medium text-foreground">{formatDate(dueAt)}</p>
							</div>
						</div>
					{/if}
					{#if milestoneCompletedAt}
						<div class="flex items-center gap-2">
							<CheckCircle2 class="w-3.5 h-3.5 text-emerald-500" />
							<div>
								<p class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Completed</p>
								<p class="text-xs font-medium text-foreground">{formatDate(milestoneCompletedAt)}</p>
							</div>
						</div>
					{/if}
				</div>
			</div>

		{:else if node?.type === 'plan'}
			<!-- Plan Details -->
			<div class="px-4 py-3 space-y-3 border-b border-border/50">
				{#if planText}
					<div>
						<p class="text-[0.65rem] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-1.5">
							Plan Content
						</p>
						<p class="text-sm text-foreground leading-relaxed">
							{truncateText(planText, 300)}
						</p>
					</div>
				{/if}
			</div>

		{:else if node?.type === 'task'}
			<!-- Task Details -->
			<div class="px-4 py-3 space-y-3 border-b border-border/50">
				<div class="flex flex-wrap gap-4">
					{#if priority !== null}
						<div class="flex items-center gap-2">
							<Lightbulb class="w-3.5 h-3.5 text-indigo-500" />
							<div>
								<p class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Priority</p>
								<p class="text-xs font-medium text-foreground">P{priority}</p>
							</div>
						</div>
					{/if}
					{#if taskDueAt}
						<div class="flex items-center gap-2">
							<Clock class="w-3.5 h-3.5 text-amber-500" />
							<div>
								<p class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Due</p>
								<p class="text-xs font-medium text-foreground">{formatDate(taskDueAt)}</p>
							</div>
						</div>
					{/if}
					{#if taskStartAt}
						<div class="flex items-center gap-2">
							<Calendar class="w-3.5 h-3.5 text-sky-500" />
							<div>
								<p class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Started</p>
								<p class="text-xs font-medium text-foreground">{formatDate(taskStartAt)}</p>
							</div>
						</div>
					{/if}
					{#if taskCompletedAt}
						<div class="flex items-center gap-2">
							<CheckCircle2 class="w-3.5 h-3.5 text-emerald-500" />
							<div>
								<p class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Completed</p>
								<p class="text-xs font-medium text-foreground">{formatDate(taskCompletedAt)}</p>
							</div>
						</div>
					{/if}
				</div>
			</div>

		{:else if node?.type === 'document'}
			<!-- Document Details -->
			<div class="px-4 py-3 space-y-3 border-b border-border/50">
				{#if content}
					<div>
						<p class="text-[0.65rem] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-1.5">
							Content Preview
						</p>
						<div class="text-sm text-foreground leading-relaxed bg-muted/30 rounded-lg p-3 border border-border/50">
							{truncateText(content, 300)}
						</div>
					</div>
				{/if}
			</div>

		{:else if node?.type === 'risk'}
			<!-- Risk Details -->
			<div class="px-4 py-3 space-y-3 border-b border-border/50">
				<div class="flex flex-wrap gap-4">
					{#if probability !== null}
						<div class="flex items-center gap-2">
							<Target class="w-3.5 h-3.5 text-amber-500" />
							<div>
								<p class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Probability</p>
								<p class="text-xs font-medium text-foreground">{(probability * 100).toFixed(0)}%</p>
							</div>
						</div>
					{/if}
					{#if impact}
						<div class="flex items-center gap-2">
							<AlertTriangle class="w-3.5 h-3.5 text-red-500" />
							<div>
								<p class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Impact</p>
								<p class="text-xs font-medium text-foreground capitalize">{impact}</p>
							</div>
						</div>
					{/if}
					{#if mitigatedAt}
						<div class="flex items-center gap-2">
							<Shield class="w-3.5 h-3.5 text-emerald-500" />
							<div>
								<p class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Mitigated</p>
								<p class="text-xs font-medium text-foreground">{formatDate(mitigatedAt)}</p>
							</div>
						</div>
					{/if}
				</div>
				{#if riskContent}
					<div>
						<p class="text-[0.65rem] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-1.5">
							Risk Details
						</p>
						<p class="text-sm text-foreground leading-relaxed">
							{truncateText(riskContent, 250)}
						</p>
					</div>
				{/if}
			</div>

		{:else if node?.type === 'decision'}
			<!-- Decision Details -->
			<div class="px-4 py-3 space-y-3 border-b border-border/50">
				{#if decisionAt}
					<div class="flex items-center gap-2">
						<CalendarDays class="w-3.5 h-3.5 text-violet-500" />
						<div>
							<p class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Decision Date</p>
							<p class="text-xs font-medium text-foreground">{formatDateTime(decisionAt)}</p>
						</div>
					</div>
				{/if}
				{#if rationale}
					<div>
						<p class="text-[0.65rem] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-1.5">
							Rationale
						</p>
						<p class="text-sm text-foreground leading-relaxed italic">
							"{truncateText(rationale, 300)}"
						</p>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Type Key -->
		{#if typeKey}
			<div class="px-4 py-2.5 border-b border-border/50 flex items-center justify-between gap-2">
				<span class="text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground shrink-0 font-medium">Type</span>
				<code class="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
					{typeKey}
				</code>
			</div>
		{/if}

		<!-- Extra Props (if any meaningful ones exist) -->
		{#if props && Object.keys(props).length > 0}
			{@const displayProps = Object.entries(props)
				.filter(([key, value]) =>
					value !== null &&
					value !== undefined &&
					value !== '' &&
					!['description', 'content', 'goal', 'plan', 'milestone', 'rationale'].includes(key)
				)
				.slice(0, 6)}
			{#if displayProps.length > 0}
				<div class="px-4 py-3 border-b border-border/50">
					<p class="text-[0.65rem] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-2">
						Additional Info
					</p>
					<dl class="space-y-1.5">
						{#each displayProps as [key, value]}
							<div class="flex items-start gap-2 text-xs">
								<dt class="text-muted-foreground flex-shrink-0 min-w-[80px] capitalize">
									{key.replace(/_/g, ' ')}
								</dt>
								<dd class="text-foreground break-words">
									{typeof value === 'object' ? JSON.stringify(value) : String(value)}
								</dd>
							</div>
						{/each}
					</dl>
				</div>
			{/if}
		{/if}

		<!-- Node ID -->
		<div class="px-4 py-2.5 flex items-center justify-between gap-2">
			<span class="text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground shrink-0 font-medium">ID</span>
			<code class="text-[0.6rem] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border break-all text-right max-w-[180px] truncate" title={node?.id ?? ''}>
				{(node?.id ?? '').slice(0, 18)}...
			</code>
		</div>
	</div>

	<!-- Action Footer -->
	{#if showDetailLink && detailUrl}
		<div class="px-4 py-3 border-t border-border bg-muted/20">
			<a
				href={detailUrl}
				class="flex items-center justify-center gap-2 w-full h-9 text-sm font-semibold rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 shadow-ink pressable transition"
			>
				<ExternalLink class="w-4 h-4" />
				<span>View in Project</span>
			</a>
		</div>
	{/if}
</div>
