<!-- apps/web/src/lib/components/profile/AccountSettingsModal.svelte -->
<script lang="ts">
	import {
		User,
		Mail,
		Lock,
		Trash2,
		AlertCircle,
		CheckCircle,
		Settings,
		Eye,
		EyeOff,
		X
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';

	interface Props {
		isOpen?: boolean;
		user: any;
		onclose?: () => void;
		onsuccess?: (event: { message: string }) => void;
		onerror?: (event: { message: string }) => void;
	}

	let { isOpen = false, user, onclose, onsuccess, onerror }: Props = $props();

	// Form state
	let activeTab = $state<'profile' | 'password' | 'danger'>('profile');
	let loading = $state(false);
	let showCurrentPassword = $state(false);
	let showNewPassword = $state(false);
	let showConfirmPassword = $state(false);
	let showDeleteConfirmation = $state(false);

	// Profile form
	let profileForm = $state({
		name: '',
		email: ''
	});

	// Password form
	let passwordForm = $state({
		currentPassword: '',
		newPassword: '',
		confirmPassword: ''
	});

	let errors = $state<string[]>([]);
	let successMessage = $state('');

	// Initialize form data when modal opens
	$effect(() => {
		if (isOpen && user) {
			profileForm = {
				name: user.user_metadata?.name || user.name || '',
				email: user.email || ''
			};

			// Reset password form
			passwordForm = {
				currentPassword: '',
				newPassword: '',
				confirmPassword: ''
			};

			// Reset state
			errors = [];
			successMessage = '';
			loading = false;
			activeTab = 'profile';
		}
	});

	async function updateProfile() {
		if (loading) return;

		errors = [];
		successMessage = '';

		// Basic validation
		if (!profileForm.name?.trim() && !profileForm.email?.trim()) {
			errors = ['Please fill in at least one field'];
			return;
		}

		if (profileForm.email && !isValidEmail(profileForm.email)) {
			errors = ['Please enter a valid email address'];
			return;
		}

		loading = true;

		try {
			const response = await fetch('/api/account/settings', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					name: profileForm.name?.trim(),
					email: profileForm.email?.trim()
				})
			});

			const result = await response.json();

			if (response.ok && result.success) {
				successMessage = result.data.message;
				onsuccess?.({ message: result.data.message });
			} else {
				errors = [result.error || 'Failed to update profile'];
			}
		} catch (error) {
			console.error('Profile update error:', error);
			errors = ['An unexpected error occurred'];
		} finally {
			loading = false;
		}
	}

	async function updatePassword() {
		if (loading) return;

		errors = [];
		successMessage = '';

		// Validation
		if (!passwordForm.currentPassword) {
			errors = ['Current password is required'];
			return;
		}

		if (!passwordForm.newPassword) {
			errors = ['New password is required'];
			return;
		}

		if (passwordForm.newPassword.length < 6) {
			errors = ['Password must be at least 6 characters long'];
			return;
		}

		if (passwordForm.newPassword !== passwordForm.confirmPassword) {
			errors = ['Passwords do not match'];
			return;
		}

		if (passwordForm.currentPassword === passwordForm.newPassword) {
			errors = ['New password must be different from current password'];
			return;
		}

		loading = true;

		try {
			const response = await fetch('/api/account/password', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					currentPassword: passwordForm.currentPassword,
					newPassword: passwordForm.newPassword
				})
			});

			const result = await response.json();

			if (response.ok && result.success) {
				successMessage = result.data.message;
				passwordForm = {
					currentPassword: '',
					newPassword: '',
					confirmPassword: ''
				};
				onsuccess?.({ message: result.data.message });
			} else {
				errors = [result.error || 'Failed to update password'];
			}
		} catch (error) {
			console.error('Password update error:', error);
			errors = ['An unexpected error occurred'];
		} finally {
			loading = false;
		}
	}

	async function deleteAccount() {
		if (loading) return;

		loading = true;
		errors = [];

		try {
			const response = await fetch('/api/account/settings', {
				method: 'DELETE'
			});

			const result = await response.json();

			if (response.ok && result.success) {
				onsuccess?.({ message: 'Account deleted successfully. Redirecting...' });
				// Redirect will be handled by the parent component
				setTimeout(() => {
					window.location.href = '/';
				}, 1500);
			} else {
				errors = [result.error || 'Failed to delete account'];
			}
		} catch (error) {
			console.error('Account deletion error:', error);
			errors = ['An unexpected error occurred'];
		} finally {
			loading = false;
			showDeleteConfirmation = false;
		}
	}

	function handleClose() {
		if (loading) return;
		onclose?.();
	}

	function isValidEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	}

	function switchTab(tab: 'profile' | 'password' | 'danger') {
		if (loading) return;
		activeTab = tab;
		errors = [];
		successMessage = '';
	}
</script>

<Modal {isOpen} onClose={handleClose} size="lg" title="">
	{#snippet header()}
		<div>
			<div class="sm:hidden">
				<div class="modal-grab-handle"></div>
			</div>
			<!-- Inkprint compact header -->
			<div
				class="flex h-12 items-center justify-between gap-2 px-3 sm:px-4 border-b border-border bg-muted/30"
			>
				<div class="flex items-center gap-2 min-w-0">
					<div class="p-1.5 bg-accent/20 rounded-lg shrink-0">
						<Settings class="w-4 h-4 text-accent" />
					</div>
					<h2 class="text-sm font-semibold text-foreground truncate">Account Settings</h2>
				</div>
				<!-- Inkprint close button -->
				<button
					type="button"
					onclick={handleClose}
					disabled={loading}
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:border-red-400/50 dark:hover:text-red-400"
					aria-label="Close modal"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="flex flex-col h-full">
			<!-- Tab Navigation -->
			<div class="border-b border-border bg-card">
				<nav class="flex space-x-8 px-6" aria-label="Tabs">
					<Button
						onclick={() => switchTab('profile')}
						disabled={loading}
						variant="ghost"
						size="md"
						class="py-4 px-1 border-b-0 font-medium text-sm transition-colors whitespace-nowrap focus:ring-0 focus:ring-offset-0
					{activeTab === 'profile'
							? 'border-accent text-accent'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
						icon={User}
					>
						Profile
					</Button>
					<Button
						onclick={() => switchTab('password')}
						disabled={loading}
						variant="ghost"
						size="md"
						class="py-4 px-1 border-b-0 font-medium text-sm transition-colors whitespace-nowrap focus:ring-0 focus:ring-offset-0
					{activeTab === 'password'
							? 'border-accent text-accent'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
						icon={Lock}
					>
						Password
					</Button>
					<Button
						onclick={() => switchTab('danger')}
						disabled={loading}
						variant="ghost"
						size="md"
						class="py-4 px-1 border-b-0 font-medium text-sm transition-colors whitespace-nowrap focus:ring-0 focus:ring-offset-0
					{activeTab === 'danger'
							? 'border-red-500 text-red-500'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
						icon={Trash2}
					>
						Delete Account
					</Button>
				</nav>
			</div>

			<!-- Tab Content -->
			<div class="flex-1 overflow-y-auto bg-muted/30">
				<!-- Success Message -->
				{#if successMessage}
					<div
						class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mx-6 mt-6 shadow-ink tx tx-grain tx-weak"
					>
						<div class="flex items-center space-x-2">
							<CheckCircle class="w-5 h-5 text-emerald-500" />
							<p class="text-sm text-foreground">
								{successMessage}
							</p>
						</div>
					</div>
				{/if}

				<!-- Error Messages -->
				{#if errors.length > 0}
					<div
						class="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mx-6 mt-6 shadow-ink tx tx-static tx-weak"
					>
						<div class="flex items-start space-x-2">
							<AlertCircle class="w-5 h-5 text-red-500 mt-0.5" />
							<div class="text-sm text-foreground">
								{#each errors as error}
									<p>{error}</p>
								{/each}
							</div>
						</div>
					</div>
				{/if}

				<!-- Profile Tab -->
				{#if activeTab === 'profile'}
					<div class="px-4 sm:px-6 py-4 space-y-3 sm:space-y-4">
						<div
							class="bg-card rounded-xl border border-border p-4 sm:p-5 lg:p-6 shadow-ink tx tx-frame tx-weak"
						>
							<div class="flex items-center gap-3 mb-6">
								<User class="w-5 h-5 text-accent" />
								<h3 class="text-lg font-semibold text-foreground">
									Profile Information
								</h3>
							</div>

							<div class="space-y-4">
								<FormField label="Full Name" labelFor="name" size="md">
									<TextInput
										id="name"
										bind:value={profileForm.name}
										type="text"
										placeholder="Enter your full name"
										disabled={loading}
										size="md"
									/>
								</FormField>

								<FormField
									label="Email Address"
									labelFor="email"
									size="md"
									hint="Changing your email will require confirmation"
								>
									<TextInput
										id="email"
										bind:value={profileForm.email}
										type="email"
										placeholder="Enter your email address"
										disabled={loading}
										size="md"
									/>
								</FormField>
							</div>

							<div class="flex justify-end mt-6">
								<Button
									onclick={updateProfile}
									disabled={loading}
									variant="primary"
									size="md"
									{loading}
									class="shadow-ink pressable"
								>
									{loading ? 'Updating...' : 'Update Profile'}
								</Button>
							</div>
						</div>
					</div>
				{/if}

				<!-- Password Tab -->
				{#if activeTab === 'password'}
					<div class="px-4 sm:px-6 py-4 space-y-3 sm:space-y-4">
						<div
							class="bg-card rounded-xl border border-border p-4 sm:p-5 lg:p-6 shadow-ink tx tx-frame tx-weak"
						>
							<div class="flex items-center gap-3 mb-6">
								<Lock class="w-5 h-5 text-emerald-500" />
								<h3 class="text-lg font-semibold text-foreground">
									Change Password
								</h3>
							</div>

							<div class="space-y-4">
								<FormField
									label="Current Password"
									labelFor="currentPassword"
									size="md"
									hint="Enter your current password to confirm your identity"
									required={true}
								>
									<div class="relative">
										<TextInput
											id="currentPassword"
											bind:value={passwordForm.currentPassword}
											type={showCurrentPassword ? 'text' : 'password'}
											placeholder="Enter current password"
											disabled={loading}
											size="md"
										/>
										<button
											type="button"
											onclick={() =>
												(showCurrentPassword = !showCurrentPassword)}
											class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
										>
											{#if showCurrentPassword}
												<EyeOff class="w-4 h-4" />
											{:else}
												<Eye class="w-4 h-4" />
											{/if}
										</button>
									</div>
								</FormField>

								<FormField
									label="New Password"
									labelFor="newPassword"
									size="md"
									hint="Must be at least 6 characters long"
									required={true}
								>
									<div class="relative">
										<TextInput
											id="newPassword"
											bind:value={passwordForm.newPassword}
											type={showNewPassword ? 'text' : 'password'}
											placeholder="Enter new password"
											disabled={loading}
											size="md"
										/>
										<button
											type="button"
											onclick={() => (showNewPassword = !showNewPassword)}
											class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
										>
											{#if showNewPassword}
												<EyeOff class="w-4 h-4" />
											{:else}
												<Eye class="w-4 h-4" />
											{/if}
										</button>
									</div>
								</FormField>

								<FormField
									label="Confirm New Password"
									labelFor="confirmPassword"
									size="md"
									required={true}
								>
									<div class="relative">
										<TextInput
											id="confirmPassword"
											bind:value={passwordForm.confirmPassword}
											type={showConfirmPassword ? 'text' : 'password'}
											placeholder="Confirm new password"
											disabled={loading}
											size="md"
										/>
										<button
											type="button"
											onclick={() =>
												(showConfirmPassword = !showConfirmPassword)}
											class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
										>
											{#if showConfirmPassword}
												<EyeOff class="w-4 h-4" />
											{:else}
												<Eye class="w-4 h-4" />
											{/if}
										</button>
									</div>
								</FormField>
							</div>

							<div class="flex justify-end mt-6">
								<Button
									onclick={updatePassword}
									disabled={loading}
									variant="primary"
									size="md"
									{loading}
									class="shadow-ink pressable"
								>
									{loading ? 'Updating...' : 'Update Password'}
								</Button>
							</div>
						</div>
					</div>
				{/if}

				<!-- Danger Zone Tab -->
				{#if activeTab === 'danger'}
					<div class="px-4 sm:px-6 py-4 space-y-3 sm:space-y-4">
						<div
							class="bg-red-500/10 border border-red-500/30 rounded-xl p-6 tx tx-static tx-weak"
						>
							<div class="flex items-center gap-3 mb-6">
								<Trash2 class="w-5 h-5 text-red-500" />
								<h3 class="text-lg font-semibold text-foreground">
									Delete Account
								</h3>
							</div>

							<div class="space-y-4">
								<div
									class="bg-card rounded-lg p-4 border border-red-500/30 shadow-ink"
								>
									<div class="flex items-start space-x-3">
										<AlertCircle
											class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"
										/>
										<div class="text-sm">
											<p class="text-foreground font-medium mb-2">
												This action cannot be undone
											</p>
											<p class="text-muted-foreground">
												Deleting your account will permanently remove all
												your data, including:
											</p>
											<ul
												class="list-disc list-inside mt-2 text-muted-foreground space-y-1"
											>
												<li>All projects and tasks</li>
												<li>Daily briefs and brain dumps</li>
												<li>Calendar integration settings</li>
												<li>Subscription and billing data</li>
											</ul>
										</div>
									</div>
								</div>
							</div>

							<div class="flex justify-end mt-6">
								<Button
									onclick={() => (showDeleteConfirmation = true)}
									disabled={loading}
									variant="outline"
									size="md"
									class="text-red-500 hover:text-white hover:bg-red-600 border-red-500 shadow-ink pressable"
									icon={Trash2}
								>
									Delete My Account
								</Button>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/snippet}
</Modal>

<!-- Delete Confirmation Modal -->
<ConfirmationModal
	isOpen={showDeleteConfirmation}
	title="Delete Account"
	message="Are you absolutely sure you want to delete your account? This action cannot be undone and will permanently delete all your data."
	confirmText="Yes, Delete My Account"
	cancelText="Cancel"
	variant="danger"
	{loading}
	loadingText="Deleting Account..."
	onconfirm={deleteAccount}
	oncancel={() => (showDeleteConfirmation = false)}
/>

<style>
	.modal-grab-handle {
		width: 32px;
		height: 4px;
		background-color: hsl(var(--muted-foreground) / 0.3);
		border-radius: 2px;
		margin: 8px auto 16px auto;
	}
</style>
