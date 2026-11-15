<!-- apps/web/src/lib/components/builder-profile/editor/WritingPicker.svelte -->
<!-- Your page > Settings > Writing: the owner's published public pages, each with its own
     switch. Nothing shows under Writing until a page is switched on (a page published for
     one reason shouldn't land on the profile by itself). Picked pages lead the list in page
     order and can be moved up or down. Each change saves at once. -->
<script lang="ts">
	import { ArrowDown, ArrowUp, ExternalLink } from '$lib/icons/lucide';
	import { shortDate } from '$lib/builder-profile/format';
	import ToggleRow from './ToggleRow.svelte';
	import { iconButtonClass } from './editor-styles';
	import type { BuilderPageEditorState } from './builder-editor-state.svelte';

	let { editor }: { editor: BuilderPageEditorState } = $props();

	const options = $derived(editor.writingOptions);
	const picked = $derived(options.filter((o) => o.picked));
</script>

<section aria-labelledby="settings-writing">
	<h3 id="settings-writing" class="micro-label mb-1">Writing</h3>
	{#if options.length === 0}
		<p class="py-2 text-sm text-muted-foreground">
			Pages you publish from your projects can show here. You haven’t published one yet.
		</p>
	{:else}
		<p class="pb-1 text-xs text-muted-foreground">
			{picked.length
				? `${picked.length} of ${options.length} on your page.`
				: 'Nothing shows under Writing until you turn a page on.'}
		</p>
		{#if editor.writingError}
			<p class="py-1 text-xs text-destructive" role="alert">{editor.writingError}</p>
		{/if}
		<ul class="divide-y divide-border">
			{#each options as option (option.page_id)}
				{@const index = picked.findIndex((p) => p.page_id === option.page_id)}
				{@const hint = [option.project_name, shortDate(option.published_at)]
					.filter(Boolean)
					.join(' · ')}
				<li class="flex items-start gap-1">
					<div class="min-w-0 flex-1">
						<ToggleRow
							id="writing-{option.page_id}"
							label={option.title}
							{hint}
							checked={option.picked}
							busy={editor.writingBusy}
							disabled={editor.writingBusy || !!editor.conflict}
							onchange={(next) => editor.setWritingPicked(option.page_id, next)}
						/>
					</div>
					<div class="flex shrink-0 items-center pt-2">
						{#if option.picked && picked.length > 1}
							<button
								type="button"
								class={iconButtonClass}
								aria-label="Move {option.title} up"
								disabled={index <= 0 || editor.writingBusy}
								onclick={() => editor.moveWriting(option.page_id, -1)}
							>
								<ArrowUp class="h-4 w-4" aria-hidden="true" />
							</button>
							<button
								type="button"
								class={iconButtonClass}
								aria-label="Move {option.title} down"
								disabled={index >= picked.length - 1 || editor.writingBusy}
								onclick={() => editor.moveWriting(option.page_id, 1)}
							>
								<ArrowDown class="h-4 w-4" aria-hidden="true" />
							</button>
						{/if}
						<a
							href={option.url_path}
							target="_blank"
							rel="noopener"
							class={iconButtonClass}
							aria-label="Open {option.title} in a new tab"
							title="Open the page"
						>
							<ExternalLink class="h-4 w-4" aria-hidden="true" />
						</a>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
