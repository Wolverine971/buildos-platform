<!-- apps/web/src/routes/profile/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { slideMotion } from '$lib/components/project/v2/board-a11y';
	import { userContextStore } from '$lib/stores/userContext';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { CircleCheck, AlertCircle, XCircle } from '$lib/icons/lucide';
	import type { PageData } from './$types';
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/Button.svelte';

	import BriefsTab from '$lib/components/profile/BriefsTab.svelte';
	import CalendarTab from '$lib/components/profile/CalendarTab.svelte';
	import EmailTab from '$lib/components/profile/EmailTab.svelte';
	import AccountTab from '$lib/components/profile/AccountTab.svelte';
	import ContactsTab from '$lib/components/profile/ContactsTab.svelte';
	import NotificationsTab from '$lib/components/profile/NotificationsTab.svelte';
	import PeopleAgentsTab from '$lib/components/profile/PeopleAgentsTab.svelte';
	import BillingTab from '$lib/components/profile/BillingTab.svelte';
	import CyclesTab from '$lib/components/profile/CyclesTab.svelte';
	import DataTab from '$lib/components/profile/DataTab.svelte';
	import SettingsNavigation from '$lib/components/profile/SettingsNavigation.svelte';
	import { getSettingsDestinations } from '$lib/components/profile/settings-navigation';
	import {
		profileTabAliasSection,
		resolveProfileTab,
		type ProfileTabId,
		type ProfileTabVisibility
	} from '$lib/components/profile/profile-tabs';

	interface Props {
		data: PageData;
		form?: any;
	}

	let { data, form }: Props = $props();

	function getInitialOnboardingComplete() {
		return data.justCompletedOnboarding || false;
	}

	/** Onboarding categories that still block a "complete" state. */
	const REQUIRED_ONBOARDING_CATEGORIES = ['projects', 'work_style', 'challenges'];

	function getInitialMissingRequired(): string[] {
		return data.progressData?.missingRequiredFields ?? [];
	}

	// State
	let saveSuccess = $state(false);
	let successMessage = $state('Changes saved successfully.');
	let saveError = $state(false);
	let errorMessage = $state('');
	let showOnboardingComplete = $state(getInitialOnboardingComplete());
	let tabVisibility = $derived<ProfileTabVisibility>({
		cyclesProfileEnabled: data.cyclesProfileEnabled,
		stripeEnabled: data.stripeEnabled
	});
	let activeTab = $derived(resolveProfileTab(page.url.searchParams.get('tab'), tabVisibility));
	let settingsDestinations = $derived(getSettingsDestinations(tabVisibility));

	/**
	 * Only drives which label the onboarding button shows ("Complete" vs "Start"),
	 * so the required categories are all this page needs from onboarding progress.
	 */
	let missingRequiredFields = $state<string[]>(getInitialMissingRequired());

	// Handle form submission results
	$effect(() => {
		if (form?.success) {
			saveSuccess = true;
			successMessage = 'Changes saved successfully.';
			saveError = false;

			setTimeout(() => {
				saveSuccess = false;
			}, 3000);

			// Refresh data after successful form submission
			refreshData();
		}
	});

	onMount(async () => {
		// Initialize store with data from page load
		userContextStore.initialize({
			context: data.userContext,
			completedOnboarding: data.completedOnboarding || false
		});

		// Auto-hide completion message after 5 seconds
		if (showOnboardingComplete) {
			setTimeout(() => {
				showOnboardingComplete = false;
			}, 5000);
		}
	});

	// Function to switch tabs and update URL
	function switchTab(tab: ProfileTabId) {
		const nextTab = resolveProfileTab(tab, tabVisibility);

		// URL state remains shareable and gets a real history entry so browser
		// back/forward navigation restores the visible Settings destination.
		const url = new URL(page.url);
		if (nextTab === 'account') {
			url.searchParams.delete('tab');
		} else {
			url.searchParams.set('tab', nextTab);
		}
		void goto(url.toString(), { keepFocus: true, noScroll: true });
	}

	async function refreshData() {
		try {
			// Use the store to reload data
			await userContextStore.load();
		} catch (error) {
			console.error('Error refreshing data:', error);
			showError('Failed to refresh data');
		}
	}

	// Utility functions for messages
	function showSuccess(message: string) {
		successMessage = message || 'Changes saved successfully.';
		saveSuccess = true;
		saveError = false;
		setTimeout(() => {
			saveSuccess = false;
		}, 3000);
	}

	function showError(message: string) {
		errorMessage = message;
		saveError = true;
		saveSuccess = false;
		setTimeout(() => {
			saveError = false;
		}, 5000);
	}

	// Handle success messages from child components
	function handleComponentSuccess(event: { message?: string }) {
		showSuccess(event?.message || 'Changes saved successfully!');
	}

	// Handle error messages from child components
	function handleComponentError(event: { message?: string }) {
		showError(event?.message || 'An error occurred');
	}

	let storeState = $derived($userContextStore);

	// Handle store errors
	$effect(() => {
		if (storeState?.error && browser) {
			showError(storeState.error);
			userContextStore.clearError();
		}
	});

	// Keep the onboarding-button label in sync with live progress from the store.
	$effect(() => {
		if (storeState?.progress) {
			missingRequiredFields = storeState.progress.missingCategories.filter((cat: string) =>
				REQUIRED_ONBOARDING_CATEGORIES.includes(cat)
			);
		}
	});
</script>

<svelte:head>
	<title>Settings - BuildOS</title>
	<meta
		name="description"
		content="Manage your BuildOS account, briefs, recurring work, notifications, and connections."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-background">
	<div class="mx-auto max-w-7xl space-y-4 px-4 py-4 lg:px-6 lg:py-6">
		<!-- Success Banner -->
		{#if showOnboardingComplete}
			<div
				class="p-3 bg-card border border-border rounded-lg"
				transition:slide={slideMotion()}
			>
				<div class="flex items-center gap-2">
					<CircleCheck class="w-4 h-4 text-muted-foreground flex-shrink-0" />
					<p class="text-sm text-foreground font-medium">
						Setup complete. BuildOS now fits how you work.
					</p>
				</div>
			</div>
		{/if}

		{#if saveSuccess}
			<div
				class="p-3 bg-card border border-border rounded-lg"
				transition:slide={slideMotion()}
			>
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						<CircleCheck class="w-4 h-4 text-muted-foreground flex-shrink-0" />
						<p class="text-sm text-foreground font-medium">
							{successMessage}
						</p>
					</div>
					<Button
						onclick={() => (saveSuccess = false)}
						variant="ghost"
						size="sm"
						class="p-1 text-muted-foreground hover:text-foreground"
						icon={XCircle}
					></Button>
				</div>
			</div>
		{/if}

		{#if saveError}
			<div
				class="p-3 bg-card border border-destructive/30 rounded-lg"
				transition:slide={slideMotion()}
			>
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						<AlertCircle class="w-4 h-4 text-destructive flex-shrink-0" />
						<p class="text-sm text-foreground font-medium">
							{errorMessage || 'Something went wrong'}
						</p>
					</div>
					<Button
						onclick={() => (saveError = false)}
						variant="ghost"
						size="sm"
						class="p-1 text-muted-foreground hover:text-foreground"
						icon={XCircle}
					></Button>
				</div>
			</div>
		{/if}

		<header class="flex items-center justify-between gap-3">
			<div class="min-w-0">
				<h1 class="text-2xl font-medium text-foreground">Settings</h1>
				<p class="mt-1 truncate text-xs text-muted-foreground">
					<span class="text-foreground"
						>{data.user?.user_metadata?.name || data.user?.name || 'Your account'}</span
					>
					<span aria-hidden="true"> · </span>{data.user?.email}
					{#if data.userContext?.created_at}
						<span class="hidden sm:inline"
							><span aria-hidden="true"> · </span>Member since {new Date(
								data.userContext.created_at
							).toLocaleDateString([], { month: 'short', year: 'numeric' })}</span
						>
					{/if}
				</p>
			</div>

			{#if !data.completedOnboarding}
				<Button
					onclick={() => goto('/onboarding')}
					variant="primary"
					size="sm"
					class="pressable flex-shrink-0"
				>
					{#if missingRequiredFields.length > 0}
						<span class="hidden sm:inline">Finish setup</span>
						<span class="sm:hidden">Setup</span>
					{:else}
						<span class="hidden sm:inline">Start setup</span>
						<span class="sm:hidden">Start</span>
					{/if}
				</Button>
			{/if}
		</header>

		<div
			class="min-w-0 space-y-4 md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:items-start md:gap-5 md:space-y-0"
		>
			<div class="min-w-0 md:sticky md:top-4">
				<SettingsNavigation
					destinations={settingsDestinations}
					activeId={activeTab}
					onchange={switchTab}
				/>
			</div>

			<main class="min-w-0" aria-label="Settings content">
				{#if activeTab === 'account'}
					<AccountTab
						user={data.user}
						initialSection={page.url.searchParams.get('section') === 'delete'
							? 'danger'
							: 'profile'}
						onsuccess={handleComponentSuccess}
						onerror={handleComponentError}
					/>
				{:else if activeTab === 'contacts'}
					<ContactsTab
						onsuccess={handleComponentSuccess}
						onerror={handleComponentError}
					/>
				{:else if activeTab === 'cycles' && data.cyclesProfileEnabled}
					<CyclesTab executionAuthority={data.cyclesExecutionAuthority} />
				{:else if activeTab === 'briefs'}
					<BriefsTab
						isAdmin={data.isAdmin}
						initialVoiceNarrationEnabled={data.voiceNarrationEnabled}
						onsuccess={handleComponentSuccess}
						onerror={handleComponentError}
					/>
				{:else if activeTab === 'calendar'}
					<CalendarTab
						{data}
						{form}
						onsuccess={handleComponentSuccess}
						onerror={handleComponentError}
					/>
				{:else if activeTab === 'email'}
					<EmailTab onsuccess={handleComponentSuccess} onerror={handleComponentError} />
				{:else if activeTab === 'notifications'}
					<NotificationsTab userId={data.user.id} />
				{:else if activeTab === 'people'}
					<PeopleAgentsTab
						userName={data.user?.name || data.user?.email || 'You'}
						initialSection={profileTabAliasSection(page.url.searchParams.get('tab'))}
						onsuccess={handleComponentSuccess}
						onerror={handleComponentError}
					/>
				{:else if activeTab === 'data'}
					<DataTab />
				{:else if activeTab === 'billing' && data.stripeEnabled}
					<BillingTab subscriptionDetails={data.subscriptionDetails} />
				{/if}
			</main>
		</div>
	</div>
</div>
