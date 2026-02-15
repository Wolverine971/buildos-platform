<!-- apps/web/src/routes/+layout.svelte -->
<script lang="ts">
	import '../app.css';
	import '$lib/styles/pwa.css';
	import { ModeWatcher } from 'mode-watcher';
	import { setContext, onMount, onDestroy, untrack } from 'svelte';
	import { page } from '$app/stores';
	import { browser, dev } from '$app/environment';
	import {
		goto,
		replaceState,
		onNavigate,
		invalidate,
		invalidateAll,
		beforeNavigate
	} from '$app/navigation';
	import { navigationStore } from '$lib/stores/navigation.store';
	import Navigation from '$lib/components/layout/Navigation.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import IOSSplashScreens from '$lib/components/layout/IOSSplashScreens.svelte';
	import { initializePWAEnhancements, setupInstallPrompt } from '$lib/utils/pwa-enhancements';
	import type { LayoutData } from './$types';
	// Static import: TrialBanner must be in the SSR pass to prevent layout shift
	import TrialBannerStatic from '$lib/components/trial/TrialBanner.svelte';

	// Notification system integration
	import NotificationStackManager from '$lib/components/notifications/NotificationStackManager.svelte';
	import {
		initBrainDumpNotificationBridge,
		cleanupBrainDumpNotificationBridge
	} from '$lib/services/brain-dump-notification.bridge';
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
	import type { AuthChangeEvent } from '@supabase/supabase-js';
	import { LOGOUT_REDIRECT_STORAGE_KEY } from '$lib/utils/auth';

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

	// Use the Supabase client from +layout.ts (avoids duplicate clients and auth listeners)
	const supabase = data.supabase;
	if (supabase) {
		setContext('supabase', supabase);
	}

	// PERFORMANCE: Reactive data with memoization - converted to $derived runes
	let user = $derived(data.user);
	let completedOnboarding = $derived(data.completedOnboarding);
	type BillingContext = {
		subscription: any | null;
		trialStatus: any | null;
		paymentWarnings: any[];
		isReadOnly: boolean;
		loading: boolean;
	};

	const createBillingContextPlaceholder = (loading: boolean): BillingContext => ({
		subscription: null,
		trialStatus: null,
		paymentWarnings: [],
		isReadOnly: false,
		loading
	});

	const clampProgress = (value: number | null | undefined) => {
		const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
		return Math.max(0, Math.min(100, numeric));
	};

	const isPromiseLike = <T,>(value: unknown): value is Promise<T> =>
		typeof value === 'object' &&
		value !== null &&
		typeof (value as Promise<T>).then === 'function';

	let billingContext = $state<BillingContext>(
		createBillingContextPlaceholder(Boolean(data.user && data.stripeEnabled))
	);
	let onboardingProgress = $derived(
		typeof data.onboardingProgress === 'number'
			? clampProgress(data.onboardingProgress)
			: completedOnboarding
				? 100
				: 0
	);
	let trialStatus = $derived(billingContext.trialStatus);
	let paymentWarnings = $derived(billingContext.paymentWarnings);
	let isReadOnly = $derived(billingContext.isReadOnly);
	let billingLoading = $derived(billingContext.loading);

	let onboardingResolveToken = 0;
	let billingResolveToken = 0;

	$effect(() => {
		const source = data.onboardingProgress;
		const token = ++onboardingResolveToken;
		const fallback = completedOnboarding ? 100 : 0;

		if (isPromiseLike<number>(source)) {
			untrack(() => {
				onboardingProgress = fallback;
			});

			source
				.then((value) => {
					if (token !== onboardingResolveToken) return;
					untrack(() => {
						onboardingProgress = completedOnboarding ? 100 : clampProgress(value ?? 0);
					});
				})
				.catch((error) => {
					console.error('Deferred onboarding progress failed:', error);
					if (token !== onboardingResolveToken) return;
					untrack(() => {
						onboardingProgress = fallback;
					});
				});
		} else {
			untrack(() => {
				onboardingProgress = typeof source === 'number' ? clampProgress(source) : fallback;
			});
		}
	});

	$effect(() => {
		const source = data.billingContext;
		const token = ++billingResolveToken;

		if (!user || !data.stripeEnabled) {
			untrack(() => {
				billingContext = createBillingContextPlaceholder(false);
			});
			return;
		}

		if (isPromiseLike<BillingContext>(source)) {
			untrack(() => {
				billingContext = {
					...billingContext,
					loading: true
				};
			});

			source
				.then((payload) => {
					if (token !== billingResolveToken) return;
					untrack(() => {
						billingContext = {
							subscription: payload?.subscription ?? null,
							trialStatus: payload?.trialStatus ?? null,
							paymentWarnings: payload?.paymentWarnings ?? [],
							isReadOnly: Boolean(payload?.isReadOnly),
							loading: false
						};
					});
				})
				.catch((error) => {
					console.error('Deferred billing context failed:', error);
					if (token !== billingResolveToken) return;
					untrack(() => {
						billingContext = createBillingContextPlaceholder(false);
					});
				});
		} else {
			untrack(() => {
				billingContext = source
					? {
							subscription: source.subscription ?? null,
							trialStatus: source.trialStatus ?? null,
							paymentWarnings: source.paymentWarnings ?? [],
							isReadOnly: Boolean(source.isReadOnly),
							loading: Boolean(source.loading)
						}
					: createBillingContextPlaceholder(Boolean(user && data.stripeEnabled));
			});
		}
	});

	$effect(() => {
		if ($page.route?.id !== currentRouteId && browser) {
			// Use untrack for state updates to prevent re-triggering the effect
			untrack(() => {
				currentRouteId = $page.route?.id || '';
			});

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
				untrack(() => {
					routeBasedState = {
						showNavigation: newShowNavigation,
						showFooter: newShowFooter,
						needsOnboarding: newNeedsOnboarding,
						showOnboardingModal: newShowOnboardingModal
					};
				});
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
	let authSyncInProgress = $state(false);
	let authSubscriptionCleanup = $state<(() => void) | null>(null);

	// Track previous auth state to prevent unnecessary reloads on visibility change.
	// When tab becomes visible, Supabase may emit SIGNED_IN even if user was already signed in.
	// Initialize from SSR user data so SIGNED_IN after INITIAL_SESSION(null) is recognized
	// as the same user and skipped — preventing two redundant __data.json re-fetches.
	let previousAuthUserId = $state<string | null>(data.user?.id ?? null);

	// Convert to $effect - load resources when user becomes available
	$effect(() => {
		if (browser && user && !resourcesLoaded && !resourcesLoadPromise) {
			// Use untrack to prevent state update from re-triggering this effect
			untrack(() => {
				resourcesLoadPromise = loadAuthenticatedResources();
			});
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
				import('$lib/components/BackgroundJobIndicator.svelte')
			]);

			const [
				toastServiceModule,
				onboardingModalModule,
				toastContainerModule,
				paymentWarningModule,
				backgroundJobIndicatorModule
			] = (await Promise.race([loadPromise, timeoutPromise])) as any;

			toastService = toastServiceModule.toastService;
			OnboardingModal = onboardingModalModule.default;
			ToastContainer = toastContainerModule.default;
			PaymentWarning = paymentWarningModule.default;
			BackgroundJobIndicator = backgroundJobIndicatorModule.default;

			// Use untrack for state updates to prevent triggering effects
			untrack(() => {
				resourcesLoaded = true;
				resourcesLoadPromise = undefined;
			});
		} catch (error) {
			console.error('Failed to load authenticated resources:', error);
			// Use untrack to allow retry without triggering effects immediately
			untrack(() => {
				resourcesLoadPromise = undefined;
			});
		}
	}

	function resetResourceLoaders() {
		resourcesLoadPromise = undefined;
		resourcesLoaded = false;
	}

	function consumeLogoutRedirect(): string | null {
		if (!browser) return null;
		try {
			const target = sessionStorage.getItem(LOGOUT_REDIRECT_STORAGE_KEY);
			if (target) {
				sessionStorage.removeItem(LOGOUT_REDIRECT_STORAGE_KEY);
				return target;
			}
		} catch (error) {
			console.warn('Unable to read logout redirect target', error);
		}
		return null;
	}

	/**
	 * Synchronize auth state with SvelteKit's data loading system.
	 *
	 * @param invalidateData - If true, invalidates all page data (triggers load function re-runs).
	 *                         Set to false for session restores/token refreshes to avoid unnecessary reloads.
	 */
	async function synchronizeAuthState(invalidateData: boolean = true) {
		if (!browser || authSyncInProgress) return;

		authSyncInProgress = true;

		try {
			// Guard against calling invalidate when page context is not available
			if ($page) {
				if (invalidateData) {
					// invalidateAll() covers all dependencies including
					// 'supabase:auth' and 'app:auth', so a single call suffices.
					// Previously the specific invalidations fired first, causing
					// a separate __data.json fetch before invalidateAll fired another.
					await invalidateAll();
				} else {
					// Token refresh / session restore — only re-run auth-specific loaders
					await invalidate('supabase:auth');
					await invalidate('app:auth');
				}
			}
		} catch (error) {
			console.error('Failed to synchronize auth state:', error);
		} finally {
			authSyncInProgress = false;
		}
	}

	/**
	 * Handle user sign-in events.
	 * Only triggers full data reload if the user actually changed (new sign-in)
	 * AND the current page data doesn't already reflect the signed-in user.
	 * Skips data reload for session restores after tab visibility change.
	 */
	async function handleAuthSignedIn(currentUserId: string | null) {
		const isNewSignIn = previousAuthUserId !== currentUserId;
		previousAuthUserId = currentUserId;

		// On initial page load, INITIAL_SESSION already set previousAuthUserId,
		// so SIGNED_IN fires with isNewSignIn=false. The SSR data is already correct —
		// skip invalidation and resource resets to prevent a visible page flicker.
		if (!isNewSignIn) return;

		// After login, goto('/', { invalidateAll: true }) already loaded fresh data
		// including the user. When SIGNED_IN fires afterward (browser client detecting
		// new cookies), data.user already matches — skip the redundant invalidation
		// and resource reset to avoid flashing/conflicts with the completed navigation.
		if (currentUserId && data.user?.id === currentUserId) return;

		resetResourceLoaders();

		// Full invalidation for actual auth state changes
		// (user signed in for the first time or switched accounts)
		await synchronizeAuthState(true);
	}

	async function handleAuthSignedOut() {
		// Clear tracked auth state
		previousAuthUserId = null;

		resetResourceLoaders();
		routeBasedState = {
			...routeBasedState,
			needsOnboarding: false,
			showOnboardingModal: false
		};

		// Always invalidate data on sign-out
		await synchronizeAuthState(true);

		if (!browser) return;

		const currentRouteId = $page.route?.id ?? '';
		const pathname = String($page.url.pathname);
		const redirectTarget: string =
			consumeLogoutRedirect() ||
			(currentRouteId.startsWith('/auth') ? pathname : '/auth/login');

		if (!currentRouteId.startsWith('/auth')) {
			await goto(redirectTarget || '/auth/login', { replaceState: true });
		}
	}

	/**
	 * Handle Supabase auth state change events.
	 *
	 * Key insight: When tab becomes visible after being hidden, Supabase may emit SIGNED_IN
	 * even if the user was already signed in (session restore/token refresh).
	 * We track the previous user ID to distinguish actual sign-ins from session restores.
	 */
	async function handleAuthStateChange(event: AuthChangeEvent | 'USER_DELETED', session: any) {
		const currentUserId = session?.user?.id ?? null;

		switch (event) {
			case 'INITIAL_SESSION':
				// Initialize tracking on first load without triggering invalidation.
				// Only update if we get a real user ID, or if we have no SSR user data.
				// Supabase may fire INITIAL_SESSION with null before _recoverAndRefresh
				// resolves — we must not overwrite the SSR-initialized value.
				if (currentUserId || !previousAuthUserId) {
					previousAuthUserId = currentUserId;
				}
				return;

			case 'SIGNED_IN':
			case 'USER_UPDATED':
			case 'PASSWORD_RECOVERY':
				await handleAuthSignedIn(currentUserId);
				break;

			case 'SIGNED_OUT':
			case 'USER_DELETED':
				await handleAuthSignedOut();
				break;

			case 'TOKEN_REFRESHED':
				// Token refresh doesn't require any data invalidation
				// The session is still valid, just with a new access token
				break;

			default:
				// Unknown events - log for debugging but don't invalidate
				console.debug('[Auth] Unhandled auth event:', event);
				break;
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

		if (supabase) {
			const {
				data: { subscription }
			} = supabase.auth.onAuthStateChange(async (event, session) => {
				try {
					await handleAuthStateChange(event, session);
				} catch (error) {
					console.error('Auth state change listener error:', error);
				}
			});

			authSubscriptionCleanup = () => subscription.unsubscribe();
		}

		// FIXED: Store cleanup functions to prevent memory leaks
		pwaCleanup = initializePWAEnhancements();
		installPromptCleanup = setupInstallPrompt();

		// Initialize notification bridges
		initBrainDumpNotificationBridge();
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

			if (authSubscriptionCleanup) {
				authSubscriptionCleanup();
				authSubscriptionCleanup = null;
			}
		};
	});

	onDestroy(() => {
		// FIXED: Comprehensive cleanup to prevent memory leaks
		if (browser) {
			if (authSubscriptionCleanup) {
				authSubscriptionCleanup();
				authSubscriptionCleanup = null;
			}

			// FIXED: Destroy stores to prevent subscription leaks
			backgroundJobs.destroy();
			destroyTimeBlockNotificationBridge();
			timeBlocksStore.destroy?.();

			// Cleanup notification bridges
			cleanupBrainDumpNotificationBridge();
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

	// ============================================================
	// VIEW TRANSITIONS API - Smooth page transitions
	// ============================================================

	// Enable View Transitions API for smooth page animations
	// This enables morphing animations between pages (e.g., project title from list to detail)
	onNavigate((navigation) => {
		// Skip if View Transitions API is not supported
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
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
			billingContext = {
				...billingContext,
				paymentWarnings: billingContext.paymentWarnings.filter((w) => w.id !== id)
			};
		} catch (error) {
			console.error('Error dismissing payment warning:', error);
		}
	}
</script>

<svelte:head>
	<title>BuildOS - Your Personal Operating System</title>
	<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

	<!-- Open Graph / Social Media -->
	<meta property="og:site_name" content="BuildOS" />
	<meta property="og:title" content="BuildOS - The Productivity System for the Builder" />
	<meta
		property="og:description"
		content="AI-powered productivity platform for ADHD minds that transforms unstructured thoughts into actionable plans."
	/>
	<meta property="og:type" content="website" />

	<!-- PERFORMANCE: System fonts used — no external font loading needed -->
</svelte:head>

<ModeWatcher />
<IOSSplashScreens />

<div
	class="layout-root flex min-h-screen min-h-[100dvh] w-full flex-col overflow-x-hidden bg-background text-foreground transition-colors"
	style="padding-left: max(0px, env(safe-area-inset-left)); padding-right: max(0px, env(safe-area-inset-right));"
>
	<!-- Skip to main content link for accessibility -->
	<a
		href="#main-content"
		class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 bg-accent text-accent-foreground px-4 py-2 rounded-lg shadow-ink-strong font-semibold"
	>
		Skip to main content
	</a>

	{#if showNavigation}
		<Navigation bind:element={navigationElement} {...navigationProps} />
	{/if}

	{#if user && trialStatus && data.stripeEnabled}
		<TrialBannerStatic
			user={{
				trial_ends_at: user.trial_ends_at,
				subscription_status: user.subscription_status ?? undefined
			}}
		/>
	{/if}

	{#if !billingLoading && paymentWarnings.length > 0 && PaymentWarning}
		<div class="container mx-auto px-3 sm:px-6 lg:px-8 mt-3 sm:mt-4">
			{#each paymentWarnings as warning (warning.id)}
				<PaymentWarning notification={warning} ondismiss={handlePaymentWarningDismiss} />
			{/each}
		</div>
	{/if}

	<main
		id="main-content"
		class={`rounded-md relative mx-auto my-3 sm:my-4 flex-1 w-full max-w-[1200px] p-1 ${showNavigation ? '' : 'min-h-screen'} `}
	>
		{@render children?.()}
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
			class="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:p-6 z-[10001]"
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

<style>
	/* Brushed aluminum background - switches based on theme */
	#main-content {
		background-image: url('/textures/brushed-alum.png');
		background-size: 500px 500px;
		background-repeat: repeat;
	}

	:global(.dark) #main-content {
		background-image: url('/textures/brushed-alum-dark.png');
	}
</style>
