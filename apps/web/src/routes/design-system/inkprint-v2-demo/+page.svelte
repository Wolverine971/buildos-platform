<!-- apps/web/src/routes/design-system/inkprint-v2-demo/+page.svelte -->
<!-- Inkprint v2 Demo: Clean Design with Strategic Texture -->
<!--
	TEXTURE PHILOSOPHY:
	- Default to CLEAN. Most UI has no texture.
	- Texture differentiates SEMANTIC TYPES, not decorates.
	- Only 3 cases warrant texture:
		1. AI-generated content (BLOOM) - "This came from AI"
		2. Errors/warnings (STATIC) - "Something's wrong"
		3. Time-critical alerts (PULSE) - "This is urgent"
	- Buttons, inputs, regular cards = CLEAN
-->
<script lang="ts">
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
		MoreHorizontal,
		Calendar,
		Link2
	} from 'lucide-svelte';

	// Demo state
	let showCreateModal = $state(false);
	let showDeleteModal = $state(false);
	let darkMode = $state(false);
	let expandedSections = $state<Record<string, boolean>>({
		tasks: true,
		goals: true,
		documents: false
	});

	function toggleSection(key: string) {
		expandedSections = { ...expandedSections, [key]: !expandedSections[key] };
	}

	// Sample data
	const project = {
		name: 'BuildOS Platform Redesign',
		description: 'Complete overhaul of the design system with Inkprint textures',
		status: 'active',
		nextStep: 'Review texture system with the team'
	};

	const tasks = [
		{ id: '1', title: 'Implement texture CSS classes', status: 'done', priority: 'high' },
		{ id: '2', title: 'Create demo page', status: 'in_progress', priority: 'high' },
		{ id: '3', title: 'Write documentation', status: 'todo', priority: 'medium' },
		{ id: '4', title: 'Get team feedback', status: 'todo', priority: 'low' }
	];

	const goals = [
		{ id: '1', name: 'Ship v2 design system', status: 'active' },
		{ id: '2', name: 'Improve visual clarity', status: 'active' }
	];

	const documents = [
		{ id: '1', title: 'Design System Spec', type: 'spec' },
		{ id: '2', title: 'Texture Philosophy', type: 'doc' }
	];

	// Urgent item for PULSE texture demo
	const urgentDeadline = {
		title: 'Submit Q1 report',
		dueTime: '5:00 PM today'
	};

	// Helper for status styling
	function getStatusStyle(status: string) {
		switch (status) {
			case 'done':
				return { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
			case 'in_progress':
				return { icon: Clock, color: 'text-accent', bg: 'bg-accent/10' };
			case 'blocked':
				return { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' };
			default:
				return { icon: Circle, color: 'text-muted-foreground', bg: 'bg-muted' };
		}
	}
</script>

<svelte:head>
	<title>Inkprint v2 Demo | BuildOS</title>
</svelte:head>

<div class="min-h-screen" class:dark={darkMode}>
	<div class="min-h-screen bg-background text-foreground">
		<!-- Top Navigation Bar -->
		<nav class="sticky top-0 z-40 bg-card/95 backdrop-blur border-b border-border">
			<div class="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between">
				<a
					href="/design-system/inkprint-v2"
					class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft class="w-4 h-4" />
					<span>Back to Texture Test</span>
				</a>

				<div class="flex items-center gap-3">
					<label class="flex items-center gap-2 text-sm cursor-pointer">
						<input
							type="checkbox"
							bind:checked={darkMode}
							class="rounded border-border"
						/>
						<span class="text-muted-foreground">Dark</span>
					</label>
				</div>
			</div>
		</nav>

		<!-- Page Content -->
		<div class="max-w-6xl mx-auto px-4 py-6">
			<!-- Project Header - CLEAN (no texture, it's just a header) -->
			<header class="mb-6">
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<div class="flex items-center gap-3 mb-1">
							<h1 class="text-2xl font-bold text-foreground truncate">
								{project.name}
							</h1>
							<span
								class="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600 capitalize"
							>
								{project.status}
							</span>
						</div>
						<p class="text-sm text-muted-foreground">{project.description}</p>
					</div>

					<div class="flex items-center gap-2 shrink-0">
						<button class="p-2 rounded-lg hover:bg-muted transition-colors">
							<Pencil class="w-4 h-4 text-muted-foreground" />
						</button>
						<button class="p-2 rounded-lg hover:bg-muted transition-colors">
							<MoreHorizontal class="w-4 h-4 text-muted-foreground" />
						</button>
					</div>
				</div>

				<!-- Next Step - CLEAN card, just highlighted with accent -->
				<div class="mt-4 p-3 rounded-lg bg-accent/5 border border-accent/20">
					<div class="flex items-center gap-3">
						<div
							class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"
						>
							<Zap class="w-4 h-4 text-accent" />
						</div>
						<div>
							<p class="text-[10px] uppercase tracking-wider text-accent font-medium">
								Next Step
							</p>
							<p class="text-sm text-foreground">{project.nextStep}</p>
						</div>
					</div>
				</div>
			</header>

			<!-- Main Grid -->
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<!-- Left Column: Main Content -->
				<div class="lg:col-span-2 space-y-6">
					<!-- ============================================ -->
					<!-- AI SUGGESTION - Uses BLOOM texture           -->
					<!-- This is AI-generated, needs differentiation  -->
					<!-- ============================================ -->
					<div
						class="relative overflow-hidden rounded-xl border border-dashed border-accent/40 bg-accent/5 p-4"
					>
						<!-- BLOOM texture - signals "AI generated" -->
						<div
							class="absolute inset-0 pointer-events-none opacity-[0.15]"
							style="background-image: url('/textures/little-pluses.png'); background-repeat: repeat;"
						></div>

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
										class="px-3 py-1.5 text-xs font-medium bg-accent text-accent-foreground rounded-lg pressable"
									>
										Yes, help me
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
						class="relative overflow-hidden rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-4"
					>
						<!-- PULSE texture - signals urgency -->
						<div
							class="absolute inset-0 pointer-events-none opacity-[0.2]"
							style="background-image: url('/textures/grilled-noise.png'); background-repeat: repeat;"
						></div>

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
								class="px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg pressable"
							>
								Start Now
							</button>
						</div>
					</div>

					<!-- ============================================ -->
					<!-- TASKS SECTION - CLEAN (normal content)       -->
					<!-- Tasks are user content, no special texture   -->
					<!-- ============================================ -->
					<section
						class="bg-card border border-border rounded-xl shadow-ink overflow-hidden"
					>
						<!-- Section Header -->
						<div
							role="button"
							tabindex="0"
							onclick={() => toggleSection('tasks')}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									toggleSection('tasks');
								}
							}}
							class="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
						>
							<div class="flex items-center gap-3">
								<div
									class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center"
								>
									<ListChecks class="w-4 h-4 text-accent" />
								</div>
								<div class="text-left">
									<h2 class="text-sm font-semibold text-foreground">Tasks</h2>
									<p class="text-xs text-muted-foreground">
										{tasks.length} items
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2">
								<button
									onclick={(e) => {
										e.stopPropagation();
										showCreateModal = true;
									}}
									class="p-1.5 rounded-md hover:bg-muted transition-colors"
								>
									<Plus class="w-4 h-4 text-muted-foreground" />
								</button>
								<ChevronDown
									class="w-4 h-4 text-muted-foreground transition-transform {expandedSections.tasks
										? ''
										: '-rotate-90'}"
								/>
							</div>
						</div>

						<!-- Task List -->
						{#if expandedSections.tasks}
							<div class="border-t border-border">
								<ul class="divide-y divide-border">
									{#each tasks as task}
										{@const style = getStatusStyle(task.status)}
										<li>
											<button
												class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
											>
												<svelte:component
													this={style.icon}
													class="w-4 h-4 {style.color} shrink-0"
												/>
												<span
													class="flex-1 text-sm text-foreground truncate"
													>{task.title}</span
												>
												<span
													class="text-xs text-muted-foreground capitalize px-2 py-0.5 rounded bg-muted"
												>
													{task.priority}
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
						class="relative overflow-hidden rounded-xl border border-destructive/30 bg-destructive/5 p-4"
					>
						<!-- STATIC texture - signals disruption/error -->
						<div
							class="absolute inset-0 pointer-events-none opacity-[0.2]"
							style="background-image: url('/textures/noisy.png'); background-repeat: repeat;"
						></div>

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
										class="px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground rounded-lg pressable"
									>
										Retry
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
					<!-- DOCUMENTS - CLEAN (normal content)           -->
					<!-- Documents are user content, no texture       -->
					<!-- ============================================ -->
					<section
						class="bg-card border border-border rounded-xl shadow-ink overflow-hidden"
					>
						<!-- Section Header -->
						<div class="flex items-center justify-between gap-3 px-4 py-3">
							<div
								role="button"
								tabindex="0"
								onclick={() => toggleSection('documents')}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										toggleSection('documents');
									}
								}}
								class="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
							>
								<div
									class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center"
								>
									<FileText class="w-4 h-4 text-accent" />
								</div>
								<div class="text-left">
									<h2 class="text-sm font-semibold text-foreground">Documents</h2>
									<p class="text-xs text-muted-foreground">
										{documents.length} files
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2">
								<button class="p-1.5 rounded-md hover:bg-muted transition-colors">
									<Plus class="w-4 h-4 text-muted-foreground" />
								</button>
								<button
									onclick={() => toggleSection('documents')}
									class="p-1.5 rounded-md hover:bg-muted transition-colors"
								>
									<ChevronDown
										class="w-4 h-4 text-muted-foreground transition-transform {expandedSections.documents
											? ''
											: '-rotate-90'}"
									/>
								</button>
							</div>
						</div>

						{#if expandedSections.documents}
							<div class="border-t border-border">
								<ul class="divide-y divide-border">
									{#each documents as doc}
										<li>
											<button
												class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
											>
												<FileText class="w-4 h-4 text-accent shrink-0" />
												<span
													class="flex-1 text-sm text-foreground truncate"
													>{doc.title}</span
												>
												<span
													class="text-xs text-muted-foreground capitalize"
													>{doc.type}</span
												>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</section>
				</div>

				<!-- Right Column: Sidebar -->
				<aside class="space-y-4">
					<!-- ============================================ -->
					<!-- GOALS - CLEAN (normal content)               -->
					<!-- Goals are user content, no texture needed    -->
					<!-- ============================================ -->
					<section
						class="bg-card border border-border rounded-xl shadow-ink overflow-hidden"
					>
						<!-- Section Header -->
						<div
							role="button"
							tabindex="0"
							onclick={() => toggleSection('goals')}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									toggleSection('goals');
								}
							}}
							class="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
						>
							<div class="flex items-center gap-3">
								<div
									class="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center"
								>
									<Target class="w-4 h-4 text-amber-500" />
								</div>
								<div class="text-left">
									<h2 class="text-sm font-semibold text-foreground">Goals</h2>
									<p class="text-xs text-muted-foreground">
										{goals.length} active
									</p>
								</div>
							</div>
							<ChevronDown
								class="w-4 h-4 text-muted-foreground transition-transform {expandedSections.goals
									? ''
									: '-rotate-90'}"
							/>
						</div>

						{#if expandedSections.goals}
							<div class="border-t border-border">
								<ul class="divide-y divide-border">
									{#each goals as goal}
										<li>
											<button
												class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
											>
												<Target class="w-4 h-4 text-amber-500 shrink-0" />
												<span class="text-sm text-foreground"
													>{goal.name}</span
												>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</section>

					<!-- Quick Actions - CLEAN buttons -->
					<div class="bg-card border border-border rounded-xl shadow-ink p-4">
						<h3
							class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3"
						>
							Quick Actions
						</h3>
						<div class="space-y-2">
							<button
								onclick={() => (showCreateModal = true)}
								class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-lg pressable"
							>
								<Plus class="w-4 h-4" />
								New Task
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

					<!-- Texture Philosophy Reference -->
					<div class="p-4 rounded-xl bg-muted/50 border border-border">
						<h3
							class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3"
						>
							Texture Usage
						</h3>
						<div class="space-y-3 text-xs text-muted-foreground">
							<div class="flex items-start gap-2">
								<Sparkles class="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
								<div>
									<span class="font-medium text-foreground">BLOOM</span>
									<span class="block">AI suggestions, generated content</span>
								</div>
							</div>
							<div class="flex items-start gap-2">
								<Clock class="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
								<div>
									<span class="font-medium text-foreground">PULSE</span>
									<span class="block">Urgent deadlines, time pressure</span>
								</div>
							</div>
							<div class="flex items-start gap-2">
								<AlertTriangle
									class="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0"
								/>
								<div>
									<span class="font-medium text-foreground">STATIC</span>
									<span class="block">Errors, warnings, blockers</span>
								</div>
							</div>
							<div class="pt-2 border-t border-border">
								<p class="italic">
									Everything else: <span class="text-foreground font-medium"
										>CLEAN</span
									>
								</p>
							</div>
						</div>
					</div>
				</aside>
			</div>
		</div>
	</div>
</div>

<!-- ============================================ -->
<!-- CREATE TASK MODAL - CLEAN (functional UI)   -->
<!-- Modals are functional, no texture needed    -->
<!-- ============================================ -->
{#if showCreateModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<!-- Backdrop -->
		<button
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			onclick={() => (showCreateModal = false)}
		></button>

		<!-- Modal - CLEAN design -->
		<div
			class="relative w-full max-w-md bg-card border border-border rounded-xl shadow-ink-strong"
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-4 py-3 border-b border-border">
				<h2 class="text-lg font-semibold text-foreground">Create Task</h2>
				<button
					onclick={() => (showCreateModal = false)}
					class="p-1.5 rounded-lg hover:bg-muted transition-colors"
				>
					<X class="w-5 h-5 text-muted-foreground" />
				</button>
			</div>

			<!-- Form - CLEAN inputs -->
			<div class="p-4 space-y-4">
				<div class="space-y-1.5">
					<label class="text-xs font-medium text-muted-foreground">Title</label>
					<input
						type="text"
						placeholder="What needs to be done?"
						class="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-accent/30 text-foreground placeholder:text-muted-foreground outline-none transition-colors"
					/>
				</div>

				<div class="space-y-1.5">
					<label class="text-xs font-medium text-muted-foreground">Description</label>
					<textarea
						placeholder="Add details..."
						rows="3"
						class="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-accent/30 text-foreground placeholder:text-muted-foreground outline-none resize-none transition-colors"
					></textarea>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<label class="text-xs font-medium text-muted-foreground">Priority</label>
						<select
							class="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner text-foreground outline-none"
						>
							<option>Low</option>
							<option>Medium</option>
							<option selected>High</option>
						</select>
					</div>
					<div class="space-y-1.5">
						<label class="text-xs font-medium text-muted-foreground">Due Date</label>
						<input
							type="date"
							class="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner text-foreground outline-none"
						/>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div
				class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30 rounded-b-xl"
			>
				<button
					onclick={() => (showCreateModal = false)}
					class="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
				>
					Cancel
				</button>
				<button
					onclick={() => (showCreateModal = false)}
					class="px-4 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-lg pressable"
				>
					Create
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
			class="relative w-full max-w-sm bg-card border border-destructive/30 rounded-xl shadow-ink-strong overflow-hidden"
		>
			<div
				class="absolute inset-0 pointer-events-none opacity-[0.15]"
				style="background-image: url('/textures/noisy.png'); background-repeat: repeat;"
			></div>

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
						class="px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground rounded-lg pressable"
					>
						Delete
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Dark mode support */
	.dark {
		color-scheme: dark;
	}

	.dark .bg-background {
		background-color: hsl(240 10% 6%);
	}

	.dark .bg-card {
		background-color: hsl(240 10% 10%);
	}

	.dark .bg-muted {
		background-color: hsl(240 10% 14%);
	}

	.dark .text-foreground {
		color: hsl(40 10% 92%);
	}

	.dark .text-muted-foreground {
		color: hsl(40 5% 55%);
	}

	.dark .border-border {
		border-color: hsl(240 10% 18%);
	}

	/* Pressable micro-interaction */
	.pressable {
		transition:
			transform 0.1s ease,
			box-shadow 0.1s ease;
	}

	.pressable:active {
		transform: scale(0.98);
	}

	/* Shadow utilities */
	.shadow-ink {
		box-shadow:
			0 1px 3px rgba(0, 0, 0, 0.08),
			0 1px 2px rgba(0, 0, 0, 0.06);
	}

	.dark .shadow-ink {
		box-shadow:
			0 1px 3px rgba(0, 0, 0, 0.3),
			0 1px 2px rgba(0, 0, 0, 0.2);
	}

	.shadow-ink-strong {
		box-shadow:
			0 10px 25px rgba(0, 0, 0, 0.15),
			0 4px 10px rgba(0, 0, 0, 0.1);
	}

	.dark .shadow-ink-strong {
		box-shadow:
			0 10px 25px rgba(0, 0, 0, 0.5),
			0 4px 10px rgba(0, 0, 0, 0.3);
	}

	.shadow-ink-inner {
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
	}

	.dark .shadow-ink-inner {
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
	}
</style>
