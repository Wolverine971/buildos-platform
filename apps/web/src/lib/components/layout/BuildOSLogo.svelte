<!-- apps/web/src/lib/components/layout/BuildOSLogo.svelte -->
<script lang="ts">
	type Props = {
		class?: string;
		alt?: string;
	};

	let { class: className = '', alt = '' }: Props = $props();
</script>

<img
	src="/brain-bolt.webp"
	{alt}
	class={`block aspect-square shrink-0 object-contain ${className}`}
	width="256"
	height="256"
	decoding="async"
/>
