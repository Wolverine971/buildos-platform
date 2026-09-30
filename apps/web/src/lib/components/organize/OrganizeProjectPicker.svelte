<!-- apps/web/src/lib/components/organize/OrganizeProjectPicker.svelte -->
<script lang="ts">
	import {
		fetchProjectSelectionSummaries,
		type ProjectSelectionSummary
	} from '$lib/components/chat/project-selector-browser';
	let {
		excludeId,
		disabled = false,
		onchoose
	}: { excludeId: string; disabled?: boolean; onchoose: (id: string) => void } = $props();
	let search = $state('');
	let results = $state<ProjectSelectionSummary[]>([]);
	let loading = $state(false);
	let message = $state('');
	let open = $state(false);
	// Network synchronization: cancel obsolete searches without resetting the input.
	$effect(() => {
		if (!open) return;
		const term = search.trim();
		const controller = new AbortController();
		let stale = false;
		const timer = setTimeout(
			async () => {
				loading = true;
				message = '';
				try {
					const rows = await fetchProjectSelectionSummaries({
						search: term,
						limit: 50,
						signal: controller.signal
					});
					if (!stale) results = rows;
				} catch {
					if (!stale) message = 'Could not load projects. Try searching again.';
				} finally {
					if (!stale) loading = false;
				}
			},
			term ? 180 : 0
		);
		return () => {
			stale = true;
			clearTimeout(timer);
			controller.abort();
		};
	});
</script>

<div class="relative">
	<button
		type="button"
		class="min-h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
		{disabled}
		aria-expanded={open}
		title={disabled ? 'Discard pending moves before switching projects.' : undefined}
		onclick={() => (open = !open)}>Choose another project…</button
	>
	{#if open && !disabled}
		<div
			class="absolute right-0 z-20 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-3 shadow-ink-strong"
		>
			<label class="text-xs font-medium" for="organize-project-search">Find a project</label>
			<input
				id="organize-project-search"
				type="search"
				bind:value={search}
				class="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
			/>
			<p class="py-2 text-xs text-muted-foreground" role="status">
				{loading ? 'Searching…' : message}
			</p>
			<ul class="max-h-64 overflow-y-auto">
				{#each results.filter((item) => item.id !== excludeId && item.stateKey !== 'archived') as project (project.id)}
					<li>
						<button
							type="button"
							class="min-h-11 w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
							onclick={() => {
								open = false;
								onchoose(project.id);
							}}>{project.name}</button
						>
					</li>
				{/each}
			</ul>
			{#if !loading && !message && results.length === 0}<p
					class="py-2 text-sm text-muted-foreground"
				>
					No projects found.
				</p>{/if}
			<button
				type="button"
				class="mt-2 min-h-11 w-full rounded-md border border-border text-sm"
				onclick={() => (open = false)}>Close</button
			>
		</div>
	{/if}
</div>
