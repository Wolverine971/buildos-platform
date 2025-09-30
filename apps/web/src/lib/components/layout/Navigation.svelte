<!-- src/lib/components/layout/Navigation.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy, tick } from 'svelte';
	import {
		Brain,
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
		Zap
	} from 'lucide-svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import BriefStatusIndicator from './BriefStatusIndicator.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import BrainDumpModal from '$lib/components/brain-dump/BrainDumpModal.svelte';
	import { logout } from '$lib/utils/auth';
	import { toastService } from '$lib/stores/toast.store';
	import { browser } from '$app/environment';
	import { goto, invalidateAll, pushState } from '$app/navigation';

	export let user: any | null = null;
	export let completedOnboarding: boolean = false;
	export let onboardingProgress: number = 0;
	export let element: HTMLElement | null = null;
	export let stripeEnabled: boolean = false;
	export let subscription: any = null;

	// State management
	let showUserMenu = false;
	let showMobileMenu = false;
	let loggingOut = false;
	let loadingLink = ''; // Track which link is currently loading
	let logoutAttempts = 0; // Track logout attempts to prevent spam
	let showBrainDumpModal = false;
	let currentProject: any = null;
	let previousPath = '';

	// Navigation items
	const NAV_ITEMS = [
		{ href: '/', label: 'Dashboard', icon: Home },
		{ href: '/projects', label: 'Projects', icon: FolderOpen },
		{ href: '/history', label: 'History', icon: StickyNote }
	];

	// Computed values
	$: needsOnboarding = user && (!completedOnboarding || onboardingProgress < 100);
	$: onboardingUrgent = user && onboardingProgress < 50;
	$: userName = user?.name || user?.email || '';

	// Reactive tracking of current path - replaces page subscription for better performance
	$: currentPath = $page.url.pathname;
	$: {
		// Handle path changes
		if (currentPath !== previousPath) {
			previousPath = currentPath;
			loadingLink = ''; // Clear loading state when navigation completes
			closeAllMenus();
		}
	}
	// Extract current project from page data if on project page
	$: currentProject =
		currentPath.startsWith('/projects/') && $page.data?.project ? $page.data.project : null;

	// Enhanced logout handler with better error handling and prevention of spam clicks
	async function handleSignOut() {
		// Prevent multiple simultaneous logout attempts
		if (loggingOut || !browser) return;

		// Rate limiting to prevent spam clicks
		const now = Date.now();
		if (logoutAttempts > 0 && now - logoutAttempts < 2000) {
			return;
		}

		logoutAttempts = now;
		loggingOut = true;
		closeAllMenus();

		try {
			// Show immediate feedback
			toastService.info('Signing out...', { duration: 1000 });

			// Call the enhanced logout function
			await logout(
				'/auth/login?message=' + encodeURIComponent('You have been signed out successfully')
			);

			// Success feedback will be shown on the login page due to the message parameter
		} catch (error) {
			// Provide specific error messaging
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

			// Reset logout state on error so user can try again
			loggingOut = false;
		} finally {
			// Reset rate limiting after a delay
			setTimeout(() => {
				logoutAttempts = 0;
			}, 1000);
		}
	}

	// Removed automatic initialization of RealtimeBriefService
	// Service will be initialized only when user explicitly generates a brief

	// Menu management
	function closeAllMenus() {
		showMobileMenu = false;
		showUserMenu = false;
	}

	function toggleMobileMenu(e: Event) {
		if (loggingOut) return; // Prevent menu interactions during logout
		e.stopPropagation();
		showMobileMenu = !showMobileMenu;
		if (showMobileMenu) showUserMenu = false;
	}

	function toggleUserMenu(e: Event) {
		if (loggingOut) return; // Prevent menu interactions during logout
		e.stopPropagation();
		showUserMenu = !showUserMenu;
		if (showUserMenu) showMobileMenu = false;
	}

	// Enhanced click handler for menu items to close menus and handle loading states
	function handleMenuItemClick(href?: string) {
		if (loggingOut) return false; // Prevent navigation during logout

		if (href && href !== currentPath) {
			loadingLink = href; // Set loading state for this specific link
		}

		closeAllMenus();
		return true;
	}

	// Event handlers
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

	onMount(() => {
		if (!browser) return;

		// Add event listeners
		document.addEventListener('keydown', handleKeydown);
		document.addEventListener('click', handleClickOutside);

		// Cleanup function
		return () => {
			document.removeEventListener('keydown', handleKeydown);
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<nav
	data-fixed-element
	bind:this={element}
	class="sticky top-0 z-50 bg-white/90 dark:bg-gray-900/85 border-b border-gray-200/80 dark:border-gray-800/70 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md shadow-sm transition-colors"
>
	<div class="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 xl:px-8">
		<div class="flex justify-between items-center h-16 gap-2">
			<!-- Left side - Logo and Navigation -->
			<div class="flex items-center min-w-0 flex-1">
				<!-- Logo -->
				<div class="flex-shrink-0 flex items-center">
					<a
						href="/"
						class="flex items-center space-x-2 sm:space-x-3"
						on:click={() => handleMenuItemClick('/')}
					>
						<!-- Animated Logo Icon (only show when not on homepage or when user is logged in) -->
						{#if $page.url.pathname !== '/' || user?.id}
							<div class="relative logo-container">
								<!-- Animated glow effect -->
								<div class="logo-glow"></div>
								<!-- Image with gradient border -->
								<div class="logo-border">
									<img
										src="/brain-bolt.png"
										alt="BuildOS icon"
										class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover bg-black"
									/>
								</div>
							</div>
						{/if}
						<!-- Logo text -->
						<span
							class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white hidden xs:inline"
							>BuildOS</span
						>
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
						on:click={() => (showBrainDumpModal = true)}
						class={`relative flex items-center gap-2 px-3 h-9 rounded-lg font-medium text-xs md:text-sm transition-all duration-200 group border border-purple-300/50 dark:border-purple-500/60 bg-white/85 dark:bg-gray-900/45 shadow-[0_1px_3px_rgba(15,23,42,0.08)] hover:bg-purple-50/40 dark:hover:bg-purple-900/35 hover:text-purple-700 dark:hover:text-purple-200 hover:shadow-[0_4px_14px_rgba(99,102,241,0.12)] ${showBrainDumpModal ? 'text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-gray-200'}`}
						aria-label="Open Brain Dump"
						title="Brain Dump"
						btnType="container"
					>
						<div class="relative">
							<!-- Brain icon -->
							<Brain
								class="w-4 h-4 transition-all duration-200 text-purple-700 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-400"
							/>
							<!-- Overlay icon - changes based on modal state -->
							{#if showBrainDumpModal}
								<!-- Zap icon when modal is open -->
								<div class="absolute -top-1 -right-1">
									<div class="relative">
										<!-- Glow effect for zap -->
										<div
											class="absolute inset-0 bg-yellow-400 rounded-full blur-sm opacity-60 animate-pulse"
										></div>
										<Zap class="w-3 h-3 text-yellow-500 relative z-10" />
									</div>
								</div>
							{/if}
						</div>
						<!-- Text - Hidden on smaller screens, shown on larger -->
						<span class="hidden xl:inline-block leading-none">Brain Dump</span>
					</Button>
				{/if}

				<ThemeToggle />

				{#if user}
					<!-- Onboarding CTA -->
					{#if needsOnboarding}
						<div class="hidden md:block">
							<a
								href="/onboarding"
								data-onboarding-link
								on:click={() => handleMenuItemClick('/onboarding')}
								class="inline-flex items-center px-1.5 md:px-2 lg:px-2.5 xl:px-3 py-1 md:py-1.5 lg:py-2 text-xs md:text-xs lg:text-sm font-medium rounded-lg shadow-sm transition-all duration-200 transform hover:scale-105 whitespace-nowrap
								{onboardingUrgent
									? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white animate-pulse'
									: 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'}
								{loggingOut ? 'opacity-50 pointer-events-none' : ''}
								{loadingLink === '/onboarding' ? 'pulse' : ''}"
							>
								{#if onboardingUrgent}
									<AlertCircle
										class="w-3 h-3 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4 mr-0.5 md:mr-1 lg:mr-1.5 flex-shrink-0"
									/>
									<span class="hidden lg:inline">Complete Setup</span>
									<span class="lg:hidden">Setup</span>
								{:else}
									<Sparkles
										class="w-3 h-3 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4 mr-0.5 md:mr-1 lg:mr-1.5 flex-shrink-0"
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
									class="w-2.5 md:w-3 h-2.5 md:h-3 ml-0.5 md:ml-0.5 lg:ml-1 flex-shrink-0"
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
											class="flex items-center w-full px-4 py-2 text-sm text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors
											{loggingOut ? 'opacity-50 pointer-events-none' : ''}"
										>
											<Sparkles class="w-4 h-4 mr-3" />
											Complete Setup
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
							class="flex items-center px-3 py-2 text-base font-medium text-white rounded-md transition-colors
							{onboardingUrgent
								? 'bg-gradient-to-r from-amber-500 to-orange-500 animate-pulse'
								: 'bg-gradient-to-r from-blue-600 to-purple-600'}
							{loggingOut ? 'opacity-50 pointer-events-none' : ''}
							{loadingLink === '/onboarding' ? 'pulse-mobile' : ''}"
						>
							{#if onboardingUrgent}
								<AlertCircle class="w-5 h-5 mr-3" />
								Complete Setup ({onboardingProgress}%)
							{:else}
								<Sparkles class="w-5 h-5 mr-3" />
								Personalize BuildOS ({onboardingProgress}%)
							{/if}
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
	project={currentProject}
	showNavigationOnSuccess={true}
	on:close={() => {
		showBrainDumpModal = false;
	}}
/>

<style>
	/* Optimized logo animation - replaces heavy video */
	.logo-container {
		position: relative;
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
