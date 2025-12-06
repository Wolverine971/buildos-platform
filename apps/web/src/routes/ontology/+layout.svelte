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

<div class="flex min-h-screen min-h-[100dvh] bg-surface-scratch dark:bg-slate-900">
	<!-- Sidebar - Desktop Only -->
	<aside
		id="ontology-sidebar"
		class="hidden lg:flex w-64 flex-shrink-0 flex-col border-r-2 border-slate-700/20 px-4 pb-4 pt-8 bg-surface-clarity dark:border-slate-500/20 dark:bg-slate-900/90"
	>
		<div
			class="space-y-1.5 rounded border-2 border-slate-700/30 bg-surface-panel px-4 py-3 dark:border-slate-500/30 dark:bg-slate-800 shadow-subtle"
		>
			<p class="text-xs font-bold tracking-tight text-accent-olive dark:text-accent-olive">
				BUILDOS
			</p>
			<h2 class="text-lg font-bold text-slate-900 dark:text-slate-100">Ontology System</h2>
			<p class="text-xs text-slate-600 dark:text-slate-400">
				High fidelity knowledge operations
			</p>
		</div>

		<nav class="mt-5 flex-1 space-y-2 overflow-y-auto pr-1">
			{#each navLinks as link}
				{@const active = link.match(currentPath)}
				{@const Icon = link.icon}
				<a
					href={link.href}
					class={`group relative flex w-full items-start gap-3 rounded px-3 py-2.5 text-sm font-semibold transition-all duration-100 ${
						active
							? 'bg-accent-orange/10 text-accent-orange border-2 border-accent-orange/30 dark:bg-accent-orange/20 dark:text-accent-orange dark:border-accent-orange/40'
							: 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-2 border-transparent dark:text-slate-300 dark:hover:bg-slate-800/50 dark:hover:text-slate-100'
					}`}
					aria-current={active ? 'page' : undefined}
				>
					<span
						class={`flex h-9 w-9 items-center justify-center rounded border-2 text-sm transition-all ${
							active
								? 'border-accent-orange bg-accent-orange/20 text-accent-orange shadow-subtle dark:bg-accent-orange/30'
								: 'border-slate-700/20 bg-surface-elevated text-slate-600 dark:border-slate-500/20 dark:bg-slate-800 dark:text-slate-400'
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
			class="mt-3 inline-flex items-center gap-2 rounded border-2 border-slate-700/30 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-accent-olive/10 hover:border-accent-olive hover:text-accent-olive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-orange dark:border-slate-500/30 dark:text-slate-300 dark:hover:bg-accent-olive/20 dark:hover:text-accent-olive shadow-subtle"
		>
			<ArrowLeft class="h-4 w-4" />
			<span>Back to BuildOS</span>
		</a>
	</aside>

	<!-- Main content -->
	<main
		class="relative flex-1 overflow-y-auto sm:pb-6 lg:px-8 lg:pb-8 bg-surface-scratch dark:bg-slate-900 [scrollbar-gutter:stable_both-edges]"
	>
		<div class="mx-auto max-w-6xl">
			{@render children()}
		</div>
	</main>
</div>
