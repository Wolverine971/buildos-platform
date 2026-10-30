<!-- apps/web/src/lib/components/projects/desktop/__fixtures__/EditorStub.svelte -->
<!-- Stands in for the rich markdown editor the reader opens on Edit: a plain textarea and Preview. -->
<script lang="ts">
	let { value = $bindable(''), onDocChange, onPreview }: Record<string, any> = $props();
</script>

<button type="button" role="tab" aria-label="Preview" onclick={() => onPreview?.()}>Preview</button>
<textarea
	aria-label="Body"
	{value}
	oninput={(event) => {
		value = event.currentTarget.value;
		onDocChange?.(value);
	}}
></textarea>
