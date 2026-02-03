<!-- apps/web/src/routes/design-system/tech-spec-project-v2/+page.svelte -->
<script lang="ts">
	/**
	 * Tech Spec Project Demo v2
	 *
	 * An elevated design combining tech spec aesthetic with full Inkprint texture system.
	 * Demonstrates Mode A (Command Center) patterns: dense, scan-first, high information density.
	 *
	 * Inkprint Integration:
	 * - tx-frame: Structural containers (header, main panels)
	 * - tx-grain: Interactive surfaces (buttons, inputs)
	 * - tx-thread: Dependency/connection displays
	 * - tx-bloom: CTAs and empty states
	 * - tx-pulse: Loading/processing states
	 * - tx-static: Error/warning indicators
	 *
	 * Weight System:
	 * - wt-paper: Default surfaces
	 * - wt-card: Important panels
	 * - wt-plate: Critical sections
	 *
	 * Atmosphere Layer:
	 * - atmo: Subtle depth with gradients
	 * - rim: Edge definition
	 * - rim-accent: Accent highlights
	 */
	import { slide, fade } from 'svelte/transition';
	import {
		ArrowLeft,
		Plus,
		FileText,
		Pencil,
		CheckCircle2,
		Circle,
		Clock,
		Target,
		ChevronDown,
		ChevronRight,
		AlertTriangle,
		ListChecks,
		Zap,
		MoreVertical,
		Flag,
		Copy,
		Check,
		GitBranch,
		Terminal,
		Hash,
		Layers,
		Settings,
		Share2,
		Activity,
		Cpu,
		Package,
		Link2,
		Database,
		Server,
		Eye,
		Bookmark,
		ExternalLink
	} from 'lucide-svelte';

	// Demo state
	let copiedId: string | null = $state(null);

	function copyToClipboard(text: string, id: string) {
		navigator.clipboard.writeText(text);
		copiedId = id;
		setTimeout(() => (copiedId = null), 2000);
	}

	// Collapsible sections - matches project page pattern
	let expandedPanels = $state<Record<string, boolean>>({
		specs: true,
		tasks: true,
		goals: true,
		milestones: false,
		dependencies: true,
		risks: false,
		activity: true
	});

	function togglePanel(key: string) {
		expandedPanels = { ...expandedPanels, [key]: !expandedPanels[key] };
	}

	// Sample project data with expanded metadata
	const project = {
		id: 'PRJ-0042',
		name: 'BuildOS Platform Redesign',
		description:
			'Complete overhaul of the design system with Inkprint textures and tech spec patterns. Implements Mode A command center aesthetic.',
		state_key: 'active',
		type_key: 'product',
		created_at: '2026-01-15T09:00:00Z',
		updated_at: '2026-02-01T14:32:00Z',
		next_step_short: 'Review texture system implementation',
		owner: 'djwayne',
		version: '2.4.1',
		build: '2026.02.01.1432',
		commit: 'a3f2c8d',
		branch: 'feature/inkprint-v2',
		environment: 'staging',
		uptime: '99.7%',
		healthScore: 94
	};

	// Spec sections with detailed technical data
	const specSections = [
		{
			id: 'SPEC-001',
			title: 'Design System Foundation',
			status: 'approved',
			version: '1.2.0',
			items: [
				{ key: 'Texture Classes', value: '6 types × 4 weights', ref: 'TX-MATRIX' },
				{ key: 'Color Tokens', value: '24 semantic + 8 accent', ref: 'CLR-001' },
				{ key: 'Shadow Variants', value: '3 (ink, strong, inner)', ref: 'SHD-001' },
				{ key: 'Spacing Scale', value: 'Dense (2-4 base)', ref: 'SPC-001' }
			]
		},
		{
			id: 'SPEC-002',
			title: 'Component Architecture',
			status: 'in_review',
			version: '0.9.0',
			items: [
				{ key: 'Base Components', value: '18 primitives', ref: 'CMP-BASE' },
				{ key: 'Composite Components', value: '12 patterns', ref: 'CMP-COMP' },
				{ key: 'Layout Patterns', value: '4 modes', ref: 'LAY-001' },
				{ key: 'Animation Curves', value: '3 presets', ref: 'ANI-001' }
			]
		}
	];

	const tasks = [
		{
			id: 'TSK-0891',
			title: 'Implement texture CSS classes',
			state_key: 'done',
			priority: 'high',
			assignee: 'djwayne',
			eta: '2h',
			completedAt: '2026-02-01T12:30:00Z'
		},
		{
			id: 'TSK-0892',
			title: 'Create tech spec demo page v2',
			state_key: 'in_progress',
			priority: 'high',
			assignee: 'djwayne',
			eta: '4h',
			progress: 65
		},
		{
			id: 'TSK-0893',
			title: 'Document texture × weight matrix',
			state_key: 'todo',
			priority: 'medium',
			assignee: null,
			eta: '2h'
		},
		{
			id: 'TSK-0894',
			title: 'Migrate existing components',
			state_key: 'blocked',
			priority: 'high',
			assignee: 'djwayne',
			blockedBy: 'TSK-0893',
			eta: '8h'
		}
	];

	const goals = [
		{
			id: 'GOL-0108',
			name: 'Ship v2 design system by Q1',
			state_key: 'active',
			progress: 65,
			target: '2026-03-31'
		},
		{
			id: 'GOL-0109',
			name: 'Achieve 100% component coverage',
			state_key: 'active',
			progress: 40,
			target: '2026-04-15'
		}
	];

	const milestones = [
		{
			id: 'MIL-0045',
			title: 'Design system spec approved',
			due_at: '2026-01-20',
			state_key: 'completed',
			deliverables: 3
		},
		{
			id: 'MIL-0046',
			title: 'Component migration complete',
			due_at: '2026-02-15',
			state_key: 'at_risk',
			deliverables: 12
		},
		{
			id: 'MIL-0047',
			title: 'Documentation published',
			due_at: '2026-02-28',
			state_key: 'pending',
			deliverables: 8
		}
	];

	const dependencies = [
		{
			from: { id: 'TSK-0892', type: 'task' },
			to: { id: 'TSK-0891', type: 'task' },
			relation: 'blocked_by',
			status: 'resolved'
		},
		{
			from: { id: 'TSK-0894', type: 'task' },
			to: { id: 'TSK-0893', type: 'task' },
			relation: 'blocked_by',
			status: 'blocking'
		},
		{
			from: { id: 'MIL-0046', type: 'milestone' },
			to: { id: 'GOL-0108', type: 'goal' },
			relation: 'contributes_to',
			status: 'active'
		}
	];

	const risks = [
		{
			id: 'RSK-0017',
			title: 'Migration complexity exceeds estimates',
			impact: 'high',
			likelihood: 'medium',
			state_key: 'monitoring',
			mitigation: 'Incremental rollout strategy'
		},
		{
			id: 'RSK-0018',
			title: 'Team adoption resistance',
			impact: 'medium',
			likelihood: 'low',
			state_key: 'identified',
			mitigation: 'Documentation and training sessions'
		}
	];

	const activityLog = [
		{
			timestamp: '14:32:00',
			action: 'Task completed',
			entity: 'TSK-0891',
			entityType: 'task',
			user: 'djwayne',
			detail: 'Texture CSS implementation'
		},
		{
			timestamp: '14:28:15',
			action: 'Spec updated',
			entity: 'SPEC-001',
			entityType: 'spec',
			user: 'djwayne',
			detail: 'Added shadow variants'
		},
		{
			timestamp: '13:45:00',
			action: 'Risk flagged',
			entity: 'RSK-0017',
			entityType: 'risk',
			user: 'system',
			detail: 'Auto-detected from timeline'
		},
		{
			timestamp: '11:20:30',
			action: 'Milestone updated',
			entity: 'MIL-0046',
			entityType: 'milestone',
			user: 'djwayne',
			detail: 'Due date extended'
		},
		{
			timestamp: '10:15:00',
			action: 'Build deployed',
			entity: 'BUILD-1432',
			entityType: 'build',
			user: 'ci',
			detail: 'Staging environment'
		}
	];

	// System health metrics
	const systemMetrics = [
		{ label: 'Build', value: project.build, status: 'ok' },
		{ label: 'Commit', value: project.commit, status: 'ok' },
		{ label: 'Branch', value: project.branch, status: 'ok' },
		{
			label: 'Health',
			value: `${project.healthScore}%`,
			status: project.healthScore > 90 ? 'ok' : 'warning'
		}
	];

	// Helper for status styling with enhanced indicators
	function getStatusIndicator(state: string) {
		const normalized = state?.toLowerCase() || '';
		if (
			normalized === 'done' ||
			normalized === 'completed' ||
			normalized === 'approved' ||
			normalized === 'resolved'
		) {
			return {
				color: 'bg-emerald-500',
				ringColor: 'ring-emerald-500/20',
				label: 'DONE',
				textColor: 'text-emerald-500'
			};
		}
		if (normalized === 'in_progress' || normalized === 'active' || normalized === 'in_review') {
			return {
				color: 'bg-blue-500',
				ringColor: 'ring-blue-500/20',
				label: 'ACTIVE',
				textColor: 'text-blue-500'
			};
		}
		if (normalized === 'blocked' || normalized === 'blocking') {
			return {
				color: 'bg-red-500',
				ringColor: 'ring-red-500/20',
				label: 'BLOCKED',
				textColor: 'text-red-500'
			};
		}
		if (normalized === 'at_risk') {
			return {
				color: 'bg-amber-500',
				ringColor: 'ring-amber-500/20',
				label: 'AT RISK',
				textColor: 'text-amber-500'
			};
		}
		if (normalized === 'monitoring') {
			return {
				color: 'bg-amber-500 animate-pulse',
				ringColor: 'ring-amber-500/20',
				label: 'MONITORING',
				textColor: 'text-amber-500'
			};
		}
		return {
			color: 'bg-slate-400',
			ringColor: 'ring-slate-400/20',
			label: 'PENDING',
			textColor: 'text-muted-foreground'
		};
	}

	function getTaskIcon(state: string) {
		const normalized = state?.toLowerCase() || '';
		if (normalized === 'done' || normalized === 'completed') return CheckCircle2;
		if (normalized === 'in_progress' || normalized === 'active') return Clock;
		if (normalized === 'blocked') return AlertTriangle;
		return Circle;
	}

	function getPriorityIndicator(priority: string) {
		if (priority === 'high') return { color: 'bg-red-500', text: 'text-red-500' };
		if (priority === 'medium') return { color: 'bg-amber-500', text: 'text-amber-500' };
		return { color: 'bg-slate-400', text: 'text-slate-400' };
	}

	function getEntityTypeIcon(type: string) {
		if (type === 'task') return ListChecks;
		if (type === 'milestone') return Flag;
		if (type === 'goal') return Target;
		if (type === 'spec') return FileText;
		if (type === 'risk') return AlertTriangle;
		if (type === 'build') return Package;
		return Hash;
	}

	// Compute project status
	const projectStatus = $derived(getStatusIndicator(project.state_key));
</script>

<svelte:head>
	<title>Tech Spec Project v2 | Design System | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground overflow-x-hidden">
	<!-- ═══════════════════════════════════════════════════════════════════════
	     HEADER - Mode A Command Bar with tx-frame texture
	     Uses wt-card weight for primary navigation surface
	═══════════════════════════════════════════════════════════════════════ -->
	<header class="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
		<div class="mx-auto max-w-screen-2xl px-2 sm:px-3 lg:px-4">
			<!-- Primary Command Bar -->
			<div class="flex items-center justify-between h-12 sm:h-14 gap-2">
				<!-- Left: Navigation + Identity -->
				<div class="flex items-center gap-2 sm:gap-3 min-w-0">
					<a
						href="/design-system/tech-spec"
						class="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted transition-colors pressable tx tx-grain tx-weak"
						aria-label="Back to design system"
					>
						<ArrowLeft class="w-4 h-4 text-muted-foreground" />
					</a>

					<!-- Project Identity Block -->
					<div class="flex items-center gap-2 sm:gap-3 min-w-0">
						<!-- Status Indicator Ring -->
						<div class="relative shrink-0">
							<div
								class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-muted/50 flex items-center justify-center ring-2 {projectStatus.ringColor}"
							>
								<Layers class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
							</div>
							<span
								class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full {projectStatus.color} ring-2 ring-background"
							></span>
						</div>

						<!-- ID + Name Stack -->
						<div class="min-w-0">
							<div class="flex items-center gap-1.5">
								<span
									class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.08em] text-accent font-medium"
								>
									{project.id}
								</span>
								<span class="text-muted-foreground/30">·</span>
								<span
									class="font-mono text-[0.55rem] sm:text-[0.6rem] text-muted-foreground uppercase tracking-wider"
								>
									Rev {project.version}
								</span>
							</div>
							<h1
								class="text-sm sm:text-base font-semibold text-foreground leading-tight truncate max-w-[200px] sm:max-w-none"
							>
								{project.name}
							</h1>
						</div>
					</div>
				</div>

				<!-- Right: System Metrics + Actions (Desktop) -->
				<div class="hidden lg:flex items-center gap-4">
					<!-- System Metrics Strip -->
					<div
						class="flex items-center gap-3 px-3 py-1.5 bg-muted/30 rounded-lg border border-border/50"
					>
						{#each systemMetrics as metric}
							<div class="flex items-center gap-1.5">
								<span
									class="font-mono text-[0.5rem] uppercase tracking-wider text-muted-foreground"
									>{metric.label}</span
								>
								<span
									class="font-mono text-[0.6rem] {metric.status === 'ok'
										? 'text-foreground'
										: 'text-amber-500'}">{metric.value}</span
								>
							</div>
							{#if metric !== systemMetrics[systemMetrics.length - 1]}
								<span class="w-px h-3 bg-border"></span>
							{/if}
						{/each}
					</div>

					<!-- Action Buttons -->
					<div class="flex items-center gap-1">
						<button
							class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
							aria-label="View"
						>
							<Eye class="w-4 h-4 text-muted-foreground" />
						</button>
						<button
							class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
							aria-label="Share"
						>
							<Share2 class="w-4 h-4 text-muted-foreground" />
						</button>
						<button
							class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
							aria-label="Settings"
						>
							<Settings class="w-4 h-4 text-muted-foreground" />
						</button>
						<button
							class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
							aria-label="Edit"
						>
							<Pencil class="w-4 h-4 text-muted-foreground" />
						</button>
					</div>
				</div>

				<!-- Right: Mobile Actions -->
				<div class="flex items-center gap-1 lg:hidden">
					<span
						class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 text-[0.5rem]"
					>
						<span class="w-1.5 h-1.5 rounded-full {projectStatus.color}"></span>
						<span class="font-mono uppercase text-foreground"
							>{projectStatus.label}</span
						>
					</span>
					<button
						class="p-1.5 rounded-lg hover:bg-muted transition-colors pressable"
						aria-label="Menu"
					>
						<MoreVertical class="w-5 h-5 text-muted-foreground" />
					</button>
				</div>
			</div>
		</div>
	</header>

	<!-- ═══════════════════════════════════════════════════════════════════════
	     MAIN CONTENT - Dense Mode A Layout
	═══════════════════════════════════════════════════════════════════════ -->
	<main class="mx-auto max-w-screen-2xl px-2 sm:px-3 lg:px-4 py-3 sm:py-4">
		<!-- Quick Actions Bar -->
		<div class="mb-3 sm:mb-4 flex items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<!-- Next Action Chip -->
				<div
					class="flex items-center gap-2 px-2.5 py-1.5 bg-accent/5 border border-accent/20 rounded-lg tx tx-bloom tx-weak"
				>
					<Zap class="w-3.5 h-3.5 text-accent" />
					<span class="font-mono text-[0.55rem] uppercase tracking-wider text-accent"
						>Next</span
					>
					<span class="text-xs text-foreground max-w-[180px] sm:max-w-none truncate"
						>{project.next_step_short}</span
					>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<button
					class="px-2.5 py-1.5 text-xs font-medium bg-accent text-accent-foreground rounded-lg pressable tx tx-grain tx-weak"
				>
					<Plus class="w-3.5 h-3.5 inline mr-1" />
					<span class="hidden sm:inline">Add Task</span>
				</button>
			</div>
		</div>

		<!-- Main Grid: 3-Column on Desktop -->
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
			<!-- ═══════════════════════════════════════════════════════════════════════
			     LEFT COLUMN - Primary Content (8 cols)
			═══════════════════════════════════════════════════════════════════════ -->
			<div class="lg:col-span-8 space-y-3 sm:space-y-4">
				<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
				     SPEC SECTIONS - tx-frame for canonical documentation
				━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
				<section>
					<!-- Section Header with Spec Numbering -->
					<div class="flex items-center gap-2 mb-2">
						<span
							class="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-accent font-medium"
							>§01</span
						>
						<span
							class="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground"
							>Specifications</span
						>
						<div class="flex-1 h-px bg-border"></div>
					</div>

					<div
						class="bg-card border border-border rounded-lg shadow-ink overflow-hidden tx tx-frame tx-weak"
					>
						<!-- Panel Header -->
						<div
							class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between"
						>
							<button
								onclick={() => togglePanel('specs')}
								class="flex items-center gap-2 hover:opacity-80 transition-opacity"
							>
								<FileText class="w-4 h-4 text-muted-foreground" />
								<span
									class="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-foreground font-medium"
									>Tech Specifications</span
								>
								<span class="font-mono text-[0.55rem] text-muted-foreground"
									>({specSections.length})</span
								>
							</button>
							<div class="flex items-center gap-1.5">
								<button class="p-1 rounded hover:bg-muted transition-colors">
									<Plus class="w-3.5 h-3.5 text-muted-foreground" />
								</button>
								<button
									onclick={() => togglePanel('specs')}
									class="p-1 rounded hover:bg-muted transition-colors"
								>
									<ChevronDown
										class="w-3.5 h-3.5 text-muted-foreground transition-transform {expandedPanels.specs
											? 'rotate-180'
											: ''}"
									/>
								</button>
							</div>
						</div>

						{#if expandedPanels.specs}
							<div
								transition:slide={{ duration: 120 }}
								class="divide-y divide-border"
							>
								{#each specSections as spec}
									{@const status = getStatusIndicator(spec.status)}
									<div class="p-3">
										<!-- Spec Header -->
										<div class="flex items-center justify-between gap-2 mb-2">
											<div class="flex items-center gap-2 min-w-0">
												<span class="font-mono text-[0.55rem] text-accent"
													>{spec.id}</span
												>
												<span
													class="text-sm font-medium text-foreground truncate"
													>{spec.title}</span
												>
											</div>
											<div class="flex items-center gap-2 shrink-0">
												<span
													class="font-mono text-[0.5rem] text-muted-foreground"
													>v{spec.version}</span
												>
												<span
													class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/50"
												>
													<span
														class="w-1.5 h-1.5 rounded-full {status.color}"
													></span>
													<span
														class="font-mono text-[0.5rem] uppercase {status.textColor}"
														>{status.label}</span
													>
												</span>
											</div>
										</div>

										<!-- Spec Items - Key-Value Grid -->
										<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
											{#each spec.items as item}
												<div
													class="px-2 py-1.5 bg-muted/20 rounded border border-border/50"
												>
													<span
														class="font-mono text-[0.5rem] uppercase tracking-wider text-muted-foreground block"
														>{item.key}</span
													>
													<div
														class="flex items-center justify-between gap-1"
													>
														<span
															class="font-mono text-[0.6rem] text-foreground"
															>{item.value}</span
														>
														<span
															class="font-mono text-[0.45rem] text-accent/60"
															>{item.ref}</span
														>
													</div>
												</div>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</section>

				<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
				     TASKS - tx-grain for interactive work items
				━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
				<section>
					<div class="flex items-center gap-2 mb-2">
						<span
							class="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-accent font-medium"
							>§02</span
						>
						<span
							class="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground"
							>Work Items</span
						>
						<div class="flex-1 h-px bg-border"></div>
					</div>

					<div
						class="bg-card border border-border rounded-lg shadow-ink overflow-hidden tx tx-grain tx-weak"
					>
						<div
							class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between"
						>
							<button
								onclick={() => togglePanel('tasks')}
								class="flex items-center gap-2 hover:opacity-80 transition-opacity"
							>
								<ListChecks class="w-4 h-4 text-blue-500" />
								<span
									class="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-foreground font-medium"
									>Tasks</span
								>
								<span class="font-mono text-[0.55rem] text-muted-foreground"
									>({tasks.length})</span
								>
							</button>
							<div class="flex items-center gap-1.5">
								<!-- Task Stats Inline -->
								<div
									class="hidden sm:flex items-center gap-2 mr-2 text-[0.5rem] font-mono"
								>
									<span class="text-emerald-500"
										>{tasks.filter((t) => t.state_key === 'done').length} done</span
									>
									<span class="text-muted-foreground/50">·</span>
									<span class="text-blue-500"
										>{tasks.filter((t) => t.state_key === 'in_progress').length}
										active</span
									>
									<span class="text-muted-foreground/50">·</span>
									<span class="text-red-500"
										>{tasks.filter((t) => t.state_key === 'blocked').length} blocked</span
									>
								</div>
								<button class="p-1 rounded hover:bg-muted transition-colors">
									<Plus class="w-3.5 h-3.5 text-muted-foreground" />
								</button>
								<button
									onclick={() => togglePanel('tasks')}
									class="p-1 rounded hover:bg-muted transition-colors"
								>
									<ChevronDown
										class="w-3.5 h-3.5 text-muted-foreground transition-transform {expandedPanels.tasks
											? 'rotate-180'
											: ''}"
									/>
								</button>
							</div>
						</div>

						{#if expandedPanels.tasks}
							<div transition:slide={{ duration: 120 }}>
								<!-- Table Header -->
								<div
									class="hidden sm:grid grid-cols-12 gap-2 px-3 py-1.5 bg-muted/10 border-b border-border font-mono text-[0.5rem] uppercase tracking-wider text-muted-foreground"
								>
									<div class="col-span-1">Status</div>
									<div class="col-span-2">ID</div>
									<div class="col-span-5">Task</div>
									<div class="col-span-2">Assignee</div>
									<div class="col-span-1">Priority</div>
									<div class="col-span-1">ETA</div>
								</div>

								<div class="divide-y divide-border/50">
									{#each tasks as task}
										{@const status = getStatusIndicator(task.state_key)}
										{@const priority = getPriorityIndicator(task.priority)}
										{@const TaskIcon = getTaskIcon(task.state_key)}
										<!-- Desktop Row -->
										<div
											class="hidden sm:grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-muted/20 transition-colors group"
										>
											<div class="col-span-1">
												<TaskIcon class="w-4 h-4 {status.textColor}" />
											</div>
											<div class="col-span-2 flex items-center gap-1">
												<span class="font-mono text-[0.6rem] text-accent"
													>{task.id}</span
												>
												<button
													onclick={() =>
														copyToClipboard(task.id, task.id)}
													class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded transition-all"
												>
													{#if copiedId === task.id}
														<Check
															class="w-2.5 h-2.5 text-emerald-500"
														/>
													{:else}
														<Copy
															class="w-2.5 h-2.5 text-muted-foreground"
														/>
													{/if}
												</button>
											</div>
											<div class="col-span-5">
												<span class="text-sm text-foreground"
													>{task.title}</span
												>
												{#if task.state_key === 'blocked' && task.blockedBy}
													<span
														class="font-mono text-[0.5rem] text-red-500 ml-1"
														>← {task.blockedBy}</span
													>
												{/if}
											</div>
											<div class="col-span-2">
												{#if task.assignee}
													<span
														class="font-mono text-[0.6rem] text-accent"
														>@{task.assignee}</span
													>
												{:else}
													<span
														class="font-mono text-[0.55rem] text-muted-foreground italic"
														>unassigned</span
													>
												{/if}
											</div>
											<div class="col-span-1">
												<span class="flex items-center gap-1">
													<span
														class="w-1.5 h-1.5 rounded-full {priority.color}"
													></span>
													<span
														class="font-mono text-[0.5rem] uppercase {priority.text}"
														>{task.priority}</span
													>
												</span>
											</div>
											<div class="col-span-1">
												<span
													class="font-mono text-[0.55rem] text-muted-foreground"
													>{task.eta}</span
												>
											</div>
										</div>

										<!-- Mobile Row -->
										<div
											class="sm:hidden px-3 py-2 hover:bg-muted/20 transition-colors"
										>
											<div class="flex items-start gap-2">
												<TaskIcon
													class="w-4 h-4 mt-0.5 {status.textColor}"
												/>
												<div class="flex-1 min-w-0">
													<div class="flex items-center gap-1.5 mb-0.5">
														<span
															class="font-mono text-[0.55rem] text-accent"
															>{task.id}</span
														>
														<span
															class="w-1.5 h-1.5 rounded-full {priority.color}"
														></span>
													</div>
													<span class="text-sm text-foreground block"
														>{task.title}</span
													>
													<div
														class="flex items-center gap-2 mt-1 text-[0.55rem]"
													>
														{#if task.assignee}
															<span class="font-mono text-accent"
																>@{task.assignee}</span
															>
														{/if}
														<span
															class="font-mono text-muted-foreground"
															>{task.eta}</span
														>
													</div>
												</div>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</section>

				<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
				     DEPENDENCIES - tx-thread for connection visualization
				━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
				<section>
					<div class="flex items-center gap-2 mb-2">
						<span
							class="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-accent font-medium"
							>§03</span
						>
						<span
							class="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground"
							>Dependencies</span
						>
						<div class="flex-1 h-px bg-border"></div>
					</div>

					<div
						class="bg-card border border-border rounded-lg shadow-ink overflow-hidden tx tx-thread tx-weak"
					>
						<div
							class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between"
						>
							<button
								onclick={() => togglePanel('dependencies')}
								class="flex items-center gap-2 hover:opacity-80 transition-opacity"
							>
								<GitBranch class="w-4 h-4 text-muted-foreground" />
								<span
									class="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-foreground font-medium"
									>Dependency Graph</span
								>
								<span class="font-mono text-[0.55rem] text-muted-foreground"
									>({dependencies.length})</span
								>
							</button>
							<button
								onclick={() => togglePanel('dependencies')}
								class="p-1 rounded hover:bg-muted transition-colors"
							>
								<ChevronDown
									class="w-3.5 h-3.5 text-muted-foreground transition-transform {expandedPanels.dependencies
										? 'rotate-180'
										: ''}"
								/>
							</button>
						</div>

						{#if expandedPanels.dependencies}
							<div transition:slide={{ duration: 120 }} class="p-3 space-y-2">
								{#each dependencies as dep}
									{@const depStatus = getStatusIndicator(dep.status)}
									{@const FromIcon = getEntityTypeIcon(dep.from.type)}
									{@const ToIcon = getEntityTypeIcon(dep.to.type)}
									<div
										class="flex items-center gap-2 p-2 bg-muted/20 rounded-lg border border-border/50 group hover:border-border transition-colors"
									>
										<!-- Source -->
										<div class="flex items-center gap-1.5 min-w-0 flex-1">
											<FromIcon
												class="w-3.5 h-3.5 text-muted-foreground shrink-0"
											/>
											<span
												class="font-mono text-[0.6rem] text-accent truncate"
												>{dep.from.id}</span
											>
										</div>

										<!-- Relation Arrow -->
										<div class="flex items-center gap-1.5 px-2 shrink-0">
											<span
												class="w-6 h-px {dep.status === 'blocking'
													? 'bg-red-500'
													: 'bg-border'}"
											></span>
											<span
												class="font-mono text-[0.45rem] uppercase tracking-wider {dep.status ===
												'blocking'
													? 'text-red-500'
													: 'text-muted-foreground'}"
											>
												{dep.relation.replace(/_/g, ' ')}
											</span>
											<ChevronRight
												class="w-3 h-3 {dep.status === 'blocking'
													? 'text-red-500'
													: 'text-muted-foreground'}"
											/>
										</div>

										<!-- Target -->
										<div
											class="flex items-center gap-1.5 min-w-0 flex-1 justify-end"
										>
											<span
												class="font-mono text-[0.6rem] text-accent truncate"
												>{dep.to.id}</span
											>
											<ToIcon
												class="w-3.5 h-3.5 text-muted-foreground shrink-0"
											/>
										</div>

										<!-- Status Indicator -->
										<div class="shrink-0">
											<span
												class="w-2 h-2 rounded-full {depStatus.color} block"
											></span>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</section>

				<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
				     ACTIVITY LOG - Terminal aesthetic with tx-static for system events
				━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
				<section>
					<div class="flex items-center gap-2 mb-2">
						<span
							class="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-accent font-medium"
							>§04</span
						>
						<span
							class="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground"
							>System Log</span
						>
						<div class="flex-1 h-px bg-border"></div>
					</div>

					<div
						class="bg-slate-900 dark:bg-slate-950 border border-slate-700 rounded-lg shadow-ink overflow-hidden"
					>
						<!-- Terminal Header -->
						<div
							class="px-3 py-1.5 bg-slate-800 dark:bg-slate-900 border-b border-slate-700 flex items-center justify-between"
						>
							<div class="flex items-center gap-2">
								<div class="flex items-center gap-1">
									<div class="w-2.5 h-2.5 rounded-full bg-red-500"></div>
									<div class="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
									<div class="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
								</div>
								<Terminal class="w-3.5 h-3.5 text-slate-400" />
								<span class="font-mono text-[0.6rem] text-slate-400"
									>activity.log</span
								>
							</div>
							<button
								onclick={() => togglePanel('activity')}
								class="p-1 rounded hover:bg-slate-700 transition-colors"
							>
								<ChevronDown
									class="w-3.5 h-3.5 text-slate-400 transition-transform {expandedPanels.activity
										? 'rotate-180'
										: ''}"
								/>
							</button>
						</div>

						{#if expandedPanels.activity}
							<div
								transition:slide={{ duration: 120 }}
								class="p-3 font-mono text-[0.65rem] space-y-1 max-h-36 overflow-y-auto"
							>
								{#each activityLog as entry}
									{@const EntryIcon = getEntityTypeIcon(entry.entityType)}
									<div
										class="flex items-start gap-2 text-slate-300 hover:bg-slate-800/50 rounded px-1 py-0.5 -mx-1 transition-colors"
									>
										<span class="text-slate-500 shrink-0"
											>[{entry.timestamp}]</span
										>
										<span class="text-emerald-400 shrink-0">{entry.action}</span
										>
										<span class="text-cyan-400 shrink-0">{entry.entity}</span>
										<span class="text-slate-600">·</span>
										<span class="text-slate-400 truncate">{entry.detail}</span>
										<span class="text-slate-500 ml-auto shrink-0"
											>@{entry.user}</span
										>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</section>
			</div>

			<!-- ═══════════════════════════════════════════════════════════════════════
			     RIGHT COLUMN - Context Panels (4 cols)
			═══════════════════════════════════════════════════════════════════════ -->
			<aside class="lg:col-span-4 space-y-3 sm:space-y-4">
				<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
				     PROJECT CONTEXT CARD - Key metadata
				━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
				<div
					class="bg-card border border-border rounded-lg shadow-ink p-3 tx tx-frame tx-weak"
				>
					<span
						class="font-mono text-[0.55rem] uppercase tracking-wider text-muted-foreground block mb-2"
						>Project Context</span
					>
					<p class="text-sm text-foreground leading-relaxed mb-3">
						{project.description}
					</p>
					<!-- Key-Value Metadata -->
					<div class="space-y-1.5 font-mono text-[0.6rem]">
						<div
							class="flex items-center justify-between py-1 border-b border-dashed border-border"
						>
							<span class="text-muted-foreground">Type</span>
							<span class="text-foreground uppercase">{project.type_key}</span>
						</div>
						<div
							class="flex items-center justify-between py-1 border-b border-dashed border-border"
						>
							<span class="text-muted-foreground">Owner</span>
							<span class="text-accent">@{project.owner}</span>
						</div>
						<div
							class="flex items-center justify-between py-1 border-b border-dashed border-border"
						>
							<span class="text-muted-foreground">Environment</span>
							<span class="text-foreground uppercase">{project.environment}</span>
						</div>
						<div class="flex items-center justify-between py-1">
							<span class="text-muted-foreground">Uptime</span>
							<span class="text-emerald-500">{project.uptime}</span>
						</div>
					</div>
				</div>

				<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
				     GOALS - Progress tracking with tx-bloom for CTAs
				━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
				<div
					class="bg-card border border-border rounded-lg shadow-ink overflow-hidden tx tx-bloom tx-weak"
				>
					<div
						class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between"
					>
						<button
							onclick={() => togglePanel('goals')}
							class="flex items-center gap-2 hover:opacity-80 transition-opacity"
						>
							<Target class="w-4 h-4 text-amber-500" />
							<span
								class="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-foreground font-medium"
								>Goals</span
							>
							<span class="font-mono text-[0.55rem] text-muted-foreground"
								>({goals.length})</span
							>
						</button>
						<div class="flex items-center gap-1.5">
							<button class="p-1 rounded hover:bg-muted transition-colors">
								<Plus class="w-3.5 h-3.5 text-muted-foreground" />
							</button>
							<button
								onclick={() => togglePanel('goals')}
								class="p-1 rounded hover:bg-muted transition-colors"
							>
								<ChevronDown
									class="w-3.5 h-3.5 text-muted-foreground transition-transform {expandedPanels.goals
										? 'rotate-180'
										: ''}"
								/>
							</button>
						</div>
					</div>

					{#if expandedPanels.goals}
						<div transition:slide={{ duration: 120 }} class="divide-y divide-border/50">
							{#each goals as goal}
								{@const status = getStatusIndicator(goal.state_key)}
								<div class="px-3 py-2.5 hover:bg-muted/20 transition-colors">
									<div class="flex items-start justify-between gap-2 mb-1.5">
										<div class="min-w-0">
											<span class="font-mono text-[0.5rem] text-accent block"
												>{goal.id}</span
											>
											<span class="text-sm text-foreground">{goal.name}</span>
										</div>
										<span
											class="w-1.5 h-1.5 rounded-full {status.color} shrink-0 mt-1"
										></span>
									</div>
									<div class="flex items-center gap-2">
										<div
											class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"
										>
											<div
												class="h-full bg-accent rounded-full transition-all"
												style="width: {goal.progress}%"
											></div>
										</div>
										<span class="font-mono text-[0.5rem] text-muted-foreground"
											>{goal.progress}%</span
										>
									</div>
									<span
										class="font-mono text-[0.5rem] text-muted-foreground block mt-1"
										>Target: {goal.target}</span
									>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
				     MILESTONES - Timeline tracking
				━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
				<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden">
					<div
						class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between"
					>
						<button
							onclick={() => togglePanel('milestones')}
							class="flex items-center gap-2 hover:opacity-80 transition-opacity"
						>
							<Flag class="w-4 h-4 text-emerald-500" />
							<span
								class="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-foreground font-medium"
								>Milestones</span
							>
							<span class="font-mono text-[0.55rem] text-muted-foreground"
								>({milestones.length})</span
							>
						</button>
						<button
							onclick={() => togglePanel('milestones')}
							class="p-1 rounded hover:bg-muted transition-colors"
						>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform {expandedPanels.milestones
									? 'rotate-180'
									: ''}"
							/>
						</button>
					</div>

					{#if expandedPanels.milestones}
						<div transition:slide={{ duration: 120 }} class="divide-y divide-border/50">
							{#each milestones as milestone}
								{@const status = getStatusIndicator(milestone.state_key)}
								<div class="px-3 py-2.5 hover:bg-muted/20 transition-colors">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<span class="font-mono text-[0.5rem] text-accent block"
												>{milestone.id}</span
											>
											<span class="text-sm text-foreground"
												>{milestone.title}</span
											>
											<div
												class="flex items-center gap-2 mt-1 font-mono text-[0.5rem]"
											>
												<span class="text-muted-foreground"
													>Due: {milestone.due_at}</span
												>
												<span class="text-muted-foreground/50">·</span>
												<span class="text-muted-foreground"
													>{milestone.deliverables} deliverables</span
												>
											</div>
										</div>
										<span
											class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/50 shrink-0"
										>
											<span class="w-1.5 h-1.5 rounded-full {status.color}"
											></span>
											<span
												class="font-mono text-[0.45rem] uppercase {status.textColor}"
												>{status.label}</span
											>
										</span>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
				     RISKS - tx-static for warning indicators
				━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
				<div
					class="bg-card border border-border rounded-lg shadow-ink overflow-hidden tx tx-static tx-weak"
				>
					<div
						class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between"
					>
						<button
							onclick={() => togglePanel('risks')}
							class="flex items-center gap-2 hover:opacity-80 transition-opacity"
						>
							<AlertTriangle class="w-4 h-4 text-red-500" />
							<span
								class="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-foreground font-medium"
								>Risks</span
							>
							<span class="font-mono text-[0.55rem] text-muted-foreground"
								>({risks.length})</span
							>
						</button>
						<button
							onclick={() => togglePanel('risks')}
							class="p-1 rounded hover:bg-muted transition-colors"
						>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform {expandedPanels.risks
									? 'rotate-180'
									: ''}"
							/>
						</button>
					</div>

					{#if expandedPanels.risks}
						<div transition:slide={{ duration: 120 }} class="divide-y divide-border/50">
							{#each risks as risk}
								{@const status = getStatusIndicator(risk.state_key)}
								<div class="px-3 py-2.5 hover:bg-muted/20 transition-colors">
									<div class="flex items-start justify-between gap-2 mb-1.5">
										<div class="min-w-0">
											<span class="font-mono text-[0.5rem] text-accent block"
												>{risk.id}</span
											>
											<span class="text-sm text-foreground">{risk.title}</span
											>
										</div>
										<span
											class="w-1.5 h-1.5 rounded-full {status.color} shrink-0 mt-1"
										></span>
									</div>
									<div
										class="flex items-center gap-2 font-mono text-[0.5rem] mb-1.5"
									>
										<span class="text-red-500 uppercase"
											>{risk.impact} impact</span
										>
										<span class="text-muted-foreground/50">·</span>
										<span class="text-muted-foreground uppercase"
											>{risk.likelihood} likelihood</span
										>
									</div>
									<div class="text-[0.55rem] text-muted-foreground">
										<span
											class="font-mono uppercase text-[0.45rem] tracking-wider"
											>Mitigation:</span
										>
										{risk.mitigation}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
				     QUICK REFERENCE - Summary stats
				━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
				<div class="bg-card border border-border rounded-lg shadow-ink p-3">
					<span
						class="font-mono text-[0.55rem] uppercase tracking-wider text-muted-foreground block mb-2"
						>Quick Reference</span
					>
					<div class="grid grid-cols-2 gap-2 font-mono text-[0.6rem]">
						<div class="px-2 py-1.5 bg-muted/20 rounded border border-border/50">
							<span class="text-muted-foreground block text-[0.5rem] uppercase"
								>Total Tasks</span
							>
							<span class="text-foreground text-sm font-medium">{tasks.length}</span>
						</div>
						<div class="px-2 py-1.5 bg-muted/20 rounded border border-border/50">
							<span class="text-muted-foreground block text-[0.5rem] uppercase"
								>Completed</span
							>
							<span class="text-emerald-500 text-sm font-medium"
								>{tasks.filter((t) => t.state_key === 'done').length}</span
							>
						</div>
						<div class="px-2 py-1.5 bg-muted/20 rounded border border-border/50">
							<span class="text-muted-foreground block text-[0.5rem] uppercase"
								>Blocked</span
							>
							<span class="text-red-500 text-sm font-medium"
								>{tasks.filter((t) => t.state_key === 'blocked').length}</span
							>
						</div>
						<div class="px-2 py-1.5 bg-muted/20 rounded border border-border/50">
							<span class="text-muted-foreground block text-[0.5rem] uppercase"
								>Open Risks</span
							>
							<span class="text-amber-500 text-sm font-medium">{risks.length}</span>
						</div>
					</div>
				</div>
			</aside>
		</div>

		<!-- ═══════════════════════════════════════════════════════════════════════
		     FOOTER - Spec reference line
		═══════════════════════════════════════════════════════════════════════ -->
		<footer class="mt-4 pt-3 border-t border-border">
			<div
				class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-muted-foreground font-mono text-[0.5rem] uppercase tracking-wider"
			>
				<div class="flex items-center gap-2">
					<span>{project.id}</span>
					<span class="text-muted-foreground/40">·</span>
					<span>Rev {project.version}</span>
					<span class="text-muted-foreground/40">·</span>
					<span>Build {project.build}</span>
				</div>
				<span>Last sync: 2026-02-01 14:32:00 UTC</span>
			</div>
		</footer>
	</main>
</div>
