<!-- apps/web/src/routes/beta/+page.svelte -->
<script lang="ts">
	import {
		Users,
		MessageCircle,
		Zap,
		CheckCircle,
		Star,
		Gift,
		Send,
		AlertTriangle,
		Loader2,
		X
	} from 'lucide-svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { validateEmailClient } from '$lib/utils/client-email-validation';
	import { requireApiData, requireApiSuccess } from '$lib/utils/api-client-helpers';

	// Form state
	let email = '';
	let fullName = '';
	let jobTitle = '';
	let companyName = '';
	let whyInterested = '';
	let productivityTools: string[] = [];
	let biggestChallenge = '';
	let referralSource = '';
	let wantsWeeklyCalls = true;
	let wantsCommunityAccess = true;
	let userTimezone = 'America/New_York';
	let honeypot = ''; // Hidden spam field

	// UI state
	let showSignupForm = false;
	let isSubmitting = false;
	let submitError = '';
	let existingSignupStatus = '';
	let emailError = '';

	// Check if user already signed up
	onMount(async () => {
		const urlParams = new URLSearchParams(window.location.search);
		const emailParam = urlParams.get('email');
		if (emailParam) {
			email = emailParam;
			await checkExistingSignup();
		}
	});

	const productivityToolOptions = [
		'Notion',
		'Obsidian',
		'Google Docs',
		'Apple Notes',
		'Todoist',
		'ClickUp',
		'Asana',
		'Monday.com',
		'Trello',
		'Linear',
		'Slack',
		'Discord',
		'Roam Research',
		'LogSeq',
		'Evernote',
		'OneNote',
		'Bear',
		'Things',
		'OmniFocus',
		'TickTick',
		'Any.do',
		'Other'
	];

	const referralSources = [
		'Twitter',
		'LinkedIn',
		'Instagram',
		'Reddit',
		'YouTube',
		'Facebook',
		'Product Hunt',
		'Friend/Colleague',
		'Google Search',
		'Blog/Article',
		'Newsletter',
		'Other'
	];

	function toggleProductivityTool(tool: string) {
		if (productivityTools.includes(tool)) {
			productivityTools = productivityTools.filter((t) => t !== tool);
		} else {
			productivityTools = [...productivityTools, tool];
		}
	}

	async function checkExistingSignup() {
		if (!email) return;

		try {
			const response = await fetch(`/api/beta/signup?email=${encodeURIComponent(email)}`);
			const result = await requireApiData<{ status?: string }>(
				response,
				'Failed to check signup status'
			);

			if (result?.status && result.status !== 'not_found') {
				existingSignupStatus = result.status;
			}
		} catch (error) {
			// Error checking signup status
		}
	}

	// Validate email on blur for instant feedback
	function validateEmail() {
		emailError = '';
		if (!email.trim()) {
			return;
		}

		const validation = validateEmailClient(email.trim());
		if (!validation.valid) {
			emailError = validation.error || 'Invalid email address';
		}
	}

	function validateForm(): string | null {
		if (honeypot.trim() !== '') return 'Spam detected';
		if (!email.trim()) return 'Email is required';
		if (!fullName.trim()) return 'Full name is required';
		if (!whyInterested.trim()) return "Please tell us why you're interested";
		if (!biggestChallenge.trim()) return 'Please describe your biggest productivity challenge';

		if (whyInterested.length < 20)
			return "Please provide more detail about why you're interested (minimum 20 characters)";
		if (biggestChallenge.length < 10) return 'Please describe your challenge in more detail';

		// Email validation (enhanced security)
		const emailValidation = validateEmailClient(email.trim());
		if (!emailValidation.valid) {
			emailError = emailValidation.error || 'Invalid email address';
			return emailValidation.error || 'Please provide a valid email address';
		}

		return null;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();

		submitError = '';

		const validationError = validateForm();
		if (validationError) {
			submitError = validationError;
			return;
		}

		isSubmitting = true;

		try {
			const response = await fetch('/api/beta/signup', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: email.trim(),
					full_name: fullName.trim(),
					job_title: jobTitle.trim() || undefined,
					company_name: companyName.trim() || undefined,
					why_interested: whyInterested.trim(),
					productivity_tools: productivityTools,
					biggest_challenge: biggestChallenge.trim(),
					referral_source: referralSource || undefined,
					wants_weekly_calls: wantsWeeklyCalls,
					wants_community_access: wantsCommunityAccess,
					user_timezone: userTimezone,
					honeypot: honeypot
				})
			});

			await requireApiSuccess(
				response,
				'There was an error with your signup. Please try again.'
			);

			// Redirect to thank you page with email parameter
			const emailParam = encodeURIComponent(email.trim());
			goto(`/beta/thank-you?email=${emailParam}`);
		} catch (error) {
			// Signup error
			submitError =
				error instanceof Error
					? error.message
					: 'There was an unexpected error. Please try again later.';
		} finally {
			isSubmitting = false;
		}
	}

	function openSignupForm() {
		showSignupForm = true;
	}

	function closeSignupForm() {
		showSignupForm = false;
	}
</script>

<SEOHead
	title="Join Beta Program - BuildOS | Early Access to AI Productivity"
	description="Join the BuildOS beta program. Get early access to AI-powered brain dump organization, weekly founder calls, and help shape the future of productivity. Limited spots available."
	canonical="https://build-os.com/beta"
	keywords="BuildOS beta, early access, beta program, AI productivity beta, brain dump app beta, founder access, productivity tool beta testing"
/>

<main class="min-h-screen bg-[var(--surface-scratch)] dither-pattern">
	<!-- Simple Hero Section -->
	<section class="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto text-center">
			<div class="flex justify-center mb-8">
				<div class="relative">
					<div
						class="utility-block w-20 h-20 rounded-sm flex items-center justify-center"
					>
						<img
							src="/brain-bolt.png"
							alt="BuildOS application icon"
							class="w-16 h-16"
							width="64"
							height="64"
						/>
					</div>
					<div class="absolute -top-2 -right-2 badge-active" aria-label="Beta program">
						BETA
					</div>
				</div>
			</div>

			<h1 class="text-4xl md:text-5xl font-bold mb-6 text-slate-900 dark:text-slate-100">
				Join the BuildOS Beta
			</h1>

			<p class="text-xl text-slate-700 dark:text-slate-300 mb-8 max-w-3xl mx-auto">
				Get early access to BuildOS and help shape how it develops. Work directly with me to
				build better AI-powered productivity.
			</p>

			{#if existingSignupStatus}
				<div
					class="clarity-zone p-6 mb-8 max-w-md mx-auto"
					role="status"
					aria-live="polite"
				>
					<h3 class="font-semibold mb-2 text-slate-900 dark:text-slate-100">
						{#if existingSignupStatus === 'pending'}
							Application Under Review
						{:else if existingSignupStatus === 'approved'}
							You're In! 🎉
						{:else if existingSignupStatus === 'waitlist'}
							You're on the Waitlist
						{/if}
					</h3>
					<p class="text-slate-700 dark:text-slate-300 text-sm">
						{#if existingSignupStatus === 'pending'}
							I'll review your application within 48 hours.
						{:else if existingSignupStatus === 'approved'}
							Check your email for beta access instructions!
						{:else if existingSignupStatus === 'waitlist'}
							You're on the waitlist. I'll reach out when spots open up.
						{/if}
					</p>
				</div>
			{:else}
				<div class="flex flex-col sm:flex-row gap-4 justify-center">
					<button
						onclick={openSignupForm}
						class="btn-tactile px-8 py-4 text-lg font-semibold"
						aria-describedby="join-beta-description"
					>
						<Users class="w-5 h-5 inline mr-2" />
						Join Beta
					</button>
					<a
						href="#what-you-get"
						class="inline-flex items-center px-8 py-4 text-lg font-semibold text-slate-700 dark:text-slate-300 border border-slate-400 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-sm transition-colors"
						aria-label="View what you get in the beta program"
					>
						Learn More
					</a>
				</div>
				<p
					id="join-beta-description"
					class="text-sm text-slate-600 dark:text-slate-400 mt-4"
				>
					Free during beta • Work directly with the founder
				</p>
			{/if}
		</div>
	</section>

	<!-- Beta Signup Form Modal -->
	{#if showSignupForm}
		<div
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="signup-modal-title"
		>
			<div
				class="card-industrial max-w-2xl w-full max-h-[90vh] overflow-y-auto relative noise-overlay"
			>
				<div class="p-8">
					<header class="flex justify-between items-center mb-6">
						<h2
							id="signup-modal-title"
							class="text-2xl font-bold text-slate-900 dark:text-slate-100"
						>
							Join BuildOS Beta
						</h2>
						<button
							onclick={closeSignupForm}
							class="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-sm transition-colors"
							aria-label="Close signup form"
						>
							<X class="w-5 h-5 text-slate-600 dark:text-slate-400" />
						</button>
					</header>

					{#if submitError}
						<div
							class="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-sm p-4"
							role="alert"
							aria-live="polite"
						>
							<div class="flex items-center">
								<AlertTriangle
									class="w-5 h-5 text-red-600 dark:text-red-400 mr-3"
									aria-hidden="true"
								/>
								<p class="text-red-700 dark:text-red-400">{submitError}</p>
							</div>
						</div>
					{/if}

					<form onsubmit={handleSubmit} class="space-y-6" novalidate>
						<!-- Honeypot field -->
						<div class="hidden">
							<label for="honeypot">Don't fill this out</label>
							<TextInput
								id="honeypot"
								type="text"
								bind:value={honeypot}
								tabindex="-1"
								autocomplete="off"
								size="md"
							/>
						</div>

						<!-- Email and Name -->
						<fieldset class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<legend class="sr-only">Personal Information</legend>
							<FormField label="Email Address" name="email" required size="md">
								<TextInput
									id="email"
									type="email"
									bind:value={email}
									placeholder="your@email.com"
									required
									aria-required="true"
									size="md"
									onblur={validateEmail}
								/>
								{#if emailError}
									<p class="mt-1 text-sm text-red-600 dark:text-red-400">
										{emailError}
									</p>
								{/if}
							</FormField>
							<FormField label="Full Name" name="fullName" required size="md">
								<TextInput
									id="fullName"
									type="text"
									bind:value={fullName}
									placeholder="Your full name"
									required
									aria-required="true"
									size="md"
								/>
							</FormField>
						</fieldset>

						<!-- Role and Company -->
						<fieldset class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<legend class="sr-only">Professional Information</legend>
							<FormField label="Current Role" name="jobTitle" size="md">
								<TextInput
									id="jobTitle"
									type="text"
									bind:value={jobTitle}
									placeholder="e.g., Startup Founder, Product Manager"
									size="md"
								/>
							</FormField>
							<FormField label="Company (Optional)" name="companyName" size="md">
								<TextInput
									id="companyName"
									type="text"
									bind:value={companyName}
									placeholder="Your company name"
									size="md"
								/>
							</FormField>
						</fieldset>

						<!-- Why Interested -->
						<FormField
							label="Why are you interested in BuildOS?"
							labelFor="whyInterested"
							required
							hint="{whyInterested.length} characters (minimum 20)"
						>
							<Textarea
								id="whyInterested"
								bind:value={whyInterested}
								rows={3}
								size="md"
								placeholder="Tell me what excites you about BuildOS and how you hope to use it..."
								required
								aria-required="true"
							/>
						</FormField>

						<!-- Current Tools -->
						<fieldset>
							<legend
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3"
							>
								What productivity tools do you currently use?
							</legend>
							<div
								class="grid grid-cols-2 md:grid-cols-3 gap-2"
								role="group"
								aria-label="Productivity tools selection"
							>
								{#each productivityToolOptions as tool}
									<Button
										type="button"
										onclick={() => toggleProductivityTool(tool)}
										variant={productivityTools.includes(tool)
											? 'primary'
											: 'outline'}
										size="sm"
										class={productivityTools.includes(tool)
											? 'bg-primary-100 border-primary-300 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:border-primary-600 dark:text-primary-300 dark:hover:bg-primary-900/40'
											: ''}
										aria-pressed={productivityTools.includes(tool)}
										aria-label="Toggle {tool} selection"
									>
										{tool}
									</Button>
								{/each}
							</div>
						</fieldset>

						<!-- Biggest Challenge -->
						<FormField
							label="What's your biggest productivity challenge?"
							labelFor="biggestChallenge"
							required
						>
							<Textarea
								id="biggestChallenge"
								bind:value={biggestChallenge}
								rows={3}
								size="md"
								placeholder="Describe what frustrates you most about staying organized and productive..."
								required
								aria-required="true"
							/>
						</FormField>

						<!-- Referral Source -->
						<FormField
							label="How did you hear about us?"
							labelFor="referralSource"
							size="md"
						>
							<Select id="referralSource" bind:value={referralSource} size="md">
								<option value="">Select an option</option>
								{#each referralSources as source}
									<option value={source}>{source}</option>
								{/each}
							</Select>
						</FormField>

						<!-- Preferences -->
						<fieldset class="space-y-4">
							<legend class="text-sm font-medium text-gray-700 dark:text-gray-300"
								>Preferences</legend
							>
							<div class="flex items-center">
								<input
									id="weeklyCalls"
									type="checkbox"
									bind:checked={wantsWeeklyCalls}
									class="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
								/>
								<label
									for="weeklyCalls"
									class="ml-3 text-sm text-gray-700 dark:text-gray-300"
								>
									I'm interested in joining calls with the founder
								</label>
							</div>
							<div class="flex items-center">
								<input
									id="communityAccess"
									type="checkbox"
									bind:checked={wantsCommunityAccess}
									class="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
								/>
								<label
									for="communityAccess"
									class="ml-3 text-sm text-gray-700 dark:text-gray-300"
								>
									I'd like to connect with other beta users
								</label>
							</div>
						</fieldset>

						<!-- Submit Button -->
						<div class="flex gap-4" role="group" aria-label="Form actions">
							<button
								type="button"
								onclick={closeSignupForm}
								class="flex-1 px-6 py-3 text-slate-700 dark:text-slate-300 border border-slate-400 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-sm transition-colors font-semibold"
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={isSubmitting}
								class="flex-1 btn-tactile px-6 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
								aria-describedby="submit-help"
							>
								{#if isSubmitting}
									<Loader2
										class="w-5 h-5 inline mr-2 animate-spin"
										aria-hidden="true"
									/>
									Submitting...
								{:else}
									<Send class="w-5 h-5 inline mr-2" aria-hidden="true" />
									Join Beta Program
								{/if}
							</button>
						</div>
						<p
							id="submit-help"
							class="text-xs text-slate-600 dark:text-slate-400 text-center"
						>
							By submitting, you agree to our beta program terms.
						</p>
					</form>
				</div>
			</div>
		</div>
	{/if}

	<!-- What You Get -->
	<section
		id="what-you-get"
		class="py-16 bg-[var(--surface-panel)] dark:bg-slate-900"
		aria-labelledby="benefits-heading"
	>
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
			<header class="text-center mb-12">
				<h2
					id="benefits-heading"
					class="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4"
				>
					What You Get
				</h2>
				<p class="text-lg text-slate-700 dark:text-slate-300">
					Beta members get early access and direct collaboration with the founder.
				</p>
			</header>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div class="card-industrial p-6 relative dither-soft">
					<div class="flex items-start space-x-4">
						<div
							class="utility-block w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0"
						>
							<CheckCircle class="w-5 h-5 text-gray-700 dark:text-gray-200" />
						</div>
						<div>
							<h3 class="font-semibold text-slate-900 dark:text-slate-100 mb-2">
								Early Access
							</h3>
							<p class="text-slate-700 dark:text-slate-300 text-sm">
								Get BuildOS before public launch and help shape how it develops.
							</p>
						</div>
					</div>
				</div>

				<div class="card-industrial p-6 relative dither-soft">
					<div class="flex items-start space-x-4">
						<div
							class="utility-block w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0"
						>
							<MessageCircle class="w-5 h-5 text-gray-700 dark:text-gray-200" />
						</div>
						<div>
							<h3 class="font-semibold text-slate-900 dark:text-slate-100 mb-2">
								Direct Collaboration
							</h3>
							<p class="text-slate-700 dark:text-slate-300 text-sm">
								Work directly with me. If you have product-minded feedback, it will
								be directly heard.
							</p>
						</div>
					</div>
				</div>

				<div class="card-industrial p-6 relative dither-soft">
					<div class="flex items-start space-x-4">
						<div
							class="utility-block w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0"
						>
							<Star class="w-5 h-5 text-gray-700 dark:text-gray-200" />
						</div>
						<div>
							<h3 class="font-semibold text-slate-900 dark:text-slate-100 mb-2">
								Lock-in Special Pricing
							</h3>
							<p class="text-slate-700 dark:text-slate-300 text-sm">
								Beta members get to lock in special pricing when BuildOS launches.
							</p>
						</div>
					</div>
				</div>

				<div class="card-industrial p-6 relative dither-soft">
					<div class="flex items-start space-x-4">
						<div
							class="utility-block w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0"
						>
							<Zap class="w-5 h-5 text-gray-700 dark:text-gray-200" />
						</div>
						<div>
							<h3 class="font-semibold text-slate-900 dark:text-slate-100 mb-2">
								Priority Feedback
							</h3>
							<p class="text-slate-700 dark:text-slate-300 text-sm">
								Your requests and feedback go to the top of the development queue.
							</p>
						</div>
					</div>
				</div>

				<div class="card-industrial p-6 relative dither-soft">
					<div class="flex items-start space-x-4">
						<div
							class="utility-block w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0"
						>
							<Gift class="w-5 h-5 text-gray-700 dark:text-gray-200" />
						</div>
						<div>
							<h3 class="font-semibold text-slate-900 dark:text-slate-100 mb-2">
								Free Premium Access
							</h3>
							<p class="text-slate-700 dark:text-slate-300 text-sm">
								Use all BuildOS features completely free during the beta period.
							</p>
						</div>
					</div>
				</div>

				<div class="card-industrial p-6 relative dither-soft">
					<div class="flex items-start space-x-4">
						<div
							class="utility-block w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0"
						>
							<Users class="w-5 h-5 text-gray-700 dark:text-gray-200" />
						</div>
						<div>
							<h3 class="font-semibold text-slate-900 dark:text-slate-100 mb-2">
								Connect with Others
							</h3>
							<p class="text-slate-700 dark:text-slate-300 text-sm">
								Chance to connect with fellow productivity enthusiasts in the beta
								community.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Simple CTA -->
	<section class="py-16">
		<div class="max-w-3xl mx-auto text-center px-4 sm:px-6 lg:px-8">
			<h2 class="text-3xl font-bold mb-4 text-slate-900 dark:text-slate-100">
				Ready to Help Build BuildOS?
			</h2>
			<p class="text-lg text-slate-700 dark:text-slate-300 mb-8">
				Join the beta program and work with me to create better AI-powered productivity.
			</p>

			{#if !existingSignupStatus}
				<div class="flex flex-col sm:flex-row gap-4 justify-center">
					<button
						onclick={openSignupForm}
						class="btn-tactile px-8 py-4 text-lg font-semibold"
						aria-label="Join the BuildOS beta program"
					>
						<Users class="w-5 h-5 inline mr-2" />
						Join Beta Program
					</button>
					<a
						href="/contact"
						class="inline-flex items-center px-8 py-4 text-lg font-semibold text-slate-700 dark:text-slate-300 border border-slate-400 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-sm transition-colors"
						aria-label="Contact with questions about the beta program"
					>
						<MessageCircle class="w-5 h-5 mr-3" aria-hidden="true" />
						Questions?
					</a>
				</div>
			{/if}

			<p class="text-sm text-slate-600 dark:text-slate-400 mt-6">
				Beta spots are limited to maintain quality feedback.
			</p>
		</div>
	</section>
</main>
