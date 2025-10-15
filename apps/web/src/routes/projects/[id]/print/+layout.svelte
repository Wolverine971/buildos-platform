<!-- Minimal print layout that BREAKS the layout chain -->
<!-- The @ symbol tells SvelteKit to ignore parent layouts -->
<script lang="ts">
	// Absolutely minimal - no imports, no external CSS, no interference
</script>

<svelte:head>
	<title>Print Preview</title>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<slot />

<style>
	/* Bulletproof CSS reset for print pages */
	:global(html),
	:global(body),
	:global(#svelte) {
		display: block !important;
		visibility: visible !important;
		opacity: 1 !important;
		height: 100% !important;
		width: 100% !important;
		margin: 0 !important;
		padding: 0 !important;
		background: white !important;
		color: #111827 !important;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial',
			sans-serif !important;
		font-size: 16px !important;
		line-height: 1.5 !important;
		overflow: visible !important;
		position: static !important;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
	}

	:global(*) {
		box-sizing: border-box;
		-webkit-print-color-adjust: exact;
		print-color-adjust: exact;
	}

	@media print {
		:global(html),
		:global(body),
		:global(#svelte) {
			height: auto !important;
			background: white !important;
			color: black !important;
		}

		:global(*) {
			visibility: visible !important;
			-webkit-print-color-adjust: exact !important;
			print-color-adjust: exact !important;
		}
	}
</style>
