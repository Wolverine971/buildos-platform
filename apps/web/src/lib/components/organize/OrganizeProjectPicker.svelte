<!-- apps/web/src/lib/components/organize/OrganizeProjectPicker.svelte -->
<script lang="ts">
	import {
		fetchProjectSelectionSummaries,
		type ProjectSelectionSummary
	} from '$lib/components/chat/project-selector-browser';
	let {
		excludeId,
		disabled = false,
		inline = false,
		onopen,
		onchoose
	}: {
		excludeId: string;
		disabled?: boolean;
		/** Expand in the flow (inside a sheet) instead of floating over the page. */
		inline?: boolean;
		onopen?: () => void;
		onchoose: (id: string) => void;
	} = $props();
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
	// Typing goes straight into search. Touch skips it so the keyboard doesn't cover the list.
	function focusSearch(input: HTMLInputElement) {
		if (window.matchMedia?.('(pointer: fine)').matches) input.focus();
	}
</script>

<div class="relative {inline ? 'w-full' : 'w-full sm:w-auto'}">
	<button
		type="button"
		class="min-h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 {inline
			? 'w-full'
			: 'w-full sm:w-auto'}"
		{disabled}
		aria-expanded={open}
		title={disabled ? 'Discard pending moves before switching projects.' : undefined}
		onclick={() => {
			open = !open;
			if (open) onopen?.();
		}}>Choose another project…</button
	>
	{#if open && !disabled}
		<!-- Phones and sheets expand in the flow: a floating panel overflowed the
		     viewport edge when the header wrapped and was clipped inside the sheet. -->
		<div
			class="mt-2 w-full rounded-lg border border-border bg-card p-3 shadow-ink-strong {inline
				? ''
				: 'sm:absolute sm:right-0 sm:z-20 sm:mt-1 sm:w-80'}"
		>
			<label class="text-xs font-medium" for="organize-project-search">Find a project</label>
			<input
				id="organize-project-search"
				type="search"
				bind:value={search}
				{@attach focusSearch}
				class="mt-1 min-h-11 w-full rounded-md border border-border bg-background p-2 text-base sm:text-sm"
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
