<!-- apps/web/src/routes/design-system/tech-spec-project/+page.svelte -->
<script lang="ts">
	/**
	 * Tech Spec Project Demo
	 *
	 * A demo page showing the project detail view styled with the tech spec aesthetic.
	 * This demonstrates how technical documentation patterns integrate with the
	 * Inkprint design system for project management interfaces.
	 *
	 * Key patterns:
	 * - Blueprint grid backgrounds with registration marks
	 * - Monospace typography for IDs, codes, and system values
	 * - Key-value data displays with dashed separators
	 * - Reference numbers and cross-linking
	 * - Status indicators using small colored dots
	 * - Section headers with spec numbering
	 */
	import { slide } from 'svelte/transition';
	import {
		ArrowLeft,
		Plus,
		FileText,
		Pencil,
		CheckCircle,
		Circle,
		Clock,
		Target,
		ChevronDown,
		ChevronRight,
		AlertCircle,
		ListChecks
		Zap,
		MoreHorizontal
		Flag
		Copy,
		Check
		GitBranch
		Terminal
		Settings,
		Share2
	} from 'lucide-svelte';

	// Demo state
	let copiedId: string | null = $state(null);

	function copyToClipboard(text: string, id: string) {
		navigator.clipboard.writeText(text);
		copiedId = id;
		setTimeout(() => (copiedId = null), 2000);
	}

	// Collapsible sections - matches project page pattern
	let documentsExpanded = $state(true);
	let expandedPanels = $state<Record<string, boolean>>({
		goals: true,
		milestones: false,
		tasks: true,
		risks: false,
		events: false
	});

	function togglePanel(key: string) {
		expandedPanels = { ...expandedPanels, [key]: !expandedPanels[key] };
	}

	// Sample project data
	const project = {
		id: 'PRJ-0042',
		name: 'BuildOS Platform Redesign',
		description:
			'Complete overhaul of the design system with Inkprint textures and tech spec patterns',
		state_key: 'active',
		type_key: 'product',
		created_at: '2026-01-15T09:00:00Z',
		updated_at: '2026-02-01T14:32:00Z',
		next_step_short: 'Review texture system implementation with the team',
		owner: 'djwayne',
		version: '2.4.1'
	};

	const tasks = [
		{
			id: 'TSK-0891',
			title: 'Implement texture CSS classes',
			state_key: 'done',
			priority: 'high',
			assignee: 'djwayne'
		},
		{
			id: 'TSK-0892',
			title: 'Create tech spec demo page',
			state_key: 'in_progress',
			priority: 'high',
			assignee: 'djwayne'
		},
		{
			id: 'TSK-0893',
			title: 'Write documentation for new patterns',
			state_key: 'todo',
			priority: 'medium',
			assignee: null
		},
		{
			id: 'TSK-0894',
			title: 'Get team feedback on aesthetic',
			state_key: 'todo',
			priority: 'low',
			assignee: null
		},
		{
			id: 'TSK-0895',
			title: 'Migrate existing components',
			state_key: 'blocked',
			priority: 'high',
			assignee: 'djwayne'
		}
	];

	const goals = [
		{ id: 'GOL-0108', name: 'Ship v2 design system by Q1', state_key: 'active', progress: 65 },
		{
			id: 'GOL-0109',
			name: 'Improve visual clarity and consistency',
			state_key: 'active',
			progress: 40
		}
	];

	const milestones = [
		{
			id: 'MIL-0045',
			title: 'Design system spec complete',
			due_at: '2026-01-20',
			state_key: 'completed'
		},
		{
			id: 'MIL-0046',
			title: 'Component migration done',
			due_at: '2026-02-15',
			state_key: 'pending'
		},
		{
			id: 'MIL-0047',
			title: 'Team review and approval',
			due_at: '2026-02-28',
			state_key: 'pending'
		}
	];

	const documents = [
		{
			id: 'DOC-0201',
			title: 'Inkprint Design System Spec',
			type_key: 'spec',
			state_key: 'published'
		},
		{
			id: 'DOC-0202',
			title: 'Tech Spec Aesthetic Guide',
			type_key: 'guide',
			state_key: 'draft'
		},
		{ id: 'DOC-0203', title: 'Migration Playbook', type_key: 'runbook', state_key: 'draft' }
	];

	const risks = [
		{
			id: 'RSK-0017',
			title: 'Migration complexity exceeds estimates',
			impact: 'high',
			likelihood: 'medium',
			state_key: 'monitoring'
		},
		{
			id: 'RSK-0018',
			title: 'Team adoption resistance',
			impact: 'medium',
			likelihood: 'low',
			state_key: 'identified'
		}
	];

	const dependencies = [
		{ from: 'TSK-0892', to: 'TSK-0891', type: 'blocked_by' },
		{ from: 'TSK-0895', to: 'TSK-0893', type: 'blocked_by' },
		{ from: 'GOL-0108', to: 'MIL-0046', type: 'requires' }
	];

	const activityLog = [
		{ timestamp: '14:32:00', action: 'Task completed', entity: 'TSK-0891', user: 'djwayne' },
		{ timestamp: '14:28:15', action: 'Document updated', entity: 'DOC-0201', user: 'djwayne' },
		{ timestamp: '13:45:00', action: 'Risk identified', entity: 'RSK-0017', user: 'system' },
		{
			timestamp: '11:20:30',
			action: 'Milestone due date changed',
			entity: 'MIL-0046',
			user: 'djwayne'
		}
	];

	// Helper for status styling
	function getStatusIndicator(state: string) {
		const normalized = state?.toLowerCase() || '';
		if (normalized === 'done' || normalized === 'completed' || normalized === 'published') {
			return { color: 'bg-emerald-500', label: 'DONE' };
		}
		if (normalized === 'in_progress' || normalized === 'active') {
			return { color: 'bg-blue-500', label: 'ACTIVE' };
		}
		if (normalized === 'blocked') {
			return { color: 'bg-red-500', label: 'BLOCKED' };
		}
		if (normalized === 'monitoring') {
			return { color: 'bg-amber-500 animate-pulse', label: 'MONITORING' };
		}
		if (normalized === 'draft') {
			return { color: 'bg-slate-400', label: 'DRAFT' };
		}
		return { color: 'bg-slate-400', label: 'PENDING' };
	}

	function getTaskIcon(state: string) {
		const normalized = state?.toLowerCase() || '';
		if (normalized === 'done' || normalized === 'completed') return CheckCircle;
		if (normalized === 'in_progress' || normalized === 'active') return Clock;
		if (normalized === 'blocked') return AlertCircle;
		return Circle;
	}

	function getPriorityColor(priority: string) {
		if (priority === 'high') return 'text-red-500';
		if (priority === 'medium') return 'text-amber-500';
		return 'text-slate-400';
	}

	// Compute project status in script area
	const projectStatus = $derived(getStatusIndicator(project.state_key));
</script>

<svelte:head>
	<title>Tech Spec Project Demo | Design System | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground overflow-x-hidden">
	<!-- Header - Card style matching inkprint-v2-demo -->
	<header class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 pt-2 sm:pt-4">
		<div
			class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink p-3 sm:p-4 space-y-3"
		>
			<!-- Title Row -->
			<div class="flex items-center justify-between gap-1.5 sm:gap-2">
				<div class="flex items-center gap-1.5 sm:gap-3 min-w-0">
					<a
						href="/design-system/tech-spec"
						class="flex items-center justify-center p-1 sm:p-2 rounded-lg hover:bg-muted transition-colors shrink-0 pressable"
						aria-label="Back to design system"
					>
						<ArrowLeft class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
					</a>
					<div class="min-w-0">
						<!-- Spec reference line -->
						<div class="flex items-center gap-1.5 sm:gap-2 mb-0.5">
							<span
								class="font-mono text-[0.55rem] sm:text-[0.6rem] uppercase tracking-[0.1em] text-accent"
							>
								{project.id}
							</span>
							<span class="text-muted-foreground/40 hidden sm:inline">•</span>
							<span
								class="font-mono text-[0.55rem] sm:text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground hidden sm:inline"
							>
								Rev {project.version}
							</span>
						</div>
						<h1
							class="text-sm sm:text-xl font-semibold text-foreground leading-tight line-clamp-1 sm:line-clamp-2"
						>
							{project.name}
						</h1>
						<p
							class="text-xs text-muted-foreground mt-0.5 line-clamp-2 hidden sm:block"
						>
							{project.description}
						</p>
					</div>
				</div>

				<!-- Desktop: Show all buttons -->
				<div class="hidden sm:flex items-center gap-1.5 shrink-0">
					<!-- State Badge -->

					<span
						class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border mr-1"
					>
						<span class="w-1.5 h-1.5 rounded-full {projectStatus.color}"></span>
						<span
							class="font-mono text-[0.55rem] uppercase tracking-wide text-foreground"
							>{projectStatus.label}</span
						>
					</span>
					<button
						class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
						aria-label="Share"
					>
						<Share2 class="w-5 h-5 text-muted-foreground" />
					</button>
					<button
						class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
						aria-label="Settings"
					>
						<Settings class="w-5 h-5 text-muted-foreground" />
					</button>
					<button
						class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
						aria-label="Edit project"
					>
						<Pencil class="w-5 h-5 text-muted-foreground" />
					</button>
				</div>

				<!-- Mobile: State + 3-dot menu -->
				<div class="flex items-center gap-1.5 sm:hidden">
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
						aria-label="Project options"
					>
						<MoreHorizontal class="w-5 h-5 text-muted-foreground" />
					</button>
				</div>

				<!-- Key-Value Project Metadata -->
				<div
					class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 p-2.5 sm:p-3 bg-muted/30 rounded-lg border border-border/50"
				>
					<div>
						<span
							class="font-mono text-[0.5rem] sm:text-[0.55rem] uppercase tracking-wider text-muted-foreground block"
							>Type</span
						>
						<span class="font-mono text-[0.65rem] sm:text-xs text-foreground capitalize"
							>{project.type_key}</span
						>
					</div>
					<div>
						<span
							class="font-mono text-[0.5rem] sm:text-[0.55rem] uppercase tracking-wider text-muted-foreground block"
							>Owner</span
						>
						<span class="font-mono text-[0.65rem] sm:text-xs text-accent"
							>@{project.owner}</span
						>
					</div>
					<div>
						<span
							class="font-mono text-[0.5rem] sm:text-[0.55rem] uppercase tracking-wider text-muted-foreground block"
							>Created</span
						>
						<span class="font-mono text-[0.65rem] sm:text-xs text-foreground"
							>2026-01-15</span
						>
					</div>
					<div>
						<span
							class="font-mono text-[0.5rem] sm:text-[0.55rem] uppercase tracking-wider text-muted-foreground block"
							>Updated</span
						>
						<span class="font-mono text-[0.65rem] sm:text-xs text-foreground"
							>2h ago</span
						>
					</div>

					<!-- Next Step Display -->
					<div
						class="flex items-center gap-3 p-2.5 sm:p-3 rounded-lg bg-accent/5 border border-accent/20"
					>
						<div
							class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"
						>
							<Zap class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
						</div>
						<div class="min-w-0">
							<p
								class="font-mono text-[0.5rem] sm:text-[0.55rem] uppercase tracking-wider text-accent"
							>
								Next Action
							</p>
							<p class="text-xs sm:text-sm text-foreground truncate">
								{project.next_step_short}
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="mx-auto max-w-screen-2xl px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
		<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 sm:gap-6">
			<!-- Left Column: Main Content -->
			<div class="min-w-0 space-y-4 sm:space-y-6">
				<!-- Documents Section -->
				<section>
					<div class="flex items-center gap-2 mb-3">
						<span
							class="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-accent"
							>Section 01</span
						>
						<div class="flex-1 h-px bg-border"></div>
					</div>

					<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden">
						<!-- Header -->
						<div
							class="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30"
						>
							<button
								onclick={() => (documentsExpanded = !documentsExpanded)}
								class="flex items-center gap-3 hover:opacity-80 transition-opacity"
							>
								<FileText class="w-4 h-4 text-muted-foreground" />
								<span
									class="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-foreground"
								>
									Documents
								</span>
								<span class="font-mono text-[0.6rem] text-muted-foreground"
									>({documents.length})</span
								>
							</button>
							<div class="flex items-center gap-2">
								<button class="p-1.5 rounded hover:bg-muted transition-colors">
									<Plus class="w-3.5 h-3.5 text-muted-foreground" />
								</button>
								<button
									onclick={() => (documentsExpanded = !documentsExpanded)}
									class="p-1.5 rounded hover:bg-muted transition-colors"
								>
									<ChevronDown
										class="w-3.5 h-3.5 text-muted-foreground transition-transform {documentsExpanded
											? 'rotate-180'
											: ''}"
									/>
								</button>
							</div>
						</div>

						{#if documentsExpanded}
							<div transition:slide={{ duration: 120 }}>
								<!-- Table header -->
								<div
									class="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 bg-muted/20 border-b border-border font-mono text-[0.55rem] uppercase tracking-wider text-muted-foreground"
								>
									<div class="col-span-2">ID</div>
									<div class="col-span-6">Title</div>
									<div class="col-span-2">Type</div>
									<div class="col-span-2">Status</div>
								</div>

								<div class="divide-y divide-border">
									{#each documents as doc}
										{@const status = getStatusIndicator(doc.state_key)}
										<!-- Desktop row -->
										<div
											class="hidden sm:grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-muted/30 transition-colors group"
										>
											<div class="col-span-2 flex items-center gap-1.5">
												<span class="font-mono text-xs text-accent"
													>{doc.id}</span
												>
												<button
													onclick={() => copyToClipboard(doc.id, doc.id)}
													class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded transition-all"
												>
													{#if copiedId === doc.id}
														<Check class="w-3 h-3 text-emerald-500" />
													{:else}
														<Copy
															class="w-3 h-3 text-muted-foreground"
														/>
													{/if}
												</button>
											</div>
											<div class="col-span-6">
												<span class="text-sm text-foreground"
													>{doc.title}</span
												>
											</div>
											<div class="col-span-2">
												<span
													class="font-mono text-xs text-muted-foreground uppercase"
													>{doc.type_key}</span
												>
											</div>
											<div class="col-span-2 flex items-center gap-1.5">
												<span
													class="w-1.5 h-1.5 rounded-full {projectStatus.color}"
												></span>
												<span
													class="font-mono text-[0.6rem] uppercase text-muted-foreground"
													>{projectStatus.label}</span
												>
											</div>
										</div>

										<!-- Mobile row -->
										<div
											class="sm:hidden px-4 py-3 hover:bg-muted/30 transition-colors"
										>
											<div class="flex items-start justify-between gap-2">
												<div>
													<span
														class="font-mono text-[0.6rem] text-accent block"
														>{doc.id}</span
													>
													<span class="text-sm text-foreground"
														>{doc.title}</span
													>
												</div>
												<div class="flex items-center gap-1.5 shrink-0">
													<span
														class="w-1.5 h-1.5 rounded-full {projectStatus.color}"
													></span>
												</div>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</section>

				<!-- Dependency Graph Section -->
				<section>
					<div class="flex items-center gap-2 mb-3">
						<span
							class="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-accent"
							>Section 02</span
						>
						<div class="flex-1 h-px bg-border"></div>
					</div>

					<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden">
						<div
							class="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-3"
						>
							<GitBranch class="w-4 h-4 text-muted-foreground" />
							<span
								class="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-foreground"
							>
								Dependencies
							</span>
							<span class="font-mono text-[0.6rem] text-muted-foreground"
								>({dependencies.length})</span
							>
						</div>

						<div class="p-4 space-y-2">
							{#each dependencies as dep}
								<div
									class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-muted/20 rounded-lg border border-border/50"
								>
									<div class="flex-1">
										<span
											class="font-mono text-[0.55rem] text-muted-foreground block"
											>Source</span
										>
										<span class="font-mono text-sm text-accent">{dep.from}</span
										>
									</div>
									<div class="flex items-center gap-2 sm:px-4">
										<span
											class="font-mono text-[0.55rem] uppercase tracking-wider text-muted-foreground"
											>{dep.type.replace(/_/g, ' ')}</span
										>
										<ChevronRight class="w-3 h-3 text-muted-foreground" />
									</div>
									<div class="flex-1 sm:text-right">
										<span
											class="font-mono text-[0.55rem] text-muted-foreground block"
											>Target</span
										>
										<span class="font-mono text-sm text-accent">{dep.to}</span>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</section>

				<!-- Log Section -->
				<section>
					<div class="flex items-center gap-2 mb-3">
						<span
							class="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-accent"
							>Section 03</span
						>
						<div class="flex-1 h-px bg-border"></div>
					</div>

					<div
						class="bg-slate-900 dark:bg-slate-950 border border-slate-700 rounded-lg shadow-ink overflow-hidden"
					>
						<div
							class="px-4 py-2 bg-slate-800 dark:bg-slate-900 border-b border-slate-700 flex items-center gap-3"
						>
							<div class="flex items-center gap-1.5">
								<div class="w-3 h-3 rounded-full bg-red-500"></div>
								<div class="w-3 h-3 rounded-full bg-amber-500"></div>
								<div class="w-3 h-3 rounded-full bg-emerald-500"></div>
							</div>
							<Terminal class="w-4 h-4 text-slate-400" />
							<span class="font-mono text-xs text-slate-400">activity.log</span>
						</div>

						<div class="p-4 font-mono text-xs space-y-1.5 max-h-48 overflow-y-auto">
							{#each activityLog as entry}
								<div class="text-slate-300">
									<span class="text-slate-500">[{entry.timestamp}]</span>
									<span class="text-emerald-400 ml-2">{entry.action}</span>
									<span class="text-cyan-400 ml-2">{entry.entity}</span>
									<span class="text-slate-500 ml-2">by</span>
									<span class="text-amber-400 ml-1">@{entry.user}</span>
								</div>
							{/each}
						</div>
					</div>
				</section>
			</div>

			<!-- Right Column: Insight Panels -->
			<aside class="min-w-0 space-y-4">
				<!-- Goals Panel -->
				<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden">
					<div
						class="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between"
					>
						<button
							onclick={() => togglePanel('goals')}
							class="flex items-center gap-3 hover:opacity-80 transition-opacity"
						>
							<Target class="w-4 h-4 text-amber-500" />
							<span
								class="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-foreground"
								>Goals</span
							>
							<span class="font-mono text-[0.6rem] text-muted-foreground"
								>({goals.length})</span
							>
						</button>
						<div class="flex items-center gap-2">
							<button class="p-1.5 rounded hover:bg-muted transition-colors">
								<Plus class="w-3.5 h-3.5 text-muted-foreground" />
							</button>
							<button
								onclick={() => togglePanel('goals')}
								class="p-1.5 rounded hover:bg-muted transition-colors"
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
						<div class="divide-y divide-border" transition:slide={{ duration: 120 }}>
							{#each goals as goal}
								{@const status = getStatusIndicator(goal.state_key)}
								<div class="px-4 py-3 hover:bg-muted/30 transition-colors">
									<div class="flex items-start justify-between gap-2 mb-2">
										<div>
											<span class="font-mono text-[0.55rem] text-accent block"
												>{goal.id}</span
											>
											<span class="text-sm text-foreground">{goal.name}</span>
										</div>
										<div class="flex items-center gap-1.5 shrink-0">
											<span class="w-1.5 h-1.5 rounded-full {status.color}"
											></span>
										</div>
									</div>
									<!-- Progress bar -->
									<div class="flex items-center gap-2">
										<div
											class="flex-1 h-1 bg-muted rounded-full overflow-hidden"
										>
											<div
												class="h-full bg-accent rounded-full"
												style="width: {goal.progress}%"
											></div>
										</div>
										<span class="font-mono text-[0.55rem] text-muted-foreground"
											>{goal.progress}%</span
										>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Milestones Panel -->
				<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden">
					<div
						class="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between"
					>
						<button
							onclick={() => togglePanel('milestones')}
							class="flex items-center gap-3 hover:opacity-80 transition-opacity"
						>
							<Flag class="w-4 h-4 text-emerald-500" />
							<span
								class="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-foreground"
								>Milestones</span
							>
							<span class="font-mono text-[0.6rem] text-muted-foreground"
								>({milestones.length})</span
							>
						</button>
						<div class="flex items-center gap-2">
							<button class="p-1.5 rounded hover:bg-muted transition-colors">
								<Plus class="w-3.5 h-3.5 text-muted-foreground" />
							</button>
							<button
								onclick={() => togglePanel('milestones')}
								class="p-1.5 rounded hover:bg-muted transition-colors"
							>
								<ChevronDown
									class="w-3.5 h-3.5 text-muted-foreground transition-transform {expandedPanels.milestones
										? 'rotate-180'
										: ''}"
								/>
							</button>
						</div>
					</div>

					{#if expandedPanels.milestones}
						<div class="divide-y divide-border" transition:slide={{ duration: 120 }}>
							{#each milestones as milestone}
								{@const status = getStatusIndicator(milestone.state_key)}
								<div class="px-4 py-3 hover:bg-muted/30 transition-colors">
									<div class="flex items-start justify-between gap-2">
										<div>
											<span class="font-mono text-[0.55rem] text-accent block"
												>{milestone.id}</span
											>
											<span class="text-sm text-foreground"
												>{milestone.title}</span
											>
											<span
												class="font-mono text-[0.55rem] text-muted-foreground block mt-1"
												>Due: {milestone.due_at}</span
											>
										</div>
										<div class="flex items-center gap-1.5 shrink-0">
											<span class="w-1.5 h-1.5 rounded-full {status.color}"
											></span>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Tasks Panel -->
				<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden">
					<div
						class="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between"
					>
						<button
							onclick={() => togglePanel('tasks')}
							class="flex items-center gap-3 hover:opacity-80 transition-opacity"
						>
							<ListChecks class="w-4 h-4 text-blue-500" />
							<span
								class="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-foreground"
								>Tasks</span
							>
							<span class="font-mono text-[0.6rem] text-muted-foreground"
								>({tasks.length})</span
							>
						</button>
						<div class="flex items-center gap-2">
							<button class="p-1.5 rounded hover:bg-muted transition-colors">
								<Plus class="w-3.5 h-3.5 text-muted-foreground" />
							</button>
							<button
								onclick={() => togglePanel('tasks')}
								class="p-1.5 rounded hover:bg-muted transition-colors"
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
						<div class="divide-y divide-border" transition:slide={{ duration: 120 }}>
							{#each tasks as task}
								{@const status = getStatusIndicator(task.state_key)}
								{@const TaskIcon = getTaskIcon(task.state_key)}
								<div class="px-4 py-3 hover:bg-muted/30 transition-colors group">
									<div class="flex items-start gap-3">
										<TaskIcon
											class="w-4 h-4 mt-0.5 shrink-0 {status.color ===
											'bg-emerald-500'
												? 'text-emerald-500'
												: status.color === 'bg-blue-500'
													? 'text-blue-500'
													: status.color === 'bg-red-500'
														? 'text-red-500'
														: 'text-slate-400'}"
										/>
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2">
												<span class="font-mono text-[0.55rem] text-accent"
													>{task.id}</span
												>
												<span
													class="font-mono text-[0.5rem] uppercase {getPriorityColor(
														task.priority
													)}">{task.priority}</span
												>
											</div>
											<span class="text-sm text-foreground block"
												>{task.title}</span
											>
											{#if task.assignee}
												<span
													class="font-mono text-[0.55rem] text-muted-foreground"
													>@{task.assignee}</span
												>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Risks Panel -->
				<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden">
					<div
						class="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between"
					>
						<button
							onclick={() => togglePanel('risks')}
							class="flex items-center gap-3 hover:opacity-80 transition-opacity"
						>
							<AlertCircle class="w-4 h-4 text-red-500" />
							<span
								class="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-foreground"
								>Risks</span
							>
							<span class="font-mono text-[0.6rem] text-muted-foreground"
								>({risks.length})</span
							>
						</button>
						<div class="flex items-center gap-2">
							<button class="p-1.5 rounded hover:bg-muted transition-colors">
								<Plus class="w-3.5 h-3.5 text-muted-foreground" />
							</button>
							<button
								onclick={() => togglePanel('risks')}
								class="p-1.5 rounded hover:bg-muted transition-colors"
							>
								<ChevronDown
									class="w-3.5 h-3.5 text-muted-foreground transition-transform {expandedPanels.risks
										? 'rotate-180'
										: ''}"
								/>
							</button>
						</div>
					</div>

					{#if expandedPanels.risks}
						<div class="divide-y divide-border" transition:slide={{ duration: 120 }}>
							{#each risks as risk}
								{@const status = getStatusIndicator(risk.state_key)}
								<div class="px-4 py-3 hover:bg-muted/30 transition-colors">
									<div class="flex items-start justify-between gap-2">
										<div>
											<span class="font-mono text-[0.55rem] text-accent block"
												>{risk.id}</span
											>
											<span class="text-sm text-foreground">{risk.title}</span
											>
											<div class="flex items-center gap-2 mt-1">
												<span
													class="font-mono text-[0.5rem] uppercase text-red-500"
													>{risk.impact} impact</span
												>
												<span class="text-muted-foreground/50">·</span>
												<span
													class="font-mono text-[0.5rem] uppercase text-muted-foreground"
													>{risk.likelihood} likelihood</span
												>
											</div>
										</div>
										<div class="flex items-center gap-1.5 shrink-0">
											<span class="w-1.5 h-1.5 rounded-full {status.color}"
											></span>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Quick Reference Card -->
				<div class="bg-card border border-border rounded-lg shadow-ink p-4">
					<span
						class="font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground block mb-3"
						>Quick Reference</span
					>
					<div class="space-y-2 font-mono text-xs">
						<div
							class="flex items-center justify-between py-1 border-b border-dashed border-border"
						>
							<span class="text-muted-foreground">Tasks</span>
							<span class="text-foreground">{tasks.length} total</span>
						</div>
						<div
							class="flex items-center justify-between py-1 border-b border-dashed border-border"
						>
							<span class="text-muted-foreground">Completed</span>
							<span class="text-emerald-500"
								>{tasks.filter((t) => t.state_key === 'done').length}</span
							>
						</div>
						<div
							class="flex items-center justify-between py-1 border-b border-dashed border-border"
						>
							<span class="text-muted-foreground">Blocked</span>
							<span class="text-red-500"
								>{tasks.filter((t) => t.state_key === 'blocked').length}</span
							>
						</div>
						<div class="flex items-center justify-between py-1">
							<span class="text-muted-foreground">Open Risks</span>
							<span class="text-amber-500">{risks.length}</span>
						</div>
					</div>
				</div>
			</aside>
		</div>

		<!-- Footer -->
		<footer class="mt-8 pt-4 border-t border-border">
			<div
				class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-muted-foreground"
			>
				<span class="font-mono text-[0.55rem] uppercase tracking-wider">
					{project.id} • Tech Spec Project Demo
				</span>
				<span class="font-mono text-[0.55rem]"> Last synced: 2026-02-01 14:32 UTC </span>
			</div>
		</footer>
	</main>
</div>
