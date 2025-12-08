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

<div class="flex min-h-screen min-h-[100dvh] bg-background">
	<!-- Sidebar - Desktop Only -->
	<aside
		id="ontology-sidebar"
		class="hidden lg:flex w-64 flex-shrink-0 flex-col border-r border-border px-4 pb-4 pt-8 bg-card"
	>
		<div
			class="space-y-1.5 rounded-lg border border-border bg-muted/30 px-4 py-3 shadow-ink tx tx-frame tx-weak ink-frame"
		>
			<p class="micro-label text-accent">BUILDOS</p>
			<h2 class="text-lg font-bold text-foreground">Ontology System</h2>
			<p class="text-xs text-muted-foreground">High fidelity knowledge operations</p>
		</div>

		<nav class="mt-5 flex-1 space-y-2 overflow-y-auto pr-1">
			{#each navLinks as link}
				{@const active = link.match(currentPath)}
				{@const Icon = link.icon}
				<a
					href={link.href}
					class={`group relative flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-100 pressable ${
						active
							? 'bg-accent/10 text-accent border border-accent/30'
							: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent'
					}`}
					aria-current={active ? 'page' : undefined}
				>
					<span
						class={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-all ${
							active
								? 'border-accent bg-accent/20 text-accent shadow-ink'
								: 'border-border bg-card text-muted-foreground'
						}`}
					>
						<Icon class="h-4 w-4" />
					</span>
					<span class="flex flex-col whitespace-pre-wrap leading-tight">
						<span>{link.label}</span>
						<span class="text-xs font-normal text-muted-foreground"
							>{link.description}</span
						>
					</span>
				</a>
			{/each}
		</nav>

		<a
			href="/"
			class="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground transition hover:bg-muted/50 hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-ink pressable"
		>
			<ArrowLeft class="h-4 w-4" />
			<span>Back to BuildOS</span>
		</a>
	</aside>

	<!-- Main content -->
	<main
		class="relative flex-1 overflow-y-auto sm:pb-6 lg:px-8 lg:pb-8 bg-background [scrollbar-gutter:stable_both-edges]"
	>
		<div class="mx-auto max-w-6xl">
			{@render children()}
		</div>
	</main>
</div>
