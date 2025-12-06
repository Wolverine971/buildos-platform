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
		Activity,
		Database
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
					title: 'Migration',
					href: '/admin/migration',
					icon: Database,
					description: 'Data migration tools'
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
	class="admin-shell relative flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 text-slate-900 transition-colors dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100"
>
	<!-- Desktop sidebar -->
	<aside
		class="relative hidden w-72 shrink-0 border-r border-slate-200/80 bg-white/80 backdrop-blur-xl dark:border-slate-800/50 dark:bg-slate-950/80 lg:flex lg:flex-col"
	>
		<!-- Logo Section -->
		<div class="border-b border-slate-200/80 px-6 py-6 dark:border-slate-800/50">
			<div class="flex items-center gap-4">
				<div
					class="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg shadow-purple-500/20"
				>
					<Layers class="h-5 w-5" />
				</div>
				<div>
					<p
						class="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500"
					>
						BuildOS
					</p>
					<p class="text-base font-bold text-slate-900 dark:text-white">Admin Console</p>
				</div>
			</div>
		</div>

		<!-- Navigation -->
		<AdminSidebar groups={navGroups} {pathname} />

		<!-- User Profile -->
		<div class="mt-auto border-t border-slate-200/80 px-6 py-5 dark:border-slate-800/50">
			<div class="flex items-center gap-3">
				<div class="relative">
					<div class={avatarClasses}>{initials}</div>
					<span
						class="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-950"
					></span>
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-semibold text-slate-900 dark:text-white truncate">
						{user?.name || 'Admin'}
					</p>
					{#if user?.email}
						<p class="text-xs text-slate-500 dark:text-slate-400 truncate">
							{user.email}
						</p>
					{/if}
				</div>
			</div>
		</div>
	</aside>

	<!-- Main content -->
	<div class="flex min-h-screen min-w-0 flex-1 flex-col">
		<!-- Top Header Bar -->

		<!-- Main Content Area -->
		<main class="relative flex-1 overflow-y-auto">
			<div class="min-h-full">
				{#if $$slots.hero}
					<div
						class="border-b border-slate-200/60 bg-gradient-to-b from-white to-slate-50/50 dark:border-slate-800/50 dark:from-slate-950 dark:to-slate-900/50"
					>
						<div class="px-4 py-6 sm:px-6 lg:px-8">
							<slot name="hero" />
						</div>
					</div>
				{/if}
				<div class="px-4 py-6 sm:px-6 lg:px-8">
					<div class="mx-auto max-w-7xl">
						<slot />
					</div>
				</div>
			</div>
		</main>
	</div>

	<!-- Mobile drawer -->
	{#if mobileOpen}
		<div id="admin-mobile-nav" class="fixed inset-0 z-50 flex lg:hidden">
			<button
				class="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
				onclick={() => (mobileOpen = false)}
				aria-label="Close menu"
			/>
			<div
				class="relative ml-auto flex h-full w-80 flex-col bg-white shadow-2xl dark:bg-slate-950 animate-slide-in"
			>
				<!-- Mobile Header -->
				<div
					class="flex items-center justify-between border-b border-slate-200/80 px-6 py-5 dark:border-slate-800/50"
				>
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg shadow-purple-500/20"
						>
							<Layers class="h-5 w-5" />
						</div>
						<div>
							<p
								class="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-500"
							>
								BuildOS
							</p>
							<p class="text-sm font-bold text-slate-900 dark:text-white">
								Admin Menu
							</p>
						</div>
					</div>
					<Button
						variant="ghost"
						size="sm"
						icon={X}
						iconPosition="left"
						onclick={() => (mobileOpen = false)}
						class="!p-2"
					>
						<span class="sr-only">Close</span>
					</Button>
				</div>

				<!-- Mobile Navigation -->
				<div class="flex-1 overflow-y-auto">
					<AdminSidebar groups={navGroups} {pathname} onNavigate={handleMobileNavigate} />
				</div>

				<!-- Mobile User Profile -->
				<div class="border-t border-slate-200/80 px-6 py-5 dark:border-slate-800/50">
					<div class="flex items-center gap-3">
						<div class="relative">
							<div class={avatarClasses}>{initials}</div>
							<span
								class="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-950"
							></span>
						</div>
						<div class="flex-1 min-w-0">
							<p
								class="text-sm font-semibold text-slate-900 dark:text-white truncate"
							>
								{user?.name || 'Admin'}
							</p>
							{#if user?.email}
								<p class="text-xs text-slate-500 dark:text-slate-400 truncate">
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
		/* Note: This is a background tint overlay, not a standalone gradient - no dithering needed */
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
