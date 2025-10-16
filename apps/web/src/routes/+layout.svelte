<!-- apps/web/src/routes/+layout.svelte -->
<script lang="ts">
	import '../app.css';
	import '$lib/styles/pwa.css';
	import { ModeWatcher } from 'mode-watcher';
	import { setContext, onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { goto, replaceState, onNavigate } from '$app/navigation';
	import { createSupabaseBrowser } from '$lib/supabase';
	import { navigationStore } from '$lib/stores/navigation.store';
	import Navigation from '$lib/components/layout/Navigation.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import IOSSplashScreens from '$lib/components/layout/IOSSplashScreens.svelte';
	import { initializePWAEnhancements, setupInstallPrompt } from '$lib/utils/pwa-enhancements';
	import type { LayoutData } from './$types';

	// Enable View Transitions API ONLY for specific navigations to improve performance
	onNavigate((navigation) => {
		const from = navigation.from?.route.id;
		const to = navigation.to?.route.id;

		// Only use view transitions for projects list <-> detail navigation
		const shouldTransition =
			(from === '/projects' && to === '/projects/[id]') ||
			(from === '/projects/[id]' && to === '/projects') ||
			(from === '/projects/[id]' && to === '/projects/[id]');

		// Check if browser supports view transitions and if we should use them
		if (!shouldTransition || !document.startViewTransition) {
			return; // Skip view transition for better performance
		}

		return new Promise((fulfillNavigation) => {
			document.startViewTransition(async () => {
				fulfillNavigation();
				await navigation.complete;
			});
		});
	});

	// Notification system integration
	import NotificationStackManager from '$lib/components/notifications/NotificationStackManager.svelte';
	import {
		initBrainDumpNotificationBridge,
		cleanupBrainDumpNotificationBridge
	} from '$lib/services/brain-dump-notification.bridge';
	import {
		initPhaseGenerationNotificationBridge,
		cleanupPhaseGenerationNotificationBridge
	} from '$lib/services/phase-generation-notification.bridge';
	import {
		initCalendarAnalysisNotificationBridge,
		cleanupCalendarAnalysisNotificationBridge
	} from '$lib/services/calendar-analysis-notification.bridge';
	import {
		initProjectSynthesisNotificationBridge,
		cleanupProjectSynthesisNotificationBridge
	} from '$lib/services/project-synthesis-notification.bridge';

	export let data: LayoutData;

	// Pre-load components that are commonly used
	let OnboardingModal: any = null;
	let ToastContainer: any = null;
	let toastService: any = null;
	let PaymentWarning: any = null;
	let TrialBanner: any = null;
	let BackgroundJobIndicator: any = null;

	// PERFORMANCE: Memoize route calculations to prevent unnecessary recalculations
	let currentRouteId = '';
	let routeBasedState = {
		showNavigation: true,
		showFooter: true,
		needsOnboarding: false,
		showOnboardingModal: false
	};

	// Simplified state management
	let navigationElement: HTMLElement | null = null;
	let modalElement: HTMLElement | null = null;
	let animatingDismiss = false;

	// Create supabase client once and memoize
	const supabase = browser ? createSupabaseBrowser() : null;
	if (supabase) {
		setContext('supabase', supabase);
	}

	// PERFORMANCE: Reactive data with memoization
	$: user = data.user;
	$: completedOnboarding = data.completedOnboarding;
	$: onboardingProgress = data.onboardingProgress;
	$: paymentWarnings = data.paymentWarnings || [];
	$: trialStatus = data.trialStatus;
	$: isReadOnly = data.isReadOnly || false;

	// PERFORMANCE: Only recalculate route-dependent values when route actually changes
	$: if ($page.route?.id !== currentRouteId && browser) {
		currentRouteId = $page.route?.id || '';

		const newShowNavigation = !currentRouteId.startsWith('/auth');
		const newShowFooter = !currentRouteId.startsWith('/auth');
		const newNeedsOnboarding = Boolean(user && !completedOnboarding);

		// Calculate onboarding modal state
		const isHomePage = $page?.url?.pathname === '/';
		const forceOnboarding = $page?.url?.searchParams.get('onboarding') === 'true';
		const newShowOnboardingModal =
			newNeedsOnboarding &&
			isHomePage &&
			(forceOnboarding || (onboardingProgress < 25 && !checkModalDismissed())) &&
			!animatingDismiss;

		// Only update state if something actually changed
		if (
			routeBasedState.showNavigation !== newShowNavigation ||
			routeBasedState.showFooter !== newShowFooter ||
			routeBasedState.needsOnboarding !== newNeedsOnboarding ||
			routeBasedState.showOnboardingModal !== newShowOnboardingModal
		) {
			routeBasedState = {
				showNavigation: newShowNavigation,
				showFooter: newShowFooter,
				needsOnboarding: newNeedsOnboarding,
				showOnboardingModal: newShowOnboardingModal
			};
		}

		// Clean up onboarding URL parameter after handling
		if (forceOnboarding && browser) {
			const url = new URL($page.url);
			url.searchParams.delete('onboarding');
			replaceState(url.toString(), {});
		}
	}

	// Destructure for template use
	$: ({ showNavigation, showFooter, needsOnboarding, showOnboardingModal } = routeBasedState);

	// PERFORMANCE: Load authenticated resources with better caching
	let resourcesLoadPromise: Promise<void> | null = null;
	let resourcesLoaded = false;

	$: if (browser && user && !resourcesLoaded && !resourcesLoadPromise) {
		resourcesLoadPromise = loadAuthenticatedResources();
	}

	async function loadAuthenticatedResources(): Promise<void> {
		if (resourcesLoaded) return;

		try {
			// Load all authenticated resources in parallel with timeout
			const timeoutPromise = new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Resource loading timeout')), 10000)
			);

			const loadPromise = Promise.all([
				import('$lib/stores/toast.store'),
				import('$lib/components/onboarding/OnboardingModal.svelte'),
				import('$lib/components/ui/ToastContainer.svelte'),
				import('$lib/components/notifications/PaymentWarning.svelte'),
				import('$lib/components/trial/TrialBanner.svelte'),
				import('$lib/components/BackgroundJobIndicator.svelte')
			]);

			const [
				toastServiceModule,
				onboardingModalModule,
				toastContainerModule,
				paymentWarningModule,
				trialBannerModule,
				backgroundJobIndicatorModule
			] = (await Promise.race([loadPromise, timeoutPromise])) as any;

			toastService = toastServiceModule.toastService;
			OnboardingModal = onboardingModalModule.default;
			ToastContainer = toastContainerModule.default;
			PaymentWarning = paymentWarningModule.default;
			TrialBanner = trialBannerModule.default;
			BackgroundJobIndicator = backgroundJobIndicatorModule.default;

			resourcesLoaded = true;
			resourcesLoadPromise = null;
		} catch (error) {
			console.error('Failed to load authenticated resources:', error);
			resourcesLoadPromise = null; // Reset to allow retry
		}
	}

	function checkModalDismissed(): boolean {
		if (!browser) return false;
		try {
			return localStorage.getItem('onboarding_modal_dismissed') === 'true';
		} catch {
			return false;
		}
	}

	// PERFORMANCE: Debounced event handlers to prevent rapid fire
	let briefCompleteTimeout: number | null = null;
	let briefNotificationTimeout: number | null = null;

	function handleBriefComplete() {
		if (briefCompleteTimeout) return;

		briefCompleteTimeout = setTimeout(() => {
			toastService?.success('Daily brief generated successfully!');
			briefCompleteTimeout = null;
		}, 100) as any;
	}

	function handleBriefNotification(event: CustomEvent) {
		if (!toastService || briefNotificationTimeout) return;

		briefNotificationTimeout = setTimeout(() => {
			const { title, body, type } = event.detail;
			const message = `${title}: ${body}`;

			switch (type) {
				case 'success':
					toastService.success(message);
					break;
				case 'error':
					toastService.error(message);
					break;
				case 'warning':
					toastService.warning(message);
					break;
				default:
					toastService.info(message);
			}
			briefNotificationTimeout = null;
		}, 100) as any;
	}

	async function handleModalDismiss() {
		if (animatingDismiss) return;

		animatingDismiss = true;

		try {
			// Simple fade out animation
			if (modalElement) {
				modalElement.style.transition = 'opacity 0.3s ease';
				modalElement.style.opacity = '0';
				await new Promise((resolve) => setTimeout(resolve, 300));
			}

			// Update state
			routeBasedState = {
				...routeBasedState,
				showOnboardingModal: false
			};

			if (browser) {
				try {
					localStorage.setItem('onboarding_modal_dismissed', 'true');
				} catch (error) {
					console.warn('Failed to save modal dismissal:', error);
				}
			}
		} catch (error) {
			console.error('Error during modal dismiss:', error);
		} finally {
			animatingDismiss = false;
		}
	}

	// PERFORMANCE: Initialize visitor tracking with better error handling and timing
	let visitorTrackingInitialized = false;

	function initializeVisitorTracking() {
		if (visitorTrackingInitialized || !browser) return;

		visitorTrackingInitialized = true;

		// Use requestIdleCallback for non-critical background tasks
		const initVisitor = async () => {
			try {
				const { visitorService } = await import('$lib/services/visitor.service');
				await visitorService.initialize();
			} catch (error) {
				// Silent failure for visitor tracking
				console.warn('Visitor tracking initialization failed:', error);
			}
		};

		if ('requestIdleCallback' in window) {
			requestIdleCallback(initVisitor, { timeout: 5000 });
		} else {
			setTimeout(initVisitor, 2000);
		}
	}

	onMount(() => {
		if (!browser) return;

		// Initialize PWA enhancements
		initializePWAEnhancements();
		setupInstallPrompt();

		// Initialize notification bridges
		initBrainDumpNotificationBridge();
		initPhaseGenerationNotificationBridge();
		initCalendarAnalysisNotificationBridge();
		initProjectSynthesisNotificationBridge();

		// Pre-load authenticated resources if user is already available
		if (user) {
			loadAuthenticatedResources();
		}

		// Subscribe to navigation store for global navigation handling
		const unsubscribeNav = navigationStore.subscribe(async (request) => {
			if (request && request.url) {
				console.log('[Layout] Navigation request received:', request.url);
				try {
					// Perform navigation at the root level
					await goto(request.url);
					console.log('[Layout] Navigation successful to:', request.url);
				} catch (error) {
					console.error('[Layout] Navigation failed:', error);
					// Fallback to hard navigation
					window.location.href = request.url;
				}
			}
		});

		// Add event listeners with better error handling
		const handleBriefCompleteWrapper = (event: Event) => {
			try {
				handleBriefComplete();
			} catch (error) {
				console.error('Error in brief complete handler:', error);
			}
		};

		const handleBriefNotificationWrapper = (event: CustomEvent) => {
			try {
				handleBriefNotification(event);
			} catch (error) {
				console.error('Error in brief notification handler:', error);
			}
		};

		window.addEventListener('briefGenerationComplete', handleBriefCompleteWrapper);
		window.addEventListener(
			'briefNotification',
			handleBriefNotificationWrapper as EventListener
		);

		// Initialize visitor tracking in background
		initializeVisitorTracking();

		// Return cleanup function
		return () => {
			window.removeEventListener('briefGenerationComplete', handleBriefCompleteWrapper);
			window.removeEventListener(
				'briefNotification',
				handleBriefNotificationWrapper as EventListener
			);
			// Cleanup navigation store subscription
			unsubscribeNav();
		};
	});

	onDestroy(() => {
		// FIXED: Comprehensive cleanup to prevent memory leaks
		if (browser) {
			// Cleanup notification bridges
			cleanupBrainDumpNotificationBridge();
			cleanupPhaseGenerationNotificationBridge();
			cleanupCalendarAnalysisNotificationBridge();
			cleanupProjectSynthesisNotificationBridge();

			// Clear any pending timeouts
			if (briefCompleteTimeout) {
				clearTimeout(briefCompleteTimeout);
				briefCompleteTimeout = null;
			}
			if (briefNotificationTimeout) {
				clearTimeout(briefNotificationTimeout);
				briefNotificationTimeout = null;
			}

			// Reset promises and state
			resourcesLoadPromise = null;
			resourcesLoaded = false;
			visitorTrackingInitialized = false;
		}
	});

	// PERFORMANCE: Memoize component props to prevent unnecessary re-renders
	$: navigationProps = { user, completedOnboarding, onboardingProgress };
	$: footerProps = { user };
	$: onboardingModalProps = {
		isOpen: showOnboardingModal || animatingDismiss,
		onDismiss: handleModalDismiss
	};

	// Handle payment warning dismissal
	async function handlePaymentWarningDismiss(event: CustomEvent) {
		const { id } = event.detail;
		if (!supabase || !id) return;

		try {
			await supabase
				.from('user_notifications')
				.update({ dismissed_at: new Date().toISOString() })
				.eq('id', id);

			// Remove from local state
			paymentWarnings = paymentWarnings.filter((w) => w.id !== id);
		} catch (error) {
			console.error('Error dismissing payment warning:', error);
		}
	}
</script>

<svelte:head>
	<title>BuildOS - Your Personal Operating System</title>
	<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
	<meta name="theme-color" content="#111827" />

	<!-- Open Graph / Social Media -->
	<meta property="og:site_name" content="BuildOS" />
	<meta property="og:title" content="BuildOS - The Productivity System for the Builder" />
	<meta
		property="og:description"
		content="AI-powered productivity platform for ADHD minds that transforms unstructured thoughts into actionable plans."
	/>
	<meta property="og:type" content="website" />

	<!-- PERFORMANCE: Preload critical fonts -->
	<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin="anonymous" />
	<link rel="dns-prefetch" href="https://fonts.gstatic.com" />
</svelte:head>

<ModeWatcher />
<IOSSplashScreens />

<div class="layout-container">
	<!-- Skip to main content link for accessibility -->
	<a
		href="#main-content"
		class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-md z-50"
	>
		Skip to main content
	</a>

	{#if showNavigation}
		<Navigation bind:element={navigationElement} {...navigationProps} />
	{/if}

	{#if user && trialStatus && TrialBanner && data.stripeEnabled}
		<svelte:component this={TrialBanner} {user} />
	{/if}

	{#if paymentWarnings.length > 0 && PaymentWarning}
		<div class="container mx-auto px-4 sm:px-6 lg:px-8 mt-4">
			{#each paymentWarnings as warning (warning.id)}
				<svelte:component
					this={PaymentWarning}
					notification={warning}
					on:dismiss={handlePaymentWarningDismiss}
				/>
			{/each}
		</div>
	{/if}

	<main id="main-content" class="main-content {showNavigation ? '' : 'min-h-screen'} !my-4">
		<slot />
	</main>

	{#if showFooter}
		<Footer {...footerProps} />
	{/if}

	{#if needsOnboarding && OnboardingModal}
		<svelte:component
			this={OnboardingModal}
			bind:element={modalElement}
			{...onboardingModalProps}
		/>
	{/if}

	{#if ToastContainer}
		<div
			aria-live="polite"
			aria-atomic="true"
			class="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:p-6 z-50"
		>
			<svelte:component this={ToastContainer} />
		</div>
	{/if}

	<!-- Background Job Status Indicator -->
	{#if BackgroundJobIndicator}
		<svelte:component this={BackgroundJobIndicator} />
	{/if}

	<!-- Notification System -->
	<NotificationStackManager />
</div>

<style>
	.layout-container {
		min-height: 100vh;
		min-height: 100dvh;
		background-color: rgb(249 250 251);
		display: flex;
		flex-direction: column;
		overflow-x: hidden;
		max-width: 100vw;
		padding: 0;
		padding-left: max(0px, env(safe-area-inset-left));
		padding-right: max(0px, env(safe-area-inset-right));

		/* PERFORMANCE: Enable hardware acceleration for better performance */
		/* transform: translateZ(0); */
		-webkit-backface-visibility: hidden;
		backface-visibility: hidden;
	}

	:global(.dark) .layout-container {
		background-color: rgb(17 24 39);
	}

	.main-content {
		flex: 1;
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
		overflow-x: hidden;
		position: relative;

		/* PERFORMANCE: Optimize rendering */
		/* contain: layout style; */
	}

	/* RESPONSIVE: Optimized breakpoints for better performance */
	@media (max-width: 640px) {
		.layout-container {
			-webkit-overflow-scrolling: touch;
			-webkit-text-size-adjust: 100%;
		}
		.main-content {
			max-width: 100%;
			padding: 0;
		}
	}

	@media (min-width: 641px) and (max-width: 1023px) {
		.main-content {
			max-width: 768px;
			padding: 0 1rem;
		}
	}

	@media (min-width: 1024px) {
		.main-content {
			max-width: 1200px;
			padding: 0 2rem;
		}
	}

	@media (min-width: 1240px) {
		.main-content {
			padding: 0;
		}
	}

	/* PERFORMANCE: Optimize for landscape mobile */
	@media (max-width: 767px) and (orientation: landscape) {
		.layout-container {
			min-height: 100vh;
		}
	}

	/* PERFORMANCE: Better font rendering on high-DPI displays */
	@media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
		.layout-container {
			-webkit-font-smoothing: antialiased;
			-moz-osx-font-smoothing: grayscale;
		}
	}

	/* ACCESSIBILITY: Respect user motion preferences */
	@media (prefers-reduced-motion: reduce) {
		* {
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
		}
	}

	/* PERFORMANCE: Optimize focus indicators */
	:global(:focus-visible) {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
	}

	/* PERFORMANCE: Improve scrolling performance */
	@supports (scroll-behavior: smooth) {
		:global(html) {
			scroll-behavior: smooth;
		}
	}

	/* ACCESSIBILITY: Screen reader only content */
	:global(.sr-only) {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}

	:global(.focus\:not-sr-only:focus) {
		position: absolute;
		width: auto;
		height: auto;
		padding: 0.5rem 1rem;
		margin: 0;
		overflow: visible;
		clip: auto;
		white-space: normal;
	}
</style>
