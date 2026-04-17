<!-- apps/web/src/lib/components/profile/AccountTab.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { User, Lock, Trash2, TriangleAlert, CircleCheck, Eye, EyeOff } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';

	interface Props {
		user: any;
		onsuccess?: (event: { message: string }) => void;
		onerror?: (event: { message: string }) => void;
	}

	let { user, onsuccess, onerror }: Props = $props();

	// Form state
	let activeSection = $state<'profile' | 'password' | 'danger'>('profile');
	let loading = $state(false);
	let showCurrentPassword = $state(false);
	let showNewPassword = $state(false);
	let showConfirmPassword = $state(false);
	let showDeleteConfirmation = $state(false);

	// Profile form
	let profileForm = $state({
		name: user?.user_metadata?.name || user?.name || '',
		email: user?.email || ''
	});

	// Password form
	let passwordForm = $state({
		currentPassword: '',
		newPassword: '',
		confirmPassword: ''
	});

	let errors = $state<string[]>([]);
	let successMessage = $state('');

	// Public URL / username editor state
	let usernameValue = $state<string | null>(null);
	let usernameDraft = $state('');
	let derivedFallback = $state('user');
	let usernameLoading = $state(false);
	let usernameError = $state<string | null>(null);

	onMount(() => {
		void loadUsername();
	});

	async function loadUsername() {
		try {
			const res = await fetch('/api/profile/me/username');
			const payload = await res.json().catch(() => null);
			if (!res.ok) return;
			usernameValue =
				typeof payload?.data?.username === 'string' ? payload.data.username : null;
			derivedFallback =
				typeof payload?.data?.derived_fallback === 'string'
					? payload.data.derived_fallback
					: 'user';
			usernameDraft = usernameValue ?? '';
		} catch {
			// Best-effort; leave defaults.
		}
	}

	async function saveUsername() {
		const trimmed = usernameDraft.trim().toLowerCase();
		if (!trimmed || trimmed === (usernameValue ?? '')) return;
		usernameLoading = true;
		usernameError = null;
		try {
			const res = await fetch('/api/profile/me/username', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: trimmed })
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				usernameError =
					payload?.error || 'Could not update username. Please try a different one.';
				return;
			}
			usernameValue = payload?.data?.username ?? trimmed;
			usernameDraft = usernameValue ?? '';
			toastService.success('Username updated');
		} catch (e) {
			usernameError = e instanceof Error ? e.message : 'Failed to update username.';
		} finally {
			usernameLoading = false;
		}
	}

	async function clearUsername() {
		if (!usernameValue) return;
		usernameLoading = true;
		usernameError = null;
		try {
			const res = await fetch('/api/profile/me/username', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: null })
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				usernameError = payload?.error || 'Failed to clear username.';
				return;
			}
			usernameValue = null;
			usernameDraft = '';
			toastService.success('Username cleared. Public URLs now use your derived name.');
		} catch (e) {
			usernameError = e instanceof Error ? e.message : 'Failed to clear username.';
		} finally {
			usernameLoading = false;
		}
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
				toastService.success('Profile updated successfully');
				onsuccess?.({ message: result.data.message });
			} else {
				errors = [result.error || 'Failed to update profile'];
				toastService.error(result.error || 'Failed to update profile');
			}
		} catch (error) {
			console.error('Profile update error:', error);
			errors = ['An unexpected error occurred'];
			toastService.error('Failed to update profile');
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
				toastService.success('Password updated successfully');
				onsuccess?.({ message: result.data.message });
			} else {
				errors = [result.error || 'Failed to update password'];
				toastService.error(result.error || 'Failed to update password');
			}
		} catch (error) {
			console.error('Password update error:', error);
			errors = ['An unexpected error occurred'];
			toastService.error('Failed to update password');
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
				toastService.success('Account deleted successfully. Redirecting...');
				onsuccess?.({ message: 'Account deleted successfully. Redirecting...' });
				// Redirect will be handled by the parent component
				setTimeout(() => {
					window.location.href = '/';
				}, 1500);
			} else {
				errors = [result.error || 'Failed to delete account'];
				toastService.error(result.error || 'Failed to delete account');
			}
		} catch (error) {
			console.error('Account deletion error:', error);
			errors = ['An unexpected error occurred'];
			toastService.error('Failed to delete account');
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

<div class="space-y-4 sm:space-y-5">
	<!-- Tab Header -->
	<div class="flex items-start gap-3">
		<div
			class="flex items-center justify-center w-10 h-10 rounded-lg bg-accent shadow-ink flex-shrink-0"
		>
			<User class="w-5 h-5 text-accent-foreground" />
		</div>
		<div class="flex-1 min-w-0">
			<h2 class="text-lg sm:text-xl font-bold text-foreground">Account</h2>
			<p class="text-xs sm:text-sm text-muted-foreground mt-0.5">
				Manage your profile, password, and public URL.
			</p>
		</div>
	</div>

	<!-- Success Message -->
	{#if successMessage}
		<div
			class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 shadow-ink tx tx-grain tx-weak"
		>
			<div class="flex items-center gap-2">
				<CircleCheck class="w-4 h-4 text-emerald-500" />
				<p class="text-sm text-foreground">{successMessage}</p>
			</div>
		</div>
	{/if}

	<!-- Error Messages -->
	{#if errors.length > 0}
		<div
			class="bg-red-500/10 border border-red-500/30 rounded-lg p-3 shadow-ink tx tx-static tx-weak"
		>
			<div class="flex items-start gap-2">
				<TriangleAlert class="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
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
				class="flex overflow-x-auto px-3 sm:px-5 -mb-px scrollbar-hide"
				aria-label="Account sections"
			>
				<Button
					onclick={() => switchSection('profile')}
					disabled={loading}
					variant="ghost"
					size="sm"
					class="py-2.5 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap focus:ring-0 focus:ring-offset-0 flex-shrink-0
					{activeSection === 'profile'
						? 'border-accent text-accent'
						: 'border-transparent text-muted-foreground hover:text-foreground'}"
					icon={User}
				>
					<span class="hidden sm:inline">Profile</span>
					<span class="sm:hidden">Profile</span>
				</Button>
				<Button
					onclick={() => switchSection('password')}
					disabled={loading}
					variant="ghost"
					size="sm"
					class="py-2.5 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap focus:ring-0 focus:ring-offset-0 flex-shrink-0 ml-3 sm:ml-5
					{activeSection === 'password'
						? 'border-accent text-accent'
						: 'border-transparent text-muted-foreground hover:text-foreground'}"
					icon={Lock}
				>
					<span class="hidden sm:inline">Password</span>
					<span class="sm:hidden">Password</span>
				</Button>
				<Button
					onclick={() => switchSection('danger')}
					disabled={loading}
					variant="ghost"
					size="sm"
					class="py-2.5 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap focus:ring-0 focus:ring-offset-0 flex-shrink-0 ml-3 sm:ml-5
					{activeSection === 'danger'
						? 'border-red-500 text-red-500'
						: 'border-transparent text-muted-foreground hover:text-foreground'}"
					icon={Trash2}
				>
					<span class="hidden sm:inline">Delete</span>
					<span class="sm:hidden">Delete</span>
				</Button>
			</nav>
		</div>

		<!-- Section Content -->
		<div class="p-4 sm:p-5">
			<!-- Profile Section -->
			{#if activeSection === 'profile'}
				<div class="space-y-4">
					<div>
						<h3 class="text-sm sm:text-base font-semibold text-foreground mb-0.5">
							Profile Information
						</h3>
						<p class="text-xs text-muted-foreground">Update your account information</p>
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
							size="sm"
							{loading}
							class="shadow-ink pressable"
						>
							{loading ? 'Updating...' : 'Update Profile'}
						</Button>
					</div>

					<!-- Public URL / Username -->
					<div class="mt-4 border-t border-border pt-4">
						<h4 class="text-sm font-semibold text-foreground">Your public URL</h4>
						<p class="mt-0.5 text-xs text-muted-foreground leading-relaxed">
							When you publish a project doc, the link uses your username as the first
							segment:
							<span class="font-mono text-foreground"
								>build-os.com/p/{usernameValue || derivedFallback}/…</span
							>
						</p>
						<div class="mt-3 space-y-2">
							<div class="flex flex-wrap items-stretch gap-2">
								<div
									class="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 text-[12px] font-mono text-muted-foreground"
								>
									build-os.com/p/
								</div>
								<input
									type="text"
									bind:value={usernameDraft}
									placeholder={derivedFallback}
									minlength="3"
									maxlength="24"
									pattern={'^[a-z0-9]+(-[a-z0-9]+)*$'}
									class="flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
									disabled={usernameLoading}
									aria-label="Public username"
								/>
							</div>
							{#if usernameError}
								<p class="text-xs text-destructive">{usernameError}</p>
							{/if}
							<div class="flex flex-wrap items-center gap-2">
								<Button
									type="button"
									onclick={saveUsername}
									disabled={usernameLoading ||
										!usernameDraft.trim() ||
										usernameDraft.trim() === (usernameValue ?? '')}
									variant="primary"
									size="sm"
									loading={usernameLoading}
								>
									{usernameValue ? 'Update username' : 'Claim username'}
								</Button>
								{#if usernameValue}
									<button
										type="button"
										onclick={clearUsername}
										disabled={usernameLoading}
										class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
									>
										Clear (revert to derived)
									</button>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Password Section -->
			{#if activeSection === 'password'}
				<div class="space-y-4">
					<div>
						<h3 class="text-sm sm:text-base font-semibold text-foreground mb-0.5">
							Change Password
						</h3>
						<p class="text-xs text-muted-foreground">
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
							size="sm"
							{loading}
							class="shadow-ink pressable"
						>
							{loading ? 'Updating...' : 'Update Password'}
						</Button>
					</div>
				</div>
			{/if}

			<!-- Danger Zone Section -->
			{#if activeSection === 'danger'}
				<div
					class="bg-red-500/10 border border-red-500/30 rounded-lg p-4 sm:p-5 tx tx-static tx-weak"
				>
					<div class="flex items-center gap-2 mb-3">
						<Trash2 class="w-4 h-4 text-red-500" />
						<h3 class="text-sm sm:text-base font-semibold text-foreground">
							Delete Account
						</h3>
					</div>

					<div class="bg-card rounded-lg p-3 border border-red-500/30">
						<div class="flex items-start gap-2.5">
							<TriangleAlert class="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
							<div class="text-xs sm:text-sm">
								<p class="text-foreground font-medium mb-1">
									This action cannot be undone
								</p>
								<p class="text-muted-foreground">
									Deleting your account permanently removes:
								</p>
								<ul
									class="list-disc list-inside mt-1 text-muted-foreground space-y-0.5"
								>
									<li>All projects and tasks</li>
									<li>Daily briefs and project context</li>
									<li>Calendar integration settings</li>
									<li>Subscription and billing data</li>
								</ul>
							</div>
						</div>
					</div>

					<div class="flex justify-end mt-4">
						<Button
							onclick={() => (showDeleteConfirmation = true)}
							disabled={loading}
							variant="outline"
							size="sm"
							class="text-red-500 hover:text-white hover:bg-red-600 border-red-500 shadow-ink pressable"
							icon={Trash2}
						>
							Delete My Account
						</Button>
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
	onconfirm={deleteAccount}
	oncancel={() => (showDeleteConfirmation = false)}
>
	Are you absolutely sure you want to delete your account? This action cannot be undone and will
	permanently delete all your data.
</ConfirmationModal>
