<!-- apps/web/src/lib/components/builder-profile/editor/SettingsPanel.svelte -->
<!-- Your page > Settings: the page's address (your @handle) and which parts show.
     Each switch saves at once. -->
<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import PanelHead from './PanelHead.svelte';
	import ToggleRow from './ToggleRow.svelte';
	import { callApi } from './editor-api';
	import type { BuilderPageEditorState, ToggleSetting } from './builder-editor-state.svelte';

	let { editor }: { editor: BuilderPageEditorState } = $props();

	let handleDraft = $state(untrack(() => editor.handle ?? ''));
	let handleBusy = $state(false);
	let handleError = $state<string | null>(null);
	let handleSaved = $state(false);

	const cleanHandle = $derived(handleDraft.trim().replace(/^@+/, '').toLowerCase());
	const handleChanged = $derived(cleanHandle !== (editor.handle ?? ''));
	const live = $derived(editor.status === 'published');

	async function saveHandle(event: SubmitEvent) {
		event.preventDefault();
		if (!cleanHandle || !handleChanged || handleBusy) return;
		handleBusy = true;
		handleError = null;
		handleSaved = false;
		const result = await callApi<{ username: string }>(
			'/api/profile/me/username',
			'PATCH',
			{ username: cleanHandle },
			'Could not change your address. Try again.'
		);
		handleBusy = false;
		if (!result.ok) {
			handleError = result.error;
			return;
		}
		handleDraft = result.data?.username ?? cleanHandle;
		handleSaved = true;
		await editor.refreshIdentity();
	}

	const shows: { key: ToggleSetting; label: string; hint: string }[] = [
		{
			key: 'show_build_log',
			label: 'Build log',
			hint: 'Days you worked, as a grid. Numbers only.'
		},
		{
			key: 'build_log_includes_private',
			label: 'Count private work',
			hint: 'Adds projects not on your page to the grid, without naming them.'
		},
		{
			key: 'show_agent_split',
			label: 'Show agents in a second color',
			hint: 'Work your agents did, in orange.'
		},
		{ key: 'show_writing', label: 'Writing', hint: 'Pages you published from your projects.' },
		{
			key: 'show_builds_with',
			label: 'Builds with',
			hint: 'People you share projects with who have a page.'
		}
	];
</script>

{#snippet toggle(row: { key: ToggleSetting; label: string; hint: string })}
	<ToggleRow
		id="page-toggle-{row.key}"
		label={row.label}
		hint={row.hint}
		checked={editor.settings[row.key]}
		disabled={row.key === 'build_log_includes_private' && !editor.settings.show_build_log}
		busy={!!editor.toggleBusy[row.key]}
		error={editor.toggleError?.key === row.key ? editor.toggleError.message : null}
		onchange={(next) => editor.setToggle(row.key, next)}
	/>
{/snippet}

<PanelHead title="Settings" hint="Your page's address, and what it shows." />

<div class="space-y-7">
	<section aria-labelledby="settings-address">
		<h3 id="settings-address" class="micro-label mb-2.5">Address</h3>
		<form class="flex flex-wrap gap-2" onsubmit={saveHandle}>
			<label for="page-handle" class="sr-only">Your handle</label>
			<div
				class="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-border-strong bg-background focus-within:border-accent focus-within:ring-1 focus-within:ring-accent"
			>
				<span
					class="inline-flex items-center border-r border-border bg-muted/50 px-2.5 font-mono text-xs text-muted-foreground"
					>build-os.com/@</span
				>
				<input
					id="page-handle"
					bind:value={handleDraft}
					maxlength="30"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					aria-describedby="page-handle-hint"
					oninput={() => (handleSaved = false)}
					class="min-h-11 min-w-0 flex-1 bg-transparent px-2.5 font-mono text-base text-foreground focus:outline-none sm:text-sm"
				/>
			</div>
			<Button
				type="submit"
				variant="outline"
				size="sm"
				loading={handleBusy}
				disabled={!handleChanged || !cleanHandle || handleBusy}>Save</Button
			>
		</form>
		<p
			id="page-handle-hint"
			class="mt-1.5 text-xs {handleError ? 'text-destructive' : 'text-muted-foreground'}"
			role={handleError ? 'alert' : undefined}
		>
			{#if handleError}
				{handleError}
			{:else if handleSaved}
				Saved. Your page now lives at build-os.com/@{editor.handle}.
			{:else if live && handleChanged}
				Links you've already shared will stop working.
			{:else}
				Also how people find you in BuildOS.
			{/if}
		</p>
	</section>

	<section aria-labelledby="settings-shows">
		<h3 id="settings-shows" class="micro-label mb-1">What your page shows</h3>
		<div class="divide-y divide-border">
			{#each shows as row (row.key)}
				{@render toggle(row)}
			{/each}
		</div>
	</section>

	<section aria-labelledby="settings-elsewhere">
		<h3 id="settings-elsewhere" class="micro-label mb-1">On other pages</h3>
		{@render toggle({
			key: 'show_on_collaborator_pages',
			label: 'Show me on collaborators’ pages',
			hint: 'You can appear in Builds with on pages of people you share projects with.'
		})}
	</section>
</div>
