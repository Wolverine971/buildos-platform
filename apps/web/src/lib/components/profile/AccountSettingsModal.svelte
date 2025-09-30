<!-- apps/web/src/lib/components/profile/AccountSettingsModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		User,
		Mail,
		Lock,
		Trash2,
		AlertCircle,
		CheckCircle,
		Settings,
		Eye,
		EyeOff
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';

	export let isOpen: boolean = false;
	export let user: any;

	const dispatch = createEventDispatcher<{
		close: void;
		success: { message: string };
		error: { message: string };
	}>();

	// Form state
	let activeTab: 'profile' | 'password' | 'danger' = 'profile';
	let loading = false;
	let showCurrentPassword = false;
	let showNewPassword = false;
	let showConfirmPassword = false;
	let showDeleteConfirmation = false;

	// Profile form
	let profileForm = {
		name: '',
		email: ''
	};

	// Password form
	let passwordForm = {
		currentPassword: '',
		newPassword: '',
		confirmPassword: ''
	};

	let errors: string[] = [];
	let successMessage = '';

	// Initialize form data when modal opens
	$: if (isOpen && user) {
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
				dispatch('success', { message: result.data.message });
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
				dispatch('success', { message: result.data.message });
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
				dispatch('success', { message: 'Account deleted successfully. Redirecting...' });
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
		dispatch('close');
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
	<div slot="header">
		<div class="sm:hidden">
			<div class="modal-grab-handle"></div>
		</div>
		<div
			class="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-800 dark:via-gray-800/95 dark:to-gray-800 px-6 py-5 border-b border-gray-200 dark:border-gray-700"
		>
			<div class="flex items-start justify-between">
				<div class="flex items-center space-x-3">
					<div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
						<Settings class="w-6 h-6 text-blue-600 dark:text-blue-400" />
					</div>
					<div>
						<h2 class="text-2xl font-semibold text-gray-900 dark:text-white">
							Account Settings
						</h2>
						<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
							Manage your account information and preferences
						</p>
					</div>
				</div>
				<Button
					type="button"
					on:click={handleClose}
					disabled={loading}
					variant="ghost"
					size="sm"
					class="!p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
					aria-label="Close modal"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</Button>
			</div>
		</div>
	</div>

	<div class="flex flex-col h-full">
		<!-- Tab Navigation -->
		<div class="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
			<nav class="flex space-x-8 px-6" aria-label="Tabs">
				<Button
					on:click={() => switchTab('profile')}
					disabled={loading}
					variant="ghost"
					size="md"
					class="py-4 px-1 border-b-0 font-medium text-sm transition-colors whitespace-nowrap focus:ring-0 focus:ring-offset-0
					{activeTab === 'profile'
						? 'border-blue-500 text-blue-600 dark:text-blue-400'
						: 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
					icon={User}
				>
					Profile
				</Button>
				<Button
					on:click={() => switchTab('password')}
					disabled={loading}
					variant="ghost"
					size="md"
					class="py-4 px-1 border-b-0 font-medium text-sm transition-colors whitespace-nowrap focus:ring-0 focus:ring-offset-0
					{activeTab === 'password'
						? 'border-blue-500 text-blue-600 dark:text-blue-400'
						: 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
					icon={Lock}
				>
					Password
				</Button>
				<Button
					on:click={() => switchTab('danger')}
					disabled={loading}
					variant="ghost"
					size="md"
					class="py-4 px-1 border-b-0 font-medium text-sm transition-colors whitespace-nowrap focus:ring-0 focus:ring-offset-0
					{activeTab === 'danger'
						? 'border-red-500 text-red-600 dark:text-red-400'
						: 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
					icon={Trash2}
				>
					Delete Account
				</Button>
			</nav>
		</div>

		<!-- Tab Content -->
		<div class="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-gray-900/30">
			<!-- Success Message -->
			{#if successMessage}
				<div
					class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mx-6 mt-6"
				>
					<div class="flex items-center space-x-2">
						<CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400" />
						<p class="text-sm text-green-700 dark:text-green-300">{successMessage}</p>
					</div>
				</div>
			{/if}

			<!-- Error Messages -->
			{#if errors.length > 0}
				<div
					class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mx-6 mt-6"
				>
					<div class="flex items-start space-x-2">
						<AlertCircle class="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
						<div class="text-sm text-red-700 dark:text-red-300">
							{#each errors as error}
								<p>{error}</p>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Profile Tab -->
			{#if activeTab === 'profile'}
				<div class="p-6 space-y-6">
					<div
						class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6"
					>
						<div class="flex items-center gap-3 mb-6">
							<User class="w-5 h-5 text-blue-600 dark:text-blue-400" />
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
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
								on:click={updateProfile}
								disabled={loading}
								variant="primary"
								size="md"
								{loading}
								loadingText="Updating Profile..."
							>
								Update Profile
							</Button>
						</div>
					</div>
				</div>
			{/if}

			<!-- Password Tab -->
			{#if activeTab === 'password'}
				<div class="p-6 space-y-6">
					<div
						class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6"
					>
						<div class="flex items-center gap-3 mb-6">
							<Lock class="w-5 h-5 text-green-600 dark:text-green-400" />
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
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
										on:click={() =>
											(showCurrentPassword = !showCurrentPassword)}
										class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
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
										on:click={() => (showNewPassword = !showNewPassword)}
										class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
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
										on:click={() =>
											(showConfirmPassword = !showConfirmPassword)}
										class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
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
								on:click={updatePassword}
								disabled={loading}
								variant="primary"
								size="md"
								{loading}
								loadingText="Updating Password..."
							>
								Update Password
							</Button>
						</div>
					</div>
				</div>
			{/if}

			<!-- Danger Zone Tab -->
			{#if activeTab === 'danger'}
				<div class="p-6 space-y-6">
					<div
						class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6"
					>
						<div class="flex items-center gap-3 mb-6">
							<Trash2 class="w-5 h-5 text-red-600 dark:text-red-400" />
							<h3 class="text-lg font-semibold text-red-900 dark:text-red-100">
								Delete Account
							</h3>
						</div>

						<div class="space-y-4">
							<div
								class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-red-200 dark:border-red-700"
							>
								<div class="flex items-start space-x-3">
									<AlertCircle
										class="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0"
									/>
									<div class="text-sm">
										<p class="text-red-800 dark:text-red-200 font-medium mb-2">
											This action cannot be undone
										</p>
										<p class="text-red-700 dark:text-red-300">
											Deleting your account will permanently remove all your
											data, including:
										</p>
										<ul
											class="list-disc list-inside mt-2 text-red-700 dark:text-red-300 space-y-1"
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
								on:click={() => (showDeleteConfirmation = true)}
								disabled={loading}
								variant="outline"
								size="md"
								class="text-red-600 hover:text-white hover:bg-red-600 border-red-600"
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
	on:confirm={deleteAccount}
	on:cancel={() => (showDeleteConfirmation = false)}
/>

<style>
	.modal-grab-handle {
		width: 32px;
		height: 4px;
		background-color: rgb(209 213 219);
		border-radius: 2px;
		margin: 8px auto 16px auto;
	}

	.dark .modal-grab-handle {
		background-color: rgb(75 85 99);
	}
</style>
