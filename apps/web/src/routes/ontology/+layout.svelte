<!-- apps/web/src/routes/ontology/+layout.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { ArrowLeft, Layers, LayoutTemplate, PlusCircle } from 'lucide-svelte';

	type NavLink = {
		href: string;
		label: string;
		description: string;
		icon: typeof Layers;
		match(path: string): boolean;
	};

	let { children } = $props();

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

<div class="flex min-h-screen min-h-[100dvh] bg-gray-50 dark:bg-gray-900/90">
	<!-- Sidebar - Desktop Only -->
	<aside
		id="ontology-sidebar"
		class="hidden lg:flex w-64 flex-shrink-0 flex-col border-r border-slate-200/80 px-4 pb-4 pt-8 shadow-lg shadow-slate-900/10 backdrop-blur dark:border-gray-800/70 dark:bg-gray-900/90"
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
				{@const Icon = link.icon}
				<a
					href={link.href}
					class={`group relative flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
						active
							? 'bg-gradient-to-r from-blue-100/70 to-indigo-100/70 text-blue-700 shadow-md shadow-blue-500/10 ring-1 ring-inset ring-blue-500/30 dark:from-blue-950/40 dark:to-indigo-950/40 dark:text-indigo-200'
							: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
					}`}
					aria-current={active ? 'page' : undefined}
				>
					<span
						class={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-colors ${
							active
								? 'border-transparent bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300'
								: 'border-slate-200/80 bg-white/70 text-slate-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300'
						}`}
					>
						<Icon class="h-4 w-4" />
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
		>
			<ArrowLeft class="h-4 w-4" />
			<span>Back to BuildOS</span>
		</a>
	</aside>

	<!-- Main content -->
	<main
		class="relative flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 [scrollbar-gutter:stable_both-edges]"
	>
		<div class="mx-auto max-w-6xl">
			{@render children()}
		</div>
	</main>
</div>
