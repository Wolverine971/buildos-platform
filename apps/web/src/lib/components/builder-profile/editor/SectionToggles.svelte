<!-- apps/web/src/lib/components/builder-profile/editor/SectionToggles.svelte -->
<!-- Your page > Sections: which parts of the page show. Each switch saves at once. -->
<script lang="ts">
	import EditorGroup from './EditorGroup.svelte';
	import ToggleRow from './ToggleRow.svelte';
	import type { BuilderPageEditorState, ToggleSetting } from './builder-editor-state.svelte';

	let { editor }: { editor: BuilderPageEditorState } = $props();

	const rows: { key: ToggleSetting; label: string; hint: string }[] = [
		{
			key: 'show_build_log',
			label: 'Build log',
			hint: 'Days you worked, as a grid. Numbers only, never titles or times.'
		},
		{
			key: 'build_log_includes_private',
			label: 'Count private work as numbers',
			hint: 'Adds your hidden projects to the grid without naming them.'
		},
		{
			key: 'show_agent_split',
			label: 'Show “with agents” as a second tone',
			hint: 'Work your agents did shows in a second color.'
		},
		{
			key: 'show_writing',
			label: 'Writing',
			hint: 'Your published public pages.'
		},
		{
			key: 'show_builds_with',
			label: 'Builds with',
			hint: 'People you share projects with who have a page and chose to show up.'
		},
		{
			key: 'show_on_collaborator_pages',
			label: 'Show me on collaborators’ pages',
			hint: 'When people you share projects with publish their page, you can appear in their Builds with.'
		}
	];
</script>

<EditorGroup id="your-page-sections" title="Sections" hint="Pick what your page shows.">
	<div class="divide-y divide-border">
		{#each rows as row (row.key)}
			<ToggleRow
				id="your-page-toggle-{row.key}"
				label={row.label}
				hint={row.hint}
				checked={editor.settings[row.key]}
				disabled={row.key === 'build_log_includes_private' && !editor.settings.show_build_log}
				busy={!!editor.toggleBusy[row.key]}
				error={editor.toggleError?.key === row.key ? editor.toggleError.message : null}
				onchange={(next) => editor.setToggle(row.key, next)}
			/>
		{/each}
	</div>
</EditorGroup>
