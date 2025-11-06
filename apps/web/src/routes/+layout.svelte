<!-- apps/web/src/routes/+layout.svelte -->
<script lang="ts">
	import '../app.css';
	import '$lib/styles/pwa.css';
	import { ModeWatcher } from 'mode-watcher';
	import { setContext, onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { browser, dev } from '$app/environment';
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
	import {
		initTimeBlockNotificationBridge,
		destroyTimeBlockNotificationBridge
	} from '$lib/services/time-block-notification.bridge';
	import { backgroundJobs } from '$lib/stores/backgroundJobs';
	import { timeBlocksStore } from '$lib/stores/timeBlocksStore';

	// Vercel Analytics & Speed Insights
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
	import type { Snippet } from 'svelte';

	// Initialize Speed Insights in production
	if (browser && !dev) {
		injectSpeedInsights();
	}

	// FIXED: Convert to $props() for Svelte 5 runes mode compatibility
	let { data, children }: { data: LayoutData; children?: Snippet } = $props();

	// Pre-load components that are commonly used - wrapped in $state for reactivity
	let OnboardingModal = $state<any>(undefined);
	let ToastContainer = $state<any>(undefined);
	let toastService = $state<any>(undefined);
	let PaymentWarning = $state<any>(undefined);
	let TrialBanner = $state<any>(undefined);
	let BackgroundJobIndicator = $state<any>(undefined);

	// PERFORMANCE: Memoize route calculations to prevent unnecessary recalculations
	let currentRouteId = $state('');
	let routeBasedState = $state({
		showNavigation: true,
		showFooter: true,
		needsOnboarding: false,
		showOnboardingModal: false
	});

	// Simplified state management - wrapped in $state for reactivity
	let navigationElement = $state<HTMLElement | null>(null);
	let modalElement = $state<HTMLElement | null>(null);
	let animatingDismiss = $state(false);

	// FIXED: Store cleanup functions to prevent memory leaks
	let pwaCleanup = $state<(() => void) | void>(undefined);
	let installPromptCleanup = $state<(() => void) | void>(undefined);

	// Create supabase client once and memoize
	const supabase = browser ? createSupabaseBrowser() : null;
	if (supabase) {
		setContext('supabase', supabase);
	}

	// PERFORMANCE: Reactive data with memoization - converted to $derived runes
	let user = $derived(data.user);
	let completedOnboarding = $derived(data.completedOnboarding);
	let onboardingProgress = $derived(data.onboardingProgress);
	let paymentWarnings = $derived(data.paymentWarnings || []);
	let trialStatus = $derived(data.trialStatus);
	let isReadOnly = $derived(data.isReadOnly || false);

	// PERFORMANCE: Only recalculate route-dependent values when route actually changes - converted to $effect
	$effect(() => {
		if ($page.route?.id !== currentRouteId && browser) {
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
	});

	// Destructure for template use - these variables are derived from routeBasedState
	let showNavigation = $derived(routeBasedState.showNavigation);
	let showFooter = $derived(routeBasedState.showFooter);
	let needsOnboarding = $derived(routeBasedState.needsOnboarding);
	let showOnboardingModal = $derived(routeBasedState.showOnboardingModal);

	// PERFORMANCE: Load authenticated resources with better caching
	let resourcesLoadPromise = $state<Promise<void> | undefined>(undefined);
	let resourcesLoaded = $state(false);

	// Convert to $effect - load resources when user becomes available
	$effect(() => {
		if (browser && user && !resourcesLoaded && !resourcesLoadPromise) {
			resourcesLoadPromise = loadAuthenticatedResources();
		}
	});

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
			resourcesLoadPromise = undefined;
		} catch (error) {
			console.error('Failed to load authenticated resources:', error);
			resourcesLoadPromise = undefined; // Reset to allow retry
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
	let briefCompleteTimeout = $state<number | undefined>(undefined);
	let briefNotificationTimeout = $state<number | undefined>(undefined);

	function handleBriefComplete() {
		if (briefCompleteTimeout) return;

		briefCompleteTimeout = setTimeout(() => {
			toastService?.success('Daily brief generated successfully!');
			briefCompleteTimeout = undefined;
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
			briefNotificationTimeout = undefined;
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
	let visitorTrackingInitialized = $state(false);

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

		// FIXED: Store cleanup functions to prevent memory leaks
		pwaCleanup = initializePWAEnhancements();
		installPromptCleanup = setupInstallPrompt();

		// Initialize notification bridges
		initBrainDumpNotificationBridge();
		initPhaseGenerationNotificationBridge();
		initCalendarAnalysisNotificationBridge();
		initProjectSynthesisNotificationBridge();
		initTimeBlockNotificationBridge();

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

			// FIXED: Call PWA cleanup functions
			if (typeof pwaCleanup === 'function') pwaCleanup();
			if (typeof installPromptCleanup === 'function') installPromptCleanup();
		};
	});

	onDestroy(() => {
		// FIXED: Comprehensive cleanup to prevent memory leaks
		if (browser) {
			// FIXED: Destroy stores to prevent subscription leaks
			backgroundJobs.destroy();
			destroyTimeBlockNotificationBridge();
			timeBlocksStore.destroy?.();

			// Cleanup notification bridges
			cleanupBrainDumpNotificationBridge();
			cleanupPhaseGenerationNotificationBridge();
			cleanupCalendarAnalysisNotificationBridge();
			cleanupProjectSynthesisNotificationBridge();

			// Clear any pending timeouts
			if (briefCompleteTimeout) {
				clearTimeout(briefCompleteTimeout);
				briefCompleteTimeout = undefined;
			}
			if (briefNotificationTimeout) {
				clearTimeout(briefNotificationTimeout);
				briefNotificationTimeout = undefined;
			}

			// Reset promises and state
			resourcesLoadPromise = undefined;
			resourcesLoaded = false;
			visitorTrackingInitialized = false;
		}
	});

	// PERFORMANCE: Memoize component props to prevent unnecessary re-renders - converted to $derived.by()
	let navigationProps = $derived.by(() => ({ user, completedOnboarding, onboardingProgress }));
	let footerProps = $derived.by(() => ({ user }));
	let onboardingModalProps = $derived.by(() => ({
		isOpen: showOnboardingModal || animatingDismiss,
		onDismiss: handleModalDismiss
	}));

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

<div
	class="flex min-h-screen min-h-[100dvh] w-full flex-col overflow-x-hidden bg-slate-50 transition-colors dark:bg-slate-900"
	style="padding-left: max(0px, env(safe-area-inset-left)); padding-right: max(0px, env(safe-area-inset-right));"
>
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
		<TrialBanner {user} />
	{/if}

	{#if paymentWarnings.length > 0 && PaymentWarning}
		<div class="container mx-auto px-3 sm:px-6 lg:px-8 mt-3 sm:mt-4">
			{#each paymentWarnings as warning (warning.id)}
				<PaymentWarning notification={warning} ondismiss={handlePaymentWarningDismiss} />
			{/each}
		</div>
	{/if}

	<main
		id="main-content"
		class={`relative mx-auto my-3 sm:my-4 flex-1 w-full max-w-[1200px] px-3 sm:px-6 lg:px-8 xl:px-10 ${showNavigation ? '' : 'min-h-screen'} py-4 sm:py-6 lg:py-8`}
	>
		{#if children}
			{@render children()}
		{/if}
	</main>

	{#if showFooter}
		<Footer {...footerProps} />
	{/if}

	{#if needsOnboarding && OnboardingModal}
		<OnboardingModal bind:element={modalElement} {...onboardingModalProps} />
	{/if}

	{#if ToastContainer}
		<div
			aria-live="polite"
			aria-atomic="true"
			class="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:p-6 z-50"
		>
			<ToastContainer />
		</div>
	{/if}

	<!-- Background Job Status Indicator -->
	{#if BackgroundJobIndicator}
		<BackgroundJobIndicator />
	{/if}

	<!-- Notification System -->
	<NotificationStackManager />
</div>
