<!-- apps/web/src/lib/components/builder-profile/editor/AudienceSelect.svelte -->
<!-- Who sees one item: anyone, or only people you share a project with. -->
<script lang="ts">
	import type { BuilderAudience } from '$lib/builder-profile/types';
	import { selectClass } from './editor-styles';

	let {
		id,
		value,
		label = 'Who sees this',
		visibleLabel = false,
		onchange
	}: {
		id: string;
		value: BuilderAudience;
		label?: string;
		visibleLabel?: boolean;
		onchange: (value: BuilderAudience) => void;
	} = $props();
</script>

<div class={visibleLabel ? 'space-y-1.5' : ''}>
	<label for={id} class={visibleLabel ? 'block text-sm font-medium text-foreground' : 'sr-only'}
		>{label}</label
	>
	<select
		{id}
		{value}
		class={selectClass}
		onchange={(event) =>
			onchange(event.currentTarget.value === 'collaborators' ? 'collaborators' : 'anyone')}
	>
		<option value="anyone">Anyone</option>
		<option value="collaborators">People I work with</option>
	</select>
</div>
