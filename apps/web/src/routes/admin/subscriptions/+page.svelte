<!-- apps/web/src/routes/admin/subscriptions/+page.svelte -->
<script lang="ts">
	import {
		Search,
		ChevronLeft,
		ChevronRight,
		User,
		AlertCircle,
		CheckCircle,
		XCircle,
		Clock,
		MoreVertical,
		RefreshCw,
		Ban,
		Gift,
		CreditCard,
		Mail
	} from 'lucide-svelte';
	import { browser } from '$app/environment';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import EmailComposerModal from '$lib/components/admin/EmailComposerModal.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let users = $state<any[]>([]);
	let searchQuery = $state('');
	let statusFilter = $state('all');
	let currentPage = $state(1);
	let totalPages = $state(1);
	let totalUsers = $state(0);
	let selectedUser = $state<any>(null);
	let showActionMenu = $state<string | null>(null);
	let processingAction = $state(false);
	let showEmailModal = $state(false);
	let emailUserId = $state('');
	let emailUserName = $state('');
	let emailUserEmail = $state('');

	const ITEMS_PER_PAGE = 50;

	// Load users on mount and when filters change
	$effect(() => {
		if (!browser) return;
		statusFilter; // Track dependency
		currentPage; // Track dependency
		loadUsers();
	});

	async function loadUsers() {
		if (!browser) return;
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				page: currentPage.toString(),
				limit: ITEMS_PER_PAGE.toString(),
				status: statusFilter,
				search: searchQuery
			});

			const response = await fetch(`/api/admin/subscriptions/users?${params}`);
			if (!response.ok) throw new Error('Failed to load users');

			const result = await response.json();
			if (result.success) {
				users = result.data.users;
				totalUsers = result.data.pagination.total;
				totalPages = result.data.pagination.totalPages;
			} else {
				throw new Error(result.error || 'Failed to load users');
			}
		} catch (err) {
			console.error('Error loading users:', err);
			error = err instanceof Error ? err.message : 'Failed to load users';
		} finally {
			isLoading = false;
		}
	}

	async function searchUsers() {
		currentPage = 1;
		await loadUsers();
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'active':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
			case 'trialing':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
			case 'canceled':
				return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
			case 'past_due':
				return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
			case 'unpaid':
				return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
		}
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'active':
				return CheckCircle;
			case 'trialing':
				return Clock;
			case 'canceled':
				return XCircle;
			case 'past_due':
				return AlertCircle;
			default:
				return AlertCircle;
		}
	}

	async function performAction(action: string, userId: string, subscriptionId: string) {
		if (processingAction) return;
		processingAction = true;
		showActionMenu = null;

		try {
			let body: any = { action, userId, subscriptionId };

			if (action === 'cancel') {
				const reason = prompt('Please provide a reason for cancellation:');
				if (!reason) {
					processingAction = false;
					return;
				}
				body.reason = reason;
			}

			if (action === 'add_discount') {
				const discountCode = prompt('Enter discount code to apply:');
				if (!discountCode) {
					processingAction = false;
					return;
				}
				body.discountCode = discountCode;
			}

			const response = await fetch('/api/admin/subscriptions/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) throw new Error('Action failed');

			// Reload users after action
			await loadUsers();
		} catch (err) {
			console.error('Error performing action:', err);
			alert('Failed to perform action. Please try again.');
		} finally {
			processingAction = false;
		}
	}

	function toggleActionMenu(userId: string) {
		showActionMenu = showActionMenu === userId ? null : userId;
	}

	// Close action menu when clicking outside
	function handleClickOutside(event: MouseEvent) {
		if (showActionMenu && !(event.target as Element).closest('[data-action-menu]')) {
			showActionMenu = null;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<svelte:head>
	<title>Subscription Management - Admin</title>
</svelte:head>

<div class="admin-page">
	<div class="admin-page">
		<!-- Header with Back Button -->
		<AdminPageHeader
			title="Subscription Management"
			description="Manage user subscriptions and billing"
			icon={CreditCard}
			backHref="/admin"
			backLabel="Dashboard"
		/>

		<!-- Filters and Search -->
		<div class="admin-panel p-4">
			<div class="flex flex-col sm:flex-row gap-4">
				<!-- Search -->
				<div class="flex-1">
					<TextInput
						type="text"
						bind:value={searchQuery}
						onkeyup={(e) => e.key === 'Enter' && searchUsers()}
						placeholder="Search by email or name..."
						size="md"
					/>
				</div>

				<!-- Status Filter -->
				<Select
					bind:value={statusFilter}
					onchange={(e) => (statusFilter = e.detail)}
					size="md"
					placeholder="All Statuses"
				>
					<option value="all">All Statuses</option>
					<option value="active">Active</option>
					<option value="trialing">Trial</option>
					<option value="past_due">Past Due</option>
					<option value="canceled">Canceled</option>
					<option value="none">No Subscription</option>
				</Select>

				<!-- Search Button -->
				<Button
					onclick={searchUsers}
					disabled={isLoading}
					variant="primary"
					size="md"
					icon={Search}
				>
					Search
				</Button>

				<!-- Refresh -->
				<Button
					onclick={loadUsers}
					disabled={isLoading}
					variant="secondary"
					size="md"
					icon={RefreshCw}
					class={isLoading ? 'animate-spin' : ''}
				/>
			</div>
		</div>

		{#if error}
			<div
				class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 dark:bg-red-900/20 dark:border-red-800"
			>
				<div class="flex items-center">
					<AlertCircle class="h-5 w-5 text-red-600 mr-2" />
					<p class="text-red-800 dark:text-red-200">{error}</p>
				</div>
			</div>
		{/if}

		<!-- Users Table -->
		<div class="admin-panel overflow-hidden">
			{#if isLoading}
				<div class="p-8 text-center">
					<RefreshCw class="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
					<p class="text-gray-500 dark:text-gray-400">Loading users...</p>
				</div>
			{:else if users.length === 0}
				<div class="p-8 text-center">
					<User class="h-12 w-12 text-gray-400 mx-auto mb-4" />
					<p class="text-gray-500 dark:text-gray-400">No users found</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
						<thead class="bg-gray-50 dark:bg-gray-700">
							<tr>
								<th
									class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
								>
									User
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
								>
									Subscription
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
								>
									Status
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
								>
									Revenue
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
								>
									Next Billing
								</th>
								<th class="relative px-6 py-3">
									<span class="sr-only">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody
							class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
						>
							{#each users as user}
								{@const subscription = user.customer_subscriptions?.[0]}
								<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex items-center">
											<div>
												<div
													class="text-sm font-medium text-gray-900 dark:text-white"
												>
													{user.name || 'Unnamed User'}
												</div>
												<div
													class="text-sm text-gray-500 dark:text-gray-400"
												>
													{user.email}
												</div>
											</div>
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										{#if subscription}
											<div class="text-sm text-gray-900 dark:text-white">
												{subscription.subscription_plans?.name ||
													'Unknown Plan'}
											</div>
											<div class="text-sm text-gray-500 dark:text-gray-400">
												${(
													subscription.subscription_plans?.price / 100
												).toFixed(2)}/{subscription.subscription_plans
													?.interval}
											</div>
										{:else}
											<span class="text-sm text-gray-500 dark:text-gray-400">
												No subscription
											</span>
										{/if}
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										{#if subscription}
											{@const StatusIcon = getStatusIcon(subscription.status)}
											<span
												class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-center font-medium {getStatusColor(
													subscription.status
												)}"
											>
												<StatusIcon class="w-3 h-3 mr-1" />
												{subscription.status}
											</span>
										{:else}
											<span
												class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-center font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
											>
												None
											</span>
										{/if}
									</td>
									<td
										class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
									>
										{#if subscription}
											${(
												(subscription.subscription_plans?.price || 0) / 100
											).toFixed(2)}
										{:else}
											$0.00
										{/if}
									</td>
									<td
										class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400"
									>
										{#if subscription?.current_period_end}
											{new Date(
												subscription.current_period_end
											).toLocaleDateString()}
										{:else}
											-
										{/if}
									</td>
									<td
										class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
									>
										{#if subscription}
											<div class="relative" data-action-menu>
												<Button
													onclick={(e) => {
														e.stopPropagation();
														toggleActionMenu(user.id);
													}}
													variant="ghost"
													size="sm"
													icon={MoreVertical}
													btnType="container"
													class="!p-1"
												/>

												{#if showActionMenu === user.id}
													<div
														class="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-700 rounded-md shadow-lg z-10 border border-gray-200 dark:border-gray-600"
													>
														<div class="py-1">
															{#if subscription.status === 'active'}
																<Button
																	onclick={() =>
																		performAction(
																			'cancel',
																			user.id,
																			subscription.id
																		)}
																	variant="ghost"
																	size="sm"
																	icon={Ban}
																	class="w-full justify-start text-left"
																>
																	Cancel Subscription
																</Button>
															{/if}

															{#if subscription.status === 'trialing'}
																<Button
																	onclick={() =>
																		performAction(
																			'extend_trial',
																			user.id,
																			subscription.id
																		)}
																	variant="ghost"
																	size="sm"
																	icon={Clock}
																	class="w-full justify-start text-left"
																>
																	Extend Trial
																</Button>
															{/if}

															<Button
																onclick={() =>
																	performAction(
																		'add_discount',
																		user.id,
																		subscription.id
																	)}
																variant="ghost"
																size="sm"
																icon={Gift}
																class="w-full justify-start text-left"
															>
																Apply Discount
															</Button>

															<Button
																onclick={() => {
																	emailUserId = user.id;
																	emailUserName = user.name;
																	emailUserEmail = user.email;
																	showEmailModal = true;
																	showActionMenu = null;
																}}
																variant="ghost"
																size="sm"
																icon={Mail}
																class="w-full justify-start text-left"
															>
																Send Email
															</Button>

															<a
																href="/admin/users/{user.id}"
																class="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
															>
																<User class="w-4 h-4 mr-2" />
																View User Details
															</a>
														</div>
													</div>
												{/if}
											</div>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Pagination -->
				<div
					class="bg-gray-50 dark:bg-gray-700 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-600 sm:px-6"
				>
					<div class="flex-1 flex justify-between sm:hidden">
						<Button
							onclick={() => (currentPage = Math.max(1, currentPage - 1))}
							disabled={currentPage === 1}
							variant="secondary"
							size="sm"
						>
							Previous
						</Button>
						<Button
							onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
							disabled={currentPage === totalPages}
							variant="secondary"
							size="sm"
						>
							Next
						</Button>
					</div>
					<div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
						<div>
							<p class="text-sm text-gray-700 dark:text-gray-300">
								Showing page <span class="font-medium">{currentPage}</span> of
								<span class="font-medium">{totalPages}</span>
								({totalUsers} total users)
							</p>
						</div>
						<div>
							<nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
								<Button
									onclick={() => (currentPage = Math.max(1, currentPage - 1))}
									disabled={currentPage === 1}
									variant="secondary"
									size="sm"
									icon={ChevronLeft}
									class="rounded-r-none"
								/>
								<Button
									onclick={() =>
										(currentPage = Math.min(totalPages, currentPage + 1))}
									disabled={currentPage === totalPages}
									variant="secondary"
									size="sm"
									icon={ChevronRight}
									class="rounded-l-none -ml-px"
								/>
							</nav>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Email Composer Modal -->
<EmailComposerModal
	bind:isOpen={showEmailModal}
	userId={emailUserId}
	userName={emailUserName}
	userEmail={emailUserEmail}
	on:emailSent={() => {
		showEmailModal = false;
	}}
/>
