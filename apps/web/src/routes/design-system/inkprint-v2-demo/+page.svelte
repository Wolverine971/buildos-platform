<!-- apps/web/src/routes/design-system/inkprint-v2-demo/+page.svelte -->
<!-- Inkprint v2 Demo: Clean Design with Strategic Texture -->
<!--
	TEXTURE PHILOSOPHY:
	- Default to CLEAN. Most UI has no texture.
	- Texture differentiates SEMANTIC TYPES, not decorates.
	- Cases that warrant texture:
		1. AI-generated content (BLOOM) - "This came from AI"
		2. Errors/warnings (STATIC) - "Something's wrong"
		3. Time-critical alerts (PULSE) - "This is urgent"
		4. Inputs/editable areas (GRID) - "You can write here"
		5. Pressable elements (45° DIAGONAL) - "This is clickable"
		6. Buttons (BRUSHED-ALUM) - Metallic feel for action buttons
	- Headers, regular cards = CLEAN (no texture)

	LAYOUT: Matches /projects/[id] page structure for consistency
-->
<script lang="ts">
	import { slide } from 'svelte/transition';
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
		AlertTriangle,
		ListChecks,
		X,
		Sparkles,
		Zap,
		MoreVertical,
		Calendar,
		Link2,
		Flag,
		Trash2
	} from 'lucide-svelte';

	// Demo state
	let showCreateModal = $state(false);
	let showDeleteModal = $state(false);
	let darkMode = $state(false);

	// Collapsible sections - matches project page pattern
	let documentsExpanded = $state(true);
	let expandedPanels = $state<Record<string, boolean>>({
		goals: true,
		milestones: false,
		tasks: true,
		risks: false
	});

	function togglePanel(key: string) {
		expandedPanels = { ...expandedPanels, [key]: !expandedPanels[key] };
	}

	// Sample data
	const project = {
		name: 'BuildOS Platform Redesign',
		description: 'Complete overhaul of the design system with Inkprint textures',
		state_key: 'active',
		next_step_short: 'Review texture system with the team'
	};

	const tasks = [
		{ id: '1', title: 'Implement texture CSS classes', state_key: 'done', priority: 'high' },
		{ id: '2', title: 'Create demo page', state_key: 'in_progress', priority: 'high' },
		{ id: '3', title: 'Write documentation', state_key: 'todo', priority: 'medium' },
		{ id: '4', title: 'Get team feedback', state_key: 'todo', priority: 'low' }
	];

	const goals = [
		{ id: '1', name: 'Ship v2 design system', state_key: 'active' },
		{ id: '2', name: 'Improve visual clarity', state_key: 'active' }
	];

	const milestones = [
		{
			id: '1',
			title: 'Design system spec complete',
			due_at: '2025-01-20',
			state_key: 'pending'
		},
		{ id: '2', title: 'Component migration done', due_at: '2025-02-01', state_key: 'pending' }
	];

	const documents = [
		{ id: '1', title: 'Design System Spec', type_key: 'spec', state_key: 'draft' },
		{ id: '2', title: 'Texture Philosophy', type_key: 'doc', state_key: 'published' }
	];

	const risks = [
		{ id: '1', title: 'Migration complexity', impact: 'medium', state_key: 'identified' }
	];

	// Urgent item for PULSE texture demo
	const urgentDeadline = {
		title: 'Submit Q1 report',
		dueTime: '5:00 PM today'
	};

	// Helper for status styling
	function getTaskVisuals(state: string) {
		const normalized = state?.toLowerCase() || '';
		if (normalized === 'done' || normalized === 'completed') {
			return { icon: CheckCircle2, color: 'text-emerald-500' };
		}
		if (normalized === 'in_progress' || normalized === 'active') {
			return { icon: Clock, color: 'text-accent' };
		}
		return { icon: Circle, color: 'text-muted-foreground' };
	}

	function getStateLabel(state: string): string {
		return (state || 'draft').replace(/_/g, ' ');
	}
</script>

<svelte:head>
	<title>Inkprint v2 Demo | BuildOS</title>
</svelte:head>

<div class="min-h-screen" class:dark={darkMode}>
	<div class="min-h-screen bg-background text-foreground overflow-x-hidden">
		<!-- Header - Matches /projects/[id] structure, NO texture on structural cards -->
		<header class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 pt-2 sm:pt-4">
			<div
				class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink p-3 sm:p-4 space-y-1 sm:space-y-3"
			>
				<!-- Title Row -->
				<div class="flex items-center justify-between gap-1.5 sm:gap-2">
					<div class="flex items-center gap-1.5 sm:gap-3 min-w-0">
						<a
							href="/design-system/inkprint-v2"
							class="flex items-center justify-center p-1 sm:p-2 rounded-lg hover:bg-muted transition-colors shrink-0 pressable"
							aria-label="Back to texture test"
						>
							<ArrowLeft class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
						</a>
						<div class="min-w-0">
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
							class="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600 capitalize"
						>
							{project.state_key}
						</span>
						<!-- Dark mode toggle -->
						<label
							class="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors"
						>
							<input type="checkbox" bind:checked={darkMode} class="rounded" />
							<span class="text-xs text-muted-foreground">Dark</span>
						</label>
						<button
							class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
							aria-label="Edit project"
						>
							<Pencil class="w-5 h-5 text-muted-foreground" />
						</button>
						<button
							onclick={() => (showDeleteModal = true)}
							class="p-2 rounded-lg hover:bg-destructive/10 transition-colors pressable"
							aria-label="Delete project"
						>
							<Trash2 class="w-5 h-5 text-destructive" />
						</button>
					</div>

					<!-- Mobile: State + 3-dot menu -->
					<div class="flex items-center gap-1.5 sm:hidden">
						<span
							class="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600 capitalize"
						>
							{project.state_key}
						</span>
						<button
							class="p-1.5 rounded-lg hover:bg-muted transition-colors pressable"
							aria-label="Project options"
						>
							<MoreVertical class="w-5 h-5 text-muted-foreground" />
						</button>
					</div>
				</div>

				<!-- Next Step Display - Matches project page -->
				<div
					class="flex items-center gap-3 p-3 rounded-lg bg-accent/5 border border-accent/20"
				>
					<div
						class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"
					>
						<Zap class="w-4 h-4 text-accent" />
					</div>
					<div>
						<p class="text-[10px] uppercase tracking-wider text-accent font-medium">
							Next Step
						</p>
						<p class="text-sm text-foreground">{project.next_step_short}</p>
					</div>
				</div>
			</div>
		</header>

		<!-- Main Content - Matches project page 2-column layout -->
		<main class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-2 sm:py-4 overflow-x-hidden">
			<div
				class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] gap-2 sm:gap-4 lg:gap-6"
			>
				<!-- Left Column: Main Content -->
				<div class="min-w-0 space-y-2 sm:space-y-4">
					<!-- ============================================ -->
					<!-- AI SUGGESTION - Uses BLOOM texture           -->
					<!-- This is AI-generated, needs differentiation  -->
					<!-- ============================================ -->
					<div
						class="relative overflow-hidden rounded-xl border border-dashed border-accent/40 bg-accent/5 p-4 tx tx-bloom tx-weak"
					>
						<div class="relative z-10 flex items-start gap-3">
							<div
								class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"
							>
								<Sparkles class="w-5 h-5 text-accent" />
							</div>
							<div class="flex-1">
								<p class="text-xs font-medium text-accent uppercase tracking-wider">
									AI Suggestion
								</p>
								<p class="text-sm text-foreground mt-1">
									Based on your progress, the "Write documentation" task could be
									broken into smaller chunks. Want me to help?
								</p>
								<div class="flex gap-2 mt-3">
									<button
										class="px-3 py-1.5 text-xs font-medium bg-accent text-accent-foreground rounded-lg tx-button pressable"
									>
										<span>Yes, help me</span>
									</button>
									<button
										class="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
									>
										Dismiss
									</button>
								</div>
							</div>
						</div>
					</div>

					<!-- ============================================ -->
					<!-- URGENT DEADLINE - Uses PULSE texture         -->
					<!-- Time-critical, needs to grab attention       -->
					<!-- ============================================ -->
					<div
						class="relative overflow-hidden rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-4 tx tx-pulse tx-med"
					>
						<div class="relative z-10 flex items-center gap-3">
							<div
								class="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0"
							>
								<Clock class="w-5 h-5 text-amber-600" />
							</div>
							<div class="flex-1">
								<p
									class="text-xs font-medium text-amber-600 uppercase tracking-wider"
								>
									Due Today
								</p>
								<p class="text-sm font-medium text-foreground mt-0.5">
									{urgentDeadline.title}
								</p>
								<p class="text-xs text-muted-foreground">
									Deadline: {urgentDeadline.dueTime}
								</p>
							</div>
							<button
								class="px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg tx-button pressable"
							>
								<span>Start Now</span>
							</button>
						</div>
					</div>

					<!-- ============================================ -->
					<!-- DOCUMENTS SECTION - Collapsible              -->
					<!-- NO texture on containers, clean headers      -->
					<!-- ============================================ -->
					<section
						class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink overflow-hidden"
					>
						<div
							class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3"
						>
							<button
								onclick={() => (documentsExpanded = !documentsExpanded)}
								class="flex items-center gap-2 sm:gap-3 flex-1 text-left hover:bg-muted/60 -m-2 sm:-m-3 p-2 sm:p-3 rounded-lg transition-colors pressable"
							>
								<div
									class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center"
								>
									<FileText class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
								</div>
								<div>
									<p class="text-xs sm:text-sm font-semibold text-foreground">
										Documents
									</p>
									<p class="text-[10px] sm:text-xs text-muted-foreground">
										{documents.length}
										{documents.length === 1 ? 'document' : 'documents'}
									</p>
								</div>
							</button>
							<div class="flex items-center gap-1 sm:gap-2">
								<button
									onclick={() => {
										showCreateModal = true;
									}}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
									aria-label="Add document"
								>
									<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
								</button>
								<button
									onclick={() => (documentsExpanded = !documentsExpanded)}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
									aria-label={documentsExpanded
										? 'Collapse documents'
										: 'Expand documents'}
								>
									<ChevronDown
										class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {documentsExpanded
											? 'rotate-180'
											: ''}"
									/>
								</button>
							</div>
						</div>

						{#if documentsExpanded}
							<div
								class="border-t border-border"
								transition:slide={{ duration: 120 }}
							>
								<ul class="divide-y divide-border/80">
									{#each documents as doc}
										<li>
											<button
												type="button"
												class="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
											>
												<div
													class="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0"
												>
													<FileText
														class="w-3 h-3 sm:w-4 sm:h-4 text-accent"
													/>
												</div>
												<div class="min-w-0 flex-1">
													<p
														class="text-xs sm:text-sm text-foreground truncate"
													>
														{doc.title}
													</p>
													<p
														class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block capitalize"
													>
														{doc.type_key}
													</p>
												</div>
												<span
													class="flex-shrink-0 text-[9px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-card border border-border capitalize"
												>
													{getStateLabel(doc.state_key)}
												</span>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</section>

					<!-- ============================================ -->
					<!-- ERROR STATE - Uses STATIC texture            -->
					<!-- Something is wrong, needs attention          -->
					<!-- ============================================ -->
					<div
						class="relative overflow-hidden rounded-xl border border-destructive/30 bg-destructive/5 p-4 tx tx-static tx-weak"
					>
						<div class="relative z-10 flex items-start gap-3">
							<AlertTriangle class="w-5 h-5 text-destructive shrink-0 mt-0.5" />
							<div>
								<p class="text-sm font-medium text-destructive">
									Calendar Sync Failed
								</p>
								<p class="text-xs text-muted-foreground mt-1">
									Unable to sync with Google Calendar. Your recent changes may not
									be saved.
								</p>
								<div class="flex gap-2 mt-3">
									<button
										class="px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground rounded-lg tx-button pressable"
									>
										<span>Retry</span>
									</button>
									<button
										class="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
									>
										Dismiss
									</button>
								</div>
							</div>
						</div>
					</div>

					<!-- ============================================ -->
					<!-- TEXTURE REFERENCE CARD                       -->
					<!-- Shows semantic texture mapping               -->
					<!-- ============================================ -->
					<div class="bg-card border border-border rounded-xl shadow-ink p-4 sm:p-6">
						<h3
							class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4"
						>
							Texture Semantic Reference
						</h3>
						<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
							<div class="flex items-start gap-2">
								<Sparkles class="w-4 h-4 text-accent mt-0.5 shrink-0" />
								<div>
									<span class="text-sm font-medium text-foreground">BLOOM</span>
									<span class="block text-xs text-muted-foreground"
										>AI suggestions, generated content</span
									>
								</div>
							</div>
							<div class="flex items-start gap-2">
								<Clock class="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
								<div>
									<span class="text-sm font-medium text-foreground">PULSE</span>
									<span class="block text-xs text-muted-foreground"
										>Urgent deadlines, time pressure</span
									>
								</div>
							</div>
							<div class="flex items-start gap-2">
								<AlertTriangle class="w-4 h-4 text-destructive mt-0.5 shrink-0" />
								<div>
									<span class="text-sm font-medium text-foreground">STATIC</span>
									<span class="block text-xs text-muted-foreground"
										>Errors, warnings, blockers</span
									>
								</div>
							</div>
							<div class="flex items-start gap-2">
								<div
									class="w-4 h-4 rounded border border-border bg-muted mt-0.5 shrink-0 tx tx-grid tx-weak"
								></div>
								<div>
									<span class="text-sm font-medium text-foreground">GRID</span>
									<span class="block text-xs text-muted-foreground"
										>Inputs, editable fields</span
									>
								</div>
							</div>
							<div class="flex items-start gap-2">
								<div
									class="w-4 h-4 rounded border border-border bg-accent mt-0.5 shrink-0 pressable"
								></div>
								<div>
									<span class="text-sm font-medium text-foreground"
										>PRESSABLE</span
									>
									<span class="block text-xs text-muted-foreground"
										>45° diagonals on clickable items</span
									>
								</div>
							</div>
							<div class="flex items-start gap-2">
								<div
									class="w-4 h-4 rounded border border-border bg-accent mt-0.5 shrink-0 tx-button"
								></div>
								<div>
									<span class="text-sm font-medium text-foreground">BUTTON</span>
									<span class="block text-xs text-muted-foreground"
										>Brushed metal for action buttons</span
									>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Right Column: Insight Panels (matches project page sidebar) -->
				<aside class="min-w-0 space-y-2 sm:space-y-3 lg:sticky lg:top-24">
					<!-- Goals Panel - NO texture on containers, clean headers -->
					<div
						class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink overflow-hidden"
					>
						<div
							class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3"
						>
							<button
								onclick={() => togglePanel('goals')}
								class="flex items-center gap-2 sm:gap-3 flex-1 text-left hover:bg-muted/60 -m-2 sm:-m-3 p-2 sm:p-3 rounded-lg transition-colors pressable"
							>
								<div
									class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-amber-500/10 flex items-center justify-center"
								>
									<Target class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
								</div>
								<div class="min-w-0">
									<p class="text-xs sm:text-sm font-semibold text-foreground">
										Goals
										<span class="text-muted-foreground font-normal"
											>({goals.length})</span
										>
									</p>
									<p
										class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
									>
										What success looks like
									</p>
								</div>
							</button>
							<div class="flex items-center gap-1 sm:gap-2">
								<button
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
									aria-label="Add goal"
								>
									<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
								</button>
								<button
									onclick={() => togglePanel('goals')}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
								>
									<ChevronDown
										class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.goals
											? 'rotate-180'
											: ''}"
									/>
								</button>
							</div>
						</div>

						{#if expandedPanels.goals}
							<div
								class="border-t border-border"
								transition:slide={{ duration: 120 }}
							>
								<ul class="divide-y divide-border/80">
									{#each goals as goal}
										<li>
											<button
												type="button"
												class="w-full flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
											>
												<Target
													class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 mt-0.5"
												/>
												<div class="min-w-0">
													<p
														class="text-xs sm:text-sm text-foreground truncate"
													>
														{goal.name}
													</p>
													<p
														class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block capitalize"
													>
														{getStateLabel(goal.state_key)}
													</p>
												</div>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>

					<!-- Milestones Panel - NO texture on containers -->
					<div
						class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink overflow-hidden"
					>
						<div
							class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3"
						>
							<button
								onclick={() => togglePanel('milestones')}
								class="flex items-center gap-2 sm:gap-3 flex-1 text-left hover:bg-muted/60 -m-2 sm:-m-3 p-2 sm:p-3 rounded-lg transition-colors pressable"
							>
								<div
									class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-emerald-500/10 flex items-center justify-center"
								>
									<Flag class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />
								</div>
								<div class="min-w-0">
									<p class="text-xs sm:text-sm font-semibold text-foreground">
										Milestones
										<span class="text-muted-foreground font-normal"
											>({milestones.length})</span
										>
									</p>
									<p
										class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
									>
										Checkpoints and dates
									</p>
								</div>
							</button>
							<div class="flex items-center gap-1 sm:gap-2">
								<button
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
									aria-label="Add milestone"
								>
									<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
								</button>
								<button
									onclick={() => togglePanel('milestones')}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
								>
									<ChevronDown
										class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.milestones
											? 'rotate-180'
											: ''}"
									/>
								</button>
							</div>
						</div>

						{#if expandedPanels.milestones}
							<div
								class="border-t border-border"
								transition:slide={{ duration: 120 }}
							>
								<ul class="divide-y divide-border/80">
									{#each milestones as milestone}
										<li>
											<button
												type="button"
												class="w-full flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
											>
												<Flag
													class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 mt-0.5"
												/>
												<div class="min-w-0 flex-1">
													<p
														class="text-xs sm:text-sm text-foreground truncate"
													>
														{milestone.title}
													</p>
													<p
														class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
													>
														Due: {milestone.due_at}
													</p>
												</div>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>

					<!-- Tasks Panel - NO texture on containers -->
					<div
						class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink overflow-hidden"
					>
						<div
							class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3"
						>
							<button
								onclick={() => togglePanel('tasks')}
								class="flex items-center gap-2 sm:gap-3 flex-1 text-left hover:bg-muted/60 -m-2 sm:-m-3 p-2 sm:p-3 rounded-lg transition-colors pressable"
							>
								<div
									class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center"
								>
									<ListChecks class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
								</div>
								<div class="min-w-0">
									<p class="text-xs sm:text-sm font-semibold text-foreground">
										Tasks
										<span class="text-muted-foreground font-normal"
											>({tasks.length})</span
										>
									</p>
									<p
										class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
									>
										What needs to move
									</p>
								</div>
							</button>
							<div class="flex items-center gap-1 sm:gap-2">
								<button
									onclick={() => (showCreateModal = true)}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
									aria-label="Add task"
								>
									<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
								</button>
								<button
									onclick={() => togglePanel('tasks')}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
								>
									<ChevronDown
										class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.tasks
											? 'rotate-180'
											: ''}"
									/>
								</button>
							</div>
						</div>

						{#if expandedPanels.tasks}
							<div
								class="border-t border-border"
								transition:slide={{ duration: 120 }}
							>
								<ul class="divide-y divide-border/80">
									{#each tasks as task}
										{@const visuals = getTaskVisuals(task.state_key)}
										{@const TaskIcon = visuals.icon}
										<li>
											<button
												type="button"
												class="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
											>
												<TaskIcon
													class="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 {visuals.color}"
												/>
												<div class="min-w-0 flex-1">
													<p
														class="text-xs sm:text-sm text-foreground truncate"
													>
														{task.title}
													</p>
													<p
														class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
													>
														<span class="capitalize"
															>{getStateLabel(task.state_key)}</span
														>
														<span class="mx-1 opacity-50">·</span>
														<span class="capitalize"
															>{task.priority}</span
														>
													</p>
												</div>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>

					<!-- Risks Panel - NO texture on containers -->
					<div
						class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink overflow-hidden"
					>
						<div
							class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3"
						>
							<button
								onclick={() => togglePanel('risks')}
								class="flex items-center gap-2 sm:gap-3 flex-1 text-left hover:bg-muted/60 -m-2 sm:-m-3 p-2 sm:p-3 rounded-lg transition-colors pressable"
							>
								<div
									class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-destructive/10 flex items-center justify-center"
								>
									<AlertTriangle
										class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-destructive"
									/>
								</div>
								<div class="min-w-0">
									<p class="text-xs sm:text-sm font-semibold text-foreground">
										Risks
										<span class="text-muted-foreground font-normal"
											>({risks.length})</span
										>
									</p>
									<p
										class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
									>
										What could go wrong
									</p>
								</div>
							</button>
							<div class="flex items-center gap-1 sm:gap-2">
								<button
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
									aria-label="Add risk"
								>
									<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
								</button>
								<button
									onclick={() => togglePanel('risks')}
									class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
								>
									<ChevronDown
										class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.risks
											? 'rotate-180'
											: ''}"
									/>
								</button>
							</div>
						</div>

						{#if expandedPanels.risks}
							<div
								class="border-t border-border"
								transition:slide={{ duration: 120 }}
							>
								<ul class="divide-y divide-border/80">
									{#each risks as risk}
										<li>
											<button
												type="button"
												class="w-full flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
											>
												<AlertTriangle
													class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 mt-0.5"
												/>
												<div class="min-w-0 flex-1">
													<p
														class="text-xs sm:text-sm text-foreground truncate"
													>
														{risk.title}
													</p>
													<p
														class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block"
													>
														<span class="capitalize"
															>{risk.state_key?.replace(/_/g, ' ') ||
																'identified'}</span
														>
														<span class="mx-1 opacity-50">·</span>
														<span class="capitalize">{risk.impact}</span
														>
														impact
													</p>
												</div>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>

					<!-- Quick Actions Card -->
					<div class="bg-card border border-border rounded-xl shadow-ink p-4">
						<h3
							class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3"
						>
							Quick Actions
						</h3>
						<div class="space-y-2">
							<button
								onclick={() => (showCreateModal = true)}
								class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-lg tx-button pressable"
							>
								<Plus class="w-4 h-4" />
								<span>New Task</span>
							</button>
							<button
								class="w-full flex items-center gap-3 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
							>
								<Calendar class="w-4 h-4 text-muted-foreground" />
								<span class="text-foreground">Schedule</span>
							</button>
							<button
								class="w-full flex items-center gap-3 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
							>
								<Link2 class="w-4 h-4 text-muted-foreground" />
								<span class="text-foreground">Add Link</span>
							</button>
						</div>
					</div>
				</aside>
			</div>
		</main>
	</div>
</div>

<!-- ============================================ -->
<!-- CREATE TASK MODAL - Uses GRID for inputs    -->
<!-- Inputs show grid texture (graph paper feel) -->
<!-- ============================================ -->
{#if showCreateModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<!-- Backdrop -->
		<button
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			onclick={() => (showCreateModal = false)}
		></button>

		<!-- Modal - Clean container, GRID texture for inputs -->
		<div
			class="relative w-full max-w-md bg-card border border-border rounded-xl shadow-ink-strong"
		>
			<!-- Header -->
			<div
				class="relative z-10 flex items-center justify-between px-4 py-3 border-b border-border"
			>
				<h2 class="text-lg font-semibold text-foreground">Create Task</h2>
				<button
					onclick={() => (showCreateModal = false)}
					class="p-1.5 rounded-lg hover:bg-muted transition-colors"
				>
					<X class="w-5 h-5 text-muted-foreground" />
				</button>
			</div>

			<!-- Form - GRID texture on inputs -->
			<div class="relative z-10 p-4 space-y-4">
				<div class="space-y-1.5">
					<label class="text-xs font-medium text-muted-foreground">Title</label>
					<!-- Input with GRID texture - "you can write here" -->
					<div class="relative tx tx-grid tx-weak rounded-lg overflow-hidden">
						<input
							type="text"
							placeholder="What needs to be done?"
							class="relative z-10 w-full px-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-accent/30 text-foreground placeholder:text-muted-foreground outline-none transition-colors"
						/>
					</div>
				</div>

				<div class="space-y-1.5">
					<label class="text-xs font-medium text-muted-foreground">Description</label>
					<!-- Textarea with GRID texture -->
					<div class="relative tx tx-grid tx-weak rounded-lg overflow-hidden">
						<textarea
							placeholder="Add details..."
							rows="3"
							class="relative z-10 w-full px-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-accent/30 text-foreground placeholder:text-muted-foreground outline-none resize-none transition-colors"
						></textarea>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<label class="text-xs font-medium text-muted-foreground">Priority</label>
						<!-- Select with GRID texture -->
						<div class="relative tx tx-grid tx-weak rounded-lg overflow-hidden">
							<select
								class="relative z-10 w-full px-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner text-foreground outline-none"
							>
								<option>Low</option>
								<option>Medium</option>
								<option selected>High</option>
							</select>
						</div>
					</div>
					<div class="space-y-1.5">
						<label class="text-xs font-medium text-muted-foreground">Due Date</label>
						<!-- Date input with GRID texture -->
						<div class="relative tx tx-grid tx-weak rounded-lg overflow-hidden">
							<input
								type="date"
								class="relative z-10 w-full px-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner text-foreground outline-none"
							/>
						</div>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div
				class="relative z-10 flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30 rounded-b-xl"
			>
				<button
					onclick={() => (showCreateModal = false)}
					class="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
				>
					Cancel
				</button>
				<button
					onclick={() => (showCreateModal = false)}
					class="px-4 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-lg tx-button pressable"
				>
					<span>Create</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ============================================ -->
<!-- DELETE MODAL - Uses STATIC texture          -->
<!-- Destructive action = warning state          -->
<!-- ============================================ -->
{#if showDeleteModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			onclick={() => (showDeleteModal = false)}
		></button>

		<!-- Modal with STATIC texture (this IS a warning state) -->
		<div
			class="relative w-full max-w-sm bg-card border border-destructive/30 rounded-xl shadow-ink-strong tx tx-static tx-weak overflow-hidden"
		>
			<div class="relative z-10 p-4">
				<div class="flex items-start gap-3">
					<div
						class="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0"
					>
						<AlertTriangle class="w-5 h-5 text-destructive" />
					</div>
					<div>
						<h3 class="text-base font-semibold text-foreground">Delete Task?</h3>
						<p class="text-sm text-muted-foreground mt-1">
							This action cannot be undone. The task will be permanently removed.
						</p>
					</div>
				</div>

				<div class="flex items-center justify-end gap-2 mt-4">
					<button
						onclick={() => (showDeleteModal = false)}
						class="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
					>
						Cancel
					</button>
					<button
						onclick={() => (showDeleteModal = false)}
						class="px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground rounded-lg tx-button pressable"
					>
						<span>Delete</span>
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
