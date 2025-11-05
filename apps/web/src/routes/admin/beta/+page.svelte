<!-- apps/web/src/routes/admin/beta/+page.svelte -->
<script lang="ts">
	import {
		UserCheck,
		Filter,
		ChevronLeft,
		ChevronRight,
		ChevronUp,
		ChevronDown,
		RefreshCw,
		Eye,
		CheckCircle,
		XCircle,
		UserPlus,
		Users,
		Shield,
		ShieldOff,
		X,
		Mail,
		Table,
		Download
	} from 'lucide-svelte';
	import { browser } from '$app/environment';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import EmailManager from '$lib/components/email/EmailManager.svelte';
	import EmailComposerModal from '$lib/components/admin/EmailComposerModal.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { formatDateTimeForDisplay } from '$lib/utils/date-utils';

	let activeTab = $state<'signups' | 'members' | 'emails' | 'dataview'>('signups');
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let searchQuery = $state('');
	let currentPage = $state(1);
	let totalPages = $state(1);
	let totalItems = $state(0);
	let selectedItem = $state<any>(null);
	let showModal = $state(false);
	let showMobileFilters = $state(false);
	let showEmailModal = $state(false);
	let emailUserId = $state('');
	let emailUserName = $state('');
	let emailUserEmail = $state('');

	// Approval confirmation modal state
	let showApprovalModal = $state(false);
	let pendingApprovalSignup = $state<any>(null);
	let isApproving = $state(false);

	// Signups data
	let signups = $state<any[]>([]);
	let signupFilters = $state({
		status: 'all',
		sortBy: 'created_at',
		sortOrder: 'desc'
	});

	// Members data
	let members = $state<any[]>([]);
	let memberFilters = $state({
		tier: 'all',
		activeOnly: false,
		sortBy: 'joined_at',
		sortOrder: 'desc'
	});

	// Data view specific state
	let dataViewFilters = $state({
		status: 'all',
		sortBy: 'created_at',
		sortOrder: 'desc',
		showAllColumns: false
	});

	// Actions
	let isUpdating = $state(false);

	// Add sorting functions for signups and members tables
	function handleSignupSort(column: string) {
		if (signupFilters.sortBy === column) {
			signupFilters.sortOrder = signupFilters.sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			signupFilters.sortBy = column;
			signupFilters.sortOrder = 'desc';
		}
		currentPage = 1;
		loadSignups();
	}

	function handleMemberSort(column: string) {
		if (memberFilters.sortBy === column) {
			memberFilters.sortOrder = memberFilters.sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			memberFilters.sortBy = column;
			memberFilters.sortOrder = 'desc';
		}
		currentPage = 1;
		loadMembers();
	}

	// onMount removed - effects handle initial load

	function handleSort(column) {
		if (dataViewFilters.sortBy === column) {
			// If already sorting by this column, toggle the order
			dataViewFilters.sortOrder = dataViewFilters.sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			// If sorting by a new column, set it and default to ascending
			dataViewFilters.sortBy = column;
			dataViewFilters.sortOrder = 'asc';
		}

		// Reset to first page when sorting changes
		currentPage = 1;

		// The reactive statement will automatically trigger loadSignups()
	}

	// Optional: Add a function to get sort icon component (if you want to refactor the inline SVG)
	function getSortIcon(column) {
		if (dataViewFilters.sortBy === column) {
			return dataViewFilters.sortOrder === 'asc' ? ChevronUp : ChevronDown;
		}
		return null;
	}

	// Enhanced function to handle referral source display
	function formatReferralSource(source) {
		if (!source) return 'Not specified';

		// Convert common sources to more readable format
		const sourceMap = {
			google: 'Google Search',
			social_media: 'Social Media',
			word_of_mouth: 'Word of Mouth',
			newsletter: 'Newsletter',
			blog_post: 'Blog Post',
			youtube: 'YouTube',
			twitter: 'Twitter',
			linkedin: 'LinkedIn',
			reddit: 'Reddit',
			hacker_news: 'Hacker News',
			product_hunt: 'Product Hunt',
			referral: 'Referral',
			direct: 'Direct',
			other: 'Other'
		};

		return sourceMap[source.toLowerCase()] || source;
	}

	// Load signups when on signups tab and filters change
	$effect(() => {
		if (activeTab === 'signups') {
			searchQuery;
			signupFilters.status;
			signupFilters.sortBy;
			signupFilters.sortOrder;

			currentPage = 1;
			loadSignups();
		}
	});

	// Load signups when on dataview tab and filters change
	$effect(() => {
		if (activeTab === 'dataview') {
			searchQuery;
			dataViewFilters.status;
			dataViewFilters.sortBy;
			dataViewFilters.sortOrder;

			currentPage = 1;
			loadSignups();
		}
	});

	// Load members when on members tab and filters change
	$effect(() => {
		if (activeTab === 'members') {
			searchQuery;
			memberFilters.tier;
			memberFilters.activeOnly;
			memberFilters.sortBy;
			memberFilters.sortOrder;

			currentPage = 1;
			loadMembers();
		}
	});

	// Load data when tab changes
	$effect(() => {
		activeTab; // Track tab changes
		currentPage = 1;
		loadData();
	});

	async function loadData() {
		if (activeTab === 'signups' || activeTab === 'dataview') {
			await loadSignups();
		} else if (activeTab === 'members') {
			await loadMembers();
		}
	}

	async function loadSignups() {
		if (!browser) return;
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				page: currentPage.toString(),
				limit: activeTab === 'dataview' ? '50' : '20',
				search: searchQuery,
				sort_by: activeTab === 'dataview' ? dataViewFilters.sortBy : signupFilters.sortBy,
				sort_order:
					activeTab === 'dataview' ? dataViewFilters.sortOrder : signupFilters.sortOrder
			});

			const statusFilter =
				activeTab === 'dataview' ? dataViewFilters.status : signupFilters.status;
			if (statusFilter !== 'all') {
				params.set('status', statusFilter);
			}

			const response = await fetch(`/api/admin/beta/signups?${params}`);
			if (!response.ok) throw new Error('Failed to load signups');

			const data = await response.json();
			signups = data.signups;
			totalPages = data.pagination.total_pages;
			totalItems = data.pagination.total_items;
		} catch (err) {
			console.error('Error loading signups:', err);
			error = err instanceof Error ? err.message : 'Failed to load signups';
		} finally {
			isLoading = false;
		}
	}

	async function loadMembers() {
		if (!browser) return;
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				page: currentPage.toString(),
				limit: '20',
				search: searchQuery,
				sort_by: memberFilters.sortBy,
				sort_order: memberFilters.sortOrder
			});

			if (memberFilters.tier !== 'all') {
				params.set('tier', memberFilters.tier);
			}

			if (memberFilters.activeOnly) {
				params.set('active_only', 'true');
			}

			const response = await fetch(`/api/admin/beta/members?${params}`);
			if (!response.ok) throw new Error('Failed to load members');

			const data = await response.json();
			members = data.members;
			totalPages = data.pagination.total_pages;
			totalItems = data.pagination.total_items;
		} catch (err) {
			console.error('Error loading members:', err);
			error = err instanceof Error ? err.message : 'Failed to load members';
		} finally {
			isLoading = false;
		}
	}

	// Show approval confirmation modal
	function showApprovalConfirmation(signup: any) {
		pendingApprovalSignup = signup;
		showApprovalModal = true;
	}

	// Handle approval confirmation
	async function handleApprovalConfirm() {
		if (!pendingApprovalSignup) return;

		showModal = false;

		isApproving = true;

		try {
			const response = await fetch('/api/admin/beta/signups', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					signup_id: pendingApprovalSignup.id,
					status: 'approved',
					create_member: true,
					send_approval_email: true
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to approve signup');
			}

			await loadSignups();
			if (selectedItem && selectedItem.id === pendingApprovalSignup.id) {
				selectedItem.signup_status = 'approved';
			}

			// Close modals and reset state
			showApprovalModal = false;
			pendingApprovalSignup = null;
		} catch (err) {
			console.error('Error approving signup:', err);
			error = err instanceof Error ? err.message : 'Failed to approve signup';
		} finally {
			isApproving = false;
		}
	}

	// Handle approval cancellation
	function handleApprovalCancel() {
		showApprovalModal = false;
		pendingApprovalSignup = null;
	}

	async function updateSignupStatus(
		signupId: string,
		status: string,
		createMember: boolean = false
	) {
		if (isUpdating) return;
		isUpdating = true;

		try {
			const response = await fetch('/api/admin/beta/signups', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					signup_id: signupId,
					status: status,
					create_member: createMember
				})
			});

			if (!response.ok) throw new Error('Failed to update signup');

			await loadSignups();
			if (selectedItem && selectedItem.id === signupId) {
				selectedItem.signup_status = status;
			}
		} catch (err) {
			console.error('Error updating signup:', err);
			error = err instanceof Error ? err.message : 'Failed to update signup';
		} finally {
			isUpdating = false;
		}
	}

	async function updateMember(memberId: string, updates: any) {
		if (isUpdating) return;
		isUpdating = true;

		try {
			const response = await fetch('/api/admin/beta/members', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					member_id: memberId,
					updates: updates
				})
			});

			if (!response.ok) throw new Error('Failed to update member');

			await loadMembers();
			if (selectedItem && selectedItem.id === memberId) {
				Object.assign(selectedItem, updates);
			}
		} catch (err) {
			console.error('Error updating member:', err);
			error = err instanceof Error ? err.message : 'Failed to update member';
		} finally {
			isUpdating = false;
		}
	}

	function formatDate(dateString: string): string {
		return formatDateTimeForDisplay(dateString);
	}

	function getStatusColor(status: string): string {
		const colors = {
			pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
			approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
			declined: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
			waitlist: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
		};
		return colors[status as keyof typeof colors] || colors.pending;
	}

	function getTierColor(tier: string): string {
		const colors = {
			founder: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
			early: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
			standard: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
		};
		return colors[tier as keyof typeof colors] || colors.standard;
	}

	function truncateText(text: string | null, maxLength: number): string {
		if (!text) return '';
		return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
	}

	function exportToCSV() {
		if (!signups.length) return;

		const headers = [
			'Name',
			'Email',
			'Company',
			'Job Title',
			'Status',
			'Referral Source',
			'Why Interested',
			'Biggest Challenge',
			'Tools Used',
			'Wants Weekly Calls',
			'Wants Community',
			'Timezone',
			'Applied Date',
			'Approved Date'
		];

		const csvContent = [
			headers.join(','),
			...signups.map((signup) =>
				[
					`"${signup.full_name || ''}"`,
					`"${signup.email || ''}"`,
					`"${signup.company_name || ''}"`,
					`"${signup.job_title || ''}"`,
					`"${signup.signup_status || ''}"`,
					`"${signup.referral_source || ''}"`,
					`"${(signup.why_interested || '').replace(/"/g, '""')}"`,
					`"${(signup.biggest_challenge || '').replace(/"/g, '""')}"`,
					`"${(signup.productivity_tools || []).join('; ')}"`,
					`"${signup.wants_weekly_calls ? 'Yes' : 'No'}"`,
					`"${signup.wants_community_access ? 'Yes' : 'No'}"`,
					`"${signup.user_timezone || ''}"`,
					`"${formatDate(signup.created_at)}"`,
					`"${signup.approved_at ? formatDate(signup.approved_at) : ''}"`
				].join(',')
			)
		].join('\n');

		const blob = new Blob([csvContent], { type: 'text/csv' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `beta-signups-${new Date().toISOString().split('T')[0]}.csv`;
		a.click();
		window.URL.revokeObjectURL(url);
	}

	function nextPage() {
		if (currentPage < totalPages) {
			currentPage++;
			loadData();
		}
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			loadData();
		}
	}
</script>

<svelte:head>
	<title>Beta Program Management - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
		<!-- Header with Back Button -->
		<AdminPageHeader
			title="Beta Program Management"
			description="Manage beta signups, members, and email communications"
			icon={UserCheck}
			backHref="/admin"
			backLabel="Dashboard"
		>
			<div slot="actions" class="flex items-center space-x-4">
				<div class="text-sm text-gray-600 dark:text-gray-400">
					{totalItems} total {activeTab === 'emails'
						? 'emails'
						: activeTab === 'dataview'
							? 'signups'
							: activeTab}
				</div>
				{#if activeTab === 'dataview'}
					<Button
						onclick={exportToCSV}
						variant="primary"
						size="md"
						icon={Download}
						iconPosition="left"
						class="bg-green-600 hover:bg-green-700"
						title="Export to CSV"
					>
						<span class="hidden lg:inline">Export CSV</span>
					</Button>
				{/if}
				{#if activeTab !== 'emails'}
					<Button
						onclick={loadData}
						disabled={isLoading}
						variant="primary"
						size="md"
						loading={isLoading}
						icon={RefreshCw}
						iconPosition="left"
					>
						<span class="hidden lg:inline">Refresh</span>
					</Button>
				{/if}
			</div>
		</AdminPageHeader>

		<!-- Tabs - Mobile Responsive -->
		<div class="border-b border-gray-200 dark:border-gray-700 mb-4">
			<nav class="-mb-px flex overflow-x-auto">
				<Button
					onclick={() => (activeTab = 'signups')}
					variant="ghost"
					size="md"
					class="flex-shrink-0 py-2 px-3 sm:px-4 border-b-2 font-medium text-sm rounded-none {activeTab ===
					'signups'
						? 'border-blue-500 text-blue-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
					icon={UserPlus}
				>
					<span class="hidden xs:inline">Signups</span>
				</Button>
				<Button
					onclick={() => (activeTab = 'dataview')}
					variant="ghost"
					size="md"
					class="flex-shrink-0 py-2 px-3 sm:px-4 border-b-2 font-medium text-sm rounded-none {activeTab ===
					'dataview'
						? 'border-blue-500 text-blue-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
					icon={Table}
				>
					<span class="hidden xs:inline">Data View</span>
				</Button>
				<Button
					onclick={() => (activeTab = 'members')}
					variant="ghost"
					size="md"
					class="flex-shrink-0 py-2 px-3 sm:px-4 border-b-2 font-medium text-sm rounded-none {activeTab ===
					'members'
						? 'border-blue-500 text-blue-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
					icon={Users}
				>
					<span class="hidden xs:inline">Members</span>
				</Button>
				<Button
					onclick={() => (activeTab = 'emails')}
					variant="ghost"
					size="md"
					class="flex-shrink-0 py-2 px-3 sm:px-4 border-b-2 font-medium text-sm rounded-none {activeTab ===
					'emails'
						? 'border-blue-500 text-blue-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
					icon={Mail}
				>
					<span class="hidden xs:inline">Emails</span>
				</Button>
			</nav>
		</div>

		<!-- Content Based on Active Tab -->
		{#if activeTab === 'emails'}
			<!-- Email Management Component -->
			<EmailManager />
		{:else if activeTab === 'dataview'}
			<!-- Enhanced Data View Table Section - Replace the existing data view table in your component -->

			<!-- Data View Tab Content -->
			<!-- Filters for Data View -->
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 mb-4">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
						Comprehensive Signup Data
					</h3>
					<div class="flex items-center space-x-2">
						<label class="flex items-center text-sm text-gray-600 dark:text-gray-400">
							<input
								type="checkbox"
								bind:checked={dataViewFilters.showAllColumns}
								class="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							Show all columns
						</label>
					</div>
				</div>

				<!-- Data View Filters -->
				<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
					<!-- Search -->
					<div class="md:col-span-2">
						<TextInput
							type="text"
							bind:value={searchQuery}
							placeholder="Search by name, email, or company..."
							size="md"
						/>
					</div>

					<!-- Status Filter -->
					<div>
						<Select
							bind:value={dataViewFilters.status}
							onchange={(e) => (dataViewFilters.status = e.detail)}
							size="md"
						>
							<option value="all">All Status</option>
							<option value="pending">Pending</option>
							<option value="approved">Approved</option>
							<option value="declined">Declined</option>
							<option value="waitlist">Waitlist</option>
						</Select>
					</div>

					<!-- Quick Sort (in addition to clickable headers) -->
					<div>
						<Select
							bind:value={dataViewFilters.sortBy}
							onchange={(e) => (dataViewFilters.sortBy = e.detail)}
							size="md"
						>
							<option value="created_at">Date Applied</option>
							<option value="full_name">Name</option>
							<option value="company_name">Company</option>
							<option value="signup_status">Status</option>
							<option value="referral_source">Referral Source</option>
						</Select>
					</div>
				</div>
			</div>

			{#if error}
				<div
					class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 dark:bg-red-900/20 dark:border-red-800"
				>
					<p class="text-red-800 dark:text-red-200">{error}</p>
				</div>
			{/if}

			<!-- Enhanced Data View Table -->
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
				{#if isLoading}
					<div class="p-6 sm:p-8 text-center">
						<RefreshCw class="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
						<p class="text-gray-600 dark:text-gray-400">Loading signup data...</p>
					</div>
				{:else if signups.length === 0}
					<div class="p-6 sm:p-8 text-center">
						<Table class="h-12 w-12 sm:h-16 sm:w-16 text-gray-400 mx-auto mb-4" />
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
							No Signup Data Found
						</h3>
						<p class="text-gray-600 dark:text-gray-400">
							{searchQuery
								? 'Try adjusting your search criteria.'
								: 'No beta signups yet.'}
						</p>
					</div>
				{:else}
					<!-- Responsive Data Table with Clickable Headers -->
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
							<thead class="bg-gray-50 dark:bg-gray-900">
								<tr>
									<!-- Contact Info - Sticky Column (Non-sortable for UX) -->
									<th
										class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-900 z-10"
									>
										Contact Info
									</th>

									<!-- Sortable Status Header -->
									<th
										class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
										onclick={() => handleSort('signup_status')}
										title="Click to sort by status"
									>
										<div class="flex items-center space-x-1">
											<span>Status</span>
											{#if dataViewFilters.sortBy === 'signup_status'}
												{#if dataViewFilters.sortOrder === 'asc'}
													<ChevronUp class="h-4 w-4" />
												{:else}
													<ChevronDown class="h-4 w-4" />
												{/if}
											{:else}
												<span
													class="h-4 w-4 flex items-center justify-center text-gray-300"
												>
													<svg
														class="h-3 w-3"
														fill="currentColor"
														viewBox="0 0 20 20"
													>
														<path d="M5 8l5-5 5 5H5z" />
														<path d="M5 12l5 5 5-5H5z" />
													</svg>
												</span>
											{/if}
										</div>
									</th>

									<!-- Sortable Referral Source Header -->
									<th
										class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
										onclick={() => handleSort('referral_source')}
										title="Click to sort by referral source"
									>
										<div class="flex items-center space-x-1">
											<span>Source</span>
											{#if dataViewFilters.sortBy === 'referral_source'}
												{#if dataViewFilters.sortOrder === 'asc'}
													<ChevronUp class="h-4 w-4" />
												{:else}
													<ChevronDown class="h-4 w-4" />
												{/if}
											{:else}
												<span
													class="h-4 w-4 flex items-center justify-center text-gray-300"
												>
													<svg
														class="h-3 w-3"
														fill="currentColor"
														viewBox="0 0 20 20"
													>
														<path d="M5 8l5-5 5 5H5z" />
														<path d="M5 12l5 5 5-5H5z" />
													</svg>
												</span>
											{/if}
										</div>
									</th>

									<!-- Why Interested (Non-sortable due to text length) -->
									<th
										class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
									>
										Why Interested
									</th>

									<!-- Biggest Challenge (Non-sortable due to text length) -->
									<th
										class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
									>
										Biggest Challenge
									</th>

									<!-- Tools Used (Non-sortable due to array type) -->
									<th
										class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
									>
										Tools Used
									</th>

									{#if dataViewFilters.showAllColumns}
										<!-- Sortable Job Title -->
										<th
											class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
											onclick={() => handleSort('job_title')}
											title="Click to sort by job title"
										>
											<div class="flex items-center space-x-1">
												<span>Job Title</span>
												{#if dataViewFilters.sortBy === 'job_title'}
													{#if dataViewFilters.sortOrder === 'asc'}
														<ChevronUp class="h-4 w-4" />
													{:else}
														<ChevronDown class="h-4 w-4" />
													{/if}
												{:else}
													<span
														class="h-4 w-4 flex items-center justify-center text-gray-300"
													>
														<svg
															class="h-3 w-3"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path d="M5 8l5-5 5 5H5z" />
															<path d="M5 12l5 5 5-5H5z" />
														</svg>
													</span>
												{/if}
											</div>
										</th>

										<!-- Sortable Company -->
										<th
											class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
											onclick={() => handleSort('company_name')}
											title="Click to sort by company"
										>
											<div class="flex items-center space-x-1">
												<span>Company</span>
												{#if dataViewFilters.sortBy === 'company_name'}
													{#if dataViewFilters.sortOrder === 'asc'}
														<ChevronUp class="h-4 w-4" />
													{:else}
														<ChevronDown class="h-4 w-4" />
													{/if}
												{:else}
													<span
														class="h-4 w-4 flex items-center justify-center text-gray-300"
													>
														<svg
															class="h-3 w-3"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path d="M5 8l5-5 5 5H5z" />
															<path d="M5 12l5 5 5-5H5z" />
														</svg>
													</span>
												{/if}
											</div>
										</th>

										<!-- Preferences (Non-sortable) -->
										<th
											class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
										>
											Preferences
										</th>

										<!-- Sortable Timezone -->
										<th
											class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
											onclick={() => handleSort('user_timezone')}
											title="Click to sort by timezone"
										>
											<div class="flex items-center space-x-1">
												<span>Timezone</span>
												{#if dataViewFilters.sortBy === 'user_timezone'}
													{#if dataViewFilters.sortOrder === 'asc'}
														<ChevronUp class="h-4 w-4" />
													{:else}
														<ChevronDown class="h-4 w-4" />
													{/if}
												{:else}
													<span
														class="h-4 w-4 flex items-center justify-center text-gray-300"
													>
														<svg
															class="h-3 w-3"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path d="M5 8l5-5 5 5H5z" />
															<path d="M5 12l5 5 5-5H5z" />
														</svg>
													</span>
												{/if}
											</div>
										</th>
									{/if}

									<!-- Sortable Applied Date -->
									<th
										class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
										onclick={() => handleSort('created_at')}
										title="Click to sort by application date"
									>
										<div class="flex items-center space-x-1">
											<span>Applied</span>
											{#if dataViewFilters.sortBy === 'created_at'}
												{#if dataViewFilters.sortOrder === 'asc'}
													<ChevronUp class="h-4 w-4" />
												{:else}
													<ChevronDown class="h-4 w-4" />
												{/if}
											{:else}
												<span
													class="h-4 w-4 flex items-center justify-center text-gray-300"
												>
													<svg
														class="h-3 w-3"
														fill="currentColor"
														viewBox="0 0 20 20"
													>
														<path d="M5 8l5-5 5 5H5z" />
														<path d="M5 12l5 5 5-5H5z" />
													</svg>
												</span>
											{/if}
										</div>
									</th>

									<!-- Actions (Non-sortable) -->
									<th
										class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
									>
										Actions
									</th>
								</tr>
							</thead>
							<tbody
								class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
							>
								{#each signups as signup}
									<tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
										<!-- Contact Info - Sticky Column -->
										<td
											class="px-4 py-4 text-sm sticky left-0 bg-white dark:bg-gray-800 z-10 border-r border-gray-200 dark:border-gray-700"
										>
											<div class="min-w-48">
												<div
													class="font-medium text-gray-900 dark:text-white"
												>
													{signup.full_name}
												</div>
												<div
													class="text-gray-500 dark:text-gray-400 break-all"
												>
													{signup.email}
												</div>
											</div>
										</td>

										<!-- Status -->
										<td class="px-4 py-4 whitespace-nowrap">
											<span
												class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getStatusColor(
													signup.signup_status
												)}"
											>
												{signup.signup_status}
											</span>
										</td>

										<!-- Referral Source -->
										<td class="px-4 py-4 text-sm text-gray-900 dark:text-white">
											<div class="max-w-32">
												{#if signup.referral_source}
													<span
														class="inline-flex px-2 py-1 text-xs bg-indigo-100 text-indigo-800 rounded dark:bg-indigo-900 dark:text-indigo-300"
													>
														{signup.referral_source}
													</span>
												{:else}
													<span
														class="text-gray-500 dark:text-gray-400 text-xs"
														>Not specified</span
													>
												{/if}
											</div>
										</td>

										<!-- Why Interested -->
										<td class="px-4 py-4 text-sm text-gray-900 dark:text-white">
											<div class="max-w-md">
												<div
													class="text-sm leading-relaxed {signup.why_interested &&
													signup.why_interested.length > 100
														? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded'
														: ''}"
													title={signup.why_interested || 'Not provided'}
													onclick={() => {
														if (
															signup.why_interested &&
															signup.why_interested.length > 100
														) {
															selectedItem = signup;
															showModal = true;
														}
													}}
												>
													{signup.why_interested
														? truncateText(signup.why_interested, 100)
														: 'Not provided'}
												</div>
											</div>
										</td>

										<!-- Biggest Challenge -->
										<td class="px-4 py-4 text-sm text-gray-900 dark:text-white">
											<div class="max-w-md">
												<div
													class="text-sm leading-relaxed {signup.biggest_challenge &&
													signup.biggest_challenge.length > 100
														? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded'
														: ''}"
													title={signup.biggest_challenge ||
														'Not provided'}
													onclick={() => {
														if (
															signup.biggest_challenge &&
															signup.biggest_challenge.length > 100
														) {
															selectedItem = signup;
															showModal = true;
														}
													}}
												>
													{signup.biggest_challenge
														? truncateText(
																signup.biggest_challenge,
																100
															)
														: 'Not provided'}
												</div>
											</div>
										</td>

										<!-- Tools Used -->
										<td class="px-4 py-4 text-sm">
											<div class="max-w-48">
												{#if signup.productivity_tools && signup.productivity_tools.length > 0}
													<div class="flex flex-wrap gap-1">
														{#each signup.productivity_tools.slice(0, 3) as tool}
															<span
																class="inline-flex px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded dark:bg-gray-700 dark:text-gray-300"
															>
																{tool}
															</span>
														{/each}
														{#if signup.productivity_tools.length > 3}
															<span
																class="inline-flex px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded dark:bg-gray-600 dark:text-gray-400"
															>
																+{signup.productivity_tools.length -
																	3} more
															</span>
														{/if}
													</div>
												{:else}
													<span class="text-gray-500 dark:text-gray-400"
														>None specified</span
													>
												{/if}
											</div>
										</td>

										{#if dataViewFilters.showAllColumns}
											<!-- Job Title -->
											<td
												class="px-4 py-4 text-sm text-gray-900 dark:text-white"
											>
												{signup.job_title || 'Not provided'}
											</td>

											<!-- Company -->
											<td
												class="px-4 py-4 text-sm text-gray-900 dark:text-white"
											>
												{signup.company_name || 'Not provided'}
											</td>

											<!-- Preferences -->
											<td class="px-4 py-4 text-sm">
												<div class="space-y-1">
													{#if signup.wants_weekly_calls}
														<div
															class="text-green-600 dark:text-green-400 text-xs"
														>
															✓ Weekly calls
														</div>
													{/if}
													{#if signup.wants_community_access}
														<div
															class="text-blue-600 dark:text-blue-400 text-xs"
														>
															✓ Community
														</div>
													{/if}
													{#if !signup.wants_weekly_calls && !signup.wants_community_access}
														<div
															class="text-gray-500 dark:text-gray-400 text-xs"
														>
															No preferences
														</div>
													{/if}
												</div>
											</td>

											<!-- Timezone -->
											<td
												class="px-4 py-4 text-sm text-gray-900 dark:text-white"
											>
												{signup.user_timezone || 'Not provided'}
											</td>
										{/if}

										<!-- Applied Date -->
										<td
											class="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400"
										>
											{formatDate(signup.created_at)}
										</td>

										<!-- Actions -->
										<td
											class="px-4 py-4 whitespace-nowrap text-right text-sm font-medium"
										>
											<div class="flex items-center justify-end space-x-2">
												<!-- View Details -->
												<Button
													onclick={() => {
														selectedItem = signup;
														showModal = true;
													}}
													variant="ghost"
													size="sm"
													icon={Eye}
													class="p-2 text-gray-400 hover:text-blue-600"
													title="View full details"
												></Button>

												<!-- Send Email -->
												<Button
													onclick={() => {
														emailUserId = signup.user_id || '';
														emailUserName = signup.full_name;
														emailUserEmail = signup.email;
														showEmailModal = true;
													}}
													variant="ghost"
													size="sm"
													icon={Mail}
													class="p-2 text-gray-400 hover:text-indigo-600"
													title="Send email"
												></Button>

												<!-- Quick Actions for Pending -->
												{#if signup.signup_status === 'pending'}
													<Button
														onclick={() =>
															updateSignupStatus(
																signup.id,
																'approved',
																true
															)}
														disabled={isUpdating}
														variant="ghost"
														size="sm"
														icon={CheckCircle}
														class="p-2 text-gray-400 hover:text-green-600"
														title="Approve and create member"
													></Button>
													<Button
														onclick={() =>
															updateSignupStatus(
																signup.id,
																'declined'
															)}
														disabled={isUpdating}
														variant="ghost"
														size="sm"
														icon={XCircle}
														class="p-2 text-gray-400 hover:text-red-600"
														title="Decline"
													></Button>
												{/if}
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Pagination for Data View -->
					{#if totalPages > 1}
						<div
							class="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700"
						>
							<div class="flex-1 flex justify-between sm:hidden">
								<Button
									onclick={prevPage}
									disabled={currentPage === 1}
									variant="outline"
									size="md"
								>
									Previous
								</Button>
								<span
									class="flex items-center text-sm text-gray-700 dark:text-gray-300"
								>
									{currentPage} of {totalPages}
								</span>
								<Button
									onclick={nextPage}
									disabled={currentPage === totalPages}
									variant="outline"
									size="md"
								>
									Next
								</Button>
							</div>
							<div
								class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between"
							>
								<div>
									<p class="text-sm text-gray-700 dark:text-gray-300">
										Showing page <span class="font-medium">{currentPage}</span>
										of <span class="font-medium">{totalPages}</span>
										({totalItems} total signups)
									</p>
								</div>
								<div>
									<nav
										class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
									>
										<Button
											onclick={prevPage}
											disabled={currentPage === 1}
											variant="outline"
											size="sm"
											icon={ChevronLeft}
											class="rounded-l-md rounded-r-none"
										></Button>
										<Button
											onclick={nextPage}
											disabled={currentPage === totalPages}
											variant="outline"
											size="sm"
											icon={ChevronRight}
											class="rounded-r-md rounded-l-none -ml-px"
										></Button>
									</nav>
								</div>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{:else}
			<!-- Existing Signups/Members Content -->
			<!-- Filters and Search -->
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 mb-4">
				<!-- Mobile Filter Toggle -->
				<div class="sm:hidden mb-4">
					<Button
						onclick={() => (showMobileFilters = !showMobileFilters)}
						variant="secondary"
						size="md"
						fullWidth={true}
						icon={Filter}
						iconPosition="right"
						class="justify-between"
					>
						<span class="text-sm font-medium"> Filters & Search </span>
					</Button>
				</div>

				<!-- Mobile Filters Collapsible -->
				<div class="sm:hidden {showMobileFilters ? 'block' : 'hidden'} space-y-4 mb-4">
					<!-- Search -->
					<FormField label="Search" labelFor="search" size="md">
						<TextInput
							id="search"
							type="text"
							bind:value={searchQuery}
							placeholder="Search by name, email..."
							size="md"
						/>
					</FormField>

					{#if activeTab === 'signups'}
						<!-- Signup Status Filter -->
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
							>
								Status
							</label>
							<Select
								bind:value={signupFilters.status}
								onchange={(e) => (signupFilters.status = e.detail)}
								size="md"
							>
								<option value="all">All Status</option>
								<option value="pending">Pending</option>
								<option value="approved">Approved</option>
								<option value="declined">Declined</option>
								<option value="waitlist">Waitlist</option>
							</Select>
						</div>

						<!-- Sort -->
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
							>
								Sort By
							</label>
							<Select
								bind:value={signupFilters.sortBy}
								onchange={(e) => (signupFilters.sortBy = e.detail)}
								size="md"
							>
								<option value="created_at">Date Applied</option>
								<option value="full_name">Name</option>
								<option value="company_name">Company</option>
							</Select>
						</div>
					{:else}
						<!-- Member Tier Filter -->
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
							>
								Tier
							</label>
							<Select
								bind:value={memberFilters.tier}
								onchange={(e) => (memberFilters.tier = e.detail)}
								size="md"
							>
								<option value="all">All Tiers</option>
								<option value="founder">Founder</option>
								<option value="early">Early</option>
								<option value="standard">Standard</option>
							</Select>
						</div>

						<!-- Active Only Toggle -->
						<div>
							<label class="flex items-center space-x-2">
								<input
									type="checkbox"
									bind:checked={memberFilters.activeOnly}
									class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
								/>
								<span class="text-sm text-gray-700 dark:text-gray-300"
									>Active Only</span
								>
							</label>
						</div>
					{/if}
				</div>

				<!-- Desktop Filters Grid -->
				<div class="hidden sm:grid sm:grid-cols-1 md:grid-cols-4 gap-4">
					<!-- Search -->
					<div class="md:col-span-2">
						<TextInput
							type="text"
							bind:value={searchQuery}
							placeholder="Search by name, email, or company..."
							size="md"
						/>
					</div>

					{#if activeTab === 'signups'}
						<!-- Signup Status Filter -->
						<div>
							<Select
								bind:value={signupFilters.status}
								onchange={(e) => (signupFilters.status = e.detail)}
								size="md"
							>
								<option value="all">All Status</option>
								<option value="pending">Pending</option>
								<option value="approved">Approved</option>
								<option value="declined">Declined</option>
								<option value="waitlist">Waitlist</option>
							</Select>
						</div>

						<!-- Sort -->
						<div>
							<Select
								bind:value={signupFilters.sortBy}
								onchange={(e) => (signupFilters.sortBy = e.detail)}
								size="md"
							>
								<option value="created_at">Date Applied</option>
								<option value="full_name">Name</option>
								<option value="company_name">Company</option>
							</Select>
						</div>
					{:else}
						<!-- Member Tier Filter -->
						<div>
							<Select
								bind:value={memberFilters.tier}
								onchange={(e) => (memberFilters.tier = e.detail)}
								size="md"
							>
								<option value="all">All Tiers</option>
								<option value="founder">Founder</option>
								<option value="early">Early</option>
								<option value="standard">Standard</option>
							</Select>
						</div>

						<!-- Active Only Toggle -->
						<div class="flex items-center">
							<label class="flex items-center space-x-2">
								<input
									type="checkbox"
									bind:checked={memberFilters.activeOnly}
									class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
								/>
								<span class="text-sm text-gray-600 dark:text-gray-400"
									>Active Only</span
								>
							</label>
						</div>
					{/if}
				</div>
			</div>

			{#if error}
				<div
					class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 dark:bg-red-900/20 dark:border-red-800"
				>
					<p class="text-red-800 dark:text-red-200">{error}</p>
				</div>
			{/if}

			<!-- Data Content -->
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
				{#if isLoading}
					<div class="p-6 sm:p-8 text-center">
						<RefreshCw class="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
						<p class="text-gray-600 dark:text-gray-400">Loading {activeTab}...</p>
					</div>
				{:else if (activeTab === 'signups' && signups.length === 0) || (activeTab === 'members' && members.length === 0)}
					<div class="p-6 sm:p-8 text-center">
						<UserCheck class="h-12 w-12 sm:h-16 sm:w-16 text-gray-400 mx-auto mb-4" />
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
							No {activeTab === 'signups' ? 'Signups' : 'Members'} Found
						</h3>
						<p class="text-gray-600 dark:text-gray-400">
							{searchQuery
								? 'Try adjusting your search criteria.'
								: activeTab === 'signups'
									? 'No beta signups yet.'
									: 'No beta members yet.'}
						</p>
					</div>
				{:else}
					<!-- Mobile Cards View -->
					<div class="sm:hidden">
						{#if activeTab === 'signups'}
							{#each signups as signup}
								<div class="p-4 border-b border-gray-200 dark:border-gray-700">
									<div class="flex items-start justify-between mb-2">
										<div class="flex items-center flex-1 min-w-0">
											<div class="flex-shrink-0 h-8 w-8">
												<div
													class="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center"
												>
													<span
														class="text-xs font-medium text-blue-800 dark:text-blue-200"
													>
														{signup.full_name.charAt(0).toUpperCase()}
													</span>
												</div>
											</div>
											<div class="ml-3 flex-1 min-w-0">
												<p
													class="text-sm font-medium text-gray-900 dark:text-white truncate"
												>
													{signup.full_name}
												</p>
												<p
													class="text-xs text-gray-500 dark:text-gray-400 truncate"
												>
													{signup.email}
												</p>
											</div>
										</div>
										<Button
											onclick={() => {
												selectedItem = signup;
												showModal = true;
											}}
											variant="ghost"
											size="sm"
											icon={Eye}
											class="ml-2 p-2 text-gray-400 hover:text-blue-600"
											title="View details"
										></Button>
									</div>

									<div class="flex items-center justify-between text-xs mb-3">
										<span
											class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getStatusColor(
												signup.signup_status
											)}"
										>
											{signup.signup_status}
										</span>
										<span class="text-gray-500">
											{formatDate(signup.created_at)}
										</span>
									</div>

									{#if signup.company_name}
										<p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
											{signup.company_name}
										</p>
									{/if}

									<!-- Quick Actions -->
									{#if signup.signup_status === 'pending'}
										<div class="flex space-x-2">
											<Button
												onclick={() => showApprovalConfirmation(signup)}
												disabled={isUpdating}
												variant="primary"
												size="sm"
												fullWidth={true}
												class="bg-green-100 text-green-800 hover:bg-green-200"
											>
												Approve & Email
											</Button>
											<Button
												onclick={() =>
													updateSignupStatus(signup.id, 'declined')}
												disabled={isUpdating}
												variant="danger"
												size="sm"
												fullWidth={true}
												class="bg-red-100 text-red-800 hover:bg-red-200"
											>
												Decline
											</Button>
										</div>
									{/if}
								</div>
							{/each}
						{:else}
							{#each members as member}
								<div class="p-4 border-b border-gray-200 dark:border-gray-700">
									<div class="flex items-start justify-between mb-2">
										<div class="flex items-center flex-1 min-w-0">
											<div class="flex-shrink-0 h-8 w-8">
												<div
													class="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center"
												>
													<span
														class="text-xs font-medium text-purple-800 dark:text-purple-200"
													>
														{member.full_name.charAt(0).toUpperCase()}
													</span>
												</div>
											</div>
											<div class="ml-3 flex-1 min-w-0">
												<div class="flex items-center">
													<p
														class="text-sm font-medium text-gray-900 dark:text-white truncate"
													>
														{member.full_name}
													</p>
													{#if !member.is_active}
														<span class="ml-2 text-red-500 text-xs"
															>(Inactive)</span
														>
													{/if}
												</div>
												<p
													class="text-xs text-gray-500 dark:text-gray-400 truncate"
												>
													{member.email}
												</p>
											</div>
										</div>
										<Button
											onclick={() => {
												selectedItem = member;
												showModal = true;
											}}
											variant="ghost"
											size="sm"
											icon={Eye}
											iconPosition="left"
											class="ml-2 p-2 text-gray-400 hover:text-blue-600"
											title="View details"
										/>
									</div>

									<div class="flex items-center justify-between text-xs mb-3">
										<span
											class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getTierColor(
												member.beta_tier
											)}"
										>
											{member.beta_tier}
										</span>
										<span class="text-gray-500">
											{formatDate(member.joined_at)}
										</span>
									</div>

									{#if member.company_name}
										<p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
											{member.company_name}
										</p>
									{/if}

									<!-- Quick Actions -->
									<div class="flex space-x-2">
										<Button
											onclick={() =>
												updateMember(member.id, {
													is_active: !member.is_active
												})}
											disabled={isUpdating}
											variant="secondary"
											size="sm"
											fullWidth={true}
											class={member.is_active
												? 'bg-red-100 text-red-800 hover:bg-red-200'
												: 'bg-green-100 text-green-800 hover:bg-green-200'}
										>
											{member.is_active ? 'Deactivate' : 'Activate'}
										</Button>
									</div>
								</div>
							{/each}
						{/if}
					</div>

					<!-- Desktop Table View -->
					<div class="hidden sm:block overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
							<thead class="bg-gray-50 dark:bg-gray-900">
								<tr>
									{#if activeTab === 'signups'}
										<!-- Signups table headers -->
										<th
											class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
											onclick={() => handleSignupSort('full_name')}
											title="Click to sort by name"
										>
											<div class="flex items-center space-x-1">
												<span>Applicant</span>
												{#if signupFilters.sortBy === 'full_name'}
													{#if signupFilters.sortOrder === 'asc'}
														<ChevronUp class="h-4 w-4" />
													{:else}
														<ChevronDown class="h-4 w-4" />
													{/if}
												{:else}
													<span
														class="h-4 w-4 flex items-center justify-center text-gray-300"
													>
														<svg
															class="h-3 w-3"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path d="M5 8l5-5 5 5H5z" />
															<path d="M5 12l5 5 5-5H5z" />
														</svg>
													</span>
												{/if}
											</div>
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
											onclick={() => handleSignupSort('company_name')}
											title="Click to sort by company"
										>
											<div class="flex items-center space-x-1">
												<span>Company</span>
												{#if signupFilters.sortBy === 'company_name'}
													{#if signupFilters.sortOrder === 'asc'}
														<ChevronUp class="h-4 w-4" />
													{:else}
														<ChevronDown class="h-4 w-4" />
													{/if}
												{:else}
													<span
														class="h-4 w-4 flex items-center justify-center text-gray-300"
													>
														<svg
															class="h-3 w-3"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path d="M5 8l5-5 5 5H5z" />
															<path d="M5 12l5 5 5-5H5z" />
														</svg>
													</span>
												{/if}
											</div>
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
											onclick={() => handleSignupSort('signup_status')}
											title="Click to sort by status"
										>
											<div class="flex items-center space-x-1">
												<span>Status</span>
												{#if signupFilters.sortBy === 'signup_status'}
													{#if signupFilters.sortOrder === 'asc'}
														<ChevronUp class="h-4 w-4" />
													{:else}
														<ChevronDown class="h-4 w-4" />
													{/if}
												{:else}
													<span
														class="h-4 w-4 flex items-center justify-center text-gray-300"
													>
														<svg
															class="h-3 w-3"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path d="M5 8l5-5 5 5H5z" />
															<path d="M5 12l5 5 5-5H5z" />
														</svg>
													</span>
												{/if}
											</div>
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
											onclick={() => handleSignupSort('created_at')}
											title="Click to sort by date"
										>
											<div class="flex items-center space-x-1">
												<span>Applied</span>
												{#if signupFilters.sortBy === 'created_at'}
													{#if signupFilters.sortOrder === 'asc'}
														<ChevronUp class="h-4 w-4" />
													{:else}
														<ChevronDown class="h-4 w-4" />
													{/if}
												{:else}
													<span
														class="h-4 w-4 flex items-center justify-center text-gray-300"
													>
														<svg
															class="h-3 w-3"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path d="M5 8l5-5 5 5H5z" />
															<path d="M5 12l5 5 5-5H5z" />
														</svg>
													</span>
												{/if}
											</div>
										</th>
									{:else}
										<!-- Members table headers -->
										<th
											class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
											onclick={() => handleMemberSort('full_name')}
											title="Click to sort by name"
										>
											<div class="flex items-center space-x-1">
												<span>Member</span>
												{#if memberFilters.sortBy === 'full_name'}
													{#if memberFilters.sortOrder === 'asc'}
														<ChevronUp class="h-4 w-4" />
													{:else}
														<ChevronDown class="h-4 w-4" />
													{/if}
												{:else}
													<span
														class="h-4 w-4 flex items-center justify-center text-gray-300"
													>
														<svg
															class="h-3 w-3"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path d="M5 8l5-5 5 5H5z" />
															<path d="M5 12l5 5 5-5H5z" />
														</svg>
													</span>
												{/if}
											</div>
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
											onclick={() => handleMemberSort('company_name')}
											title="Click to sort by company"
										>
											<div class="flex items-center space-x-1">
												<span>Company</span>
												{#if memberFilters.sortBy === 'company_name'}
													{#if memberFilters.sortOrder === 'asc'}
														<ChevronUp class="h-4 w-4" />
													{:else}
														<ChevronDown class="h-4 w-4" />
													{/if}
												{:else}
													<span
														class="h-4 w-4 flex items-center justify-center text-gray-300"
													>
														<svg
															class="h-3 w-3"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path d="M5 8l5-5 5 5H5z" />
															<path d="M5 12l5 5 5-5H5z" />
														</svg>
													</span>
												{/if}
											</div>
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
											onclick={() => handleMemberSort('beta_tier')}
											title="Click to sort by tier"
										>
											<div class="flex items-center space-x-1">
												<span>Tier</span>
												{#if memberFilters.sortBy === 'beta_tier'}
													{#if memberFilters.sortOrder === 'asc'}
														<ChevronUp class="h-4 w-4" />
													{:else}
														<ChevronDown class="h-4 w-4" />
													{/if}
												{:else}
													<span
														class="h-4 w-4 flex items-center justify-center text-gray-300"
													>
														<svg
															class="h-3 w-3"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path d="M5 8l5-5 5 5H5z" />
															<path d="M5 12l5 5 5-5H5z" />
														</svg>
													</span>
												{/if}
											</div>
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
											onclick={() => handleMemberSort('joined_at')}
											title="Click to sort by date"
										>
											<div class="flex items-center space-x-1">
												<span>Joined</span>
												{#if memberFilters.sortBy === 'joined_at'}
													{#if memberFilters.sortOrder === 'asc'}
														<ChevronUp class="h-4 w-4" />
													{:else}
														<ChevronDown class="h-4 w-4" />
													{/if}
												{:else}
													<span
														class="h-4 w-4 flex items-center justify-center text-gray-300"
													>
														<svg
															class="h-3 w-3"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path d="M5 8l5-5 5 5H5z" />
															<path d="M5 12l5 5 5-5H5z" />
														</svg>
													</span>
												{/if}
											</div>
										</th>
									{/if}
									<th
										class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
									>
										Actions
									</th>
								</tr>
							</thead>
							<tbody
								class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
							>
								{#if activeTab === 'signups'}
									{#each signups as signup}
										<tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="flex items-center">
													<div class="flex-shrink-0 h-10 w-10">
														<div
															class="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center"
														>
															<span
																class="text-sm font-medium text-blue-800 dark:text-blue-200"
															>
																{signup.full_name
																	.charAt(0)
																	.toUpperCase()}
															</span>
														</div>
													</div>
													<div class="ml-4">
														<div
															class="text-sm font-medium text-gray-900 dark:text-white"
														>
															{signup.full_name}
														</div>
														<div
															class="text-sm text-gray-500 dark:text-gray-400"
														>
															{signup.email}
														</div>
														{#if signup.job_title}
															<div class="text-xs text-gray-400">
																{signup.job_title}
															</div>
														{/if}
													</div>
												</div>
											</td>
											<td
												class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
											>
												{signup.company_name || 'Not specified'}
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span
													class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getStatusColor(
														signup.signup_status
													)}"
												>
													{signup.signup_status}
												</span>
											</td>
											<td
												class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400"
											>
												{formatDate(signup.created_at)}
											</td>
											<td
												class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
											>
												<div
													class="flex items-center justify-end space-x-2"
												>
													<!-- View Details -->
													<Button
														onclick={() => {
															selectedItem = signup;
															showModal = true;
														}}
														variant="ghost"
														size="sm"
														icon={Eye}
														iconPosition="left"
														class="p-2 text-gray-400 hover:text-blue-600 transition-colors"
														title="View details"
													/>

													<!-- Send Email -->
													<Button
														onclick={() => {
															emailUserId = signup.user_id || '';
															emailUserName = signup.full_name;
															emailUserEmail = signup.email;
															showEmailModal = true;
														}}
														variant="ghost"
														size="sm"
														icon={Mail}
														iconPosition="left"
														class="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
														title="Send email"
													/>

													<!-- Quick Actions -->
													{#if signup.signup_status === 'pending'}
														<Button
															onclick={() =>
																showApprovalConfirmation(signup)}
															disabled={isUpdating}
															variant="ghost"
															size="sm"
															icon={CheckCircle}
															iconPosition="left"
															class="p-2 text-gray-400 hover:text-green-600 transition-colors"
															title="Approve and send email"
														/>
														<Button
															onclick={() =>
																updateSignupStatus(
																	signup.id,
																	'declined'
																)}
															disabled={isUpdating}
															variant="ghost"
															size="sm"
															icon={XCircle}
															iconPosition="left"
															class="p-2 text-gray-400 hover:text-red-600 transition-colors"
															title="Decline"
														/>
													{/if}
												</div>
											</td>
										</tr>
									{/each}
								{:else}
									{#each members as member}
										<tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="flex items-center">
													<div class="flex-shrink-0 h-10 w-10">
														<div
															class="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center"
														>
															<span
																class="text-sm font-medium text-purple-800 dark:text-purple-200"
															>
																{member.full_name
																	.charAt(0)
																	.toUpperCase()}
															</span>
														</div>
													</div>
													<div class="ml-4">
														<div
															class="text-sm font-medium text-gray-900 dark:text-white flex items-center"
														>
															{member.full_name}
															{#if !member.is_active}
																<span
																	class="ml-2 text-red-500 text-xs"
																	>(Inactive)</span
																>
															{/if}
														</div>
														<div
															class="text-sm text-gray-500 dark:text-gray-400"
														>
															{member.email}
														</div>
														{#if member.job_title}
															<div class="text-xs text-gray-400">
																{member.job_title}
															</div>
														{/if}
													</div>
												</div>
											</td>
											<td
												class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
											>
												{member.company_name || 'Not specified'}
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span
													class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getTierColor(
														member.beta_tier
													)}"
												>
													{member.beta_tier}
												</span>
											</td>
											<td
												class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400"
											>
												{formatDate(member.joined_at)}
											</td>
											<td
												class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
											>
												<div
													class="flex items-center justify-end space-x-2"
												>
													<!-- Send Email -->
													<Button
														onclick={() => {
															emailUserId = member.user_id || '';
															emailUserName = member.full_name;
															emailUserEmail = member.email;
															showEmailModal = true;
														}}
														variant="ghost"
														size="sm"
														icon={Mail}
														iconPosition="left"
														class="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
														title="Send email"
													/>
													<!-- View Details -->
													<Button
														onclick={() => {
															selectedItem = member;
															showModal = true;
														}}
														variant="ghost"
														size="sm"
														icon={Eye}
														iconPosition="left"
														class="p-2 text-gray-400 hover:text-blue-600 transition-colors"
														title="View details"
													/>

													<!-- Toggle Active Status -->
													<Button
														onclick={() =>
															updateMember(member.id, {
																is_active: !member.is_active
															})}
														disabled={isUpdating}
														variant="ghost"
														size="sm"
														icon={member.is_active ? ShieldOff : Shield}
														iconPosition="left"
														class="p-2 text-gray-400 hover:text-yellow-600 transition-colors"
														title={member.is_active
															? 'Deactivate'
															: 'Activate'}
													/>
												</div>
											</td>
										</tr>
									{/each}
								{/if}
							</tbody>
						</table>
					</div>

					<!-- Pagination - Mobile Responsive -->
					{#if totalPages > 1}
						<div
							class="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700"
						>
							<div class="flex-1 flex justify-between sm:hidden">
								<Button
									onclick={prevPage}
									disabled={currentPage === 1}
									variant="outline"
									size="md"
								>
									Previous
								</Button>
								<span
									class="flex items-center text-sm text-gray-700 dark:text-gray-300"
								>
									{currentPage} of {totalPages}
								</span>
								<Button
									onclick={nextPage}
									disabled={currentPage === totalPages}
									variant="outline"
									size="md"
								>
									Next
								</Button>
							</div>
							<div
								class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between"
							>
								<div>
									<p class="text-sm text-gray-700 dark:text-gray-300">
										Showing page <span class="font-medium">{currentPage}</span>
										of
										<span class="font-medium">{totalPages}</span>
									</p>
								</div>
								<div>
									<nav
										class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
									>
										<Button
											onclick={prevPage}
											disabled={currentPage === 1}
											variant="outline"
											size="sm"
											icon={ChevronLeft}
											class="rounded-l-md rounded-r-none"
										></Button>
										<Button
											onclick={nextPage}
											disabled={currentPage === totalPages}
											variant="outline"
											size="sm"
											icon={ChevronRight}
											class="rounded-r-md rounded-l-none -ml-px"
										></Button>
									</nav>
								</div>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- Approval Confirmation Modal -->
<ConfirmationModal
	isOpen={showApprovalModal}
	title="Approve Beta Application"
	confirmText="Approve & Send Email"
	cancelText="Cancel"
	confirmVariant="success"
	icon="success"
	loading={isApproving}
	loadingText="Sending approval email..."
	on:confirm={handleApprovalConfirm}
	on:cancel={handleApprovalCancel}
>
	<div slot="content">
		{#if pendingApprovalSignup}
			<div class="space-y-4">
				<p class="text-sm text-gray-600 dark:text-gray-400">
					You're about to approve <strong>{pendingApprovalSignup.full_name}</strong> for the
					beta program.
				</p>

				<div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
					<h4 class="font-medium text-gray-900 dark:text-white mb-2">This will:</h4>
					<ul class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
						<li>• Create a beta member account</li>
						<li>• Send welcome email with login instructions</li>
						<li>• Grant founder tier access with 20% discount</li>
						<li>• Change status to "approved"</li>
					</ul>
				</div>

				<div class="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
					<p class="text-sm text-blue-800 dark:text-blue-200">
						<strong>Email will be sent to:</strong>
						{pendingApprovalSignup.email}
					</p>
				</div>
			</div>
		{/if}
	</div>
</ConfirmationModal>

<!-- Details Modal - Keep your existing modal content -->
{#if showModal && selectedItem}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
		>
			<div class="p-4 sm:p-6">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
						{activeTab === 'signups' || activeTab === 'dataview'
							? 'Signup Details'
							: 'Member Details'}
					</h3>
					<Button
						onclick={() => (showModal = false)}
						variant="ghost"
						size="sm"
						icon={X}
						iconPosition="left"
						class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
						title="Close"
					/>
				</div>

				<div class="space-y-6">
					<!-- Basic Info -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
								>Name</label
							>
							<p class="text-sm text-gray-900 dark:text-white">
								{selectedItem.full_name}
							</p>
						</div>
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
								>Email</label
							>
							<p class="text-sm text-gray-900 dark:text-white break-all">
								{selectedItem.email}
							</p>
						</div>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
								>Job Title</label
							>
							<p class="text-sm text-gray-900 dark:text-white">
								{selectedItem.job_title || 'Not provided'}
							</p>
						</div>
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
								>Company</label
							>
							<p class="text-sm text-gray-900 dark:text-white">
								{selectedItem.company_name || 'Not provided'}
							</p>
						</div>
					</div>

					{#if activeTab === 'signups' || activeTab === 'dataview'}
						<!-- Signup specific fields -->
						{#if selectedItem.why_interested}
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
									>Why Interested</label
								>
								<div class="mt-1 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border">
									<p
										class="text-sm text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed"
									>
										{selectedItem.why_interested}
									</p>
								</div>
							</div>
						{/if}

						{#if selectedItem.biggest_challenge}
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
									>Biggest Challenge</label
								>
								<div class="mt-1 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border">
									<p
										class="text-sm text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed"
									>
										{selectedItem.biggest_challenge}
									</p>
								</div>
							</div>
						{/if}

						{#if selectedItem.productivity_tools && selectedItem.productivity_tools.length > 0}
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
									>Current Tools</label
								>
								<div class="mt-1 flex flex-wrap gap-2">
									{#each selectedItem.productivity_tools as tool}
										<span
											class="inline-flex px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded-md dark:bg-blue-900 dark:text-blue-300"
										>
											{tool}
										</span>
									{/each}
								</div>
							</div>
						{/if}

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>Status</label
								>
								<span
									class="inline-flex px-3 py-1 text-sm font-semibold rounded-full {getStatusColor(
										selectedItem.signup_status
									)}"
								>
									{selectedItem.signup_status}
								</span>
							</div>
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>Applied</label
								>
								<p class="text-sm text-gray-900 dark:text-white">
									{formatDate(selectedItem.created_at)}
								</p>
							</div>
						</div>

						{#if selectedItem.referral_source}
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>How they heard about us</label
								>
								<p class="text-sm text-gray-900 dark:text-white">
									{selectedItem.referral_source}
								</p>
							</div>
						{/if}

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>Wants Weekly Calls</label
								>
								<p class="text-sm text-gray-900 dark:text-white">
									{selectedItem.wants_weekly_calls ? 'Yes' : 'No'}
								</p>
							</div>
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>Wants Community Access</label
								>
								<p class="text-sm text-gray-900 dark:text-white">
									{selectedItem.wants_community_access ? 'Yes' : 'No'}
								</p>
							</div>
						</div>

						{#if selectedItem.user_timezone}
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>Timezone</label
								>
								<p class="text-sm text-gray-900 dark:text-white">
									{selectedItem.user_timezone}
								</p>
							</div>
						{/if}
					{:else}
						<!-- Member specific fields (keep existing member modal content) -->
						<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>Beta Tier</label
								>
								<span
									class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getTierColor(
										selectedItem.beta_tier
									)}"
								>
									{selectedItem.beta_tier}
								</span>
							</div>
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>Access Level</label
								>
								<p class="text-sm text-gray-900 dark:text-white capitalize">
									{selectedItem.access_level}
								</p>
							</div>
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>Status</label
								>
								<span
									class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {selectedItem.is_active
										? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
										: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'}"
								>
									{selectedItem.is_active ? 'Active' : 'Inactive'}
								</span>
							</div>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>Joined</label
								>
								<p class="text-sm text-gray-900 dark:text-white">
									{formatDate(selectedItem.joined_at)}
								</p>
							</div>
							{#if selectedItem.last_active_at}
								<div>
									<label
										class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
										>Last Active</label
									>
									<p class="text-sm text-gray-900 dark:text-white">
										{formatDate(selectedItem.last_active_at)}
									</p>
								</div>
							{/if}
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>Feedback Submitted</label
								>
								<p class="text-sm text-gray-900 dark:text-white">
									{selectedItem.total_feedback_submitted || 0}
								</p>
							</div>
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>Features Requested</label
								>
								<p class="text-sm text-gray-900 dark:text-white">
									{selectedItem.total_features_requested || 0}
								</p>
							</div>
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>Calls Attended</label
								>
								<p class="text-sm text-gray-900 dark:text-white">
									{selectedItem.total_calls_attended || 0}
								</p>
							</div>
						</div>

						{#if selectedItem.has_lifetime_pricing}
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<label
										class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
										>Lifetime Pricing</label
									>
									<span
										class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300"
									>
										Enabled
									</span>
								</div>
								<div>
									<label
										class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
										>Discount</label
									>
									<p class="text-sm text-gray-900 dark:text-white">
										{selectedItem.discount_percentage}%
									</p>
								</div>
							</div>
						{/if}

						<!-- Original Beta Application Responses -->
						{#if selectedItem.beta_signups}
							<div class="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
								<h4
									class="text-sm font-semibold text-gray-900 dark:text-white mb-4"
								>
									Original Beta Application
								</h4>

								{#if selectedItem.beta_signups.why_interested}
									<div class="mb-4">
										<label
											class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
											>Why They're Interested</label
										>
										<div
											class="mt-1 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border"
										>
											<p
												class="text-sm text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed"
											>
												{selectedItem.beta_signups.why_interested}
											</p>
										</div>
									</div>
								{/if}

								{#if selectedItem.beta_signups.biggest_challenge}
									<div class="mb-4">
										<label
											class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
											>Biggest Challenge</label
										>
										<div
											class="mt-1 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border"
										>
											<p
												class="text-sm text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed"
											>
												{selectedItem.beta_signups.biggest_challenge}
											</p>
										</div>
									</div>
								{/if}

								{#if selectedItem.beta_signups.productivity_tools && selectedItem.beta_signups.productivity_tools.length > 0}
									<div class="mb-4">
										<label
											class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
											>Current Tools</label
										>
										<div class="mt-1 flex flex-wrap gap-2">
											{#each selectedItem.beta_signups.productivity_tools as tool}
												<span
													class="inline-flex px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded-md dark:bg-blue-900 dark:text-blue-300"
												>
													{tool}
												</span>
											{/each}
										</div>
									</div>
								{/if}

								{#if selectedItem.beta_signups.referral_source}
									<div class="mb-4">
										<label
											class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
											>How they heard about us</label
										>
										<p class="text-sm text-gray-900 dark:text-white">
											{selectedItem.beta_signups.referral_source}
										</p>
									</div>
								{/if}

								<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
									<div>
										<label
											class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
											>Wants Weekly Calls</label
										>
										<p class="text-sm text-gray-900 dark:text-white">
											{selectedItem.beta_signups.wants_weekly_calls
												? 'Yes'
												: 'No'}
										</p>
									</div>
									<div>
										<label
											class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
											>Wants Community Access</label
										>
										<p class="text-sm text-gray-900 dark:text-white">
											{selectedItem.beta_signups.wants_community_access
												? 'Yes'
												: 'No'}
										</p>
									</div>
								</div>
							</div>
						{/if}
					{/if}
				</div>

				<!-- Action Buttons - Mobile Responsive -->
				<div class="mt-6 flex flex-wrap gap-2">
					<Button onclick={() => (showModal = false)} variant="secondary" size="md">
						Close
					</Button>

					{#if (activeTab === 'signups' || activeTab === 'dataview') && selectedItem.signup_status === 'pending'}
						<Button
							onclick={() => {
								showApprovalConfirmation(selectedItem);
								// updateSignupStatus(selectedItem.id, 'approved', true);
								// showModal = false;
							}}
							disabled={isUpdating}
							variant="primary"
							size="md"
							class="bg-green-600 hover:bg-green-700"
						>
							Approve & Create Member
						</Button>
						<Button
							onclick={() => {
								updateSignupStatus(selectedItem.id, 'waitlist');
								selectedItem.signup_status = 'waitlist';
							}}
							disabled={isUpdating}
							variant="primary"
							size="md"
						>
							Move to Waitlist
						</Button>
						<Button
							onclick={() => {
								updateSignupStatus(selectedItem.id, 'declined');
								selectedItem.signup_status = 'declined';
							}}
							disabled={isUpdating}
							variant="danger"
							size="md"
						>
							Decline
						</Button>
					{/if}

					{#if activeTab === 'members'}
						<Button
							onclick={() => {
								updateMember(selectedItem.id, {
									is_active: !selectedItem.is_active
								});
								selectedItem.is_active = !selectedItem.is_active;
							}}
							disabled={isUpdating}
							variant={selectedItem.is_active ? 'danger' : 'primary'}
							size="md"
							class={selectedItem.is_active
								? 'bg-red-600 hover:bg-red-700'
								: 'bg-green-600 hover:bg-green-700'}
						>
							{selectedItem.is_active ? 'Deactivate' : 'Activate'} Member
						</Button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Email Composer Modal -->
<EmailComposerModal
	bind:isOpen={showEmailModal}
	userId={emailUserId}
	userName={emailUserName}
	userEmail={emailUserEmail}
	on:emailSent={() => {
		showEmailModal = false;
		// Optionally refresh members list or show success message
	}}
/>
