<!-- apps/web/src/lib/components/people/InviteLinkQr.svelte -->
<!--
	The QR code for an invite link, drawn as one SVG path from the link itself.
	Always dark-on-light (scanners need it), so it reads as a printed card in dark mode.
-->
<script lang="ts">
	import { QR_INK, QR_PAPER, qrDrawing } from './qr-code';

	let {
		url,
		label,
		class: className = ''
	}: {
		url: string;
		/** What the code is, for screen readers ("QR code to join 9takes"). */
		label: string;
		class?: string;
	} = $props();

	const drawing = $derived(url ? qrDrawing(url) : null);
</script>

{#if drawing}
	<svg
		class="block h-auto w-full rounded-md {className}"
		viewBox="0 0 {drawing.viewSize} {drawing.viewSize}"
		role="img"
		aria-label={label}
		shape-rendering="crispEdges"
	>
		<rect width={drawing.viewSize} height={drawing.viewSize} fill={QR_PAPER} />
		<path d={drawing.path} fill={QR_INK} />
	</svg>
{/if}
