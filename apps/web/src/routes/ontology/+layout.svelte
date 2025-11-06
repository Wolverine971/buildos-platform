<!-- apps/web/src/routes/ontology/+layout.svelte -->
<script lang="ts">
	import { page } from '$app/stores';

	let { children } = $props();
	let isMobileMenuOpen = $state(false);
</script>

<!-- Mobile menu toggle button -->
<button
	class="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
	onclick={() => (isMobileMenuOpen = !isMobileMenuOpen)}
	aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
	aria-expanded={isMobileMenuOpen}
>
	<svg
		class="w-6 h-6 text-gray-700 dark:text-gray-300"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
	>
		{#if isMobileMenuOpen}
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M6 18L18 6M6 6l12 12"
			/>
		{:else}
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M4 6h16M4 12h16M4 18h16"
			/>
		{/if}
	</svg>
</button>

<div class="flex h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Sidebar -->
	<aside
		class="fixed lg:static inset-y-0 left-0 z-0 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-transform duration-300 {isMobileMenuOpen
			? 'translate-x-0'
			: '-translate-x-full lg:translate-x-0'}"
	>
		<!-- Header -->
		<div class="p-6 border-b border-gray-200 dark:border-gray-700">
			<h2 class="text-xl font-bold text-gray-900 dark:text-white mb-1">Ontology System</h2>
			<p class="text-sm text-gray-500 dark:text-gray-400">Admin Dashboard</p>
		</div>

		<!-- Navigation -->
		<nav class="flex-1 p-4 overflow-y-auto">
			<a
				href="/ontology"
				class="flex items-center gap-3 px-4 py-3 mb-1 text-gray-700 dark:text-gray-300 rounded-lg transition-all duration-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white {$page
					.url.pathname === '/ontology'
					? 'bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 text-blue-700 dark:text-blue-400 border-l-4 border-blue-600 dark:border-blue-500'
					: ''}"
				onclick={() => (isMobileMenuOpen = false)}
			>
				<svg
					class="w-5 h-5 flex-shrink-0"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
					/>
				</svg>
				<span class="font-medium">Projects</span>
			</a>

			<a
				href="/ontology/create"
				class="flex items-center gap-3 px-4 py-3 mb-1 text-gray-700 dark:text-gray-300 rounded-lg transition-all duration-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white {$page
					.url.pathname === '/ontology/create'
					? 'bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 text-blue-700 dark:text-blue-400 border-l-4 border-blue-600 dark:border-blue-500'
					: ''}"
				onclick={() => (isMobileMenuOpen = false)}
			>
				<svg
					class="w-5 h-5 flex-shrink-0"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4v16m8-8H4"
					/>
				</svg>
				<span class="font-medium">Create Project</span>
			</a>

			<a
				href="/ontology/templates"
				class="flex items-center gap-3 px-4 py-3 mb-1 text-gray-700 dark:text-gray-300 rounded-lg transition-all duration-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white {$page.url.pathname.startsWith(
					'/ontology/templates'
				)
					? 'bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 text-blue-700 dark:text-blue-400 border-l-4 border-blue-600 dark:border-blue-500'
					: ''}"
				onclick={() => (isMobileMenuOpen = false)}
			>
				<svg
					class="w-5 h-5 flex-shrink-0"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z"
					/>
				</svg>
				<span class="font-medium">Templates</span>
			</a>
		</nav>

		<!-- Footer -->
		<div class="p-6 border-t border-gray-200 dark:border-gray-700">
			<a
				href="/"
				class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors duration-200"
			>
				← Back to BuildOS
			</a>
		</div>
	</aside>

	<!-- Overlay for mobile -->
	{#if isMobileMenuOpen}
		<div
			class="fixed inset-0 bg-black/50 z-30 lg:hidden cursor-default"
			onclick={() => (isMobileMenuOpen = false)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
					e.preventDefault();
					isMobileMenuOpen = false;
				}
			}}
			role="button"
			tabindex="0"
			aria-label="Close menu"
		></div>
	{/if}

	<!-- Main content -->
	<main class="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8 lg:ml-0">
		{@render children()}
	</main>
</div>
