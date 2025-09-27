<script lang="ts">
	import SwaggerUI from '$lib/components/docs/SwaggerUI.svelte';
</script>

<svelte:head>
	<title>BuildOS API Documentation</title>
	<meta name="description" content="Interactive API documentation for BuildOS" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<div class="max-w-7xl mx-auto px-4 py-8">
		<nav class="flex gap-4 mb-8">
			<a
				href="/docs/api"
				class="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium"
			>
				Interactive API
			</a>
			<a
				href="/docs/technical/api/routes-reference.md"
				target="_blank"
				class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
			>
				Route Reference
			</a>
			<a
				href="/docs/technical/api/types.md"
				target="_blank"
				class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
			>
				Type Definitions
			</a>
			<a
				href="/docs/technical/api/templates.md"
				target="_blank"
				class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
			>
				Templates
			</a>
		</nav>

		<SwaggerUI
			specUrl="/openapi.json"
			title="BuildOS API Documentation"
			description="Interactive API documentation and testing interface"
		/>
	</div>
</div>