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
		Loader2,
		Zap,
		Clock
	} from 'lucide-svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import BriefStatusIndicator from './BriefStatusIndicator.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import BrainDumpModal from '$lib/components/brain-dump/BrainDumpModal.svelte';
	import AgentChatModal from '$lib/components/agent/AgentChatModal.svelte';
	import {
		brainDumpV2Store,
		isModalOpen as brainDumpModalIsOpen
	} from '$lib/stores/brain-dump-v2.store';
	import { logout } from '$lib/utils/auth';
	import { toastService } from '$lib/stores/toast.store';
	import { browser, dev } from '$app/environment';
	import type { ChatContextType } from '@buildos/shared-types';

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

	const showBrainDumpModal = $derived($brainDumpModalIsOpen);
	const currentPath = $derived($page.url.pathname);
	const storeProject = $derived($brainDumpV2Store?.core?.selectedProject ?? null);
	const routeProject = $derived(
		currentPath.startsWith('/projects/') && $page.data?.project ? $page.data.project : null
	);
	const modalProject = $derived(storeProject ?? routeProject ?? null);

	// Context-aware chat configuration based on current page
	const chatContextType = $derived.by((): ChatContextType => {
		// Task page: /projects/[id]/tasks/[taskId]
		if (currentPath.match(/^\/projects\/[^/]+\/tasks\/[^/]+/)) {
			return 'task';
		}
		// Project page: /projects/[id]
		if (currentPath.match(/^\/projects\/[^/]+$/) && $page.data?.project) {
			return 'project_update';
		}
		// Default: global context
		return 'global';
	});

	const chatEntityId = $derived.by((): string | undefined => {
		// Task page: return task ID
		const taskMatch = currentPath.match(/^\/projects\/[^/]+\/tasks\/([^/]+)/);
		if (taskMatch) {
			return taskMatch[1];
		}
		// Project page: return project ID
		if (currentPath.match(/^\/projects\/([^/]+)$/) && $page.data?.project) {
			return $page.data.project.id;
		}
		// No entity
		return undefined;
	});

	const NAV_ITEMS = [
		{ href: '/', label: 'Dashboard', icon: Home },
		{ href: '/projects', label: 'Projects', icon: FolderOpen },
		{ href: '/time-blocks', label: 'Time Blocks', icon: Clock },
		{ href: '/history', label: 'History', icon: StickyNote }
	];

	const needsOnboarding = $derived(user && (!completedOnboarding || onboardingProgress < 100));
	const onboardingUrgent = $derived(user && onboardingProgress < 50);
	const userName = $derived(user?.name || user?.email || '');

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
			toastService.info('Signing out...', { duration: 1000 });

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

	function handleOpenBrainDump() {
		closeAllMenus();
		brainDumpV2Store.openModal({ resetSelection: true });
	}

	function handleBrainDumpClose() {
		brainDumpV2Store.closeModal();
	}

	function handleOpenChat() {
		closeAllMenus();
		showChatModal = true;
	}

	function handleChatClose() {
		showChatModal = false;
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

		return () => {
			themeObserver.disconnect();
			document.removeEventListener('keydown', handleKeydown);
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<nav
	data-fixed-element
	bind:this={element}
	class="sticky top-0 z-0 bg-white/90 dark:bg-gray-900/85 border-b border-gray-200/80 dark:border-gray-800/70 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md shadow-sm transition-colors"
>
	<div class="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 xl:px-8">
		<div class="flex justify-between items-center h-16 gap-2">
			<!-- Left side - Logo and Navigation -->
			<div class="flex items-center min-w-0 flex-1">
				<!-- Logo -->
				<div class="flex-shrink-0 flex items-center">
					<a href="/" class="flex items-center" on:click={() => handleMenuItemClick('/')}>
						<span class="sr-only">BuildOS</span>
						<span class="buildos-logo" aria-hidden="true">
							<span class="buildos-logo__word">Build</span>
							<span class="buildos-logo__accent">OS</span>
						</span>
					</a>
				</div>

				<!-- Desktop Navigation -->
				{#if user}
					<div
						class="hidden md:ml-3 lg:ml-4 xl:ml-6 2xl:ml-8 md:flex md:gap-0.5 lg:gap-0.5 xl:gap-1"
					>
						{#each NAV_ITEMS as item}
							<a
								href={item.href}
								on:click={() => handleMenuItemClick(item.href)}
								class="inline-flex items-center px-1.5 md:px-2 lg:px-2 xl:px-2.5 2xl:px-3 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-md transition-colors duration-200 whitespace-nowrap
								{currentPath === item.href
									? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
									: 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'}
								{loggingOut ? 'opacity-50 pointer-events-none' : ''}
								{loadingLink === item.href ? 'pulse' : ''}"
							>
								<svelte:component
									this={item.icon}
									class="w-3.5 md:w-4 h-3.5 md:h-4 mr-0.5 lg:mr-1 xl:mr-1.5 2xl:mr-2 flex-shrink-0 {currentPath ===
									item.href
										? 'text-blue-600 dark:text-blue-400'
										: 'text-gray-500 dark:text-gray-400'}"
								/>
								<span class="hidden lg:inline">{item.label}</span>
								<span class="lg:hidden">{item.label.split(' ')[0]}</span>
							</a>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Right side -->
			<div class="flex items-center gap-1.5 sm:gap-2 lg:gap-2 xl:gap-3 flex-shrink-0">
				{#if user}
					<!-- Brief Status (desktop only) -->
					<div class="hidden xl:block">
						<BriefStatusIndicator />
					</div>
					<!-- Brain Dump Button - Responsive design -->
					<Button
						variant="outline"
						size="sm"
						on:click={handleOpenBrainDump}
						class={`relative flex items-center gap-2 px-3 h-9 rounded-lg font-medium text-xs md:text-sm transition-all duration-200 group border-transparent dark:border-transparent bg-white/85 dark:bg-gray-900/45 shadow-[0_1px_3px_rgba(15,23,42,0.08)] hover:bg-purple-50/40 dark:hover:bg-purple-900/35 hover:text-purple-700 dark:hover:text-purple-200 hover:shadow-[0_4px_14px_rgba(99,102,241,0.12)] ${showBrainDumpModal ? 'text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-gray-200'}`}
						aria-label="Open Brain Dump"
						title="Brain Dump"
						btnType="container"
					>
						<div class="relative flex items-center justify-center">
							<!-- brain-bolt icon - responsive sizing -->
							<img
								src="/brain-bolt.png"
								alt="Brain Dump"
								class="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-md object-cover transition-transform group-hover:scale-105"
							/>
							<!-- Overlay icon - changes based on modal state -->
							{#if showBrainDumpModal}
								<!-- Zap icon when modal is open - centered on brain-bolt -->
								<div
									class="absolute inset-0 flex items-center justify-center pointer-events-none"
								>
									<div class="relative">
										<!-- Glow effect for zap -->
										<div
											class="absolute inset-0 bg-yellow-400 rounded-full blur-md opacity-70 animate-pulse"
											style="transform: scale(2.5);"
										></div>
										<Zap
											class="w-4 h-5 sm:w-5 sm:h-6 text-yellow-500 relative z-10 drop-shadow-lg"
										/>
									</div>
								</div>
							{/if}
						</div>
						<!-- Text - Hidden on smaller screens, shown on larger -->
						<span class="hidden xl:inline-block leading-none">Brain Dump</span>
					</Button>

					<!-- Multi-Agent Chat Button -->
					<Button
						variant="outline"
						size="sm"
						on:click={handleOpenChat}
						class={`relative flex items-center gap-2 px-3 h-9 rounded-lg font-medium text-xs md:text-sm transition-all duration-200 group border-transparent dark:border-transparent bg-white/85 dark:bg-gray-900/45 shadow-[0_1px_3px_rgba(15,23,42,0.08)] hover:bg-blue-50/40 dark:hover:bg-blue-900/35 hover:text-blue-700 dark:hover:text-blue-200 hover:shadow-[0_4px_14px_rgba(59,130,246,0.12)] ${showChatModal ? 'text-blue-700 dark:text-blue-300 bg-blue-50/40 dark:bg-blue-900/35' : 'text-gray-700 dark:text-gray-200'}`}
						aria-label="Open Multi-Agent Chat"
						title="Multi-Agent System - Planner + Executor Agents"
						btnType="container"
					>
						<Sparkles class="w-4 h-4 transition-transform group-hover:scale-110" />
						<span class="hidden xl:inline-block leading-none">Agents</span>
					</Button>
				{/if}

				<ThemeToggle />

				{#if user}
					<!-- Onboarding CTA with enhanced gradient styling -->
					{#if needsOnboarding}
						<div class="hidden md:block">
							<a
								href="/onboarding"
								data-onboarding-link
								on:click={() => handleMenuItemClick('/onboarding')}
								class="inline-flex items-center px-2 md:px-3 lg:px-3.5 xl:px-4 py-1.5 md:py-2 lg:py-2.5 text-xs md:text-sm lg:text-sm font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 whitespace-nowrap
								{onboardingUrgent
									? 'bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 hover:from-amber-600 hover:via-orange-600 hover:to-red-600 text-white animate-pulse border-none'
									: 'bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 hover:from-purple-700 hover:via-blue-700 hover:to-indigo-700 text-white border-none'}
								{loggingOut ? 'opacity-50 pointer-events-none' : ''}
								{loadingLink === '/onboarding' ? 'pulse' : ''}"
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

					<!-- Mobile menu button -->
					<Button
						on:click={toggleMobileMenu}
						data-mobile-menu-button
						disabled={loggingOut}
						variant="ghost"
						size="sm"
						icon={showMobileMenu ? X : Menu}
						class="md:hidden p-2 text-gray-400 hover:text-gray-500 min-h-0"
						aria-expanded={showMobileMenu}
						aria-label="Toggle mobile menu"
					></Button>

					<!-- Desktop User menu -->
					<div class="hidden md:block relative" data-user-menu>
						<Button
							on:click={toggleUserMenu}
							disabled={loggingOut}
							variant="outline"
							size="sm"
							btnType="container"
							class="flex items-center gap-1.5 px-3 h-9 text-xs md:text-sm rounded-lg text-gray-700 dark:text-gray-200 border border-purple-300/50 dark:border-purple-500/60 bg-white/85 dark:bg-gray-900/45 shadow-[0_1px_3px_rgba(15,23,42,0.08)] hover:bg-purple-50/40 dark:hover:bg-purple-900/35 hover:text-purple-700 dark:hover:text-purple-200 hover:shadow-[0_4px_14px_rgba(99,102,241,0.12)]"
							aria-expanded={showUserMenu}
							aria-haspopup="true"
							aria-label="User menu"
						>
							<span
								class="max-w-20 md:max-w-24 lg:max-w-28 xl:max-w-32 truncate leading-none"
								>{userName}</span
							>
							{#if user?.is_admin}
								<Shield class="w-4 h-4 text-red-500" />
							{/if}
							{#if needsOnboarding}
								<div class="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
							{/if}
						</Button>

						<!-- User dropdown -->
						{#if showUserMenu}
							<div
								class="absolute right-0 mt-2 w-56 bg-white/95 dark:bg-gray-800/95 rounded-xl border border-gray-100 dark:border-gray-700/70 shadow-xl ring-1 ring-black/5 dark:ring-gray-600/40 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md z-50"
							>
								<div class="pt-1">
									<!-- User info -->
									<div
										class="px-4 py-3 text-sm border-b border-gray-100 dark:border-gray-700"
									>
										<div
											class="font-medium text-gray-900 dark:text-white flex items-center"
										>
											{user?.name || 'User'}
											{#if user?.is_admin}
												<span
													class="ml-2 px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full dark:bg-red-900 dark:text-red-300"
												>
													Admin
												</span>
											{/if}
										</div>
										<div class="text-gray-500 dark:text-gray-400 truncate">
											{user.email}
										</div>
										{#if needsOnboarding}
											<div
												class="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center"
											>
												<AlertCircle class="w-3 h-3 mr-1" />
												Setup {onboardingProgress}% complete
											</div>
										{/if}
									</div>

									<!-- Menu items -->
									{#if needsOnboarding}
										<a
											href="/onboarding"
											on:click={() => handleMenuItemClick('/onboarding')}
											class="flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-lg mx-2 mb-2 transition-all duration-200
												{onboardingUrgent
												? 'bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 hover:from-amber-600 hover:via-orange-600 hover:to-red-600 text-white shadow-md'
												: 'bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 hover:from-purple-700 hover:via-blue-700 hover:to-indigo-700 text-white shadow-md'}
												{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
										>
											{#if onboardingUrgent}
												<AlertCircle class="w-4 h-4 mr-3" />
												Complete Setup
											{:else}
												<Sparkles class="w-4 h-4 mr-3" />
												Complete Setup
											{/if}
											<ChevronRight class="w-3.5 h-3.5 ml-auto" />
										</a>
									{/if}

									<a
										href="/profile"
										on:click={() => handleMenuItemClick('/profile')}
										class="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors
										{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
									>
										<User class="w-4 h-4 mr-3" />
										Profile & Settings
									</a>

									{#if stripeEnabled}
										<a
											href={subscription?.hasActiveSubscription
												? '/profile?tab=billing'
												: '/pricing'}
											on:click={() =>
												handleMenuItemClick(
													subscription?.hasActiveSubscription
														? '/profile?tab=billing'
														: '/pricing'
												)}
											class="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors
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
											on:click={() => handleMenuItemClick('/admin')}
											class="flex items-center w-full px-4 py-2 text-sm text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors
											{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
										>
											<Shield class="w-4 h-4 mr-3" />
											Admin Dashboard
										</a>
									{/if}

									<Button
										on:click={handleSignOut}
										disabled={loggingOut}
										variant="ghost"
										size="sm"
										fullWidth
										btnType="container"
										loading={loggingOut}
										class="justify-start w-full px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 min-h-0 transition-colors rounded-none"
									>
										{#if loggingOut}
											<Loader2 class="w-4 h-4 mr-3 animate-spin" />
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
					<div class="hidden md:flex items-center gap-2 lg:gap-3">
						<a
							href="/auth/login"
							class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
						>
							Sign In
						</a>
						<a
							href="/auth/register"
							class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
						>
							Sign Up
						</a>
					</div>

					<!-- Mobile auth menu toggle -->
					<Button
						on:click={toggleMobileMenu}
						data-mobile-menu-button
						variant="ghost"
						size="sm"
						icon={showMobileMenu ? X : Menu}
						class="md:hidden p-2 text-gray-400 hover:text-gray-500 min-h-0"
						aria-expanded={showMobileMenu}
					></Button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Mobile menu -->
	{#if showMobileMenu}
		<div
			class="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
			data-mobile-menu
		>
			{#if user}
				<!-- Mobile Brief Status -->
				<div class="px-4 pt-3 pb-2">
					<BriefStatusIndicator />
				</div>

				<!-- Mobile Navigation -->
				<div class="px-2 pt-2 pb-3 space-y-1">
					{#if needsOnboarding}
						<a
							href="/onboarding"
							on:click={() => handleMenuItemClick('/onboarding')}
							class="flex items-center px-4 py-3 text-base font-semibold text-white rounded-xl shadow-lg transition-all duration-300 hover:scale-[1.02]
							{onboardingUrgent
								? 'bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 hover:from-amber-600 hover:via-orange-600 hover:to-red-600 animate-pulse'
								: 'bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 hover:from-purple-700 hover:via-blue-700 hover:to-indigo-700'}
							{loggingOut ? 'opacity-50 pointer-events-none' : ''}
							{loadingLink === '/onboarding' ? 'pulse-mobile' : ''}"
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

					{#each NAV_ITEMS as item}
						<a
							href={item.href}
							on:click={() => handleMenuItemClick(item.href)}
							class="flex items-center px-3 py-2 text-base font-medium rounded-md transition-colors
							{currentPath === item.href
								? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
								: 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'}
							{loggingOut ? 'opacity-50 pointer-events-none' : ''}
							{loadingLink === item.href ? 'pulse-mobile' : ''}"
						>
							<svelte:component
								this={item.icon}
								class="w-5 h-5 mr-3 {currentPath === item.href
									? 'text-blue-600 dark:text-blue-400'
									: 'text-gray-500 dark:text-gray-400'}"
							/>
							{item.label}
						</a>
					{/each}
				</div>

				<!-- Mobile User Section -->
				<div class="pt-4 pb-3 border-t border-gray-200 dark:border-gray-700">
					<div class="px-4 mb-3">
						<div
							class="text-base font-medium text-gray-800 dark:text-gray-200 flex items-center"
						>
							{user?.name || 'User'}
							{#if user?.is_admin}
								<span
									class="ml-2 px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full dark:bg-red-900 dark:text-red-300"
								>
									Admin
								</span>
							{/if}
							{#if needsOnboarding}
								<div
									class="ml-2 w-2 h-2 bg-amber-500 rounded-full animate-pulse"
								></div>
							{/if}
						</div>
						<div class="text-sm text-gray-500 dark:text-gray-400 truncate">
							{user.email}
						</div>
						{#if needsOnboarding}
							<div
								class="mt-1 text-xs text-amber-600 dark:text-amber-400 flex items-center"
							>
								<AlertCircle class="w-3 h-3 mr-1" />
								Setup {onboardingProgress}% complete
							</div>
						{/if}
					</div>

					<div class="px-2 space-y-1">
						<a
							href="/profile"
							on:click={() => handleMenuItemClick('/profile')}
							class="flex items-center px-3 py-2 text-base font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors
							{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
						>
							<User class="w-5 h-5 mr-3" />
							Profile & Settings
						</a>

						{#if stripeEnabled}
							<a
								href={subscription?.hasActiveSubscription
									? '/profile?tab=billing'
									: '/pricing'}
								on:click={() =>
									handleMenuItemClick(
										subscription?.hasActiveSubscription
											? '/profile?tab=billing'
											: '/pricing'
									)}
								class="flex items-center px-3 py-2 text-base font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors
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
								on:click={() => handleMenuItemClick('/admin')}
								class="flex items-center px-3 py-2 text-base font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors
								{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
							>
								<Shield class="w-5 h-5 mr-3" />
								Admin Dashboard
							</a>
						{/if}

						<Button
							on:click={handleSignOut}
							disabled={loggingOut}
							variant="ghost"
							size="md"
							fullWidth
							icon={loggingOut ? Loader2 : LogOut}
							iconPosition="left"
							loading={loggingOut}
							class="justify-start px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 min-h-0"
						>
							{loggingOut ? 'Signing out...' : 'Sign out'}
						</Button>
					</div>
				</div>
			{:else}
				<!-- Mobile auth menu for non-authenticated users -->
				<div class="px-2 pt-2 pb-3 space-y-1">
					<a
						href="/auth/login"
						on:click={() => handleMenuItemClick('/auth/login')}
						class="block px-3 py-2 text-base font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
					>
						Sign In
					</a>
					<a
						href="/auth/register"
						on:click={() => handleMenuItemClick('/auth/register')}
						class="block px-3 py-2 text-base font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-md transition-colors"
					>
						Sign Up
					</a>
				</div>
			{/if}
		</div>
	{/if}
</nav>

<!-- Brain Dump Modal -->
<BrainDumpModal
	isOpen={showBrainDumpModal}
	project={modalProject}
	showNavigationOnSuccess={true}
	on:close={handleBrainDumpClose}
	on:openAgent={handleOpenChat}
/>

<!-- Multi-Agent Chat Modal -->
{#if showChatModal && dev}
	<AgentChatModal
		isOpen={showChatModal}
		contextType={chatContextType}
		entityId={chatEntityId}
		onClose={handleChatClose}
	/>
{/if}

<style>
	/* Optimized logo animation - replaces heavy video */
	.logo-container {
		position: relative;
	}

	/* Recreated BuildOS wordmark as text to replace legacy image */
	.buildos-logo {
		display: inline-flex;
		align-items: baseline;
		font-family:
			'SF Pro Display',
			'SF Pro Text',
			'Helvetica Neue',
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		font-weight: 700;
		font-size: clamp(1.55rem, 2.4vw, 1.85rem);
		letter-spacing: -0.045em;
		line-height: 1;
		gap: 0.05em;
		padding-inline: 0.1rem;
	}

	.buildos-logo__word {
		color: #0f172a;
		letter-spacing: -0.04em;
		padding-left: 3px;
	}

	.buildos-logo__accent {
		padding-right: 3px;
		background: linear-gradient(120deg, #1d4ed8 0%, #4338ca 45%, #7c3aed 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		letter-spacing: -0.06em;
		text-shadow: 0 6px 16px rgba(79, 70, 229, 0.25);
	}

	:global(.dark) .buildos-logo__word {
		color: #f8fafc;
	}

	:global(.dark) .buildos-logo__accent {
		/* background: linear-gradient(118deg, #bfdbfe 0%, #c7d2fe 35%, #ddd6fe 65%, #ede9fe 100%); */
		text-shadow: 0 10px 22px rgba(148, 163, 246, 0.45);
		filter: drop-shadow(0 6px 14px rgba(29, 78, 216, 0.28));
	}

	.logo-glow {
		position: absolute;
		inset: -4px;
		background: linear-gradient(90deg, rgb(96 165 250), rgb(168 85 247), rgb(96 165 250));
		background-size: 200% 200%;
		border-radius: 0.5rem;
		filter: blur(4px);
		opacity: 0.4;
		animation: glow-pulse 3s ease-in-out infinite;
	}

	@keyframes glow-pulse {
		0%,
		100% {
			opacity: 0.4;
			background-position: 0% 50%;
		}
		50% {
			opacity: 0.6;
			background-position: 100% 50%;
		}
	}

	.logo-border {
		position: relative;
		background: linear-gradient(135deg, rgb(59 130 246), rgb(147 51 234));
		padding: 2px;
		border-radius: 0.5rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	/* Disable animations for users who prefer reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.logo-glow {
			animation: none;
			opacity: 0.4;
		}
	}
</style>
