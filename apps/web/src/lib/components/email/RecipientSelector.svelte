<!-- apps/web/src/lib/components/email/RecipientSelector.svelte -->
<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';
	import { Users, Search, Plus, X, Mail, Building, Shield, User } from 'lucide-svelte';
	import Modal from '../ui/Modal.svelte';
	import TextInput from '../ui/TextInput.svelte';
	import FormField from '../ui/FormField.svelte';
	import Button from '../ui/Button.svelte';

	interface Props {
		isOpen?: boolean;
		selectedRecipients?: any[];
	}

	let { isOpen = false, selectedRecipients = [] }: Props = $props();

	const dispatch = createEventDispatcher();

	let activeTab = $state<'beta_users' | 'beta_members' | 'custom'>('beta_users');
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let searchQuery = $state('');

	// Recipients data
	let betaUsers = $state<any[]>([]);
	let betaMembers = $state<any[]>([]);
	let customRecipients = $state<any[]>([]);

	// Selection state
	let selectedUserIds = $state(new Set<string>());
	let selectedMemberIds = $state(new Set<string>());
	let selectedCustomIds = $state(new Set<string>());

	// Custom recipient form
	let customName = $state('');
	let customEmail = $state('');
	let showCustomForm = $state(false);

	onMount(() => {
		if (isOpen) {
			loadRecipients();
			initializeSelection();
		}
	});

	// Watch for open state changes
	$effect(() => {
		if (!browser) return;
		if (isOpen) {
			loadRecipients();
			initializeSelection();
		}
	});

	function initializeSelection() {
		// Initialize selection sets based on existing recipients
		selectedUserIds = new Set(
			selectedRecipients
				.filter((r) => (r.recipient_type || r.type) === 'beta_user')
				.map((r) => r.recipient_id || r.id)
				.filter((id) => id) // Remove null/undefined IDs
		);

		selectedMemberIds = new Set(
			selectedRecipients
				.filter((r) => (r.recipient_type || r.type) === 'beta_member')
				.map((r) => r.recipient_id || r.id)
				.filter((id) => id) // Remove null/undefined IDs
		);

		// For custom recipients, use email as the ID since recipient_id is null
		const customRecipientsList = selectedRecipients.filter(
			(r) => (r.recipient_type || r.type) === 'custom'
		);

		// Load existing custom recipients - ensure we have all the data needed
		// and merge with any existing custom recipients that were already added in this session
		const existingCustomEmails = new Set(customRecipients.map((r) => r.email));
		const incomingCustomRecipients = customRecipientsList
			.filter((r) => !existingCustomEmails.has(r.recipient_email || r.email))
			.map((r) => ({
				id: r.recipient_email || r.email,
				name: r.recipient_name || r.name || '',
				email: r.recipient_email || r.email,
				type: 'custom'
			}));

		// Merge with existing custom recipients
		customRecipients = [...customRecipients, ...incomingCustomRecipients];

		// Initialize selectedCustomIds with all custom recipients (both existing and newly loaded)
		selectedCustomIds = new Set(customRecipients.map((r) => r.email));
	}

	async function loadRecipients() {
		isLoading = true;
		error = null;

		try {
			// Load beta users
			const usersResponse = await fetch(
				'/api/admin/emails/recipients?source=beta_users&limit=100'
			);
			if (usersResponse.ok) {
				const usersResult = await usersResponse.json();
				betaUsers = usersResult.recipients || [];
			}

			// Load beta members
			const membersResponse = await fetch(
				'/api/admin/emails/recipients?source=beta_members&limit=100'
			);
			if (membersResponse.ok) {
				const membersResult = await membersResponse.json();
				betaMembers = membersResult.recipients || [];
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load recipients';
		} finally {
			isLoading = false;
		}
	}

	function toggleUserSelection(userId: string) {
		if (selectedUserIds.has(userId)) {
			selectedUserIds.delete(userId);
		} else {
			selectedUserIds.add(userId);
		}
		selectedUserIds = new Set(selectedUserIds);
	}

	function toggleMemberSelection(memberId: string) {
		if (selectedMemberIds.has(memberId)) {
			selectedMemberIds.delete(memberId);
		} else {
			selectedMemberIds.add(memberId);
		}
		selectedMemberIds = new Set(selectedMemberIds);
	}

	function toggleCustomSelection(customEmail: string) {
		if (selectedCustomIds.has(customEmail)) {
			selectedCustomIds.delete(customEmail);
		} else {
			selectedCustomIds.add(customEmail);
		}
		selectedCustomIds = new Set(selectedCustomIds);
	}

	function selectAllBetaUsers() {
		selectedUserIds = new Set(filteredBetaUsers.map((user) => user.id));
	}

	function deselectAllBetaUsers() {
		selectedUserIds = new Set();
	}

	let filteredBetaUsers = $derived(filterUsers(betaUsers, searchQuery));
	let filteredBetaMembers = $derived(filterUsers(betaMembers, searchQuery));
	let filteredCustomRecipients = $derived(filterUsers(customRecipients, searchQuery));

	let allBetaUsersSelected = $derived(
		filteredBetaUsers.length > 0 &&
			filteredBetaUsers.every((user) => selectedUserIds.has(user.id))
	);

	let totalSelected = $derived(
		selectedUserIds.size + selectedMemberIds.size + selectedCustomIds.size
	);

	function addCustomRecipient() {
		if (!customName.trim() || !customEmail.trim()) {
			error = 'Name and email are required';
			return;
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(customEmail)) {
			error = 'Please enter a valid email address';
			return;
		}

		// Check if email already exists
		const existsInCustom = customRecipients.some((r) => r.email === customEmail);
		const existsInUsers = betaUsers.some((r) => r.email === customEmail);
		const existsInMembers = betaMembers.some((r) => r.email === customEmail);

		if (existsInCustom || existsInUsers || existsInMembers) {
			error = 'This email is already in the list';
			return;
		}

		// Add to custom recipients
		const newRecipient = {
			id: customEmail.trim(),
			name: customName.trim(),
			email: customEmail.trim(),
			type: 'custom'
		};

		customRecipients = [...customRecipients, newRecipient];
		selectedCustomIds.add(customEmail.trim());
		selectedCustomIds = new Set(selectedCustomIds);

		// Clear form
		customName = '';
		customEmail = '';
		showCustomForm = false;
		error = null;
	}

	function removeCustomRecipient(customEmail: string) {
		customRecipients = customRecipients.filter((r) => r.email !== customEmail);
		selectedCustomIds.delete(customEmail);
		selectedCustomIds = new Set(selectedCustomIds);
	}

	function saveSelection() {
		const recipients = [];

		// Add selected beta users
		for (const userId of selectedUserIds) {
			const user = betaUsers.find((u) => u.id === userId);
			if (user) {
				recipients.push({
					id: user.id,
					name: user.name,
					email: user.email,
					type: 'beta_user',
					company: user.company
				});
			}
		}

		// Add selected beta members
		for (const memberId of selectedMemberIds) {
			const member = betaMembers.find((m) => m.id === memberId);
			if (member) {
				recipients.push({
					id: member.id,
					name: member.name,
					email: member.email,
					type: 'beta_member',
					company: member.company,
					tier: member.tier
				});
			}
		}

		// Add selected custom recipients
		for (const customEmail of selectedCustomIds) {
			const custom = customRecipients.find((c) => c.email === customEmail);
			if (custom) {
				recipients.push({
					id: null,
					name: custom.name,
					email: custom.email,
					type: 'custom'
				});
			}
		}

		dispatch('recipientsSelected', recipients);
	}

	function close() {
		dispatch('close');
	}

	function clearMessages() {
		error = null;
	}

	// Filter functions
	function filterUsers(users: any[], query: string) {
		if (!query) return users;
		return users.filter(
			(user) =>
				user.name.toLowerCase().includes(query.toLowerCase()) ||
				user.email.toLowerCase().includes(query.toLowerCase()) ||
				(user.company && user.company.toLowerCase().includes(query.toLowerCase()))
		);
	}
</script>

<Modal {isOpen} onClose={close} title="Select Recipients" size="xl">
	{#snippet children()}
		<div class="space-y-4">
			<!-- Error Message -->
			{#if error}
				<div
					class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3"
				>
					<div class="flex justify-between items-center">
						<p class="text-red-800 dark:text-red-200 text-sm">{error}</p>
						<Button
							onclick={clearMessages}
							variant="ghost"
							size="sm"
							class="!text-red-400 hover:!text-red-600 p-1"
						>
							<X class="h-4 w-4" />
						</Button>
					</div>
				</div>
			{/if}

			<!-- Header with Selection Count -->
			<div
				class="flex items-center justify-between bg-muted rounded-lg p-4"
			>
				<div class="flex items-center space-x-3">
					<Users class="h-5 w-5 text-blue-600 dark:text-blue-400" />
					<span class="font-medium text-foreground">
						{totalSelected} recipient{totalSelected !== 1 ? 's' : ''} selected
					</span>
				</div>

				<!-- Search -->
				<div class="relative max-w-sm">
					<Search
						class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
					/>
					<TextInput
						bind:value={searchQuery}
						placeholder="Search recipients..."
						class="pl-10"
						size="md"
					/>
				</div>
			</div>

			<!-- Tabs -->
			<div class="border-b border-border">
				<nav class="-mb-px flex space-x-8">
					<Button
						onclick={() => (activeTab = 'beta_users')}
						variant="ghost"
						size="sm"
						class="py-2 px-1 border-b-2 font-medium {activeTab === 'beta_users'
							? 'border-blue-500 text-blue-600 dark:text-blue-400'
							: 'border-transparent text-muted-foreground hover:text-foreground hover:border-border dark:text-muted-foreground dark:hover:text-muted-foreground'}"
					>
						<User class="h-4 w-4 mr-2" />
						Beta Users ({betaUsers.length})
					</Button>
					<Button
						onclick={() => (activeTab = 'beta_members')}
						variant="ghost"
						size="sm"
						class="py-2 px-1 border-b-2 font-medium {activeTab === 'beta_members'
							? 'border-blue-500 text-blue-600 dark:text-blue-400'
							: 'border-transparent text-muted-foreground hover:text-foreground hover:border-border dark:text-muted-foreground dark:hover:text-muted-foreground'}"
					>
						<Shield class="h-4 w-4 mr-2" />
						Beta Members ({betaMembers.length})
					</Button>
					<Button
						onclick={() => (activeTab = 'custom')}
						variant="ghost"
						size="sm"
						class="py-2 px-1 border-b-2 font-medium {activeTab === 'custom'
							? 'border-blue-500 text-blue-600 dark:text-blue-400'
							: 'border-transparent text-muted-foreground hover:text-foreground hover:border-border dark:text-muted-foreground dark:hover:text-muted-foreground'}"
					>
						<Plus class="h-4 w-4 mr-2" />
						Custom ({customRecipients.length})
					</Button>
				</nav>
			</div>

			<!-- Content -->
			<div class="max-h-96 overflow-y-auto">
				{#if isLoading}
					<div class="flex justify-center py-8">
						<div
							class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"
						></div>
					</div>
				{:else}
					<!-- Beta Users Tab -->
					{#if activeTab === 'beta_users'}
						{#if filteredBetaUsers.length === 0}
							<div class="text-center py-8">
								<User class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
								<p class="text-muted-foreground">
									{searchQuery
										? 'No beta users match your search'
										: 'No beta users found'}
								</p>
							</div>
						{:else}
							<!-- Select All / Deselect All Button -->
							<div class="mb-4 flex justify-start">
								<Button
									onclick={allBetaUsersSelected
										? deselectAllBetaUsers
										: selectAllBetaUsers}
									variant="outline"
									size="sm"
									class="text-xs"
								>
									{allBetaUsersSelected ? 'Deselect All' : 'Select All'} Beta Users
								</Button>
							</div>
							<div class="space-y-2">
								{#each filteredBetaUsers as user}
									<div
										class="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted"
									>
										<div class="flex items-center space-x-3">
											<input
												type="checkbox"
												checked={selectedUserIds.has(user.id)}
												onchange={() => toggleUserSelection(user.id)}
												class="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer dark:checked:bg-blue-600"
											/>
											<div class="flex-shrink-0">
												<div
													class="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center"
												>
													<span
														class="text-sm font-medium text-blue-800 dark:text-blue-200"
													>
														{user.name.charAt(0).toUpperCase()}
													</span>
												</div>
											</div>
											<div class="min-w-0 flex-1">
												<p
													class="text-sm font-medium text-foreground truncate"
												>
													{user.name}
												</p>
												<div
													class="flex items-center space-x-2 text-sm text-muted-foreground"
												>
													<Mail class="h-3 w-3" />
													<span class="truncate">{user.email}</span>
												</div>
												{#if user.company}
													<div
														class="flex items-center space-x-2 text-sm text-muted-foreground"
													>
														<Building class="h-3 w-3" />
														<span class="truncate">{user.company}</span>
													</div>
												{/if}
											</div>
										</div>
										<div class="flex items-center space-x-2">
											<span
												class="inline-flex px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 rounded-full"
											>
												{user.status}
											</span>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					{/if}

					<!-- Beta Members Tab -->
					{#if activeTab === 'beta_members'}
						{#if filteredBetaMembers.length === 0}
							<div class="text-center py-8">
								<Shield class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
								<p class="text-muted-foreground">
									{searchQuery
										? 'No beta members match your search'
										: 'No beta members found'}
								</p>
							</div>
						{:else}
							<div class="space-y-2">
								{#each filteredBetaMembers as member}
									<div
										class="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted"
									>
										<div class="flex items-center space-x-3">
											<input
												type="checkbox"
												checked={selectedMemberIds.has(member.id)}
												onchange={() => toggleMemberSelection(member.id)}
												class="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer dark:checked:bg-blue-600"
											/>
											<div class="flex-shrink-0">
												<div
													class="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center"
												>
													<span
														class="text-sm font-medium text-purple-800 dark:text-purple-200"
													>
														{member.name.charAt(0).toUpperCase()}
													</span>
												</div>
											</div>
											<div class="min-w-0 flex-1">
												<p
													class="text-sm font-medium text-foreground truncate"
												>
													{member.name}
												</p>
												<div
													class="flex items-center space-x-2 text-sm text-muted-foreground"
												>
													<Mail class="h-3 w-3" />
													<span class="truncate">{member.email}</span>
												</div>
												{#if member.company}
													<div
														class="flex items-center space-x-2 text-sm text-muted-foreground"
													>
														<Building class="h-3 w-3" />
														<span class="truncate"
															>{member.company}</span
														>
													</div>
												{/if}
											</div>
										</div>
										<div class="flex items-center space-x-2">
											<span
												class="inline-flex px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 rounded-full"
											>
												{member.tier}
											</span>
											{#if member.active}
												<span
													class="inline-flex px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 rounded-full"
												>
													Active
												</span>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					{/if}

					<!-- Custom Recipients Tab -->
					{#if activeTab === 'custom'}
						<div class="space-y-4">
							<!-- Add Custom Recipient Form -->
							<div class="bg-muted rounded-lg p-4">
								{#if showCustomForm}
									<div class="space-y-3">
										<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
											<FormField label="Name" labelFor="custom-name">
												<TextInput
													id="custom-name"
													bind:value={customName}
													placeholder="Recipient name"
													size="md"
												/>
											</FormField>
											<FormField label="Email" labelFor="custom-email">
												<TextInput
													id="custom-email"
													type="email"
													bind:value={customEmail}
													placeholder="email@example.com"
													size="md"
												/>
											</FormField>
										</div>
										<div class="flex justify-end space-x-2">
											<Button
												onclick={() => (showCustomForm = false)}
												variant="outline"
												size="md"
											>
												Cancel
											</Button>
											<Button
												onclick={addCustomRecipient}
												variant="primary"
												size="md"
											>
												Add Recipient
											</Button>
										</div>
									</div>
								{:else}
									<Button
										onclick={() => (showCustomForm = true)}
										variant="outline"
										size="md"
										class="w-full border-2 border-dashed border-border hover:border-border"
									>
										<Plus class="h-4 w-4 mr-2" />
										Add Custom Recipient
									</Button>
								{/if}
							</div>

							<!-- Custom Recipients List -->
							{#if filteredCustomRecipients.length === 0}
								<div class="text-center py-8">
									<Plus class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
									<p class="text-muted-foreground">
										{searchQuery
											? 'No custom recipients match your search'
											: 'No custom recipients added yet'}
									</p>
								</div>
							{:else}
								<div class="space-y-2">
									{#each filteredCustomRecipients as custom}
										<div
											class="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted"
										>
											<div class="flex items-center space-x-3">
												<input
													type="checkbox"
													checked={selectedCustomIds.has(custom.email)}
													onchange={() =>
														toggleCustomSelection(custom.email)}
													class="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer dark:checked:bg-blue-600"
												/>
												<div class="flex-shrink-0">
													<div
														class="h-10 w-10 rounded-full bg-muted flex items-center justify-center"
													>
														<span
															class="text-sm font-medium text-foreground"
														>
															{custom.name.charAt(0).toUpperCase()}
														</span>
													</div>
												</div>
												<div class="min-w-0 flex-1">
													<p
														class="text-sm font-medium text-foreground truncate"
													>
														{custom.name}
													</p>
													<div
														class="flex items-center space-x-2 text-sm text-muted-foreground"
													>
														<Mail class="h-3 w-3" />
														<span class="truncate">{custom.email}</span>
													</div>
												</div>
											</div>
											<div class="flex items-center space-x-2">
												<span
													class="inline-flex px-2 py-1 text-xs font-medium bg-muted text-foreground dark:text-muted-foreground rounded-full"
												>
													Custom
												</span>
												<Button
													onclick={() =>
														removeCustomRecipient(custom.email)}
													variant="ghost"
													size="sm"
													icon={X}
													class="!text-red-400 hover:!text-red-600"
													title="Remove recipient"
												/>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<!-- Footer -->
		<div class="flex justify-between items-center pt-4 p-4">
			<span class="text-sm text-muted-foreground">
				{totalSelected} recipient{totalSelected !== 1 ? 's' : ''} selected
			</span>
			<div class="flex space-x-3">
				<Button onclick={close} variant="secondary" size="md">Cancel</Button>
				<Button onclick={saveSelection} variant="primary" size="md">Save Selection</Button>
			</div>
		</div>
	{/snippet}
</Modal>
