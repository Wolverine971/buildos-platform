<!-- apps/web/src/routes/profile/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { userContextStore } from '$lib/stores/userContext';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		User,
		Users,
		CircleCheck,
		Rocket,
		Key,
		Settings,
		Sparkles,
		Calendar,
		Mail,
		AlertCircle,
		Bell,
		XCircle,
		X,
		CreditCard
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { browser } from '$app/environment';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TabNav from '$lib/components/ui/TabNav.svelte';
	import type { Tab as TabNavTab } from '$lib/components/ui/TabNav.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import { requireApiData } from '$lib/utils/api-client-helpers';

	// Import the new components
	import BriefsTab from '$lib/components/profile/BriefsTab.svelte';
	import CalendarTab from '$lib/components/profile/CalendarTab.svelte';
	import AccountTab from '$lib/components/profile/AccountTab.svelte';
	import ContactsTab from '$lib/components/profile/ContactsTab.svelte';
	import NotificationsTab from '$lib/components/profile/NotificationsTab.svelte';
	import PreferencesTab from '$lib/components/profile/PreferencesTab.svelte';
	import AgentKeysTab from '$lib/components/profile/AgentKeysTab.svelte';

	interface Props {
		data: PageData;
		form?: any;
	}

	let { data, form }: Props = $props();

	// State
	let saveSuccess = $state(false);
	let saveError = $state(false);
	let errorMessage = $state('');
	let showOnboardingComplete = $state(data.justCompletedOnboarding || false);
	let activeTab = $state(data.activeTab || 'account');

	// Template management state
	let editingTemplate = $state<any>(null);
	let creatingTemplate = $state<'project' | null>(null);

	// Progress data from server
	let progressData = $state(
		data.progressData || {
			completed: false,
			progress: 0,
			missingFields: [] as string[],
			completedFields: [] as string[],
			missingRequiredFields: [] as string[],
			categoryProgress: {} as Record<string, boolean>
		}
	);

	// Handle form submission results
	$effect(() => {
		if (form?.success) {
			saveSuccess = true;
			saveError = false;
			editingTemplate = null;
			creatingTemplate = null;

			setTimeout(() => {
				saveSuccess = false;
			}, 3000);

			// Refresh data after successful form submission
			refreshData();
		}
	});

	// Watch for URL changes to update active tab
	$effect(() => {
		const urlTab = $page.url.searchParams.get('tab');
		if (urlTab && urlTab !== activeTab) {
			if (
				[
					'account',
					'contacts',
					'preferences',
					'briefs',
					'calendar',
					'notifications',
					'agent-keys',
					'billing'
				].includes(urlTab)
			) {
				activeTab = urlTab;
			}
		}
	});

	let profileTabs = $derived<TabNavTab[]>([
		{ id: 'account', label: 'Account', icon: User },
		{ id: 'contacts', label: 'Contacts', icon: Users },
		{ id: 'preferences', label: 'AI Preferences', icon: Sparkles },
		{ id: 'briefs', label: 'Brief Settings', icon: Bell },
		{ id: 'calendar', label: 'Calendar', icon: Calendar },
		{ id: 'notifications', label: 'Notifications', icon: Bell },
		{ id: 'agent-keys', label: 'Agent Keys', icon: Key },
		...(data.stripeEnabled ? [{ id: 'billing', label: 'Billing', icon: CreditCard }] : [])
	]);

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
	function switchTab(tab: string) {
		activeTab = tab;

		// Update URL without reload
		const url = new URL($page.url);
		if (tab === 'account') {
			url.searchParams.delete('tab');
		} else {
			url.searchParams.set('tab', tab);
		}
		goto(url.toString(), { replaceState: true });
	}

	// Function to download invoice PDF
	async function downloadInvoice(invoiceId: string) {
		try {
			const response = await fetch(`/api/stripe/invoice/${invoiceId}/download`);
			const { url } = await requireApiData<{ url?: string }>(
				response,
				'Failed to get invoice'
			);
			if (url) {
				window.open(url, '_blank');
			}
		} catch (err) {
			console.error('Error downloading invoice:', err);
			showError('Failed to download invoice');
		}
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
	function showSuccess(_message: string) {
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

	function closeTemplateEditor() {
		editingTemplate = null;
		creatingTemplate = null;
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

	// Update progress data from store
	$effect(() => {
		if (storeState?.progress) {
			progressData = {
				completed: storeState.completedOnboarding,
				progress: storeState.progress.percentage,
				missingFields: storeState.progress.missingCategories,
				completedFields: storeState.progress.completedCategories,
				missingRequiredFields: storeState.progress.missingCategories.filter((cat: string) =>
					['projects', 'work_style', 'challenges'].includes(cat)
				),
				categoryProgress: storeState.progress.completedCategories.reduce(
					(acc: Record<string, boolean>, cat: string) => {
						acc[cat] = true;
						return acc;
					},
					{} as Record<string, boolean>
				),
				categoryCompletion: storeState.progress.completedCategories.reduce(
					(acc: Record<string, boolean>, cat: string) => {
						acc[cat] = true;
						return acc;
					},
					{} as Record<string, boolean>
				),
				missingCategories: storeState.progress.missingCategories
			};
		}
	});
</script>

<svelte:head>
	<title>Profile & Settings - BuildOS</title>
	<meta
		name="description"
		content="Manage your BuildOS profile, work preferences, and AI prompt templates for personalized productivity assistance."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<div class="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
		<!-- Success Banner -->
		{#if showOnboardingComplete}
			<div
				class="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg shadow-ink tx tx-grain tx-weak"
				transition:slide
			>
				<div class="flex items-center gap-2">
					<CircleCheck class="w-4 h-4 text-emerald-500 flex-shrink-0" />
					<p class="text-sm text-foreground font-medium">
						Setup complete! BuildOS is now personalized to your workflow.
					</p>
				</div>
			</div>
		{/if}

		{#if saveSuccess}
			<div
				class="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg shadow-ink tx tx-grain tx-weak"
				transition:slide
			>
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						<CircleCheck class="w-4 h-4 text-emerald-500" />
						<p class="text-sm text-foreground font-medium">
							Changes saved successfully.
						</p>
					</div>
					<Button
						onclick={() => (saveSuccess = false)}
						variant="ghost"
						size="sm"
						class="p-1 text-emerald-500 hover:text-emerald-600"
						icon={XCircle}
					></Button>
				</div>
			</div>
		{/if}

		{#if saveError}
			<div
				class="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg shadow-ink tx tx-static tx-weak"
				transition:slide
			>
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						<AlertCircle class="w-4 h-4 text-red-500" />
						<p class="text-sm text-foreground font-medium">
							{errorMessage || 'An error occurred'}
						</p>
					</div>
					<Button
						onclick={() => (saveError = false)}
						variant="ghost"
						size="sm"
						class="p-1 text-red-500 hover:text-red-600"
						icon={XCircle}
					></Button>
				</div>
			</div>
		{/if}

		<!-- Profile Header -->
		<div
			class="bg-card rounded-lg shadow-ink border border-border p-3 sm:p-4 mb-4 tx tx-frame tx-weak"
		>
			<div class="flex items-center justify-between gap-3">
				<div class="flex items-center gap-3 min-w-0">
					<div
						class="w-10 h-10 sm:w-12 sm:h-12 bg-accent rounded-full flex items-center justify-center flex-shrink-0 shadow-ink"
					>
						<User class="w-5 h-5 sm:w-6 sm:h-6 text-accent-foreground" />
					</div>
					<div class="min-w-0">
						<h1 class="text-base sm:text-lg font-bold text-foreground truncate">
							{data.user?.user_metadata?.name || 'Your Profile'}
						</h1>
						<div
							class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5"
						>
							<span class="flex items-center gap-1 min-w-0">
								<Mail class="w-3 h-3 flex-shrink-0" />
								<span class="truncate">{data.user?.email}</span>
							</span>
							{#if data.userContext?.created_at}
								<span class="flex items-center gap-1">
									<Calendar class="w-3 h-3 flex-shrink-0" />
									Member since {new Date(
										data.userContext.created_at
									).toLocaleDateString()}
								</span>
							{/if}
						</div>
					</div>
				</div>

				{#if !data.userContext || !data.completedOnboarding || progressData.missingRequiredFields?.length > 0}
					<Button
						onclick={() => goto('/onboarding')}
						variant="primary"
						size="sm"
						class="bg-accent hover:bg-accent/90 shadow-ink pressable flex-shrink-0"
					>
						{#if progressData.missingRequiredFields?.length > 0}
							<AlertCircle class="w-3.5 h-3.5 mr-1" />
							<span class="hidden sm:inline">Complete Onboarding</span>
							<span class="sm:hidden">Setup</span>
						{:else}
							<Sparkles class="w-3.5 h-3.5 mr-1" />
							<span class="hidden sm:inline">Start Onboarding</span>
							<span class="sm:hidden">Start</span>
						{/if}
					</Button>
				{/if}
			</div>
		</div>

		<!-- Tab Navigation -->
		<div class="bg-card rounded-lg shadow-ink border border-border mb-4 sm:mb-5">
			<TabNav
				tabs={profileTabs}
				{activeTab}
				onchange={(event) => switchTab(event.detail)}
				containerClass="mb-0 border-0"
				navClass="mx-0 px-3 sm:px-6"
				ariaLabel="Profile sections"
			/>
		</div>

		<!-- Tab Content -->
		{#if activeTab === 'account'}
			<!-- Use the new AccountTab component -->
			<AccountTab
				user={data.user}
				onsuccess={handleComponentSuccess}
				onerror={handleComponentError}
			/>
		{:else if activeTab === 'contacts'}
			<ContactsTab onsuccess={handleComponentSuccess} onerror={handleComponentError} />
		{:else if activeTab === 'preferences'}
			<PreferencesTab />
		{:else if activeTab === 'briefs'}
			<!-- Use the new BriefsTab component -->
			<BriefsTab onsuccess={handleComponentSuccess} onerror={handleComponentError} />
		{:else if activeTab === 'calendar'}
			<!-- Use the new CalendarTab component -->
			<CalendarTab
				{data}
				{form}
				onsuccess={handleComponentSuccess}
				onerror={handleComponentError}
			/>
		{:else if activeTab === 'notifications'}
			<!-- Use the new NotificationsTab component -->
			<NotificationsTab userId={data.user.id} />
		{:else if activeTab === 'agent-keys'}
			<AgentKeysTab onsuccess={handleComponentSuccess} onerror={handleComponentError} />
		{:else if activeTab === 'billing' && data.stripeEnabled}
			<!-- Billing/Subscription Tab -->
			<div class="space-y-4 sm:space-y-5">
				<!-- Tab Header -->
				<div class="flex items-start gap-3">
					<div
						class="flex items-center justify-center w-10 h-10 rounded-lg bg-accent shadow-ink flex-shrink-0"
					>
						<CreditCard class="w-5 h-5 text-accent-foreground" />
					</div>
					<div class="flex-1 min-w-0">
						<h2 class="text-lg sm:text-xl font-bold text-foreground">Billing</h2>
						<p class="text-xs sm:text-sm text-muted-foreground mt-0.5">
							Manage your subscription and payment history.
						</p>
					</div>
				</div>

				{#if data.subscriptionDetails?.subscription}
					<!-- Active Subscription -->
					<div
						class="bg-card rounded-lg shadow-ink border border-border tx tx-frame tx-weak"
					>
						<div class="px-4 sm:px-5 py-3 border-b border-border">
							<h3
								class="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2"
							>
								<CircleCheck class="w-4 h-4 text-emerald-500" />
								{data.subscriptionDetails.subscription.subscription_plans?.name ||
									'Pro Plan'}
							</h3>
							<p class="text-xs text-muted-foreground mt-0.5">Active subscription</p>
						</div>

						<div class="p-4 sm:p-5 space-y-4">
							<div class="flex items-baseline justify-between gap-3 flex-wrap">
								<div>
									<p class="text-2xl font-bold text-foreground">
										${(
											(data.subscriptionDetails.subscription
												.subscription_plans?.price_cents ?? 0) / 100
										).toFixed(2)}<span
											class="text-sm font-normal text-muted-foreground"
											>/{data.subscriptionDetails.subscription
												.subscription_plans?.billing_interval}</span
										>
									</p>
									<p class="text-xs text-muted-foreground mt-0.5">
										Next billing: {data.subscriptionDetails.subscription
											.current_period_end
											? new Date(
													data.subscriptionDetails.subscription.current_period_end
												).toLocaleDateString()
											: 'N/A'}
									</p>
								</div>
							</div>

							<div class="grid grid-cols-2 gap-4 pt-3 border-t border-border">
								<div>
									<p
										class="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5"
									>
										Status
									</p>
									<p class="text-sm text-foreground capitalize">
										{data.subscriptionDetails.subscription.status}
									</p>
								</div>
								<div>
									<p
										class="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5"
									>
										Member Since
									</p>
									<p class="text-sm text-foreground">
										{data.subscriptionDetails.subscription.created_at
											? new Date(
													data.subscriptionDetails.subscription.created_at
												).toLocaleDateString()
											: 'N/A'}
									</p>
								</div>
							</div>

							<form method="POST" action="/api/stripe/portal" use:enhance>
								<Button
									type="submit"
									variant="secondary"
									size="sm"
									class="shadow-ink pressable"
									icon={Settings}
								>
									Manage Subscription
								</Button>
							</form>
						</div>
					</div>

					<!-- Invoice Info -->
					<div class="bg-muted rounded-lg p-3 border border-border">
						<p
							class="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1"
						>
							Invoice Information
						</p>
						<ul class="text-xs text-muted-foreground space-y-0.5">
							<li>• Invoices are emailed automatically</li>
							<li>
								• Tax ID and business details can be updated in the billing portal
							</li>
							<li>• All invoices include applicable taxes</li>
						</ul>
					</div>

					<!-- Payment History -->
					{#if data.subscriptionDetails.invoices.length > 0}
						<div
							class="bg-card rounded-lg shadow-ink border border-border tx tx-frame tx-weak"
						>
							<div class="px-4 sm:px-5 py-3 border-b border-border">
								<h3 class="text-sm sm:text-base font-semibold text-foreground">
									Payment History
								</h3>
							</div>
							<div class="divide-y divide-border">
								{#each data.subscriptionDetails.invoices as invoice}
									<div
										class="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5"
									>
										<div class="min-w-0">
											<p class="text-sm font-medium text-foreground">
												${(invoice.amount_paid / 100).toFixed(2)}
											</p>
											<p class="text-xs text-muted-foreground">
												{invoice.created_at
													? new Date(
															invoice.created_at
														).toLocaleDateString()
													: 'N/A'}
											</p>
										</div>
										<div class="text-right flex-shrink-0">
											<p
												class="text-xs font-medium capitalize text-foreground"
											>
												{invoice.status}
											</p>
											{#if invoice.invoice_pdf}
												<a
													href={invoice.invoice_pdf}
													target="_blank"
													rel="noopener noreferrer"
													class="text-xs text-accent hover:text-accent/80 transition-colors"
												>
													Download PDF
												</a>
											{:else if invoice.stripe_invoice_id}
												<Button
													onclick={() =>
														downloadInvoice(invoice.stripe_invoice_id)}
													variant="ghost"
													size="sm"
													class="text-xs text-accent hover:text-accent/80 py-0"
												>
													Generate PDF
												</Button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{:else}
					<!-- No Subscription -->
					<div
						class="bg-card rounded-lg shadow-ink border border-border tx tx-bloom tx-weak"
					>
						<div class="p-5 sm:p-6 text-center">
							<div class="max-w-md mx-auto">
								<div
									class="p-2.5 bg-accent/10 rounded-full w-12 h-12 mx-auto mb-3 flex items-center justify-center"
								>
									<Sparkles class="w-6 h-6 text-accent" />
								</div>
								<h3 class="text-lg sm:text-xl font-bold text-foreground mb-1">
									Upgrade to Pro
								</h3>
								<p class="text-sm text-muted-foreground mb-5">
									Unlock all features and take your productivity to the next
									level.
								</p>
								<div class="space-y-2 text-left max-w-sm mx-auto mb-5">
									<div class="flex items-start gap-2">
										<CircleCheck
											class="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0"
										/>
										<p class="text-sm text-foreground">
											Google Calendar integration for automatic task
											scheduling
										</p>
									</div>
									<div class="flex items-start gap-2">
										<CircleCheck
											class="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0"
										/>
										<p class="text-sm text-foreground">
											AI-powered daily briefs to keep you on track
										</p>
									</div>
									<div class="flex items-start gap-2">
										<CircleCheck
											class="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0"
										/>
										<p class="text-sm text-foreground">
											Advanced project phases and timeline management
										</p>
									</div>
									<div class="flex items-start gap-2">
										<CircleCheck
											class="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0"
										/>
										<p class="text-sm text-foreground">
											Priority support and early access to new features
										</p>
									</div>
								</div>
								<a
									href="/pricing"
									class="inline-flex items-center px-5 py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground font-medium text-sm rounded-lg shadow-ink pressable transition-all duration-200"
								>
									<Rocket class="w-4 h-4 mr-2" />
									Get Started — $20/month
								</a>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Template Editor/Preview Modal -->
		{#if editingTemplate}
			<div
				class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
				transition:fade
			>
				<div
					class="bg-card rounded-xl shadow-ink-strong border border-border max-w-4xl w-full max-h-[90vh] overflow-hidden tx tx-frame tx-weak"
					transition:slide
				>
					<div class="p-6 border-b border-border">
						<div class="flex items-center justify-between">
							<h3 class="text-lg font-semibold text-foreground">
								{#if editingTemplate.preview}
									Preview Template: {editingTemplate.name}
								{:else if editingTemplate.id}
									Edit Template
								{:else}
									Create New Template
								{/if}
							</h3>
							<Button
								onclick={closeTemplateEditor}
								variant="ghost"
								size="sm"
								class="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted pressable"
								icon={X}
							></Button>
						</div>
					</div>

					{#if editingTemplate.preview}
						<!-- Preview Mode -->
						<div class="p-6 overflow-y-auto max-h-[60vh]">
							<div class="space-y-4">
								<div>
									<h4 class="text-sm font-medium text-foreground mb-2">
										Description
									</h4>
									<p class="text-muted-foreground">
										{editingTemplate.description || 'No description provided'}
									</p>
								</div>
								<div>
									<h4 class="text-sm font-medium text-foreground mb-2">
										Template Content
									</h4>
									<pre
										class="bg-muted p-4 rounded-lg text-sm font-mono whitespace-pre-wrap overflow-x-auto border border-border text-foreground">
{editingTemplate.template_content}
									</pre>
								</div>
							</div>
						</div>
					{:else}
						<!-- Edit Mode -->
						<form
							method="POST"
							action={editingTemplate.id ? '?/updateTemplate' : '?/createTemplate'}
							use:enhance
							class="contents"
						>
							{#if editingTemplate.id}
								<input type="hidden" name="id" value={editingTemplate.id} />
							{/if}
							<input type="hidden" name="type" value={creatingTemplate} />

							<div class="p-6 overflow-y-auto max-h-[60vh]">
								<div class="space-y-4">
									<FormField label="Name" labelFor="templateName" required>
										<TextInput
											id="templateName"
											name="name"
											bind:value={editingTemplate.name}
											type="text"
											required
											placeholder="Template name"
											size="md"
										/>
									</FormField>
									<FormField label="Description" labelFor="templateDescription">
										<TextInput
											id="templateDescription"
											name="description"
											bind:value={editingTemplate.description}
											type="text"
											placeholder="What this template is used for"
											size="md"
										/>
									</FormField>
									<FormField
										label="Template Content"
										labelFor="template_content"
										required
										hint=""
									>
										<Textarea
											name="template_content"
											bind:value={editingTemplate.template_content}
											rows={12}
											size="md"
											required
											class="font-mono text-sm"
											placeholder="Enter your template content."
										/>
									</FormField>
								</div>
							</div>

							<div class="p-6 border-t border-border flex justify-end space-x-3">
								<Button
									type="button"
									onclick={closeTemplateEditor}
									variant="ghost"
									size="md"
									class="pressable"
								>
									Cancel
								</Button>
								<Button
									type="submit"
									variant="primary"
									size="md"
									class="shadow-ink pressable"
								>
									{editingTemplate.id ? 'Update' : 'Create'} Template
								</Button>
							</div>
						</form>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
