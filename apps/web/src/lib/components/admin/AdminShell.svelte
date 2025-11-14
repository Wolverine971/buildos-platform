<!-- apps/web/src/lib/components/admin/AdminShell.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import {
		Menu,
		X,
		LayoutDashboard,
		LineChart,
		CreditCard,
		Users,
		MessageSquare,
		Sparkles,
		GitBranch,
		Cpu,
		Workflow,
		AlertTriangle,
		ShieldCheck,
		Bot,
		Coins,
		History,
		Wrench,
		BellRing,
		ListTree,
		MessageCircle,
		TestTube,
		BarChart3,
		Layers,
		Activity
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import AdminSidebar, { type AdminNavGroup } from '$lib/components/admin/AdminSidebar.svelte';

	let { user }: { user?: { name?: string | null; email?: string | null } } = $props();

	let mobileOpen = $state(false);

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
					href: '/admin/chat',
					icon: MessageCircle,
					description: 'Agent performance',
					children: [
						{
							title: 'Overview',
							href: '/admin/chat',
							icon: BarChart3
						},
						{
							title: 'Agents',
							href: '/admin/chat/agents',
							icon: Bot
						},
						{
							title: 'Costs',
							href: '/admin/chat/costs',
							icon: Coins
						},
						{
							title: 'Sessions',
							href: '/admin/chat/sessions',
							icon: History
						},
						{
							title: 'Tools',
							href: '/admin/chat/tools',
							icon: Wrench
						}
					]
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
					title: 'LLM Usage',
					href: '/admin/llm-usage',
					icon: Cpu,
					description: 'Model cost & quality'
				},
				{
					title: 'Ontology',
					href: '/admin/ontology',
					icon: Workflow,
					description: 'Knowledge graph'
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

	const initials = $derived(
		(user?.name || user?.email || '')
			.split(' ')
			.map((part) => part.charAt(0).toUpperCase())
			.slice(0, 2)
			.join('') || 'AD'
	);

	const avatarClasses =
		'flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold uppercase text-white dark:bg-slate-100 dark:text-slate-900';
</script>

<div
	class="admin-shell relative flex min-h-screen bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100"
>
	<!-- Desktop sidebar -->
	<aside
		class="relative hidden w-64 shrink-0 border-r border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-900 lg:flex lg:flex-col"
	>
		<div class="border-b border-slate-200 px-5 py-5 dark:border-slate-800/80">
			<div class="flex items-center gap-3">
				<div
					class="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
				>
					<Layers class="h-4 w-4" />
				</div>
				<div>
					<p
						class="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-slate-400"
					>
						BuildOS
					</p>
					<p class="text-sm font-semibold text-slate-900 dark:text-white">
						Admin Control
					</p>
				</div>
			</div>
		</div>

		<AdminSidebar groups={navGroups} {pathname} />

		<div class="border-t border-slate-200 px-5 py-4 dark:border-slate-800/80">
			<div class="flex items-center gap-3">
				<div class={avatarClasses}>{initials}</div>
				<div>
					<p class="text-sm font-semibold text-slate-900 dark:text-white">
						{user?.name || 'Admin'}
					</p>
					{#if user?.email}
						<p class="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
					{/if}
				</div>
			</div>
		</div>
	</aside>

	<!-- Main content -->
	<div class="flex min-h-screen min-w-0 flex-1 flex-col">
		<header
			class="sticky top-0 z-0 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 transition-all duration-300 dark:border-slate-800/70 dark:bg-slate-950/90"
		>
			<div
				class="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 py-3 sm:px-6 lg:px-10"
			>
				<div class="flex items-center space-x-3">
					<Button
						variant="ghost"
						size="sm"
						class="lg:hidden"
						icon={mobileOpen ? X : Menu}
						iconPosition="left"
						aria-controls="admin-mobile-nav"
						aria-expanded={mobileOpen}
						on:click={() => (mobileOpen = !mobileOpen)}
					>
						Menu
					</Button>
					<div class="flex items-center space-x-3 lg:hidden">
						<div
							class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-cyan-500 text-white shadow-md shadow-blue-500/40"
						>
							<Layers class="h-4 w-4" />
						</div>
						<div>
							<p
								class="text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-slate-400"
							>
								BuildOS
							</p>
							<p class="text-sm font-semibold text-slate-900 dark:text-white">
								Admin Control
							</p>
						</div>
					</div>
				</div>

				<div class="flex items-center space-x-3">
					<div class="hidden flex-col text-right sm:flex">
						<p
							class="text-[0.6rem] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500"
						>
							Active Admin
						</p>
						<p class="text-sm font-semibold text-slate-900 dark:text-white">
							{user?.name || 'Operator'}
						</p>
					</div>
					<div class={avatarClasses}>{initials}</div>
				</div>
			</div>
		</header>

		<main class="relative flex-1 min-w-0 pb-10 pt-4 sm:pt-6">
			<div class="mx-auto w-full max-w-[1600px] px-4 pb-10 sm:px-6 lg:px-10 xl:px-12">
				{#if $$slots.hero}
					<div class="mb-5 sm:mb-6">
						<slot name="hero" />
					</div>
				{/if}
				<div class="admin-stack">
					<slot />
				</div>
			</div>
		</main>
	</div>

	<!-- Mobile drawer -->
	{#if mobileOpen}
		<div id="admin-mobile-nav" class="fixed inset-0 z-50 flex lg:hidden">
			<button
				class="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
				on:click={() => (mobileOpen = false)}
				aria-label="Close menu"
			/>
			<div
				class="relative ml-auto flex h-full w-80 flex-col border-l border-slate-200/60 bg-white/95 shadow-2xl dark:border-slate-800/70 dark:bg-slate-900/95"
			>
				<div class="flex items-center justify-between px-5 py-4">
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
							Navigation
						</p>
						<p class="text-sm font-semibold text-slate-900 dark:text-white">
							Choose a module
						</p>
					</div>
					<Button
						variant="ghost"
						size="sm"
						icon={X}
						iconPosition="left"
						on:click={() => (mobileOpen = false)}
					>
						Close
					</Button>
				</div>
				<div class="flex-1 overflow-y-auto pb-8">
					<AdminSidebar groups={navGroups} {pathname} onNavigate={handleMobileNavigate} />
				</div>
				<div class="border-t border-slate-200/70 px-5 py-4 dark:border-slate-800/70">
					<div class="flex items-center space-x-4">
						<div class={avatarClasses}>{initials}</div>
						<div>
							<p class="text-sm font-semibold text-slate-900 dark:text-white">
								{user?.name || 'Admin'}
							</p>
							{#if user?.email}
								<p class="text-xs text-slate-500 dark:text-slate-400">
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
		background-color: #f8fafc;
	}

	:global(.dark .admin-shell) {
		background-color: #020617;
	}

	:global(.admin-shell .admin-panel) {
		position: relative;
		border-radius: 0.875rem;
		background: rgba(255, 255, 255, 0.97);
		border: 1px solid rgba(148, 163, 184, 0.35);
		box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
		backdrop-filter: blur(10px);
	}

	:global(.dark .admin-shell .admin-panel) {
		background: rgba(2, 6, 23, 0.92);
		border-color: rgba(71, 85, 105, 0.65);
		box-shadow: 0 20px 40px rgba(2, 6, 23, 0.75);
	}

	:global(.admin-shell .admin-panel--tinted) {
		overflow: hidden;
	}

	:global(.admin-shell .admin-panel--tinted::after) {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.07), rgba(14, 165, 233, 0.05));
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
