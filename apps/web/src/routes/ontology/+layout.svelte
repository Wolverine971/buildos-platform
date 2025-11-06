<!-- apps/web/src/routes/ontology/+layout.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { ArrowLeft, Layers, LayoutTemplate, Menu, PlusCircle, X } from 'lucide-svelte';

	type NavLink = {
		href: string;
		label: string;
		description: string;
		icon: typeof Layers;
		match(path: string): boolean;
	};

	let { children } = $props();
	let isMobileMenuOpen = $state(false);

	const navLinks: NavLink[] = [
		{
			href: '/ontology',
			label: 'Projects',
			description: 'Knowledge workflows',
			icon: Layers,
			match: (path) => path === '/ontology' || path.startsWith('/ontology/projects')
		},
		{
			href: '/ontology/create',
			label: 'Create Project',
			description: 'Spin up a new graph',
			icon: PlusCircle,
			match: (path) => path === '/ontology/create'
		},
		{
			href: '/ontology/templates',
			label: 'Templates',
			description: 'Reusable FSM blueprints',
			icon: LayoutTemplate,
			match: (path) => path.startsWith('/ontology/templates')
		}
	];

	const currentPath = $derived($page.url.pathname);
</script>

<!-- Mobile menu toggle button -->
<button
	type="button"
	class="lg:hidden fixed top-3 left-3 z-40 inline-flex items-center justify-center rounded-xl border border-slate-200/70 bg-white/90 px-2.5 py-2 text-slate-700 shadow-lg shadow-slate-900/5 backdrop-blur transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-200"
	onclick={() => (isMobileMenuOpen = !isMobileMenuOpen)}
	aria-controls="ontology-sidebar"
	aria-label={isMobileMenuOpen ? 'Close navigation' : 'Open navigation'}
	aria-expanded={isMobileMenuOpen}
>
	{#if isMobileMenuOpen}
		<X class="h-5 w-5" />
	{:else}
		<Menu class="h-5 w-5" />
	{/if}
</button>

<div class=" flex min-h-screen min-h-[100dvh] bg-gray-50 dark:bg-gray-900/90">
	<!-- Sidebar -->
	<aside
		id="ontology-sidebar"
		class="fixed inset-y-0 left-0 z-0 flex w-64 flex-col border-r border-slate-200/80 bg-white/95 px-3 pb-4 pt-6 shadow-lg shadow-slate-900/10 transition-transform duration-300 ease-out backdrop-blur dark:border-gray-800/70 dark:bg-gray-900/90 lg:static lg:z-0 lg:translate-x-0 lg:px-4 lg:pt-8 {isMobileMenuOpen
			? 'translate-x-0'
			: '-translate-x-full lg:translate-x-0'}"
	>
		<div
			class="space-y-1.5 rounded-xl border border-slate-200/80 bg-gradient-to-br from-blue-50/80 to-purple-50/60 px-4 py-3 dark:border-slate-800 dark:from-blue-950/30 dark:to-purple-950/20"
		>
			<p
				class="text-xs font-semibold uppercase tracking-wide text-blue-700/80 dark:text-indigo-300/80"
			>
				BuildOS
			</p>
			<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">
				Ontology System
			</h2>
			<p class="text-xs text-slate-500 dark:text-slate-400">
				High fidelity knowledge operations
			</p>
		</div>

		<nav class="mt-5 flex-1 space-y-2 overflow-y-auto pr-1">
			{#each navLinks as link}
				{@const active = link.match(currentPath)}
				<a
					href={link.href}
					class={`group relative flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
						active
							? 'bg-gradient-to-r from-blue-100/70 to-indigo-100/70 text-blue-700 shadow-md shadow-blue-500/10 ring-1 ring-inset ring-blue-500/30 dark:from-blue-950/40 dark:to-indigo-950/40 dark:text-indigo-200'
							: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
					}`}
					aria-current={active ? 'page' : undefined}
					onclick={() => (isMobileMenuOpen = false)}
				>
					<span
						class={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-colors ${
							active
								? 'border-transparent bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300'
								: 'border-slate-200/80 bg-white/70 text-slate-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300'
						}`}
					>
						<svelte:component this={link.icon} class="h-4 w-4" />
					</span>
					<span class="flex flex-col whitespace-pre-wrap leading-tight">
						<span>{link.label}</span>
						<span class="text-xs font-normal text-slate-500 dark:text-slate-400"
							>{link.description}</span
						>
					</span>
				</a>
			{/each}
		</nav>

		<a
			href="/"
			class="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200/70 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:bg-blue-50/70 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/40 dark:hover:text-indigo-200"
			onclick={() => (isMobileMenuOpen = false)}
		>
			<ArrowLeft class="h-4 w-4" />
			<span>Back to BuildOS</span>
		</a>
	</aside>

	<!-- Overlay for mobile -->
	{#if isMobileMenuOpen}
		<div
			class="fixed inset-0 z-20 bg-slate-900/40 lg:hidden"
			onclick={() => (isMobileMenuOpen = false)}
			role="presentation"
		></div>
	{/if}

	<!-- Main content -->
	<main class="relative flex-1 overflow-y-auto px-3 py-5 sm:px-5 lg:px-8 lg:py-6">
		{@render children()}
	</main>
</div>
