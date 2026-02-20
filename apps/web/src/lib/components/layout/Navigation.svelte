<!-- apps/web/src/lib/components/layout/Navigation.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import {
		FolderOpen,
		Home,
		StickyNote,
		User,
		LogOut,
		Menu,
		X,
		Shield,
		Sparkles,
		AlertCircle,
		ChevronRight,
		LoaderCircle,
		Zap,
		Clock,
		Sun,
		Moon,
		Bell
	} from 'lucide-svelte';
	import { toggleMode } from 'mode-watcher';
	import BriefStatusIndicator from './BriefStatusIndicator.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { logout } from '$lib/utils/auth';
	import { toastService, TOAST_DURATION } from '$lib/stores/toast.store';
	import { browser, dev } from '$app/environment';
	import type { ChatContextType } from '@buildos/shared-types';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';

	type Props = {
		user: any | null;
		completedOnboarding?: boolean;
		onboardingProgress?: number;
		element?: HTMLElement | null;
		stripeEnabled?: boolean;
		subscription?: any;
	};

	let {
		user = null,
		completedOnboarding = false,
		onboardingProgress = 0,
		element = $bindable<HTMLElement | null>(null),
		stripeEnabled = false,
		subscription = null
	}: Props = $props();

	let showUserMenu = $state(false);
	let showMobileMenu = $state(false);
	let loggingOut = $state(false);
	let loadingLink = $state('');
	let lastLogoutAttempt = $state(0);
	let previousPath = $state('');
	let isDark = $state(false);
	let showChatModal = $state(false);
	let chatOpenedWithContext = $state<ChatContextType | null>(null);

	// Hide-on-scroll: hide nav when scrolling down on mobile, show on scroll up
	let lastScrollY = $state(0);
	let navHidden = $state(false);

	const currentPath = $derived($page.url.pathname);

	// Context-aware chat configuration based on current page
	const chatContextType = $derived.by((): ChatContextType => {
		// Project detail page: /projects/[id]
		if (currentPath.match(/^\/projects\/[^/]+$/) && $page.data?.project) {
			return 'project';
		}
		// Default: global context
		return 'global';
	});

	const chatEntityId = $derived.by((): string | undefined => {
		// Project detail page: return project ID
		if (currentPath.match(/^\/projects\/([^/]+)$/) && $page.data?.project) {
			return $page.data.project.id;
		}
		// No entity
		return undefined;
	});

	const chatAutoInitProject = $derived.by(() => {
		if (currentPath.match(/^\/projects\/[^/]+$/) && $page.data?.project) {
			return {
				projectId: $page.data.project.id,
				projectName: $page.data.project.name ?? 'Project',
				showActionSelector: false
			};
		}
		return null;
	});

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: Home },
		{ href: '/projects', label: 'Projects', icon: FolderOpen },
		// { href: '/time-blocks', label: 'Time Blocks', icon: Clock },
		{ href: '/history', label: 'History', icon: StickyNote }
	];

	const loadingAccentClass = 'animate-pulse-accent ring-1 ring-accent/60 shadow-ink-strong';

	const needsOnboarding = $derived(user && (!completedOnboarding || onboardingProgress < 100));
	const onboardingUrgent = $derived(user && onboardingProgress < 50);
	const userName = $derived(user?.name || user?.email || '');
	const pendingInvites = $derived.by(() => {
		const invites = $page.data?.pendingInvites;
		return Array.isArray(invites) ? invites : [];
	});
	const pendingInviteCount = $derived(pendingInvites.length);
	const hasPendingInvites = $derived(pendingInviteCount > 0);

	$effect(() => {
		const path = currentPath;
		if (path !== previousPath) {
			previousPath = path;
			loadingLink = '';
			closeAllMenus();
		}
	});

	async function handleSignOut() {
		if (loggingOut || !browser) return;

		const now = Date.now();
		if (lastLogoutAttempt > 0 && now - lastLogoutAttempt < 2000) {
			return;
		}

		lastLogoutAttempt = now;
		loggingOut = true;
		closeAllMenus();

		try {
			toastService.info('Signing out...', { duration: TOAST_DURATION.QUICK });

			await logout(
				'/auth/login?message=' + encodeURIComponent('You have been signed out successfully')
			);
		} catch (error) {
			if (error instanceof Error) {
				if (error.message.includes('network') || error.message.includes('fetch')) {
					toastService.error(
						'Network error during sign out. You may need to refresh the page.'
					);
				} else if (error.message.includes('timeout')) {
					toastService.error('Sign out timed out. Please try again.');
				} else {
					toastService.error('Sign out failed. Please try refreshing the page.');
				}
			} else {
				toastService.error(
					'Sign out encountered an issue. Please refresh the page if you remain logged in.'
				);
			}

			loggingOut = false;
		} finally {
			setTimeout(() => {
				lastLogoutAttempt = 0;
			}, 1000);
		}
	}

	function closeAllMenus() {
		showMobileMenu = false;
		showUserMenu = false;
	}

	function toggleMobileMenu(e: Event) {
		if (loggingOut) return;
		e.stopPropagation();
		showMobileMenu = !showMobileMenu;
		if (showMobileMenu) showUserMenu = false;
	}

	function toggleUserMenu(e: Event) {
		if (loggingOut) return;
		e.stopPropagation();
		showUserMenu = !showUserMenu;
		if (showUserMenu) showMobileMenu = false;
	}

	function handleMenuItemClick(href?: string) {
		if (loggingOut) return false;

		if (href && href !== currentPath) {
			loadingLink = href;
		}

		closeAllMenus();
		return true;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeAllMenus();
		}
	}

	function handleClickOutside(e: MouseEvent) {
		if (!e.target) return;

		const target = e.target as Element;
		const isInsideMobileMenu = target.closest('[data-mobile-menu]');
		const isInsideUserMenu = target.closest('[data-user-menu]');

		if (!isInsideMobileMenu && !isInsideUserMenu) {
			closeAllMenus();
		}
	}

	function handleOpenChat(
		detailOrEvent?: { projectId: string; chatType: string } | MouseEvent | CustomEvent
	) {
		closeAllMenus();
		chatOpenedWithContext = chatContextType;
		showChatModal = true;
		// TODO: Pass projectId and chatType to AgentChatModal when needed
		// If detailOrEvent has projectId, it's the detail object we need
	}

	function handleChatClose(summary?: DataMutationSummary) {
		const wasProjectCreate = chatOpenedWithContext === 'project_create';
		showChatModal = false;
		chatOpenedWithContext = null;

		if (summary?.hasChanges && summary.affectedProjectIds.length > 0) {
			if (wasProjectCreate) {
				toastService.success('Project created! Head to Projects to explore it.', {
					duration: TOAST_DURATION.LONG
				});
			} else {
				toastService.success('Changes saved.', { duration: TOAST_DURATION.STANDARD });
			}
		}
	}

	function handleScroll() {
		// Only hide nav on mobile
		if (window.innerWidth >= 768) {
			navHidden = false;
			lastScrollY = window.scrollY;
			return;
		}

		const currentY = window.scrollY;
		const delta = currentY - lastScrollY;

		if (currentY < 80) {
			// Always show nav near top of page
			navHidden = false;
		} else if (delta > 10) {
			// Scrolling down — hide nav
			navHidden = true;
			closeAllMenus();
		} else if (delta < -5) {
			// Scrolling up — show nav
			navHidden = false;
		}

		lastScrollY = currentY;
	}

	onMount(() => {
		if (!browser) return;

		// Check if we're in dark mode
		isDark = document.documentElement.classList.contains('dark');

		// Listen for theme changes
		const themeObserver = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
					isDark = document.documentElement.classList.contains('dark');
				}
			});
		});

		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});

		document.addEventListener('keydown', handleKeydown);
		document.addEventListener('click', handleClickOutside);
		window.addEventListener('scroll', handleScroll, { passive: true });

		return () => {
			themeObserver.disconnect();
			document.removeEventListener('keydown', handleKeydown);
			document.removeEventListener('click', handleClickOutside);
			window.removeEventListener('scroll', handleScroll);
		};
	});
</script>

<nav
	aria-label="Main navigation"
	data-fixed-element
	bind:this={element}
	class="sticky top-0 z-10 bg-card border-b border-border shadow-ink transition-all duration-200 {navHidden
		? '-translate-y-full'
		: 'translate-y-0'}"
>
	<div class="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 xl:px-8">
		<div class="flex justify-between items-center h-16 gap-2.5">
			<!-- Left side - Logo and Navigation -->
			<div class="flex items-center min-w-0">
				<!-- Logo - different styles for authenticated vs unauthenticated -->
				<div class="flex-shrink-0 flex items-center">
					{#if user}
						<!-- Authenticated: Text logo -->
						<a
							href="/"
							class="flex items-center group"
							onclick={() => handleMenuItemClick('/')}
						>
							<span class="sr-only">BuildOS</span>
							<span
								class="inline-flex items-baseline gap-[0.08em] font-black tracking-tight text-[clamp(1.5rem,4vw,2.1rem)] sm:text-[clamp(1.75rem,2.5vw,2.1rem)] leading-none"
								aria-hidden="true"
							>
								<span
									class="text-foreground transition-colors duration-200 group-hover:text-accent/80"
									>Build</span
								>
								<span class="logo-os">OS</span>
							</span>
						</a>
					{:else}
						<!-- Unauthenticated: Brain-bolt icon + text -->
						<a
							href="/"
							class="flex items-center gap-3 group"
							onclick={() => handleMenuItemClick('/')}
						>
							<img
								src="/brain-bolt.png"
								alt="BuildOS"
								class="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-md object-cover"
							/>
							<div>
								<div
									class="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground"
								>
									BuildOS
								</div>
								<div class="text-xs text-muted-foreground">
									AI-first project operating system
								</div>
							</div>
						</a>
					{/if}
				</div>

				<!-- Desktop Navigation -->
				{#if user}
					<div
						class="hidden md:ml-3 lg:ml-4 xl:ml-6 2xl:ml-8 md:flex md:gap-0.5 lg:gap-0.5 xl:gap-1"
					>
						{#each navItems as item}
							{@const Icon = item.icon}

							<a
								href={item.href}
								onclick={() => handleMenuItemClick(item.href)}
								class="relative inline-flex items-center px-2 lg:px-3 py-1.5 md:py-2 text-xs md:text-sm font-bold tracking-tight rounded transition-all duration-200 whitespace-nowrap
								{currentPath === item.href
									? 'text-accent bg-muted'
									: 'text-muted-foreground hover:text-foreground hover:bg-muted'}
								{loggingOut ? 'opacity-50 pointer-events-none' : ''}
								{loadingLink === item.href ? 'animate-pulse' : ''}"
							>
								<!-- Underline indicator for active route -->
								{#if currentPath === item.href}
									<div
										class="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-accent"
									></div>
								{/if}
								<Icon
									class="w-3.5 md:w-4 h-3.5 md:h-4 mr-1 lg:mr-1.5 flex-shrink-0 {currentPath ===
									item.href
										? 'text-accent'
										: 'text-muted-foreground'}"
								/>
								<span class="hidden lg:inline">{item.label}</span>
								<span class="lg:hidden">{item.label.split(' ')[0]}</span>
							</a>
						{/each}
					</div>
				{/if}
			</div>

			{#if !user}
				<!-- Centered nav links for non-authenticated users -->
				<div
					class="hidden md:flex items-center justify-center flex-1 gap-6 text-xs text-muted-foreground"
				>
					<a class="hover:text-foreground transition" href="/#how">How it works</a>
					<a class="hover:text-foreground transition" href="/#stack">Under the hood</a>
				</div>
			{/if}
			<!-- Right side -->
			<div class="flex items-center gap-1.5 sm:gap-2 lg:gap-2 xl:gap-3 flex-shrink-0">
				{#if user}
					<!-- Brief Status (desktop only) -->
					<div class="hidden xl:block">
						<BriefStatusIndicator />
					</div>

					<!-- Brain Dump & Chat Button -->
					<Button
						variant="outline"
						size="sm"
						onclick={handleOpenChat}
						class={`relative flex items-center gap-2 px-3 h-9 rounded font-bold tracking-tight text-xs md:text-sm transition-all duration-200 group pressable border tx tx-grain tx-weak ${showChatModal ? 'text-accent-foreground bg-accent border-accent shadow-ink' : 'text-muted-foreground bg-card border-border hover:border-accent hover:bg-accent/10 hover:text-accent shadow-ink'}`}
						aria-label="Open Brain Dump & Chat"
						title="Brain Dump & Chat - AI-Powered Planning"
						btnType="container"
					>
						<div class="relative flex items-center justify-center">
							<!-- brain-bolt icon - responsive sizing with dithering, light/dark mode switching -->
							<!-- Light mode: light version by default, color on hover -->
							<img
								src="/brain-bolt.png"
								alt="Brain Dump & Chat"
								class="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-md object-cover transition-opacity duration-200 group-hover:opacity-0 dark:hidden"
							/>
							<!-- Light mode hover: colored version -->
							<img
								src="/brain-bolt.png"
								alt="Brain Dump & Chat"
								class="absolute inset-0 w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-md object-cover transition-opacity duration-200 opacity-0 group-hover:opacity-100 dark:hidden"
							/>
							<!-- Dark mode: dark version by default, color on hover -->
							<img
								src="/brain-bolt.png"
								alt="Brain Dump & Chat"
								class="hidden w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-md object-cover transition-opacity duration-200 group-hover:opacity-0 dark:block"
							/>
							<!-- Dark mode hover: colored version -->
							<img
								src="/brain-bolt.png"
								alt="Brain Dump & Chat"
								class="hidden absolute inset-0 w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-md object-cover transition-opacity duration-200 opacity-0 group-hover:opacity-100 dark:block"
							/>
							<!-- Overlay icon - changes based on modal state -->
							{#if showChatModal}
								<!-- Zap icon when modal is open - centered on brain-bolt -->
								<div
									class="absolute inset-0 flex items-center justify-center pointer-events-none"
								>
									<div class="relative">
										<!-- Glow effect for zap -->
										<div
											class="absolute inset-0 bg-accent rounded-full blur-md opacity-60 animate-pulse"
											style="transform: scale(2.5);"
										></div>
										<Zap
											class="w-4 h-5 sm:w-5 sm:h-6 text-accent relative z-10 drop-shadow-lg"
										/>
									</div>
								</div>
							{/if}
						</div>
						<!-- New user hint: pulsing dot only for users who haven't completed onboarding at all -->
						{#if user && !completedOnboarding && !showChatModal}
							<span class="absolute -top-1 -right-1 flex h-2.5 w-2.5">
								<span
									class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75"
								></span>
								<span
									class="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent"
								></span>
							</span>
						{/if}
						<!-- Text - Hidden on smaller screens, shown on larger -->
						<span class="hidden xl:inline-block leading-none">Brain Dump & Chat</span>
					</Button>
				{/if}

				{#if user}
					<!-- Onboarding CTA with enhanced styling -->
					{#if needsOnboarding}
						<div class="hidden md:block">
							<a
								href="/onboarding"
								data-onboarding-link
								onclick={() => handleMenuItemClick('/onboarding')}
								class="inline-flex items-center px-2 md:px-3 lg:px-3.5 xl:px-4 py-1.5 md:py-2 lg:py-2.5 text-xs md:text-sm lg:text-sm font-bold tracking-tight rounded-lg shadow-ink pressable transition-all duration-200 whitespace-nowrap tx tx-bloom tx-weak
								{onboardingUrgent
									? 'bg-warning text-warning-foreground hover:bg-warning/90 border border-warning/20'
									: 'bg-accent hover:bg-accent/90 text-accent-foreground border border-accent/20'}
								{loggingOut ? 'opacity-50 pointer-events-none' : ''}
								{loadingLink === '/onboarding' ? loadingAccentClass : ''}"
							>
								{#if onboardingUrgent}
									<AlertCircle
										class="w-3.5 h-3.5 md:w-4 md:h-4 lg:w-4 lg:h-4 mr-1 md:mr-1.5 lg:mr-2 flex-shrink-0 animate-pulse"
									/>
									<span class="hidden lg:inline">Complete Setup</span>
									<span class="lg:hidden">Setup</span>
								{:else}
									<Sparkles
										class="w-3.5 h-3.5 md:w-4 md:h-4 lg:w-4 lg:h-4 mr-1 md:mr-1.5 lg:mr-2 flex-shrink-0"
									/>
									<span class="hidden xl:inline"
										>Personalize ({onboardingProgress}%)</span
									>
									<span class="xl:hidden hidden lg:inline"
										>Setup ({onboardingProgress}%)</span
									>
									<span class="lg:hidden">Setup</span>
								{/if}
								<ChevronRight
									class="w-3 md:w-3.5 h-3 md:h-3.5 ml-1 md:ml-1.5 lg:ml-2 flex-shrink-0"
								/>
							</a>
						</div>
					{/if}

					<!-- Mobile menu button - styled to match brain-bolt button -->
					<Button
						onclick={toggleMobileMenu}
						data-mobile-menu-button
						disabled={loggingOut}
						variant="outline"
						size="sm"
						btnType="container"
						class="md:hidden flex items-center justify-center px-3 h-9 rounded border border-border bg-card shadow-ink hover:border-accent hover:bg-accent/10 pressable transition-all duration-200 tx tx-grain tx-weak group"
						aria-expanded={showMobileMenu}
						aria-label="Toggle mobile menu"
					>
						{#if showMobileMenu}
							<X
								class="w-7 h-7 text-muted-foreground group-hover:text-accent transition-colors"
							/>
						{:else}
							<Menu
								class="w-7 h-7 text-muted-foreground group-hover:text-accent transition-colors"
							/>
						{/if}
					</Button>

					<!-- Desktop User menu -->
					<div class="hidden md:block relative" data-user-menu>
						<Button
							onclick={toggleUserMenu}
							disabled={loggingOut}
							variant="outline"
							size="sm"
							btnType="container"
							class="flex items-center gap-1.5 px-3 h-9 text-xs md:text-sm rounded font-bold tracking-tight text-muted-foreground border border-border bg-card shadow-ink hover:border-accent hover:bg-accent/10 hover:text-accent pressable transition-all duration-100"
							aria-expanded={showUserMenu}
							aria-haspopup="true"
							aria-label="User menu"
						>
							<span
								class="max-w-20 md:max-w-24 lg:max-w-28 xl:max-w-32 truncate leading-none"
								>{userName}</span
							>
							{#if user?.is_admin}
								<Shield class="w-4 h-4 text-destructive" />
							{/if}
							{#if needsOnboarding}
								<div class="w-2 h-2 bg-warning rounded-full animate-pulse"></div>
							{/if}
						</Button>

						<!-- User dropdown -->
						{#if showUserMenu}
							<div
								class="absolute right-0 mt-2 w-56 bg-card rounded-lg border border-border shadow-ink-strong z-50 tx tx-frame tx-weak ink-frame animate-ink-in"
							>
								<div class="pt-1">
									<!-- User info -->
									<div class="px-4 py-3 text-sm border-b border-border">
										<div class="font-bold text-foreground flex items-center">
											{user?.name || 'User'}
											{#if user?.is_admin}
												<span
													class="ml-2 px-2 py-0.5 text-xs bg-destructive text-destructive-foreground rounded font-bold"
												>
													Admin
												</span>
											{/if}
										</div>
										<div class="text-muted-foreground truncate">
											{user.email}
										</div>
										{#if needsOnboarding}
											<div
												class="mt-2 text-xs text-accent flex items-center font-bold"
											>
												<AlertCircle class="w-3 h-3 mr-1" />
												Setup {onboardingProgress}% complete
											</div>
										{/if}
									</div>

									<!-- Menu items -->
									{#if needsOnboarding}
										<div class="px-3 pt-2 pb-1">
											<a
												href="/onboarding"
												onclick={() => handleMenuItemClick('/onboarding')}
												class="flex items-center w-full px-4 py-2.5 text-sm font-bold tracking-tight rounded-lg transition-all duration-200 shadow-ink pressable tx tx-bloom tx-weak
													{onboardingUrgent
													? 'bg-warning text-warning-foreground hover:bg-warning/90 border border-warning/20'
													: 'bg-accent hover:bg-accent/90 text-accent-foreground border border-accent/20'}
													{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
											>
												{#if onboardingUrgent}
													<AlertCircle
														class="w-4 h-4 mr-3 animate-pulse"
													/>
													Complete Setup
												{:else}
													<Sparkles class="w-4 h-4 mr-3" />
													Complete Setup
												{/if}
												<ChevronRight class="w-3.5 h-3.5 ml-auto" />
											</a>
										</div>
									{/if}

									<a
										href="/profile"
										onclick={() => handleMenuItemClick('/profile')}
										class="flex items-center w-full px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors
										{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
									>
										<User class="w-4 h-4 mr-3" />
										Profile & Settings
									</a>

									<a
										href="/notifications"
										onclick={() => handleMenuItemClick('/notifications')}
										class="flex items-center w-full px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors
										{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
									>
										<Bell class="w-4 h-4 mr-3" />
										Notifications
									</a>

									{#if hasPendingInvites}
										<a
											href="/invites"
											onclick={() => handleMenuItemClick('/invites')}
											class="flex items-center w-full px-4 py-1.5 text-xs font-semibold text-accent hover:text-accent/90 hover:bg-muted transition-colors
											{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
										>
											<span class="ml-7">Project invites</span>
											<span
												class="ml-auto inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[0.6rem] font-bold text-accent"
											>
												{pendingInviteCount}
											</span>
										</a>
									{/if}

									{#if stripeEnabled}
										<a
											href={subscription?.hasActiveSubscription
												? '/profile?tab=billing'
												: '/pricing'}
											onclick={() =>
												handleMenuItemClick(
													subscription?.hasActiveSubscription
														? '/profile?tab=billing'
														: '/pricing'
												)}
											class="flex items-center w-full px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors
											{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
										>
											<svg
												class="w-4 h-4 mr-3"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
												/>
											</svg>
											{subscription?.hasActiveSubscription
												? 'Billing'
												: 'Upgrade to Pro'}
										</a>
									{/if}

									{#if user?.is_admin}
										<a
											href="/admin"
											onclick={() => handleMenuItemClick('/admin')}
											class="flex items-center w-full px-4 py-2 text-sm font-bold text-destructive hover:bg-destructive/10 transition-colors
											{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
										>
											<Shield class="w-4 h-4 mr-3" />
											Admin Dashboard
										</a>
									{/if}

									<button
										onclick={toggleMode}
										class="flex items-center w-full px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors
										{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
										disabled={loggingOut}
										aria-label="Toggle theme"
									>
										{#if isDark}
											<Sun class="w-4 h-4 mr-3" />
											Light Mode
										{:else}
											<Moon class="w-4 h-4 mr-3" />
											Dark Mode
										{/if}
									</button>

									<Button
										onclick={handleSignOut}
										disabled={loggingOut}
										variant="ghost"
										size="sm"
										fullWidth
										btnType="container"
										loading={loggingOut}
										class="justify-start w-full px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-muted min-h-0 transition-colors rounded-none font-bold"
									>
										{#if loggingOut}
											<LoaderCircle class="w-4 h-4 mr-3 animate-spin" />
											Signing out...
										{:else}
											<LogOut class="w-4 h-4 mr-3" />
											Sign out
										{/if}
									</Button>
								</div>
							</div>
						{/if}
					</div>
				{:else}
					<!-- Auth buttons for non-authenticated users -->
					<div class="hidden md:flex items-center gap-2">
						<!-- Theme toggle button -->
						<button
							onclick={toggleMode}
							class="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors pressable"
							aria-label="Toggle theme"
						>
							{#if isDark}
								<Sun class="w-4 h-4" />
							{:else}
								<Moon class="w-4 h-4" />
							{/if}
						</button>
						<a
							href="/auth/login"
							class="px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-lg border border-border bg-card shadow-ink hover:bg-muted hover:border-accent/50 transition-colors pressable"
						>
							Log in
						</a>
						<a
							href="/auth/register"
							class="px-4 py-1.5 text-xs font-bold text-accent-foreground bg-accent rounded-lg shadow-ink hover:bg-accent/90 transition-colors pressable tx tx-bloom tx-weak"
						>
							Sign up free
						</a>
					</div>

					<!-- Mobile auth menu toggle - styled to match brain-bolt button -->
					<Button
						onclick={toggleMobileMenu}
						data-mobile-menu-button
						variant="outline"
						size="sm"
						btnType="container"
						class="md:hidden flex items-center justify-center px-3 h-9 rounded border border-border bg-card shadow-ink hover:border-accent hover:bg-accent/10 pressable transition-all duration-200 tx tx-grain tx-weak group"
						aria-expanded={showMobileMenu}
						aria-label="Toggle mobile menu"
					>
						{#if showMobileMenu}
							<X
								class="w-7 h-7 text-muted-foreground group-hover:text-accent transition-colors"
							/>
						{:else}
							<Menu
								class="w-7 h-7 text-muted-foreground group-hover:text-accent transition-colors"
							/>
						{/if}
					</Button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Mobile menu -->
	{#if showMobileMenu}
		<div class="md:hidden border-t border-border bg-card animate-ink-in" data-mobile-menu>
			{#if user}
				<!-- Mobile Brief Status -->
				<div class="px-3 pt-2 pb-2">
					<BriefStatusIndicator />
				</div>

				<!-- Mobile Navigation -->
				<div class="px-2 pt-1.5 pb-2 space-y-1">
					{#if needsOnboarding}
						<a
							href="/onboarding"
							onclick={() => handleMenuItemClick('/onboarding')}
							class="flex items-center px-3 py-2.5 text-base font-bold tracking-tight rounded-lg shadow-ink pressable transition-all duration-200 tx tx-bloom tx-weak
							{onboardingUrgent
								? 'bg-warning text-warning-foreground hover:bg-warning/90 border border-warning/20'
								: 'bg-accent hover:bg-accent/90 text-accent-foreground border border-accent/20'}
							{loggingOut ? 'opacity-50 pointer-events-none' : ''}
							{loadingLink === '/onboarding' ? loadingAccentClass : ''}"
						>
							{#if onboardingUrgent}
								<AlertCircle class="w-5 h-5 mr-3 animate-pulse" />
								Complete Setup ({onboardingProgress}%)
							{:else}
								<Sparkles class="w-5 h-5 mr-3" />
								Personalize BuildOS ({onboardingProgress}%)
							{/if}
							<ChevronRight class="w-4 h-4 ml-auto" />
						</a>
					{/if}

					{#each navItems as item}
						{@const Icon = item.icon}
						<a
							href={item.href}
							onclick={() => handleMenuItemClick(item.href)}
							class="relative flex items-center px-3 py-2 text-base font-bold rounded transition-colors
							{currentPath === item.href
								? 'text-accent bg-muted'
								: 'text-muted-foreground hover:text-foreground hover:bg-muted'}
							{loggingOut ? 'opacity-50 pointer-events-none' : ''}
							{loadingLink === item.href ? 'animate-pulse' : ''}"
						>
							<!-- Underline indicator for active route -->
							{#if currentPath === item.href}
								<div
									class="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-accent"
								></div>
							{/if}
							<Icon
								class="w-5 h-5 mr-3 {currentPath === item.href
									? 'text-accent'
									: 'text-muted-foreground'}"
							/>
							{item.label}
						</a>
					{/each}
				</div>

				<!-- Mobile User Section -->
				<div class="pt-3 pb-3 border-t border-border">
					<div class="px-3 mb-2.5">
						<div class="text-base font-medium text-foreground flex items-center">
							{user?.name || 'User'}
							{#if user?.is_admin}
								<span
									class="ml-2 px-2 py-0.5 text-xs bg-destructive/15 text-destructive rounded-full font-semibold"
								>
									Admin
								</span>
							{/if}
							{#if needsOnboarding}
								<div
									class="ml-2 w-2 h-2 bg-warning rounded-full animate-pulse"
								></div>
							{/if}
						</div>
						<div class="text-sm text-muted-foreground truncate">
							{user.email}
						</div>
						{#if needsOnboarding}
							<div class="mt-1 text-xs text-accent flex items-center">
								<AlertCircle class="w-3 h-3 mr-1" />
								Setup {onboardingProgress}% complete
							</div>
						{/if}
					</div>

					<div class="px-2 space-y-1">
						<a
							href="/profile"
							onclick={() => handleMenuItemClick('/profile')}
							class="flex items-center px-3 py-1.5 text-base font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors
							{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
						>
							<User class="w-5 h-5 mr-3" />
							Profile & Settings
						</a>

						<a
							href="/notifications"
							onclick={() => handleMenuItemClick('/notifications')}
							class="flex items-center px-3 py-1.5 text-base font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors
							{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
						>
							<Bell class="w-5 h-5 mr-3" />
							Notifications
						</a>

						{#if hasPendingInvites}
							<a
								href="/invites"
								onclick={() => handleMenuItemClick('/invites')}
								class="flex items-center px-3 py-1 text-sm font-semibold text-accent hover:text-accent/90 hover:bg-muted rounded-md transition-colors
								{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
							>
								<span class="ml-8">Project invites</span>
								<span
									class="ml-auto inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-bold text-accent"
								>
									{pendingInviteCount}
								</span>
							</a>
						{/if}

						{#if stripeEnabled}
							<a
								href={subscription?.hasActiveSubscription
									? '/profile?tab=billing'
									: '/pricing'}
								onclick={() =>
									handleMenuItemClick(
										subscription?.hasActiveSubscription
											? '/profile?tab=billing'
											: '/pricing'
									)}
								class="flex items-center px-3 py-1.5 text-base font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors
								{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
							>
								<svg
									class="w-5 h-5 mr-3"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
									/>
								</svg>
								{subscription?.hasActiveSubscription ? 'Billing' : 'Upgrade to Pro'}
							</a>
						{/if}

						{#if user?.is_admin}
							<a
								href="/admin"
								onclick={() => handleMenuItemClick('/admin')}
								class="flex items-center px-3 py-1.5 text-base font-bold text-destructive hover:text-destructive/80 hover:bg-destructive/10 rounded-md transition-colors
								{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
							>
								<Shield class="w-5 h-5 mr-3" />
								Admin Dashboard
							</a>
						{/if}

						<button
							onclick={toggleMode}
							class="flex items-center px-3 py-1.5 text-base font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors w-full
							{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
							disabled={loggingOut}
							aria-label="Toggle theme"
						>
							{#if isDark}
								<Sun class="w-5 h-5 mr-3" />
								Light Mode
							{:else}
								<Moon class="w-5 h-5 mr-3" />
								Dark Mode
							{/if}
						</button>

						<Button
							onclick={handleSignOut}
							disabled={loggingOut}
							variant="ghost"
							size="md"
							fullWidth
							icon={loggingOut ? LoaderCircle : LogOut}
							iconPosition="left"
							loading={loggingOut}
							class="justify-start px-3 py-1.5 text-muted-foreground hover:bg-muted min-h-0 font-bold"
						>
							{loggingOut ? 'Signing out...' : 'Sign out'}
						</Button>
					</div>
				</div>
			{:else}
				<!-- Mobile auth menu for non-authenticated users -->
				<div class="px-2 pt-1.5 pb-3 space-y-1">
					<a
						href="/#how"
						onclick={() => handleMenuItemClick('/#how')}
						class="block px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
					>
						How it works
					</a>
					<a
						href="/#stack"
						onclick={() => handleMenuItemClick('/#stack')}
						class="block px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
					>
						Under the hood
					</a>
					<div class="border-t border-border my-2"></div>
					<button
						onclick={toggleMode}
						class="flex items-center w-full px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
						aria-label="Toggle theme"
					>
						{#if isDark}
							<Sun class="w-4 h-4 mr-2" />
							Light Mode
						{:else}
							<Moon class="w-4 h-4 mr-2" />
							Dark Mode
						{/if}
					</button>
					<a
						href="/auth/login"
						onclick={() => handleMenuItemClick('/auth/login')}
						class="block px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
					>
						Log in
					</a>
					<a
						href="/auth/register"
						onclick={() => handleMenuItemClick('/auth/register')}
						class="block px-3 py-2.5 mt-2 text-sm font-bold text-center text-accent-foreground bg-accent hover:bg-accent/90 rounded-lg shadow-ink pressable tx tx-bloom tx-weak transition-colors"
					>
						Sign up free
					</a>
				</div>
			{/if}
		</div>
	{/if}
</nav>

<!-- Brain Dump & Chat Modal -->
{#if showChatModal}
	{#await import('$lib/components/agent/AgentChatModal.svelte') then { default: AgentChatModal }}
		<AgentChatModal
			isOpen={showChatModal}
			contextType={chatContextType}
			entityId={chatEntityId}
			autoInitProject={chatAutoInitProject}
			onClose={handleChatClose}
		/>
	{/await}
{/if}

<style>
	/* BuildOS Logo - Bloom effect on OS */
	.logo-os {
		position: relative;
		display: inline-block;
		color: hsl(var(--accent));
		padding: 0 0.08em;
	}

	/* Bloom radial glow behind OS */
	.logo-os::before {
		content: '';
		position: absolute;
		inset: -0.2em -0.15em;
		border-radius: 0.25em;
		/* Soft radial bloom gradient */
		background: radial-gradient(
			ellipse 100% 100% at 50% 55%,
			hsl(var(--accent) / 0.18) 0%,
			hsl(var(--accent) / 0.08) 50%,
			transparent 80%
		);
		z-index: -1;
		pointer-events: none;
		transition: opacity 0.2s ease;
	}

	/* Subtle dot texture overlay */
	.logo-os::after {
		content: '';
		position: absolute;
		inset: -0.15em -0.1em;
		border-radius: 0.2em;
		/* Tiny bloom dots */
		background-image: radial-gradient(
			circle at center,
			hsl(var(--accent) / 0.25) 0.5px,
			transparent 0.5px
		);
		background-size: 3px 3px;
		z-index: -1;
		pointer-events: none;
		opacity: 0.6;
		transition: opacity 0.2s ease;
	}

	/* Hover - intensify the bloom */
	:global(.group:hover) .logo-os::before {
		background: radial-gradient(
			ellipse 110% 110% at 50% 55%,
			hsl(var(--accent) / 0.25) 0%,
			hsl(var(--accent) / 0.12) 50%,
			transparent 85%
		);
	}

	:global(.group:hover) .logo-os::after {
		opacity: 0.8;
	}

	/* Dark mode - slightly brighter bloom */
	:global(.dark) .logo-os::before {
		background: radial-gradient(
			ellipse 100% 100% at 50% 55%,
			hsl(var(--accent) / 0.22) 0%,
			hsl(var(--accent) / 0.1) 50%,
			transparent 80%
		);
	}

	:global(.dark) .logo-os::after {
		background-image: radial-gradient(
			circle at center,
			hsl(var(--accent) / 0.3) 0.5px,
			transparent 0.5px
		);
		opacity: 0.5;
	}
</style>
