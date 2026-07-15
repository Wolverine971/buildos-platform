<!-- apps/web/src/lib/components/admin/AdminShell.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import {
		X,
		Menu,
		Home,
		PanelLeftClose,
		PanelLeftOpen,
		LayoutDashboard,
		LineChart,
		CreditCard,
		Users,
		MessageSquare,
		Mail,
		Sparkles,
		GitBranch,
		Workflow,
		AlertTriangle,
		ShieldCheck,
		BellRing,
		ListTree,
		MessageCircle,
		TestTube,
		Layers,
		Activity,
		Database,
		Globe,
		Network
	} from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import AdminSidebar from '$lib/components/admin/AdminSidebar.svelte';
	import type { AdminNavGroup } from '$lib/components/admin/adminNav.types';
	import { CHAT_ADMIN_NAV_ITEMS, CHAT_ADMIN_ROOT } from '$lib/components/admin/adminRoutes';

	let {
		user,
		children,
		hero
	}: {
		user?: { name?: string | null; email?: string | null };
		children?: Snippet;
		hero?: Snippet;
	} = $props();

	const ADMIN_SIDEBAR_COLLAPSED_KEY = 'buildos.admin.sidebar.collapsed';
	const wideContentRoutePrefixes = [
		'/admin/emails',
		'/admin/email-sequences',
		'/admin/users',
		'/admin/errors',
		'/admin/notifications/nlogs',
		'/admin/migration',
		'/admin/chat/sessions',
		'/admin/chat/users',
		'/admin/chat/costs',
		'/admin/chat/timing',
		'/admin/chat/domains',
		'/admin/ontology/graph',
		'/admin/ontology/public-pages'
	];

	let mobileOpen = $state(false);
	let sidebarCollapsed = $state(false);

	const navGroups: AdminNavGroup[] = [
		{
			title: 'Overview',
			items: [
				{
					title: 'Executive Summary',
					href: '/admin',
					icon: LayoutDashboard,
					description: 'Cross-system performance'
				},
				{
					title: 'Revenue Insights',
					href: '/admin/revenue',
					icon: LineChart,
					description: 'MRR, ARR & cash flow'
				},
				{
					title: 'Subscriptions',
					href: '/admin/subscriptions',
					icon: CreditCard,
					description: 'Plans, billing, retention'
				}
			]
		},
		{
			title: 'Customer Ops',
			items: [
				{
					title: 'User Directory',
					href: '/admin/users',
					icon: Users,
					description: 'Accounts & activation'
				},
				{
					title: 'Feedback Desk',
					href: '/admin/feedback',
					icon: MessageSquare,
					description: 'Voice of the customer'
				},
				{
					title: 'Email Drafts',
					href: '/admin/emails',
					icon: Mail,
					description: 'Compose, review & send'
				},
				{
					title: 'Email Sequences',
					href: '/admin/email-sequences',
					icon: Mail,
					description: 'Copy, recipients & timing',
					children: [
						{
							title: 'Overview',
							href: '/admin/email-sequences',
							icon: Mail
						},
						{
							title: 'Welcome Sequence',
							href: '/admin/welcome-sequence',
							icon: Sparkles
						}
					]
				},
				{
					title: 'Beta Program',
					href: '/admin/beta',
					icon: Sparkles,
					description: 'VIP onboarding'
				}
			]
		},
		{
			title: 'Platform Health',
			items: [
				{
					title: 'Feature Flags',
					href: '/admin/feature-flags',
					icon: GitBranch,
					description: 'Rollouts & toggles'
				},
				{
					title: 'Chat Intelligence',
					href: CHAT_ADMIN_ROOT,
					icon: MessageCircle,
					description: 'Agent performance',
					children: CHAT_ADMIN_NAV_ITEMS
				},
				{
					title: 'Notifications',
					href: '/admin/notifications',
					icon: BellRing,
					description: 'Delivery analytics',
					children: [
						{
							title: 'Overview',
							href: '/admin/notifications',
							icon: Activity
						},
						{
							title: 'Event Logs',
							href: '/admin/notifications/nlogs',
							icon: ListTree
						},
						{
							title: 'SMS Scheduler',
							href: '/admin/notifications/sms-scheduler',
							icon: MessageCircle
						},
						{
							title: 'Test Bed',
							href: '/admin/notifications/test-bed',
							icon: TestTube
						}
					]
				},
				{
					title: 'Ontology',
					href: '/admin/ontology/graph',
					icon: Workflow,
					description: 'Knowledge graph',
					children: [
						{
							title: 'Graph',
							href: '/admin/ontology/graph',
							icon: Network,
							activePaths: ['/admin/ontology']
						},
						{
							title: 'Public Pages',
							href: '/admin/ontology/public-pages',
							icon: Globe
						}
					]
				},
				{
					title: 'Migration',
					href: '/admin/migration',
					icon: Database,
					description: 'Data migration tools',
					children: [
						{
							title: 'Dashboard',
							href: '/admin/migration',
							icon: Database,
							activePrefixes: ['/admin/migration/users']
						},
						{
							title: 'Errors',
							href: '/admin/migration/errors',
							icon: AlertTriangle
						}
					]
				},
				{
					title: 'Error Control',
					href: '/admin/errors',
					icon: AlertTriangle,
					description: 'Incidents & triage'
				},
				{
					title: 'Security Center',
					href: '/admin/security',
					icon: ShieldCheck,
					description: 'Threat & access logs'
				}
			]
		}
	];

	let lastPath = '';

	// Close mobile menu on navigation
	$effect(() => {
		const currentPath = $page.url.pathname;
		if (lastPath && currentPath !== lastPath) {
			mobileOpen = false;
		}
		lastPath = currentPath;
	});

	// Handler for mobile navigation
	function handleMobileNavigate() {
		mobileOpen = false;
	}

	let pathname = $derived($page.url.pathname);
	let isWideContentRoute = $derived(
		wideContentRoutePrefixes.some(
			(route) => pathname === route || pathname.startsWith(`${route}/`)
		)
	);

	const initials = $derived(
		(user?.name || user?.email || '')
			.split(' ')
			.map((part) => part.charAt(0).toUpperCase())
			.slice(0, 2)
			.join('') || 'AD'
	);

	const avatarClasses =
		'flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-semibold uppercase text-background';

	onMount(() => {
		if (!browser) return;

		try {
			sidebarCollapsed = localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY) === 'true';
		} catch (error) {
			console.warn('Unable to load admin sidebar preference', error);
		}
	});

	function setSidebarCollapsed(nextValue: boolean) {
		sidebarCollapsed = nextValue;

		if (!browser) return;

		try {
			localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, String(nextValue));
		} catch (error) {
			console.warn('Unable to save admin sidebar preference', error);
		}
	}

	function toggleSidebarCollapsed() {
		setSidebarCollapsed(!sidebarCollapsed);
	}
</script>

<div
	class="admin-shell relative flex min-h-full flex-1 bg-background text-foreground transition-colors"
>
	<!-- Desktop sidebar -->
	<aside
		class={`relative hidden shrink-0 border-r border-border bg-card backdrop-blur-xl transition-[width] duration-200 lg:flex lg:flex-col tx tx-frame tx-weak ${
			sidebarCollapsed ? 'w-16' : 'w-72'
		}`}
	>
		<!-- Logo Section -->
		<div
			class={sidebarCollapsed
				? 'border-b border-border px-2 py-4'
				: 'border-b border-border px-5 py-5'}
		>
			<div
				class={sidebarCollapsed
					? 'flex flex-col items-center gap-3'
					: 'flex items-center justify-between gap-3'}
			>
				<a
					href="/admin"
					class={sidebarCollapsed
						? 'flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-ink'
						: 'flex min-w-0 items-center gap-4 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'}
					aria-label="Admin dashboard"
					title={sidebarCollapsed ? 'Admin dashboard' : undefined}
				>
					<span
						class={sidebarCollapsed
							? 'flex h-11 w-11 items-center justify-center rounded-xl'
							: 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-ink'}
					>
						<Layers class="h-5 w-5" />
					</span>
					{#if !sidebarCollapsed}
						<span class="min-w-0">
							<span
								class="block text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground"
							>
								BuildOS
							</span>
							<span class="block truncate text-base font-bold text-foreground">
								Admin Console
							</span>
						</span>
					{/if}
				</a>

				<button
					type="button"
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label={sidebarCollapsed
						? 'Expand admin sidebar'
						: 'Collapse admin sidebar'}
					title={sidebarCollapsed ? 'Expand admin sidebar' : 'Collapse admin sidebar'}
					onclick={toggleSidebarCollapsed}
				>
					{#if sidebarCollapsed}
						<PanelLeftOpen class="h-4 w-4" />
					{:else}
						<PanelLeftClose class="h-4 w-4" />
					{/if}
				</button>
			</div>
		</div>

		<!-- Navigation -->
		<AdminSidebar groups={navGroups} {pathname} collapsed={sidebarCollapsed} />

		<!-- User Profile -->
		<div
			class={sidebarCollapsed
				? 'mt-auto border-t border-border px-2 py-4'
				: 'mt-auto border-t border-border px-5 py-5'}
		>
			<div
				class={sidebarCollapsed
					? 'flex flex-col items-center gap-3'
					: 'flex items-center gap-3'}
			>
				<div class="relative">
					<div
						class={avatarClasses}
						title={sidebarCollapsed ? user?.name || user?.email || 'Admin' : undefined}
					>
						{initials}
					</div>
					<span
						class="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-success"
					></span>
				</div>
				{#if !sidebarCollapsed}
					<div class="flex-1 min-w-0">
						<p class="text-sm font-semibold text-foreground truncate">
							{user?.name || 'Admin'}
						</p>
						{#if user?.email}
							<p class="text-xs text-muted-foreground truncate">
								{user.email}
							</p>
						{/if}
					</div>
				{/if}
				<a
					href="/dashboard"
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Open main app"
					title="Open main app"
				>
					<Home class="h-4 w-4" />
				</a>
			</div>
		</div>
	</aside>

	<!-- Main content -->
	<div class="flex min-h-screen min-w-0 flex-1 flex-col">
		<!-- Mobile admin section bar (sits below the global top nav) -->
		<header
			class="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-card px-3 shadow-ink lg:hidden"
		>
			<button
				type="button"
				class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-ink transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label="Open admin sections menu"
				aria-controls="admin-mobile-nav"
				aria-expanded={mobileOpen}
				onclick={() => (mobileOpen = true)}
			>
				<Menu class="h-4 w-4" />
				<span>Admin menu</span>
			</button>
		</header>

		<!-- Main Content Area -->
		<main class="relative flex-1 overflow-y-auto">
			<div class="min-h-full">
				{#if hero}
					<div class="border-b border-border bg-muted">
						<div class="px-4 py-6 sm:px-6 lg:px-8">
							{@render hero?.()}
						</div>
					</div>
				{/if}
				<div
					class={isWideContentRoute
						? 'px-4 py-4 sm:px-5 lg:px-6 xl:px-8 2xl:px-10'
						: 'px-4 py-6 sm:px-6 lg:px-8'}
				>
					<div class={isWideContentRoute ? 'w-full' : 'mx-auto max-w-7xl'}>
						{@render children?.()}
					</div>
				</div>
			</div>
		</main>
	</div>

	<!-- Mobile drawer -->
	{#if mobileOpen}
		<div id="admin-mobile-nav" class="fixed inset-0 z-50 flex lg:hidden">
			<button
				class="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
				onclick={() => (mobileOpen = false)}
				aria-label="Close menu"
			></button>
			<div
				class="relative ml-auto flex h-full w-80 flex-col bg-card shadow-ink-strong animate-slide-in tx tx-frame tx-weak"
			>
				<!-- Mobile Header -->
				<div class="flex items-center justify-between border-b border-border px-6 py-5">
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-ink"
						>
							<Layers class="h-5 w-5" />
						</div>
						<div>
							<p
								class="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground"
							>
								BuildOS
							</p>
							<p class="text-sm font-bold text-foreground">Admin Menu</p>
						</div>
					</div>
					<Button
						variant="ghost"
						size="sm"
						icon={X}
						iconPosition="left"
						onclick={() => (mobileOpen = false)}
						class="!p-2 text-muted-foreground hover:text-foreground"
					>
						<span class="sr-only">Close</span>
					</Button>
				</div>

				<!-- Mobile Navigation -->
				<div class="flex-1 overflow-y-auto">
					<AdminSidebar
						groups={navGroups}
						{pathname}
						onNavigate={handleMobileNavigate}
						expandable
					/>
				</div>

				<!-- Mobile User Profile -->
				<div class="border-t border-border px-6 py-5">
					<div class="flex items-center gap-3">
						<div class="relative">
							<div class={avatarClasses}>{initials}</div>
							<span
								class="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-success"
							></span>
						</div>
						<div class="flex-1 min-w-0">
							<p class="text-sm font-semibold text-foreground truncate">
								{user?.name || 'Admin'}
							</p>
							{#if user?.email}
								<p class="text-xs text-muted-foreground truncate">
									{user.email}
								</p>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(.admin-shell) {
		background-color: hsl(var(--background));
	}

	:global(.admin-shell .admin-panel) {
		position: relative;
		border-radius: 0.875rem;
		background: hsl(var(--card) / 0.97);
		border: 1px solid hsl(var(--border));
		box-shadow: var(--shadow-ink);
		backdrop-filter: blur(10px);
	}

	:global(.admin-shell .admin-panel--tinted) {
		overflow: hidden;
	}

	:global(.admin-shell .admin-panel--tinted::after) {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(135deg, hsl(var(--accent) / 0.07), hsl(var(--accent) / 0.04));
		opacity: 0.45;
		pointer-events: none;
	}

	:global(.dark .admin-shell .admin-panel--tinted::after) {
		opacity: 0.25;
	}

	:global(.admin-shell .admin-panel > *) {
		position: relative;
		z-index: 1;
	}

	:global(.admin-stack),
	:global(.admin-page) {
		display: flex;
		flex-direction: column;
		width: 100%;
		gap: 1.25rem;
	}

	:global(.admin-stack > *),
	:global(.admin-page > *) {
		min-width: 0;
	}

	@media (min-width: 640px) {
		:global(.admin-stack),
		:global(.admin-page) {
			gap: 1.5rem;
		}
	}

	@media (min-width: 1024px) {
		:global(.admin-stack),
		:global(.admin-page) {
			gap: 1.75rem;
		}
	}
</style>
