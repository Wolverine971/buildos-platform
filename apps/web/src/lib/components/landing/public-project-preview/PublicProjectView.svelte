<!-- apps/web/src/lib/components/landing/public-project-preview/PublicProjectView.svelte -->
<!--
	Public Project Preview — Landing-page embed.

	Renders a real BuildOS project (one of ~6 hand-curated public ontology
	projects) in a read-only mirror of the v2 project page:

		Header card → Pulse strip (Recent / Up next) → Entity tab strip
		→ Task kanban → Documents tree

	The toolbar exposes a Desktop / Mobile toggle so visitors can preview the
	same project at both viewports. Mobile renders inside a centered phone
	frame (~390px wide) with the mobile-mode children layouts.

	Data sources:
	- GET /api/public/projects                          (list of public projects)
	- GET /api/public/projects/[id]/graph?viewMode=full (full payload for one)

	No authentication required. No edit affordances.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { ChevronDown, GitBranch, LoaderCircle, Monitor, Smartphone } from 'lucide-svelte';
	import PublicProjectHeader from './PublicProjectHeader.svelte';
	import PublicProjectStatsRow from './PublicProjectStatsRow.svelte';
	import PublicPulseStrip from './PublicPulseStrip.svelte';
	import PublicEntityTabStrip from './PublicEntityTabStrip.svelte';
	import PublicTaskBoard from './PublicTaskBoard.svelte';
	import PublicDocsTree from './PublicDocsTree.svelte';
	import {
		DEFAULT_PUBLIC_PROJECT_ID,
		type PublicProjectFullData,
		type PublicProjectSummary,
		type ViewportMode
	} from './lib/public-project-types';

	let {
		initialProjectId,
		embedded = false
	}: {
		initialProjectId?: string;
		/**
		 * When true, strips the outer landing-section chrome (dashed wrapper,
		 * "Read-only example" corner stamp, big H2 heading + lede paragraph)
		 * so the preview fits inside a host that already provides framing
		 * — e.g. the modal on landing-v2.
		 */
		embedded?: boolean;
	} = $props();

	const seededProjectId = untrack(() => initialProjectId ?? null);
	let availableProjects = $state<PublicProjectSummary[]>([]);
	let currentProjectId = $state<string | null>(seededProjectId);
	let fullData = $state<PublicProjectFullData | null>(null);

	let isLoadingList = $state(true);
	let isLoadingProject = $state(false);
	let listError = $state<string | null>(null);
	let projectError = $state<string | null>(null);

	let viewport = $state<ViewportMode>('desktop');

	onMount(async () => {
		await loadProjectList();
	});

	async function loadProjectList() {
		isLoadingList = true;
		listError = null;
		try {
			const response = await fetch('/api/public/projects');
			const payload = await response.json();
			if (!response.ok || !payload.success) {
				throw new Error(payload?.error || 'Failed to fetch public projects');
			}
			availableProjects = payload.data?.projects ?? [];

			if (!currentProjectId && availableProjects.length > 0) {
				const preferred =
					availableProjects.find((p) => p.id === DEFAULT_PUBLIC_PROJECT_ID) ??
					availableProjects[0];
				currentProjectId = preferred?.id ?? null;
			}

			if (currentProjectId) {
				await loadProjectData(currentProjectId);
			} else {
				listError = 'No example projects available right now.';
			}
		} catch (err) {
			console.error('[PublicProjectView] Failed to load projects:', err);
			listError = err instanceof Error ? err.message : 'Failed to load example projects';
		} finally {
			isLoadingList = false;
		}
	}

	async function loadProjectData(projectId: string) {
		isLoadingProject = true;
		projectError = null;
		try {
			const response = await fetch(`/api/public/projects/${projectId}/graph?viewMode=full`);
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(
					payload?.error || payload?.message || 'Failed to load example project'
				);
			}
			fullData = {
				source: payload.data?.source,
				stats: payload.data?.stats,
				project: payload.data?.project
			};
		} catch (err) {
			console.error('[PublicProjectView] Failed to load project graph:', err);
			projectError = err instanceof Error ? err.message : 'Failed to load example project';
			fullData = null;
		} finally {
			isLoadingProject = false;
		}
	}

	function handleSelectChange(event: Event) {
		const target = event.currentTarget as HTMLSelectElement;
		const next = target.value;
		if (next && next !== currentProjectId) {
			currentProjectId = next;
			loadProjectData(next);
		}
	}
</script>

{#snippet toolbar()}
	<div class="flex items-center gap-2 flex-wrap">
		<!-- Desktop / Mobile toggle -->
		<div
			role="tablist"
			aria-label="Viewport"
			class="inline-flex rounded-lg border border-border bg-card shadow-ink p-0.5 h-9"
		>
			<button
				role="tab"
				type="button"
				aria-selected={viewport === 'desktop'}
				onclick={() => (viewport = 'desktop')}
				class="inline-flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-md transition-colors {viewport ===
				'desktop'
					? 'bg-accent text-accent-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
				title="Desktop preview"
			>
				<Monitor class="w-3.5 h-3.5" />
				<span class="hidden xs:inline">Desktop</span>
			</button>
			<button
				role="tab"
				type="button"
				aria-selected={viewport === 'mobile'}
				onclick={() => (viewport = 'mobile')}
				class="inline-flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-md transition-colors {viewport ===
				'mobile'
					? 'bg-accent text-accent-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
				title="Mobile preview"
			>
				<Smartphone class="w-3.5 h-3.5" />
				<span class="hidden xs:inline">Mobile</span>
			</button>
		</div>

		<label class="relative shrink-0 flex-1 sm:flex-none min-w-0">
			<span class="sr-only">Choose an example project</span>
			<select
				class="appearance-none pressable w-full h-9 pl-3 pr-9 text-sm font-medium rounded-lg border border-border bg-card text-foreground shadow-ink hover:border-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
				value={currentProjectId ?? ''}
				onchange={handleSelectChange}
				disabled={isLoadingList || availableProjects.length === 0}
			>
				{#if availableProjects.length === 0}
					<option value="">Loading examples…</option>
				{:else}
					{#each availableProjects as project (project.id)}
						<option value={project.id}>{project.name}</option>
					{/each}
				{/if}
			</select>
			<ChevronDown
				class="w-4 h-4 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
			/>
		</label>
	</div>
{/snippet}

{#snippet body()}
	{#if listError}
		<div
			class="rounded-lg border border-border bg-card shadow-ink tx tx-static tx-weak p-6 text-center"
		>
			<p class="text-sm text-muted-foreground">{listError}</p>
			<button
				type="button"
				onclick={loadProjectList}
				class="mt-3 px-4 py-2 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition shadow-ink pressable"
			>
				Try again
			</button>
		</div>
	{:else if isLoadingList && !fullData}
		<div
			class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak p-12 flex items-center justify-center"
		>
			<div class="flex items-center gap-2 text-sm text-muted-foreground">
				<LoaderCircle class="w-5 h-5 animate-spin" />
				<span>Loading example project…</span>
			</div>
		</div>
	{:else if projectError}
		<div
			class="rounded-lg border border-border bg-card shadow-ink tx tx-static tx-weak p-6 text-center space-y-3"
		>
			<p class="text-sm text-muted-foreground">{projectError}</p>
			<button
				type="button"
				onclick={() =>
					currentProjectId ? loadProjectData(currentProjectId) : loadProjectList()}
				class="px-4 py-2 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition shadow-ink pressable"
			>
				Try again
			</button>
		</div>
	{:else if fullData}
		{#if viewport === 'mobile'}
			<div class="flex justify-center">
				<div
					class="relative w-[390px] max-w-full rounded-[2rem] border-[8px] border-foreground/80 dark:border-foreground/60 bg-background shadow-ink-strong overflow-hidden"
					aria-label="Mobile preview"
				>
					<!-- Phone notch -->
					<div
						class="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 rounded-b-2xl bg-foreground/80 dark:bg-foreground/60 z-10"
						aria-hidden="true"
					></div>
					<div
						class="bg-background h-[640px] overflow-y-auto px-2.5 pt-7 pb-4 space-y-2.5"
					>
						<PublicProjectHeader project={fullData.project} viewport="mobile" />
						<PublicProjectStatsRow stats={fullData.stats} />
						<PublicPulseStrip source={fullData.source} viewport="mobile" />
						<PublicEntityTabStrip source={fullData.source} viewport="mobile" />
						<PublicTaskBoard tasks={fullData.source.tasks ?? []} viewport="mobile" />
						<PublicDocsTree
							documents={fullData.source.documents ?? []}
							docStructure={fullData.project.doc_structure ?? null}
						/>
					</div>
				</div>
			</div>
		{:else}
			<div class="space-y-3 sm:space-y-4">
				<PublicProjectHeader project={fullData.project} viewport="desktop" />
				<PublicProjectStatsRow stats={fullData.stats} />
				<PublicPulseStrip source={fullData.source} viewport="desktop" />
				<PublicEntityTabStrip source={fullData.source} viewport="desktop" />
				<PublicTaskBoard tasks={fullData.source.tasks ?? []} viewport="desktop" />
				<PublicDocsTree
					documents={fullData.source.documents ?? []}
					docStructure={fullData.project.doc_structure ?? null}
				/>
			</div>
		{/if}
	{/if}
{/snippet}

{#if embedded}
	<!-- Embedded mode: host provides framing (e.g. the landing-v2 modal title).
		 Render a compact toolbar + body, no dashed wrapper, no big H2. -->
	<div class="px-3 sm:px-5 py-3 sm:py-4 space-y-3 sm:space-y-4">
		<div class="flex items-center justify-end gap-2">
			{@render toolbar()}
		</div>
		{@render body()}
	</div>
{:else}
	<section id="example" class="border-b border-border bg-background">
		<div class="mx-auto max-w-6xl px-4 py-10 sm:py-14">
			<div
				class="relative rounded-2xl border-2 border-dashed border-border bg-muted/30 dark:bg-muted/20 shadow-ink-strong tx tx-grain tx-weak p-4 sm:p-6 lg:p-8 space-y-5"
			>
				<!-- corner stamp -->
				<div
					class="absolute -top-3 right-4 sm:right-6 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border-2 border-dashed border-border bg-background shadow-ink"
				>
					<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
					<span
						class="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground font-semibold"
					>
						Read-only example
					</span>
				</div>

				<div class="space-y-3">
					<div class="flex items-center gap-2">
						<div
							class="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center border border-accent/20"
						>
							<GitBranch class="w-4 h-4 text-accent" />
						</div>
						<span
							class="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
						>
							Example project
						</span>
					</div>

					<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
						<div class="space-y-2">
							<h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">
								See what a real BuildOS project looks like.
							</h2>
							<p class="text-sm text-muted-foreground max-w-2xl">
								Header, pulse, kanban, docs, graph — the same view a logged-in user
								gets, rendered from a real public project. Switch between examples
								or preview what it looks like on mobile.
							</p>
						</div>

						{@render toolbar()}
					</div>
				</div>

				{@render body()}
			</div>
		</div>
	</section>
{/if}
