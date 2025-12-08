<!-- apps/web/src/lib/components/profile/AccountTab.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { User, Lock, Trash2, TriangleAlert, CircleCheck, Eye, EyeOff } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';

	export let user: any;

	const dispatch = createEventDispatcher<{
		success: { message: string };
		error: { message: string };
	}>();

	// Form state
	let activeSection: 'profile' | 'password' | 'danger' = 'profile';
	let loading = false;
	let showCurrentPassword = false;
	let showNewPassword = false;
	let showConfirmPassword = false;
	let showDeleteConfirmation = false;

	// Profile form
	let profileForm = {
		name: user?.user_metadata?.name || user?.name || '',
		email: user?.email || ''
	};

	// Password form
	let passwordForm = {
		currentPassword: '',
		newPassword: '',
		confirmPassword: ''
	};

	let errors: string[] = [];
	let successMessage = '';

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

	function isValidEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	}

	function switchSection(section: 'profile' | 'password' | 'danger') {
		if (loading) return;
		activeSection = section;
		errors = [];
		successMessage = '';
	}
</script>

<div class="space-y-6">
	<!-- Success Message -->
	{#if successMessage}
		<div
			class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 shadow-ink tx tx-grain tx-weak"
		>
			<div class="flex items-center space-x-2">
				<CircleCheck class="w-5 h-5 text-emerald-500" />
				<p class="text-sm text-foreground">{successMessage}</p>
			</div>
		</div>
	{/if}

	<!-- Error Messages -->
	{#if errors.length > 0}
		<div
			class="bg-red-500/10 border border-red-500/30 rounded-lg p-4 shadow-ink tx tx-static tx-weak"
		>
			<div class="flex items-start space-x-2">
				<TriangleAlert class="w-5 h-5 text-red-500 mt-0.5" />
				<div class="text-sm text-foreground">
					{#each errors as error}
						<p>{error}</p>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Section Buttons -->
	<div class="bg-card rounded-lg shadow-ink border border-border tx tx-frame tx-weak">
		<div class="border-b border-border">
			<nav
				class="flex overflow-x-auto px-4 sm:px-6 -mb-px scrollbar-hide"
				aria-label="Account sections"
			>
				<Button
					onclick={() => switchSection('profile')}
					disabled={loading}
					variant="ghost"
					size="md"
					class="py-3 sm:py-4 px-2 sm:px-4 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap focus:ring-0 focus:ring-offset-0 flex-shrink-0
					{activeSection === 'profile'
						? 'border-accent text-accent'
						: 'border-transparent text-muted-foreground hover:text-foreground'}"
					icon={User}
				>
					<span class="hidden sm:inline">Profile Information</span>
					<span class="sm:hidden">Profile</span>
				</Button>
				<Button
					onclick={() => switchSection('password')}
					disabled={loading}
					variant="ghost"
					size="md"
					class="py-3 sm:py-4 px-2 sm:px-4 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap focus:ring-0 focus:ring-offset-0 flex-shrink-0 ml-4 sm:ml-8
					{activeSection === 'password'
						? 'border-accent text-accent'
						: 'border-transparent text-muted-foreground hover:text-foreground'}"
					icon={Lock}
				>
					<span class="hidden sm:inline">Change Password</span>
					<span class="sm:hidden">Password</span>
				</Button>
				<Button
					onclick={() => switchSection('danger')}
					disabled={loading}
					variant="ghost"
					size="md"
					class="py-3 sm:py-4 px-2 sm:px-4 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap focus:ring-0 focus:ring-offset-0 flex-shrink-0 ml-4 sm:ml-8
					{activeSection === 'danger'
						? 'border-red-500 text-red-500'
						: 'border-transparent text-muted-foreground hover:text-foreground'}"
					icon={Trash2}
				>
					<span class="hidden sm:inline">Delete Account</span>
					<span class="sm:hidden">Delete</span>
				</Button>
			</nav>
		</div>

		<!-- Section Content -->
		<div class="p-4 sm:p-6">
			<!-- Profile Section -->
			{#if activeSection === 'profile'}
				<div class="space-y-4 sm:space-y-6">
					<div>
						<h3 class="text-base sm:text-lg font-semibold text-foreground mb-1">
							Profile Information
						</h3>
						<p class="text-sm text-muted-foreground">Update your account information</p>
					</div>

					<div class="space-y-4">
						<FormField label="Full Name" labelFor="name">
							<TextInput
								id="name"
								bind:value={profileForm.name}
								type="text"
								inputmode="text"
								enterkeyhint="next"
								placeholder="Enter your full name"
								disabled={loading}
								size="md"
							/>
						</FormField>

						<FormField
							label="Email Address"
							labelFor="email"
							hint="Changing your email will require confirmation"
						>
							<TextInput
								id="email"
								bind:value={profileForm.email}
								type="email"
								inputmode="email"
								enterkeyhint="done"
								placeholder="Enter your email address"
								disabled={loading}
								size="md"
							/>
						</FormField>
					</div>

					<div class="flex justify-end">
						<Button
							onclick={updateProfile}
							disabled={loading}
							variant="primary"
							size="md"
							{loading}
							class="w-full sm:w-auto shadow-ink pressable"
						>
							{loading ? 'Updating...' : 'Update Profile'}
						</Button>
					</div>
				</div>
			{/if}

			<!-- Password Section -->
			{#if activeSection === 'password'}
				<div class="space-y-4 sm:space-y-6">
					<div>
						<h3 class="text-base sm:text-lg font-semibold text-foreground mb-1">
							Change Password
						</h3>
						<p class="text-sm text-muted-foreground">
							Update your password to keep your account secure
						</p>
					</div>

					<div class="space-y-4">
						<FormField
							label="Current Password"
							labelFor="currentPassword"
							hint="Enter your current password to confirm your identity"
							required={true}
						>
							<div class="relative">
								<TextInput
									id="currentPassword"
									bind:value={passwordForm.currentPassword}
									type={showCurrentPassword ? 'text' : 'password'}
									autocomplete="current-password"
									enterkeyhint="next"
									placeholder="Enter current password"
									disabled={loading}
									size="md"
								/>
								<button
									type="button"
									onclick={() => (showCurrentPassword = !showCurrentPassword)}
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
							hint="Must be at least 6 characters long"
							required={true}
						>
							<div class="relative">
								<TextInput
									id="newPassword"
									bind:value={passwordForm.newPassword}
									type={showNewPassword ? 'text' : 'password'}
									autocomplete="new-password"
									enterkeyhint="next"
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
							required={true}
						>
							<div class="relative">
								<TextInput
									id="confirmPassword"
									bind:value={passwordForm.confirmPassword}
									type={showConfirmPassword ? 'text' : 'password'}
									autocomplete="new-password"
									enterkeyhint="done"
									placeholder="Confirm new password"
									disabled={loading}
									size="md"
								/>
								<button
									type="button"
									onclick={() => (showConfirmPassword = !showConfirmPassword)}
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

					<div class="flex justify-end">
						<Button
							onclick={updatePassword}
							disabled={loading}
							variant="primary"
							size="md"
							{loading}
							class="w-full sm:w-auto shadow-ink pressable"
						>
							{loading ? 'Updating...' : 'Update Password'}
						</Button>
					</div>
				</div>
			{/if}

			<!-- Danger Zone Section -->
			{#if activeSection === 'danger'}
				<div class="space-y-4 sm:space-y-6">
					<div
						class="bg-red-500/10 border border-red-500/30 rounded-xl p-4 sm:p-6 tx tx-static tx-weak"
					>
						<div class="flex items-center gap-3 mb-4 sm:mb-6">
							<Trash2 class="w-5 h-5 text-red-500" />
							<h3 class="text-base sm:text-lg font-semibold text-foreground">
								Delete Account
							</h3>
						</div>

						<div class="space-y-4">
							<div class="bg-card rounded-lg p-4 border border-red-500/30">
								<div class="flex items-start space-x-3">
									<TriangleAlert
										class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"
									/>
									<div class="text-sm">
										<p class="text-foreground font-medium mb-2">
											This action cannot be undone
										</p>
										<p class="text-muted-foreground">
											Deleting your account will permanently remove all your
											data, including:
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

						<div class="flex justify-end mt-4 sm:mt-6">
							<Button
								onclick={() => (showDeleteConfirmation = true)}
								disabled={loading}
								variant="outline"
								size="md"
								class="text-red-500 hover:text-white hover:bg-red-600 border-red-500 w-full sm:w-auto shadow-ink pressable"
								icon={Trash2}
							>
								<span class="hidden sm:inline">Delete My Account</span>
								<span class="sm:hidden">Delete Account</span>
							</Button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Delete Confirmation Modal -->
<ConfirmationModal
	isOpen={showDeleteConfirmation}
	title="Delete Account"
	confirmText="Yes, Delete My Account"
	cancelText="Cancel"
	confirmVariant="danger"
	{loading}
	loadingText="Deleting Account..."
	on:confirm={deleteAccount}
	on:cancel={() => (showDeleteConfirmation = false)}
>
	Are you absolutely sure you want to delete your account? This action cannot be undone and will
	permanently delete all your data.
</ConfirmationModal>
