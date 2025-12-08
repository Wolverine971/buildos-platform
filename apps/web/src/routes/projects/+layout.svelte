<!-- apps/web/src/routes/projects/+layout.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { ArrowLeft, Layers, LayoutTemplate, PlusCircle } from 'lucide-svelte';

	type NavLink = {
		href: string;
		label: string;
		description: string;
		icon: typeof Layers;
		match(path: string): boolean;
		adminOnly?: boolean;
	};

	let { children, data } = $props();

	// Check if user is admin - only admins see the full sidebar with Templates
	const isAdmin = $derived(data?.user?.is_admin ?? false);

	const navLinks: NavLink[] = [
		{
			href: '/projects',
			label: 'Projects',
			description: 'Manage your projects',
			icon: Layers,
			match: (path) => path === '/projects' || path.startsWith('/projects/projects')
		},
		{
			href: '/projects/create',
			label: 'Create Project',
			description: 'Start a new project',
			icon: PlusCircle,
			match: (path) => path === '/projects/create'
		},
		{
			href: '/projects/templates',
			label: 'Templates',
			description: 'Reusable blueprints',
			icon: LayoutTemplate,
			match: (path) => path.startsWith('/projects/templates'),
			adminOnly: true
		}
	];

	// Filter nav links based on admin status
	const visibleNavLinks = $derived(navLinks.filter((link) => !link.adminOnly || isAdmin));

	const currentPath = $derived($page.url.pathname);
</script>

<div class="flex min-h-screen min-h-[100dvh] bg-background">
	<!-- Sidebar - Desktop Only, Admin Only -->
	{#if isAdmin}
		<aside
			id="projects-sidebar"
			class="hidden lg:flex w-64 flex-shrink-0 flex-col border-r border-border px-4 pb-4 pt-8 bg-card"
		>
			<div
				class="space-y-1.5 rounded-lg border border-border bg-muted/30 px-4 py-3 shadow-ink tx tx-frame tx-weak ink-frame"
			>
				<p class="micro-label text-accent">BUILDOS</p>
				<h2 class="text-lg font-bold text-foreground">Projects</h2>
				<p class="text-xs text-muted-foreground">Manage and organize your work</p>
			</div>

			<nav class="mt-5 flex-1 space-y-2 overflow-y-auto pr-1">
				{#each visibleNavLinks as link}
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
	{/if}

	<!-- Main content -->
	<main
		class="relative flex-1 overflow-y-auto px-4 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8 bg-background [scrollbar-gutter:stable_both-edges]"
	>
		<div class="mx-auto max-w-6xl pt-4 sm:pt-6">
			{@render children()}
		</div>
	</main>
</div>
