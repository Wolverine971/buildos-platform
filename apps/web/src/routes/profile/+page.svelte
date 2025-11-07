<!-- apps/web/src/routes/profile/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { userContextStore } from '$lib/stores/userContext';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		User,
		CheckCircle,
		Rocket,
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
	import NotificationsTab from '$lib/components/profile/NotificationsTab.svelte';

	export let data: PageData;
	export let form;

	// State
	let saveSuccess = false;
	let saveError = false;
	let errorMessage = '';
	let showOnboardingComplete = data.justCompletedOnboarding || false;
	let activeTab = data.activeTab || 'account'; // Support URL param for initial tab
	let profileTabs: TabNavTab[] = [];

	// Template management state
	let projectTemplates: any[] = data.projectTemplates || [];
	let editingTemplate: any = null;
	let creatingTemplate: 'project' | null = null;

	// Progress data from server
	let progressData = data.progressData || {
		completed: false,
		progress: 0,
		missingFields: [],
		completedFields: [],
		missingRequiredFields: [],
		categoryProgress: {}
	};

	// Handle form submission results
	$: if (form?.success) {
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

	// Watch for URL changes to update active tab
	$: if ($page.url.searchParams.get('tab') !== activeTab) {
		const urlTab = $page.url.searchParams.get('tab');
		if (
			urlTab &&
			['account', 'briefs', 'calendar', 'notifications', 'billing'].includes(urlTab)
		) {
			activeTab = urlTab;
		}
	}

	$: profileTabs = [
		{ id: 'account', label: 'Account', icon: User },
		{ id: 'briefs', label: 'Brief Settings', icon: Bell },
		{ id: 'calendar', label: 'Calendar', icon: Calendar },
		{ id: 'notifications', label: 'Notifications', icon: Bell },
		...(data.stripeEnabled ? [{ id: 'billing', label: 'Billing', icon: CreditCard }] : [])
	];

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

			// Also refresh templates if needed
			if (activeTab === 'prompts') {
				// Fetch templates separately if not handled by store
				const response = await fetch('/api/templates');
				const templateData = await requireApiData<{ projectTemplates?: any[] }>(
					response,
					'Failed to load templates'
				);
				projectTemplates = templateData.projectTemplates || [];
			}
		} catch (error) {
			console.error('Error refreshing data:', error);
			showError('Failed to refresh data');
		}
	}

	// Utility functions for messages
	function showSuccess(message: string) {
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

	function previewTemplate(template: any) {
		editingTemplate = { ...template, preview: true };
	}

	function createNewTemplate() {
		creatingTemplate = 'project';
		editingTemplate = {
			name: '',
			description: '',
			template_content: '',
			user_id: data.user.id,
			in_use: false
		};
	}

	function editTemplate(template: any) {
		editingTemplate = { ...template };
	}

	function closeTemplateEditor() {
		editingTemplate = null;
		creatingTemplate = null;
	}

	function getActiveTemplate() {
		return (
			projectTemplates.find((t) => t.in_use && t.user_id === data.user.id) ||
			projectTemplates.find((t) => t.is_default && !t.user_id)
		);
	}

	// Handle success messages from child components
	function handleComponentSuccess(event: CustomEvent<{ message?: string }>) {
		showSuccess(event.detail?.message || 'Changes saved successfully!');
	}

	// Handle error messages from child components
	function handleComponentError(event: CustomEvent<{ message?: string }>) {
		showError(event.detail?.message || 'An error occurred');
	}

	$: activeProjectTemplate = getActiveTemplate();
	$: storeState = $userContextStore;

	$: if (storeState?.error && browser) {
		showError(storeState.error);
		userContextStore.clearError();
	}

	// Update progress data from store
	$: if (storeState?.progress) {
		progressData = {
			completed: storeState.completedOnboarding,
			progress: storeState.progress.percentage,
			missingFields: storeState.progress.missingCategories,
			completedFields: storeState.progress.completedCategories,
			missingRequiredFields: storeState.progress.missingCategories.filter(
				(cat) => ['projects', 'work_style', 'challenges'].includes(cat) // Top 3 most important
			),
			categoryProgress: storeState.progress.completedCategories.reduce(
				(acc, cat) => {
					acc[cat] = true;
					return acc;
				},
				{} as Record<string, boolean>
			),
			categoryCompletion: storeState.progress.completedCategories.reduce(
				(acc, cat) => {
					acc[cat] = true;
					return acc;
				},
				{} as Record<string, boolean>
			),
			missingCategories: storeState.progress.missingCategories
		};
	}
</script>

<svelte:head>
	<title>Profile & Settings - BuildOS</title>
	<meta
		name="description"
		content="Manage your BuildOS profile, work preferences, and AI prompt templates for personalized productivity assistance."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
		<!-- Success Banner -->
		{#if showOnboardingComplete}
			<div
				class="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
				transition:slide
			>
				<div class="flex items-center">
					<CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400 mr-3" />
					<p class="text-green-700 dark:text-green-300 font-medium">
						Setup complete! BuildOS is now personalized to your workflow and
						preferences.
					</p>
				</div>
			</div>
		{/if}

		{#if saveSuccess}
			<div
				class="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
				transition:slide
			>
				<div class="flex items-center justify-between">
					<div class="flex items-center">
						<CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400 mr-3" />
						<p class="text-green-700 dark:text-green-300 font-medium">
							Changes saved successfully!
						</p>
					</div>
					<Button
						onclick={() => (saveSuccess = false)}
						variant="ghost"
						size="sm"
						class="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
						icon={XCircle}
					></Button>
				</div>
			</div>
		{/if}

		{#if saveError}
			<div
				class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
				transition:slide
			>
				<div class="flex items-center justify-between">
					<div class="flex items-center">
						<AlertCircle class="w-5 h-5 text-red-600 dark:text-red-400 mr-3" />
						<p class="text-red-700 dark:text-red-300 font-medium">
							{errorMessage || 'An error occurred'}
						</p>
					</div>
					<Button
						onclick={() => (saveError = false)}
						variant="ghost"
						size="sm"
						class="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
						icon={XCircle}
					></Button>
				</div>
			</div>
		{/if}

		<!-- Profile Header -->
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-4 sm:mb-6"
		>
			<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
				<div class="flex items-center space-x-3 sm:space-x-4">
					<div
						class="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0"
					>
						<User class="w-6 h-6 sm:w-8 sm:h-8 text-white" />
					</div>
					<div class="min-w-0">
						<h1
							class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate"
						>
							{data.user?.user_metadata?.name || 'Your Profile'}
						</h1>
						<p
							class="text-sm sm:text-base text-gray-600 dark:text-gray-400 flex items-center mt-1 truncate"
						>
							<Mail class="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0" />
							<span class="truncate">{data.user?.email}</span>
						</p>
						{#if data.userContext?.created_at}
							<p
								class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex items-center mt-1"
							>
								<Calendar
									class="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0"
								/>
								Member since {new Date(
									data.userContext.created_at
								).toLocaleDateString()}
							</p>
						{/if}
					</div>
				</div>

				<div class="flex items-center">
					{#if !data.userContext || !data.completedOnboarding || progressData.missingRequiredFields?.length > 0}
						<Button
							onclick={() => goto('/onboarding')}
							variant="primary"
							size="sm"
							class="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200 w-full sm:w-auto text-xs sm:text-sm"
						>
							{#if progressData.missingRequiredFields?.length > 0}
								<AlertCircle class="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
								<span class="hidden sm:inline">Complete Onboarding</span>
								<span class="sm:hidden">Complete Setup</span>
							{:else}
								<Sparkles class="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
								<span class="hidden sm:inline">Start Onboarding</span>
								<span class="sm:hidden">Get Started</span>
							{/if}
						</Button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Tab Navigation -->
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 sm:mb-6"
		>
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
				on:success={handleComponentSuccess}
				on:error={handleComponentError}
			/>
		{:else if activeTab === 'briefs'}
			<!-- Use the new BriefsTab component -->
			<BriefsTab on:success={handleComponentSuccess} on:error={handleComponentError} />
		{:else if activeTab === 'calendar'}
			<!-- Use the new CalendarTab component -->
			<CalendarTab
				{data}
				{form}
				on:success={handleComponentSuccess}
				on:error={handleComponentError}
			/>
		{:else if activeTab === 'notifications'}
			<!-- Use the new NotificationsTab component -->
			<NotificationsTab userId={data.user.id} />
		{:else if activeTab === 'billing' && data.stripeEnabled}
			<!-- Billing/Subscription Tab -->
			<div class="space-y-4 sm:space-y-6">
				{#if data.subscriptionDetails?.subscription}
					<!-- Active Subscription -->
					<div
						class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
					>
						<div class="p-4 sm:p-6">
							<div
								class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6"
							>
								<div class="flex items-center gap-3">
									<div
										class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg flex-shrink-0"
									>
										<CheckCircle
											class="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400"
										/>
									</div>
									<div>
										<h2
											class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white"
										>
											{data.subscriptionDetails.subscription
												.subscription_plans?.name || 'Pro Plan'}
										</h2>
										<p
											class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1"
										>
											Active subscription
										</p>
									</div>
								</div>

								<div class="text-left sm:text-right">
									<p
										class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white"
									>
										${(
											data.subscriptionDetails.subscription.subscription_plans
												?.price_cents / 100
										).toFixed(2)}
										<span class="text-sm font-normal text-gray-500"
											>/{data.subscriptionDetails.subscription
												.subscription_plans?.billing_interval}</span
										>
									</p>
									<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
										Next billing: {data.subscriptionDetails.subscription
											.current_period_end
											? new Date(
													data.subscriptionDetails.subscription.current_period_end
												).toLocaleDateString()
											: 'N/A'}
									</p>
								</div>
							</div>

							<div class="border-t border-gray-200 dark:border-gray-700 pt-4">
								<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
									<div>
										<p
											class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
										>
											Status
										</p>
										<p
											class="text-sm text-gray-600 dark:text-gray-400 capitalize"
										>
											{data.subscriptionDetails.subscription.status}
										</p>
									</div>
									<div>
										<p
											class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
										>
											Member since
										</p>
										<p class="text-sm text-gray-600 dark:text-gray-400">
											{data.subscriptionDetails.subscription.created_at
												? new Date(
														data.subscriptionDetails.subscription.created_at
													).toLocaleDateString()
												: 'N/A'}
										</p>
									</div>
								</div>

								<div class="mt-4 sm:mt-6">
									<form method="POST" action="/api/stripe/portal" use:enhance>
										<Button
											type="submit"
											variant="secondary"
											size="sm"
											class="sm:size-md w-full sm:w-auto"
											icon={Settings}
										>
											Manage Subscription
										</Button>
									</form>
								</div>
							</div>
						</div>
					</div>

					<!-- Invoice Settings Info -->
					<div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4 mt-4">
						<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							Invoice Information
						</h4>
						<div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 space-y-1">
							<p>• Invoices are automatically sent to your email</p>
							<p>
								• Tax ID and business details can be updated in the billing portal
							</p>
							<p>• All invoices include applicable taxes</p>
						</div>
					</div>

					<!-- Payment History -->
					{#if data.subscriptionDetails.invoices.length > 0}
						<div
							class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
						>
							<div class="p-4 sm:p-6">
								<h3
									class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4"
								>
									Payment History
								</h3>
								<div class="space-y-3">
									{#each data.subscriptionDetails.invoices as invoice}
										<div
											class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0"
										>
											<div>
												<p
													class="text-sm sm:text-base font-medium text-gray-900 dark:text-white"
												>
													${(invoice.amount_paid / 100).toFixed(2)}
												</p>
												<p
													class="text-xs sm:text-sm text-gray-600 dark:text-gray-400"
												>
													{invoice.created_at
														? new Date(
																invoice.created_at
															).toLocaleDateString()
														: 'N/A'}
												</p>
											</div>
											<div class="text-left sm:text-right">
												<p
													class="text-xs sm:text-sm font-medium capitalize text-gray-700 dark:text-gray-300"
												>
													{invoice.status}
												</p>
												{#if invoice.invoice_pdf}
													<a
														href={invoice.invoice_pdf}
														target="_blank"
														rel="noopener noreferrer"
														class="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
													>
														Download PDF
													</a>
												{:else if invoice.stripe_invoice_id}
													<Button
														onclick={() =>
															downloadInvoice(
																invoice.stripe_invoice_id
															)}
														variant="ghost"
														size="sm"
														class="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
													>
														Generate PDF
													</Button>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						</div>
					{/if}
				{:else}
					<!-- No Subscription -->
					<div
						class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
					>
						<div class="p-6 text-center">
							<div class="max-w-md mx-auto">
								<div
									class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center"
								>
									<Sparkles class="w-8 h-8 text-blue-600 dark:text-blue-400" />
								</div>
								<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
									Upgrade to Pro
								</h2>
								<p class="text-gray-600 dark:text-gray-400 mb-6">
									Unlock all features and take your productivity to the next level
								</p>
								<div class="space-y-3 text-left max-w-sm mx-auto mb-6">
									<div class="flex items-start">
										<CheckCircle
											class="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0"
										/>
										<p class="text-sm text-gray-700 dark:text-gray-300">
											Google Calendar integration for automatic task
											scheduling
										</p>
									</div>
									<div class="flex items-start">
										<CheckCircle
											class="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0"
										/>
										<p class="text-sm text-gray-700 dark:text-gray-300">
											AI-powered daily briefs to keep you on track
										</p>
									</div>
									<div class="flex items-start">
										<CheckCircle
											class="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0"
										/>
										<p class="text-sm text-gray-700 dark:text-gray-300">
											Advanced project phases and timeline management
										</p>
									</div>
									<div class="flex items-start">
										<CheckCircle
											class="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0"
										/>
										<p class="text-sm text-gray-700 dark:text-gray-300">
											Priority support and early access to new features
										</p>
									</div>
								</div>
								<a
									href="/pricing"
									class="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200"
								>
									<Rocket class="w-5 h-5 mr-2" />
									Get Started - $20/month
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
					class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
					transition:slide
				>
					<div class="p-6 border-b border-gray-200 dark:border-gray-700">
						<div class="flex items-center justify-between">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
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
								class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
								icon={X}
							></Button>
						</div>
					</div>

					{#if editingTemplate.preview}
						<!-- Preview Mode -->
						<div class="p-6 overflow-y-auto max-h-[60vh]">
							<div class="space-y-4">
								<div>
									<h4
										class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
									>
										Description
									</h4>
									<p class="text-gray-600 dark:text-gray-400">
										{editingTemplate.description || 'No description provided'}
									</p>
								</div>
								<div>
									<h4
										class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
									>
										Template Content
									</h4>
									<pre
										class="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg text-sm font-mono whitespace-pre-wrap overflow-x-auto">
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

							<div
								class="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3"
							>
								<Button
									type="button"
									onclick={closeTemplateEditor}
									variant="ghost"
									size="md"
								>
									Cancel
								</Button>
								<Button type="submit" variant="primary" size="md">
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
