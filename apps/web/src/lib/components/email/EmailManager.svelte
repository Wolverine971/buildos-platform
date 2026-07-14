<!-- apps/web/src/lib/components/email/EmailManager.svelte -->
<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import {
		Mail,
		Plus,
		Search,
		Filter,
		Eye,
		Edit,
		Trash2,
		Users,
		RefreshCw,
		ChevronLeft,
		ChevronRight
	} from 'lucide-svelte';
	import ConfirmationModal from '../ui/ConfirmationModal.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface EmailListRequest {
		page: number;
		search: string;
		status: string;
		category: string;
		sortBy: string;
		sortOrder: string;
		refreshVersion: number;
	}

	// Data state
	let emails = $state<any[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let searchQuery = $state('');
	let currentPage = $state(1);
	let totalPages = $state(1);
	let totalItems = $state(0);

	// Filters
	let statusFilter = $state('all');
	let categoryFilter = $state('all');
	let sortBy = $state('created_at');
	let sortOrder = $state('desc');
	let refreshVersion = $state(0);

	// UI state
	let activeView = $state<'list' | 'compose' | 'edit' | 'preview'>('list');
	let selectedEmail = $state<any>(null);
	let showDeleteModal = $state(false);
	let emailToDelete = $state<any>(null);
	let isDeleting = $state(false);
	let EmailComposerComponent = $state<Component<any, any> | null>(null);
	let EmailPreviewComponent = $state<Component<any, any> | null>(null);
	let emailComposerPromise: Promise<Component<any, any>> | null = null;
	let emailPreviewPromise: Promise<Component<any, any>> | null = null;

	// Mobile responsive
	let showMobileFilters = $state(false);

	let timeZone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);

	let previousRequestSearch = '';
	const emailListRequest = $derived<EmailListRequest>({
		page: currentPage,
		search: searchQuery,
		status: statusFilter,
		category: categoryFilter,
		sortBy,
		sortOrder,
		refreshVersion
	});

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	// This effect is the single owner of email-list requests.
	$effect(() => {
		const request = emailListRequest;
		const controller = new AbortController();
		const debounceMs = request.search !== previousRequestSearch ? 250 : 0;
		previousRequestSearch = request.search;

		const timeoutId = window.setTimeout(() => {
			void loadEmails(request, controller.signal);
		}, debounceMs);

		return () => {
			window.clearTimeout(timeoutId);
			controller.abort();
		};
	});

	async function loadEmails(request: EmailListRequest, signal: AbortSignal) {
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				page: request.page.toString(),
				limit: '20',
				search: request.search,
				sort_by: request.sortBy,
				sort_order: request.sortOrder
			});

			if (request.status !== 'all') {
				params.set('status', request.status);
			}

			if (request.category !== 'all') {
				params.set('category', request.category);
			}

			const response = await fetch(`/api/admin/emails?${params}`, { signal });
			if (!response.ok) throw new Error('Failed to load emails');

			const result = await response.json();
			if (signal.aborted) return;

			if (result.success) {
				emails = result.data?.emails || [];
				totalPages = result.data?.pagination?.total_pages || 1;
				totalItems = result.data?.pagination?.total_items || 0;
			} else {
				throw new Error(result.error || 'Failed to load emails');
			}
		} catch (err) {
			if (signal.aborted || isAbortError(err)) return;
			console.error('Error loading emails:', err);
			error = err instanceof Error ? err.message : 'Failed to load emails';
		} finally {
			if (!signal.aborted) {
				isLoading = false;
			}
		}
	}

	function isAbortError(error: unknown): boolean {
		return error instanceof Error && error.name === 'AbortError';
	}

	function resetPage() {
		currentPage = 1;
	}

	function refreshEmails() {
		refreshVersion += 1;
	}

	async function loadEmailComposer() {
		if (!emailComposerPromise) {
			emailComposerPromise = import('./EmailComposer.svelte').then((module) => {
				EmailComposerComponent = module.default;
				return module.default;
			});
		}

		return emailComposerPromise;
	}

	async function loadEmailPreview() {
		if (!emailPreviewPromise) {
			emailPreviewPromise = import('./EmailPreview.svelte').then((module) => {
				EmailPreviewComponent = module.default;
				return module.default;
			});
		}

		return emailPreviewPromise;
	}

	function createNewEmail() {
		selectedEmail = null;
		activeView = 'compose';
		void loadEmailComposer();
	}

	function editEmail(email: any) {
		selectedEmail = email;
		activeView = 'edit';
		void loadEmailComposer();
	}

	function viewEmail(email: any) {
		selectedEmail = email;
		activeView = 'preview';
		void loadEmailPreview();
	}

	function confirmDeleteEmail(email: any) {
		emailToDelete = email;
		showDeleteModal = true;
	}

	async function deleteEmail() {
		if (!emailToDelete) return;

		isDeleting = true;
		try {
			const response = await fetch(`/api/admin/emails/${emailToDelete.id}`, {
				method: 'DELETE'
			});

			const result = await response.json();
			if (result.success) {
				// Remove from list
				emails = emails.filter((e) => e.id !== emailToDelete.id);
				totalItems--;

				showDeleteModal = false;
				emailToDelete = null;
			} else {
				throw new Error(result.error || 'Failed to delete email');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete email';
		} finally {
			isDeleting = false;
		}
	}

	function handleEmailSaved(savedEmail: any) {
		// Update or add email in list
		const existingIndex = emails.findIndex((e) => e.id === savedEmail.id);
		if (existingIndex >= 0) {
			emails[existingIndex] = savedEmail;
		} else {
			emails = [savedEmail, ...emails];
			totalItems++;
		}

		// Stay in edit mode to allow further changes
		selectedEmail = savedEmail;
	}

	function handleEmailSent() {
		// Refresh emails to get updated status
		refreshEmails();
		// Return to list view
		activeView = 'list';
	}

	function backToList() {
		activeView = 'list';
		selectedEmail = null;
	}

	function nextPage() {
		if (currentPage < totalPages) {
			currentPage++;
		}
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
		}
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			timeZone
		});
	}

	function getStatusColor(status: string): string {
		const colors = {
			draft: 'bg-muted text-foreground dark:text-muted-foreground',
			scheduled: 'bg-info/10 text-info',
			sent: 'bg-success/10 text-success',
			delivered: 'bg-success/10 text-success',
			failed: 'bg-destructive/10 text-destructive'
		};
		return colors[status as keyof typeof colors] || colors.draft;
	}

	function getRecipientCount(email: any): number {
		return email.email_recipients ? email.email_recipients.length : 0;
	}

	function getOpenCount(email: any): number {
		if (!email.email_recipients) return 0;
		return email.email_recipients.filter((r: any) => r.opened_at).length;
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div
		class="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0"
	>
		<div>
			{#if activeView !== 'list'}
				<Button
					onclick={backToList}
					variant="ghost"
					size="sm"
					icon={ChevronLeft}
					class="!text-muted-foreground hover:!text-foreground dark:!text-muted-foreground dark:hover:!text-muted-foreground !mb-2"
				>
					Back to Emails
				</Button>
			{/if}
			<div class="flex items-center">
				<h2 class="text-2xl font-bold text-foreground flex items-center">
					<Mail class="mr-3 h-6 w-6 text-info" />
					{activeView === 'list'
						? 'Email Management'
						: activeView === 'compose'
							? 'Compose Email'
							: activeView === 'edit'
								? 'Edit Email'
								: 'Email Preview'}
				</h2>
			</div>
			{#if activeView === 'list'}
				<p class="text-muted-foreground mt-1">Manage and send emails to beta users</p>
			{/if}
		</div>

		{#if activeView === 'list'}
			<div class="flex items-center space-x-3">
				<div class="text-sm text-muted-foreground">
					{totalItems} total emails
				</div>
				<Button
					onclick={refreshEmails}
					disabled={isLoading}
					variant="secondary"
					size="md"
					icon={RefreshCw}
					loading={isLoading}
				>
					Refresh
				</Button>
				<Button onclick={createNewEmail} variant="primary" size="md" icon={Plus}>
					Compose Email
				</Button>
			</div>
		{/if}
	</div>

	<!-- Error Message -->
	{#if error}
		<div class="bg-destructive/10 border border-destructive/30 rounded-md p-4">
			<p class="text-destructive">{error}</p>
		</div>
	{/if}

	<!-- Main Content -->
	{#if activeView === 'list'}
		<!-- Filters and Search -->
		<div class="bg-card rounded-lg shadow p-4 sm:p-6">
			<!-- Mobile Filter Toggle -->
			<div class="sm:hidden mb-4">
				<Button
					onclick={() => (showMobileFilters = !showMobileFilters)}
					variant="ghost"
					size="md"
					icon={Filter}
					iconPosition="right"
					class="!w-full !justify-between !p-3 !bg-muted"
				>
					Filters & Search
				</Button>
			</div>

			<!-- Mobile Filters Collapsible -->
			<div class="sm:hidden {showMobileFilters ? 'block' : 'hidden'} space-y-4 mb-4">
				<!-- Search -->
				<FormField label="Search" labelFor="mobile-search">
					<div class="relative">
						<Search
							class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
						/>
						<TextInput
							id="mobile-search"
							bind:value={searchQuery}
							oninput={resetPage}
							placeholder="Search emails..."
							class="pl-10"
							size="md"
						/>
					</div>
				</FormField>

				<!-- Status Filter -->
				<FormField label="Status" labelFor="mobile-status-filter">
					<Select
						bind:value={statusFilter}
						onchange={(value) => {
							statusFilter = String(value);
							resetPage();
						}}
						size="md"
						placeholder="All Status"
						id="mobile-status-filter"
					>
						<option value="all">All Status</option>
						<option value="draft">Draft</option>
						<option value="scheduled">Scheduled</option>
						<option value="sent">Sent</option>
						<option value="delivered">Delivered</option>
						<option value="failed">Failed</option>
					</Select>
				</FormField>

				<!-- Sort -->
				<FormField label="Sort By" labelFor="mobile-sort-by">
					<Select
						bind:value={sortBy}
						onchange={(value) => {
							sortBy = String(value);
							resetPage();
						}}
						size="md"
						placeholder="Date Created"
						id="mobile-sort-by"
					>
						<option value="created_at">Date Created</option>
						<option value="subject">Subject</option>
						<option value="status">Status</option>
						<option value="sent_at">Date Sent</option>
					</Select>
				</FormField>
			</div>

			<!-- Desktop Filters Grid -->
			<div class="hidden sm:grid sm:grid-cols-4 gap-4">
				<!-- Search -->
				<div class="col-span-2">
					<div class="relative">
						<Search
							class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
						/>
						<TextInput
							bind:value={searchQuery}
							oninput={resetPage}
							placeholder="Search emails by subject or content..."
							class="pl-10"
							size="md"
						/>
					</div>
				</div>

				<!-- Status Filter -->
				<div>
					<Select
						bind:value={statusFilter}
						size="md"
						placeholder="All Status"
						onchange={(value) => {
							statusFilter = String(value);
							resetPage();
						}}
					>
						<option value="all">All Status</option>
						<option value="draft">Draft</option>
						<option value="scheduled">Scheduled</option>
						<option value="sent">Sent</option>
						<option value="delivered">Delivered</option>
						<option value="failed">Failed</option>
					</Select>
				</div>

				<!-- Sort -->
				<div>
					<Select
						bind:value={sortBy}
						size="md"
						placeholder="Date Created"
						onchange={(value) => {
							sortBy = String(value);
							resetPage();
						}}
					>
						<option value="created_at">Date Created</option>
						<option value="subject">Subject</option>
						<option value="status">Status</option>
						<option value="sent_at">Date Sent</option>
					</Select>
				</div>
			</div>
		</div>

		<!-- Email List -->
		<div class="bg-card rounded-lg shadow overflow-hidden">
			{#if isLoading}
				<div class="p-8 text-center">
					<RefreshCw class="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
					<p class="text-muted-foreground">Loading emails...</p>
				</div>
			{:else if emails.length === 0}
				<div class="p-8 text-center">
					<Mail class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
					<h3 class="text-lg font-semibold text-foreground mb-2">No Emails Found</h3>
					<p class="text-muted-foreground mb-4">
						{searchQuery
							? 'Try adjusting your search criteria.'
							: 'Start by creating your first email.'}
					</p>
					<Button onclick={createNewEmail} variant="primary" size="md" icon={Plus}>
						Compose Email
					</Button>
				</div>
			{:else}
				<!-- Mobile Cards View -->
				<div class="sm:hidden">
					{#each emails as email}
						<div class="p-4 border-b border-border">
							<div class="flex items-start justify-between mb-2">
								<div class="flex-1 min-w-0">
									<h3 class="text-sm font-medium text-foreground truncate">
										{email.subject}
									</h3>
									<p class="text-xs text-muted-foreground mt-1">
										{formatDate(email.created_at)}
									</p>
								</div>
								<div class="flex items-center space-x-2 ml-3">
									<Button
										onclick={() => viewEmail(email)}
										variant="ghost"
										size="sm"
										icon={Eye}
										class="!p-2 !text-muted-foreground hover:!text-info"
										title="View email"
									/>
									{#if email.status === 'draft' || email.status === 'scheduled'}
										<Button
											onclick={() => editEmail(email)}
											variant="ghost"
											size="sm"
											icon={Edit}
											class="!p-2 !text-muted-foreground hover:!text-warning"
											title="Edit email"
										/>
									{/if}
									{#if email.status === 'draft'}
										<Button
											onclick={() => confirmDeleteEmail(email)}
											variant="ghost"
											size="sm"
											icon={Trash2}
											class="!p-2 !text-muted-foreground hover:!text-destructive"
											title="Delete email"
										/>
									{/if}
								</div>
							</div>

							<div class="flex items-center justify-between text-xs mb-2">
								<span
									class="inline-flex px-2 py-1 font-medium rounded-full {getStatusColor(
										email.status
									)}"
								>
									{email.status}
								</span>
								<div class="flex items-center space-x-3 text-muted-foreground">
									<span class="flex items-center">
										<Users class="h-3 w-3 mr-1" />
										{getRecipientCount(email)}
									</span>
									{#if email.status === 'sent' || email.status === 'delivered'}
										<span class="flex items-center">
											<Eye class="h-3 w-3 mr-1" />
											{getOpenCount(email)}
										</span>
									{/if}
								</div>
							</div>

							<p class="text-xs text-muted-foreground line-clamp-2">
								From: {email.from_name} &lt;{email.from_email}&gt;
							</p>
						</div>
					{/each}
				</div>

				<!-- Desktop Table View -->
				<div class="hidden sm:block overflow-x-auto">
					<table class="min-w-full divide-y divide-border">
						<thead class="bg-muted">
							<tr>
								<th
									class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
								>
									Email
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
								>
									Status
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
								>
									Recipients
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
								>
									Created
								</th>
								<th
									class="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider"
								>
									Actions
								</th>
							</tr>
						</thead>
						<tbody class="bg-card divide-y divide-border">
							{#each emails as email}
								<tr class="hover:bg-muted">
									<td class="px-6 py-4">
										<div class="flex items-center">
											<div class="flex-shrink-0 h-10 w-10">
												<div
													class="h-10 w-10 rounded-full bg-info/10 flex items-center justify-center"
												>
													<Mail class="h-5 w-5 text-info" />
												</div>
											</div>
											<div class="ml-4">
												<div class="text-sm font-medium text-foreground">
													{email.subject}
												</div>
												<div class="text-sm text-muted-foreground">
													From: {email.from_name} &lt;{email.from_email}&gt;
												</div>
											</div>
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span
											class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getStatusColor(
												email.status
											)}"
										>
											{email.status}
										</span>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex items-center text-sm text-foreground">
											<Users class="h-4 w-4 mr-1 text-muted-foreground" />
											{getRecipientCount(email)}
											{#if email.status === 'sent' || email.status === 'delivered'}
												<span class="ml-2 text-muted-foreground">
													(<Eye
														class="h-3 w-3 inline mr-1"
													/>{getOpenCount(email)} opened)
												</span>
											{/if}
										</div>
									</td>
									<td
										class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground"
									>
										{formatDate(email.created_at)}
									</td>
									<td
										class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
									>
										<div class="flex items-center justify-end space-x-2">
											<Button
												onclick={() => viewEmail(email)}
												variant="ghost"
												size="sm"
												icon={Eye}
												class="!p-2 !text-muted-foreground hover:!text-info !transition-colors"
												title="View email"
											/>
											{#if email.status === 'draft' || email.status === 'scheduled'}
												<Button
													onclick={() => editEmail(email)}
													variant="ghost"
													size="sm"
													icon={Edit}
													class="!p-2 !text-muted-foreground hover:!text-warning !transition-colors"
													title="Edit email"
												/>
											{/if}
											{#if email.status === 'draft'}
												<Button
													onclick={() => confirmDeleteEmail(email)}
													variant="ghost"
													size="sm"
													icon={Trash2}
													class="!p-2 !text-muted-foreground hover:!text-destructive !transition-colors"
													title="Delete email"
												/>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Pagination -->
				{#if totalPages > 1}
					<div
						class="bg-card px-4 py-3 flex items-center justify-between border-t border-border"
					>
						<div class="flex-1 flex justify-between sm:hidden">
							<Button
								onclick={prevPage}
								disabled={currentPage === 1}
								variant="secondary"
								size="sm"
							>
								Previous
							</Button>
							<span class="flex items-center text-sm text-foreground">
								{currentPage} of {totalPages}
							</span>
							<Button
								onclick={nextPage}
								disabled={currentPage === totalPages}
								variant="secondary"
								size="sm"
							>
								Next
							</Button>
						</div>
						<div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
							<div>
								<p class="text-sm text-foreground">
									Showing page <span class="font-medium">{currentPage}</span> of
									<span class="font-medium">{totalPages}</span>
								</p>
							</div>
							<div>
								<nav
									class="relative z-0 inline-flex rounded-md shadow-ink -space-x-px"
								>
									<Button
										onclick={prevPage}
										disabled={currentPage === 1}
										variant="secondary"
										size="sm"
										icon={ChevronLeft}
										class="!rounded-r-none"
									/>
									<Button
										onclick={nextPage}
										disabled={currentPage === totalPages}
										variant="secondary"
										size="sm"
										icon={ChevronRight}
										class="!rounded-l-none"
									/>
								</nav>
							</div>
						</div>
					</div>
				{/if}
			{/if}
		</div>
	{:else if activeView === 'compose'}
		{#if EmailComposerComponent}
			<EmailComposerComponent onsaved={handleEmailSaved} onsent={handleEmailSent} />
		{:else}
			<div class="admin-panel p-8 text-center text-sm text-muted-foreground">
				Loading composer...
			</div>
		{/if}
	{:else if activeView === 'edit'}
		{#if EmailComposerComponent}
			<EmailComposerComponent
				initialEmail={selectedEmail}
				onsaved={handleEmailSaved}
				onsent={handleEmailSent}
			/>
		{:else}
			<div class="admin-panel p-8 text-center text-sm text-muted-foreground">
				Loading composer...
			</div>
		{/if}
	{:else if activeView === 'preview'}
		{#if EmailPreviewComponent}
			<EmailPreviewComponent
				emailData={{ ...selectedEmail, recipients: selectedEmail?.email_recipients || [] }}
				showTracking={selectedEmail?.status === 'sent' ||
					selectedEmail?.status === 'delivered'}
			/>
		{:else}
			<div class="admin-panel p-8 text-center text-sm text-muted-foreground">
				Loading preview...
			</div>
		{/if}
	{/if}
</div>

<!-- Delete Confirmation Modal -->
<ConfirmationModal
	isOpen={showDeleteModal}
	title="Delete Email"
	confirmText="Delete"
	cancelText="Cancel"
	confirmVariant="danger"
	icon="danger"
	loading={isDeleting}
	loadingText="Deleting..."
	onconfirm={deleteEmail}
	oncancel={() => (showDeleteModal = false)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			Are you sure you want to delete this email? This action cannot be undone.
		</p>
	{/snippet}

	{#snippet details()}
		{#if emailToDelete}
			<div class="mt-3 text-sm text-muted-foreground">
				<p><strong>Subject:</strong> {emailToDelete.subject}</p>
				<p><strong>Status:</strong> {emailToDelete.status}</p>
			</div>
		{/if}
	{/snippet}
</ConfirmationModal>
