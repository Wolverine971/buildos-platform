<!-- src/lib/components/LoadingSpinner.svelte -->
<script lang="ts">
	export let size: 'small' | 'medium' | 'large' = 'medium';

	const sizeClasses = {
		small: 'w-4 h-4',
		medium: 'w-6 h-6',
		large: 'w-8 h-8'
	};
</script>

<div class="animate-spin {sizeClasses[size]}">
	<svg
		class="w-full h-full text-gray-400"
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
	>
		<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
		<path
			class="opacity-75"
			fill="currentColor"
			d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
		/>
	</svg>
</div>
