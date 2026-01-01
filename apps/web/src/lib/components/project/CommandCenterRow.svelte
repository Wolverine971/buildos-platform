<!-- apps/web/src/lib/components/project/CommandCenterRow.svelte -->
<!--
	Command Center Row Component

	Wraps two panels in a flex row with wrap behavior.
	When one panel expands, it takes full width and the partner wraps below.

	Documentation:
	- Mobile Command Center: /apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="flex flex-wrap gap-1.5 items-start">
	{@render children()}
</div>
