<!-- apps/web/src/routes/design-system/tech-spec/+page.svelte -->
<script lang="ts">
	import {
		FileText,
		GitBranch,
		Layers,
		Target,
		Calendar,
		ListChecks,
		Flag,
		AlertTriangle,
		ChevronRight,
		ExternalLink,
		Copy,
		Check,
		Info,
		Zap,
		Database,
		Cpu,
		Activity,
		Terminal,
		Box,
		Hash
	} from 'lucide-svelte';

	// Demo state
	let copiedId: string | null = $state(null);

	function copyToClipboard(text: string, id: string) {
		navigator.clipboard.writeText(text);
		copiedId = id;
		setTimeout(() => (copiedId = null), 2000);
	}

	// Sample data
	const systemStatus = {
		version: '2.4.1',
		build: '20260201-a7c3f',
		uptime: '14d 7h 23m',
		lastDeploy: '2026-01-28T14:32:00Z'
	};

	const entities = [
		{ type: 'Project', id: 'PRJ-0042', name: 'BuildOS Platform', status: 'active', refs: 12 },
		{ type: 'Goal', id: 'GOL-0108', name: 'Launch MVP', status: 'in_progress', refs: 5 },
		{ type: 'Task', id: 'TSK-0891', name: 'Implement auth flow', status: 'completed', refs: 3 },
		{ type: 'Risk', id: 'RSK-0017', name: 'API rate limits', status: 'monitoring', refs: 2 }
	];

	const changelog = [
		{ version: '2.4.1', date: '2026-02-01', type: 'patch', changes: 3 },
		{ version: '2.4.0', date: '2026-01-28', type: 'minor', changes: 12 },
		{ version: '2.3.0', date: '2026-01-15', type: 'minor', changes: 8 },
		{ version: '2.2.5', date: '2026-01-02', type: 'patch', changes: 5 }
	];

	const dependencies = [
		{ from: 'TSK-0891', to: 'TSK-0892', type: 'blocks' },
		{ from: 'GOL-0108', to: 'PRJ-0042', type: 'belongs_to' },
		{ from: 'RSK-0017', to: 'GOL-0108', type: 'threatens' }
	];

	const specPatterns = [
		{
			name: 'Monospace Data',
			description: 'Use font-mono for IDs, codes, and system values',
			example: 'PRJ-0042'
		},
		{
			name: 'Micro-labels',
			description: 'Small caps with wide tracking for section headers',
			example: 'SECTION 01'
		},
		{
			name: 'Key-Value Pairs',
			description: 'Aligned data display with dashed separators',
			example: 'Status: Active'
		},
		{
			name: 'Reference Numbers',
			description: 'Inline doc references for cross-linking',
			example: 'Ref: DS-ANNOT-001'
		}
	];
</script>

<svelte:head>
	<title>Tech Spec Aesthetic | Design System | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background">
	<!-- Page Header with Blueprint Grid -->
	<header class="relative border-b border-border overflow-hidden">
		<!-- Blueprint grid background -->
		<div
			class="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
			style="
				background-image:
					linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
					linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px);
				background-size: 24px 24px;
			"
		></div>

		<!-- Registration marks -->
		<div
			class="absolute top-2 left-2 w-4 h-4 border-l border-t border-muted-foreground/30"
		></div>
		<div
			class="absolute top-2 right-2 w-4 h-4 border-r border-t border-muted-foreground/30"
		></div>
		<div
			class="absolute bottom-2 left-2 w-4 h-4 border-l border-b border-muted-foreground/30"
		></div>
		<div
			class="absolute bottom-2 right-2 w-4 h-4 border-r border-b border-muted-foreground/30"
		></div>

		<div class="relative max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
			<!-- Spec label -->
			<div class="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
				<span
					class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
				>
					DOC-DS-001 • Rev 1.0
				</span>
				<span class="w-1 h-1 rounded-full bg-muted-foreground/50 hidden sm:block"></span>
				<span
					class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
				>
					Design System Reference
				</span>
			</div>

			<h1 class="text-2xl sm:text-3xl lg:text-4xl font-semibold text-foreground mb-2">
				Tech Spec Aesthetic
			</h1>
			<p class="text-sm sm:text-base text-muted-foreground max-w-2xl">
				Technical documentation patterns integrated with the Inkprint design system.
				Precision meets craft.
			</p>

			<!-- Version badge -->
			<div
				class="mt-4 sm:mt-6 inline-flex items-center gap-2 px-3 py-1.5 bg-muted rounded border border-border"
			>
				<div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
				<span class="font-mono text-xs text-foreground">v{systemStatus.version}</span>
				<span class="text-muted-foreground/50">|</span>
				<span class="font-mono text-xs text-muted-foreground">{systemStatus.build}</span>
			</div>
		</div>
	</header>

	<main class="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10 sm:space-y-12">
		<!-- Pattern Overview -->
		<section>
			<div class="flex items-center gap-2 mb-4">
				<span
					class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-accent"
				>
					Overview
				</span>
				<div class="flex-1 h-px bg-border"></div>
			</div>

			<h2 class="text-lg sm:text-xl font-semibold text-foreground mb-4 sm:mb-6">
				Core Patterns
			</h2>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				{#each specPatterns as pattern}
					<div
						class="p-4 bg-card border border-border rounded-lg shadow-ink hover:border-accent/50 transition-colors"
					>
						<div class="flex items-start gap-3">
							<div
								class="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0"
							>
								<Hash class="w-4 h-4 text-muted-foreground" />
							</div>
							<div class="min-w-0">
								<h3 class="font-medium text-foreground text-sm">{pattern.name}</h3>
								<p class="text-xs text-muted-foreground mt-1">
									{pattern.description}
								</p>
								<code
									class="mt-2 inline-block px-2 py-0.5 bg-muted rounded text-xs font-mono text-accent"
								>
									{pattern.example}
								</code>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- Section 1: System Status Panel -->
		<section>
			<div class="flex items-center gap-2 mb-4">
				<span
					class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-accent"
				>
					Section 01
				</span>
				<div class="flex-1 h-px bg-border"></div>
			</div>

			<h2 class="text-lg sm:text-xl font-semibold text-foreground mb-4 sm:mb-6">
				System Status Display
			</h2>

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
				<!-- Status Card -->
				<div
					class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
				>
					<!-- Header -->
					<div
						class="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30"
					>
						<div class="flex items-center gap-2">
							<Cpu class="w-4 h-4 text-muted-foreground" />
							<span
								class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
							>
								SYS-STATUS
							</span>
						</div>
						<div class="flex items-center gap-1.5">
							<div class="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
							<span class="font-mono text-xs text-emerald-600 dark:text-emerald-400"
								>OPERATIONAL</span
							>
						</div>
					</div>

					<!-- Key-value data -->
					<div class="p-4 space-y-3">
						<div
							class="flex items-center justify-between py-1.5 border-b border-dashed border-border"
						>
							<span
								class="font-mono text-xs text-muted-foreground uppercase tracking-wider"
								>Version</span
							>
							<span class="font-mono text-sm text-foreground"
								>{systemStatus.version}</span
							>
						</div>
						<div
							class="flex items-center justify-between py-1.5 border-b border-dashed border-border"
						>
							<span
								class="font-mono text-xs text-muted-foreground uppercase tracking-wider"
								>Build</span
							>
							<div class="flex items-center gap-2">
								<span class="font-mono text-sm text-foreground"
									>{systemStatus.build}</span
								>
								<button
									onclick={() => copyToClipboard(systemStatus.build, 'build')}
									class="p-1 hover:bg-muted rounded transition-colors"
								>
									{#if copiedId === 'build'}
										<Check class="w-3 h-3 text-emerald-500" />
									{:else}
										<Copy class="w-3 h-3 text-muted-foreground" />
									{/if}
								</button>
							</div>
						</div>
						<div
							class="flex items-center justify-between py-1.5 border-b border-dashed border-border"
						>
							<span
								class="font-mono text-xs text-muted-foreground uppercase tracking-wider"
								>Uptime</span
							>
							<span class="font-mono text-sm text-foreground"
								>{systemStatus.uptime}</span
							>
						</div>
						<div class="flex items-center justify-between py-1.5">
							<span
								class="font-mono text-xs text-muted-foreground uppercase tracking-wider"
								>Last Deploy</span
							>
							<span class="font-mono text-sm text-foreground"
								>2026-01-28 14:32 UTC</span
							>
						</div>
					</div>
				</div>

				<!-- Metrics Card -->
				<div
					class="bg-card border border-border rounded-lg shadow-ink tx tx-grain tx-weak overflow-hidden"
				>
					<div
						class="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30"
					>
						<div class="flex items-center gap-2">
							<Activity class="w-4 h-4 text-muted-foreground" />
							<span
								class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
							>
								METRICS
							</span>
						</div>
						<span
							class="font-mono text-[0.55rem] sm:text-[0.6rem] text-muted-foreground"
							>Last 24h</span
						>
					</div>

					<div class="p-4 grid grid-cols-2 gap-4">
						<div class="space-y-1">
							<span
								class="font-mono text-[0.55rem] sm:text-[0.6rem] uppercase tracking-wider text-muted-foreground"
								>Requests</span
							>
							<p class="font-mono text-xl sm:text-2xl text-foreground">847K</p>
							<span class="font-mono text-xs text-emerald-600 dark:text-emerald-400"
								>+12.4%</span
							>
						</div>
						<div class="space-y-1">
							<span
								class="font-mono text-[0.55rem] sm:text-[0.6rem] uppercase tracking-wider text-muted-foreground"
								>Latency P99</span
							>
							<p class="font-mono text-xl sm:text-2xl text-foreground">142ms</p>
							<span class="font-mono text-xs text-amber-600 dark:text-amber-400"
								>+3.2%</span
							>
						</div>
						<div class="space-y-1">
							<span
								class="font-mono text-[0.55rem] sm:text-[0.6rem] uppercase tracking-wider text-muted-foreground"
								>Error Rate</span
							>
							<p class="font-mono text-xl sm:text-2xl text-foreground">0.02%</p>
							<span class="font-mono text-xs text-emerald-600 dark:text-emerald-400"
								>-0.01%</span
							>
						</div>
						<div class="space-y-1">
							<span
								class="font-mono text-[0.55rem] sm:text-[0.6rem] uppercase tracking-wider text-muted-foreground"
								>Active Users</span
							>
							<p class="font-mono text-xl sm:text-2xl text-foreground">1,247</p>
							<span class="font-mono text-xs text-emerald-600 dark:text-emerald-400"
								>+8.7%</span
							>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Section 2: Entity Reference Table -->
		<section>
			<div class="flex items-center gap-2 mb-4">
				<span
					class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-accent"
				>
					Section 02
				</span>
				<div class="flex-1 h-px bg-border"></div>
			</div>

			<h2 class="text-lg sm:text-xl font-semibold text-foreground mb-4 sm:mb-6">
				Entity Reference Index
			</h2>

			<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden">
				<!-- Table header - Hidden on mobile -->
				<div class="hidden sm:block px-4 py-3 bg-muted/50 border-b border-border">
					<div
						class="grid grid-cols-12 gap-4 font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
					>
						<div class="col-span-2">ID</div>
						<div class="col-span-1">Type</div>
						<div class="col-span-5">Name</div>
						<div class="col-span-2">Status</div>
						<div class="col-span-1 text-right">Refs</div>
						<div class="col-span-1"></div>
					</div>
				</div>

				<!-- Table rows -->
				<div class="divide-y divide-border">
					{#each entities as entity}
						<!-- Desktop row -->
						<div
							class="hidden sm:block px-4 py-3 hover:bg-muted/30 transition-colors group"
						>
							<div class="grid grid-cols-12 gap-4 items-center">
								<!-- ID with copy -->
								<div class="col-span-2 flex items-center gap-2">
									<span class="font-mono text-sm text-accent">{entity.id}</span>
									<button
										onclick={() => copyToClipboard(entity.id, entity.id)}
										class="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded transition-all"
									>
										{#if copiedId === entity.id}
											<Check class="w-3 h-3 text-emerald-500" />
										{:else}
											<Copy class="w-3 h-3 text-muted-foreground" />
										{/if}
									</button>
								</div>

								<!-- Type icon -->
								<div class="col-span-1">
									{#if entity.type === 'Project'}
										<Layers class="w-4 h-4 text-purple-500" />
									{:else if entity.type === 'Goal'}
										<Target class="w-4 h-4 text-amber-500" />
									{:else if entity.type === 'Task'}
										<ListChecks class="w-4 h-4 text-slate-500" />
									{:else if entity.type === 'Risk'}
										<AlertTriangle class="w-4 h-4 text-red-500" />
									{/if}
								</div>

								<!-- Name -->
								<div class="col-span-5">
									<span class="text-sm text-foreground">{entity.name}</span>
								</div>

								<!-- Status -->
								<div class="col-span-2">
									<span
										class="inline-flex items-center gap-1.5 font-mono text-xs"
									>
										{#if entity.status === 'active'}
											<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"
											></span>
											<span
												class="text-emerald-600 dark:text-emerald-400 uppercase"
												>Active</span
											>
										{:else if entity.status === 'in_progress'}
											<span class="w-1.5 h-1.5 rounded-full bg-blue-500"
											></span>
											<span class="text-blue-600 dark:text-blue-400 uppercase"
												>In Progress</span
											>
										{:else if entity.status === 'completed'}
											<span class="w-1.5 h-1.5 rounded-full bg-slate-400"
											></span>
											<span class="text-muted-foreground uppercase"
												>Completed</span
											>
										{:else if entity.status === 'monitoring'}
											<span
												class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"
											></span>
											<span
												class="text-amber-600 dark:text-amber-400 uppercase"
												>Monitoring</span
											>
										{/if}
									</span>
								</div>

								<!-- Refs count -->
								<div class="col-span-1 text-right">
									<span class="font-mono text-sm text-muted-foreground"
										>{entity.refs}</span
									>
								</div>

								<!-- Action -->
								<div class="col-span-1 text-right">
									<button class="p-1.5 hover:bg-muted rounded transition-colors">
										<ChevronRight class="w-4 h-4 text-muted-foreground" />
									</button>
								</div>
							</div>
						</div>

						<!-- Mobile row -->
						<div class="sm:hidden px-4 py-3 hover:bg-muted/30 transition-colors">
							<div class="flex items-start justify-between gap-3">
								<div class="flex items-center gap-2">
									{#if entity.type === 'Project'}
										<Layers class="w-4 h-4 text-purple-500 shrink-0" />
									{:else if entity.type === 'Goal'}
										<Target class="w-4 h-4 text-amber-500 shrink-0" />
									{:else if entity.type === 'Task'}
										<ListChecks class="w-4 h-4 text-slate-500 shrink-0" />
									{:else if entity.type === 'Risk'}
										<AlertTriangle class="w-4 h-4 text-red-500 shrink-0" />
									{/if}
									<div>
										<span class="font-mono text-xs text-accent block"
											>{entity.id}</span
										>
										<span class="text-sm text-foreground">{entity.name}</span>
									</div>
								</div>
								<div class="flex items-center gap-1.5 font-mono text-xs shrink-0">
									{#if entity.status === 'active'}
										<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"
										></span>
									{:else if entity.status === 'in_progress'}
										<span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
									{:else if entity.status === 'completed'}
										<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
									{:else if entity.status === 'monitoring'}
										<span
											class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"
										></span>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>

				<!-- Table footer -->
				<div
					class="px-4 py-2 bg-muted/30 border-t border-border flex items-center justify-between"
				>
					<span
						class="font-mono text-[0.55rem] sm:text-[0.6rem] text-muted-foreground uppercase tracking-wider"
					>
						{entities.length} entities indexed
					</span>
					<button
						class="font-mono text-xs text-accent hover:underline flex items-center gap-1"
					>
						View all <ExternalLink class="w-3 h-3" />
					</button>
				</div>
			</div>
		</section>

		<!-- Section 3: Dependency Graph -->
		<section>
			<div class="flex items-center gap-2 mb-4">
				<span
					class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-accent"
				>
					Section 03
				</span>
				<div class="flex-1 h-px bg-border"></div>
			</div>

			<h2 class="text-lg sm:text-xl font-semibold text-foreground mb-4 sm:mb-6">
				Dependency Mapping
			</h2>

			<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
				<!-- Dependency list -->
				<div
					class="lg:col-span-2 bg-card border border-border rounded-lg shadow-ink tx tx-thread tx-weak overflow-hidden"
				>
					<div class="px-4 py-3 border-b border-border bg-muted/30">
						<div class="flex items-center gap-2">
							<GitBranch class="w-4 h-4 text-muted-foreground" />
							<span
								class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
							>
								DEPENDENCY GRAPH
							</span>
						</div>
					</div>

					<div class="p-4 space-y-3">
						{#each dependencies as dep}
							<div
								class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 bg-muted/30 rounded-lg border border-border/50"
							>
								<!-- From -->
								<div class="flex-1">
									<span
										class="font-mono text-xs text-muted-foreground block mb-0.5"
										>Source</span
									>
									<span class="font-mono text-sm text-accent">{dep.from}</span>
								</div>

								<!-- Arrow with type -->
								<div class="flex items-center gap-2 sm:flex-col sm:gap-1 sm:px-4">
									<span
										class="font-mono text-[0.55rem] sm:text-[0.6rem] uppercase tracking-wider text-muted-foreground"
									>
										{dep.type}
									</span>
									<div class="flex items-center gap-1 text-muted-foreground">
										<div class="w-6 sm:w-8 h-px bg-current"></div>
										<ChevronRight class="w-3 h-3" />
									</div>
								</div>

								<!-- To -->
								<div class="flex-1 sm:text-right">
									<span
										class="font-mono text-xs text-muted-foreground block mb-0.5"
										>Target</span
									>
									<span class="font-mono text-sm text-accent">{dep.to}</span>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Legend -->
				<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden">
					<div class="px-4 py-3 border-b border-border bg-muted/30">
						<span
							class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
						>
							RELATIONSHIP TYPES
						</span>
					</div>

					<div class="p-4 space-y-3">
						<div class="flex items-center gap-3">
							<div
								class="w-3 h-3 rounded bg-red-500/20 border border-red-500 shrink-0"
							></div>
							<div>
								<span class="font-mono text-xs text-foreground block">blocks</span>
								<span class="text-[0.6rem] sm:text-[0.65rem] text-muted-foreground"
									>Prevents progress</span
								>
							</div>
						</div>
						<div class="flex items-center gap-3">
							<div
								class="w-3 h-3 rounded bg-blue-500/20 border border-blue-500 shrink-0"
							></div>
							<div>
								<span class="font-mono text-xs text-foreground block"
									>belongs_to</span
								>
								<span class="text-[0.6rem] sm:text-[0.65rem] text-muted-foreground"
									>Parent relationship</span
								>
							</div>
						</div>
						<div class="flex items-center gap-3">
							<div
								class="w-3 h-3 rounded bg-amber-500/20 border border-amber-500 shrink-0"
							></div>
							<div>
								<span class="font-mono text-xs text-foreground block"
									>threatens</span
								>
								<span class="text-[0.6rem] sm:text-[0.65rem] text-muted-foreground"
									>Risk association</span
								>
							</div>
						</div>
						<div class="flex items-center gap-3">
							<div
								class="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500 shrink-0"
							></div>
							<div>
								<span class="font-mono text-xs text-foreground block">enables</span>
								<span class="text-[0.6rem] sm:text-[0.65rem] text-muted-foreground"
									>Unlocks capability</span
								>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Section 4: Changelog / Version History -->
		<section>
			<div class="flex items-center gap-2 mb-4">
				<span
					class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-accent"
				>
					Section 04
				</span>
				<div class="flex-1 h-px bg-border"></div>
			</div>

			<h2 class="text-lg sm:text-xl font-semibold text-foreground mb-4 sm:mb-6">
				Version History
			</h2>

			<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden">
				<div class="divide-y divide-border">
					{#each changelog as release, i}
						<div
							class="px-4 py-4 flex items-start gap-3 sm:gap-4 hover:bg-muted/30 transition-colors"
						>
							<!-- Timeline indicator -->
							<div class="flex flex-col items-center shrink-0">
								<div
									class="w-3 h-3 rounded-full border-2 {i === 0
										? 'bg-accent border-accent'
										: 'bg-background border-border'}"
								></div>
								{#if i < changelog.length - 1}
									<div class="w-px h-full min-h-[40px] bg-border mt-1"></div>
								{/if}
							</div>

							<!-- Content -->
							<div class="flex-1 min-w-0">
								<div class="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
									<span class="font-mono text-sm font-medium text-foreground">
										v{release.version}
									</span>
									<span
										class="px-1.5 py-0.5 rounded text-[0.55rem] sm:text-[0.6rem] font-mono uppercase {release.type ===
										'minor'
											? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
											: 'bg-muted text-muted-foreground'}"
									>
										{release.type}
									</span>
									{#if i === 0}
										<span
											class="px-1.5 py-0.5 rounded bg-emerald-500/10 text-[0.55rem] sm:text-[0.6rem] font-mono uppercase text-emerald-600 dark:text-emerald-400"
										>
											Latest
										</span>
									{/if}
								</div>
								<div
									class="flex flex-wrap items-center gap-2 sm:gap-4 text-muted-foreground"
								>
									<span class="font-mono text-xs">{release.date}</span>
									<span class="text-xs">{release.changes} changes</span>
								</div>
							</div>

							<!-- View link -->
							<button
								class="font-mono text-xs text-accent hover:underline flex items-center gap-1 shrink-0"
							>
								<span class="hidden sm:inline">View</span>
								<ChevronRight class="w-3 h-3" />
							</button>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<!-- Section 5: Technical Callouts -->
		<section>
			<div class="flex items-center gap-2 mb-4">
				<span
					class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-accent"
				>
					Section 05
				</span>
				<div class="flex-1 h-px bg-border"></div>
			</div>

			<h2 class="text-lg sm:text-xl font-semibold text-foreground mb-4 sm:mb-6">
				Annotation Patterns
			</h2>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
				<!-- Info callout -->
				<div class="relative pl-4 border-l-2 border-blue-500">
					<div
						class="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center"
					>
						<Info class="w-2.5 h-2.5 text-white" />
					</div>
					<div class="pl-4">
						<span
							class="font-mono text-[0.55rem] sm:text-[0.6rem] uppercase tracking-wider text-blue-600 dark:text-blue-400"
						>
							Note
						</span>
						<p class="text-sm text-foreground mt-1">
							Tech spec callouts use left-border annotations with semantic coloring to
							indicate information type.
						</p>
						<span
							class="font-mono text-[0.55rem] sm:text-[0.6rem] text-muted-foreground mt-2 block"
						>
							Ref: DS-ANNOT-001
						</span>
					</div>
				</div>

				<!-- Warning callout -->
				<div class="relative pl-4 border-l-2 border-amber-500">
					<div
						class="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center"
					>
						<AlertTriangle class="w-2.5 h-2.5 text-white" />
					</div>
					<div class="pl-4">
						<span
							class="font-mono text-[0.55rem] sm:text-[0.6rem] uppercase tracking-wider text-amber-600 dark:text-amber-400"
						>
							Warning
						</span>
						<p class="text-sm text-foreground mt-1">
							Amber callouts indicate caution areas or deprecated patterns that
							require attention.
						</p>
						<span
							class="font-mono text-[0.55rem] sm:text-[0.6rem] text-muted-foreground mt-2 block"
						>
							Ref: DS-ANNOT-002
						</span>
					</div>
				</div>

				<!-- Tip callout -->
				<div class="relative pl-4 border-l-2 border-emerald-500">
					<div
						class="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center"
					>
						<Zap class="w-2.5 h-2.5 text-white" />
					</div>
					<div class="pl-4">
						<span
							class="font-mono text-[0.55rem] sm:text-[0.6rem] uppercase tracking-wider text-emerald-600 dark:text-emerald-400"
						>
							Tip
						</span>
						<p class="text-sm text-foreground mt-1">
							Green callouts highlight best practices and recommended patterns for
							optimal results.
						</p>
						<span
							class="font-mono text-[0.55rem] sm:text-[0.6rem] text-muted-foreground mt-2 block"
						>
							Ref: DS-ANNOT-003
						</span>
					</div>
				</div>

				<!-- Technical callout -->
				<div class="relative pl-4 border-l-2 border-purple-500">
					<div
						class="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center"
					>
						<Database class="w-2.5 h-2.5 text-white" />
					</div>
					<div class="pl-4">
						<span
							class="font-mono text-[0.55rem] sm:text-[0.6rem] uppercase tracking-wider text-purple-600 dark:text-purple-400"
						>
							Technical
						</span>
						<p class="text-sm text-foreground mt-1">
							Purple callouts contain implementation details, code references, or
							system specifications.
						</p>
						<span
							class="font-mono text-[0.55rem] sm:text-[0.6rem] text-muted-foreground mt-2 block"
						>
							Ref: DS-ANNOT-004
						</span>
					</div>
				</div>
			</div>
		</section>

		<!-- Section 6: Code Block Pattern -->
		<section>
			<div class="flex items-center gap-2 mb-4">
				<span
					class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-accent"
				>
					Section 06
				</span>
				<div class="flex-1 h-px bg-border"></div>
			</div>

			<h2 class="text-lg sm:text-xl font-semibold text-foreground mb-4 sm:mb-6">
				Code Reference Block
			</h2>

			<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden">
				<!-- Code header -->
				<div
					class="px-4 py-2 bg-muted/50 border-b border-border flex items-center justify-between"
				>
					<div class="flex items-center gap-2 sm:gap-3 min-w-0">
						<FileText class="w-4 h-4 text-muted-foreground shrink-0" />
						<span class="font-mono text-xs text-foreground truncate">inkprint.css</span>
						<span
							class="font-mono text-[0.55rem] sm:text-[0.6rem] text-muted-foreground shrink-0"
							>:42-58</span
						>
					</div>
					<button
						onclick={() => copyToClipboard('/* code */', 'code')}
						class="p-1.5 hover:bg-muted rounded transition-colors flex items-center gap-1.5 shrink-0"
					>
						{#if copiedId === 'code'}
							<Check class="w-3 h-3 text-emerald-500" />
							<span class="font-mono text-xs text-emerald-500 hidden sm:inline"
								>Copied</span
							>
						{:else}
							<Copy class="w-3 h-3 text-muted-foreground" />
							<span class="font-mono text-xs text-muted-foreground hidden sm:inline"
								>Copy</span
							>
						{/if}
					</button>
				</div>

				<!-- Code content -->
				<div class="p-4 font-mono text-xs sm:text-sm overflow-x-auto">
					<pre class="text-foreground"><span class="text-muted-foreground select-none"
							>42  </span><span class="text-purple-500">.spec-label</span> {'{'}<br
						/><span class="text-muted-foreground select-none">43  </span>  <span
							class="text-blue-500">font-family</span
						>: <span class="text-amber-600 dark:text-amber-400">'IBM Plex Mono'</span
						>, monospace;<br /><span class="text-muted-foreground select-none"
							>44  </span>  <span class="text-blue-500">font-size</span>: <span
							class="text-emerald-600 dark:text-emerald-400">0.6rem</span
						>;<br /><span class="text-muted-foreground select-none">45  </span>  <span
							class="text-blue-500">letter-spacing</span
						>: <span class="text-emerald-600 dark:text-emerald-400">0.12em</span>;<br
						/><span class="text-muted-foreground select-none">46  </span>  <span
							class="text-blue-500">text-transform</span
						>: uppercase;<br /><span class="text-muted-foreground select-none"
							>47  </span>  <span class="text-blue-500">color</span>: <span
							class="text-blue-500">var</span
						>(<span class="text-amber-600 dark:text-amber-400">--muted-foreground</span
						>);<br /><span class="text-muted-foreground select-none"
							>48  </span>{'}'}</pre>
				</div>
			</div>
		</section>

		<!-- Section 7: Terminal Output Pattern -->
		<section>
			<div class="flex items-center gap-2 mb-4">
				<span
					class="font-mono text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.15em] text-accent"
				>
					Section 07
				</span>
				<div class="flex-1 h-px bg-border"></div>
			</div>

			<h2 class="text-lg sm:text-xl font-semibold text-foreground mb-4 sm:mb-6">
				Terminal Output
			</h2>

			<div
				class="bg-slate-900 dark:bg-slate-950 border border-slate-700 rounded-lg shadow-ink overflow-hidden"
			>
				<!-- Terminal header -->
				<div
					class="px-4 py-2 bg-slate-800 dark:bg-slate-900 border-b border-slate-700 flex items-center gap-3"
				>
					<div class="flex items-center gap-1.5">
						<div class="w-3 h-3 rounded-full bg-red-500"></div>
						<div class="w-3 h-3 rounded-full bg-amber-500"></div>
						<div class="w-3 h-3 rounded-full bg-emerald-500"></div>
					</div>
					<div class="flex items-center gap-2">
						<Terminal class="w-4 h-4 text-slate-400" />
						<span class="font-mono text-xs text-slate-400">buildos-platform</span>
					</div>
				</div>

				<!-- Terminal content -->
				<div class="p-4 font-mono text-xs sm:text-sm overflow-x-auto">
					<div class="space-y-1 text-slate-300">
						<p><span class="text-emerald-400">$</span> pnpm run build</p>
						<p class="text-slate-500">
							<span class="text-slate-400">info</span> - Loaded env from .env.local
						</p>
						<p class="text-slate-500">
							<span class="text-blue-400">vite</span> - Building for production...
						</p>
						<p class="text-emerald-400">
							<span class="text-emerald-500">✓</span> 847 modules transformed.
						</p>
						<p class="text-slate-500">
							<span class="text-slate-400">dist/</span>
							<span class="text-cyan-400">_app/immutable/</span>
						</p>
						<p class="text-emerald-400">
							<span class="text-emerald-500">✓</span> built in 14.23s
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Footer -->
		<footer class="pt-6 sm:pt-8 border-t border-border">
			<div
				class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-muted-foreground"
			>
				<div class="flex items-center gap-2 sm:gap-4">
					<span
						class="font-mono text-[0.55rem] sm:text-[0.6rem] uppercase tracking-wider"
					>
						DOC-DS-001 • Tech Spec Aesthetic
					</span>
				</div>
				<div class="flex items-center gap-2 sm:gap-4">
					<span class="font-mono text-[0.55rem] sm:text-[0.6rem]">Page 1 of 1</span>
					<span class="font-mono text-[0.55rem] sm:text-[0.6rem]"
						>Generated 2026-02-01</span
					>
				</div>
			</div>
		</footer>
	</main>
</div>
