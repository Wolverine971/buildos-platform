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
		LoaderCircle,
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
	import { PUBLIC_RECAPTCHA_SITE_KEY } from '$env/static/public';

	// TypeScript types for reCAPTCHA
	declare global {
		interface Window {
			grecaptcha: {
				render: (
					container: string | HTMLElement,
					options: {
						sitekey: string;
						callback: (token: string) => void;
						'expired-callback'?: () => void;
						'error-callback'?: () => void;
						theme?: 'light' | 'dark';
					}
				) => number;
				reset: (widgetId?: number) => void;
				getResponse: (widgetId?: number) => string;
				ready: (callback: () => void) => void;
			};
			onRecaptchaLoad?: () => void;
		}
	}

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

	// reCAPTCHA state
	let recaptchaToken = '';
	let recaptchaWidgetId: number | null = null;
	let recaptchaLoaded = false;
	let recaptchaError = '';

	// Check if reCAPTCHA is required (only when site key is configured)
	const recaptchaRequired = !!PUBLIC_RECAPTCHA_SITE_KEY;

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

		// reCAPTCHA validation (only required if configured)
		if (recaptchaRequired && PUBLIC_RECAPTCHA_SITE_KEY && !recaptchaToken) {
			return 'Please complete the reCAPTCHA verification';
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
					honeypot: honeypot,
					recaptcha_token: recaptchaToken || undefined
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
			// Signup error - reset reCAPTCHA so user can try again
			resetRecaptcha();
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
		// Initialize reCAPTCHA after DOM updates
		setTimeout(initRecaptcha, 0);
	}

	function closeSignupForm() {
		showSignupForm = false;
		// Reset reCAPTCHA state when closing
		resetRecaptcha();
	}

	// reCAPTCHA functions
	function loadRecaptchaScript(): Promise<void> {
		return new Promise((resolve, reject) => {
			// If already loaded, resolve immediately
			if (window.grecaptcha?.render) {
				resolve();
				return;
			}

			// Check if script is already being loaded
			const existingScript = document.querySelector(
				'script[src*="recaptcha/api.js"]'
			) as HTMLScriptElement;
			if (existingScript) {
				// Wait for it to load
				existingScript.onload = () => resolve();
				existingScript.onerror = () => reject(new Error('Failed to load reCAPTCHA'));
				return;
			}

			// Create and load the script
			const script = document.createElement('script');
			script.src =
				'https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoad&render=explicit';
			script.async = true;
			script.defer = true;

			window.onRecaptchaLoad = () => {
				recaptchaLoaded = true;
				resolve();
			};

			script.onerror = () => {
				recaptchaError = 'Failed to load reCAPTCHA. Please refresh the page.';
				reject(new Error('Failed to load reCAPTCHA'));
			};

			document.head.appendChild(script);
		});
	}

	function renderRecaptcha() {
		const container = document.getElementById('recaptcha-container');
		if (!container || !window.grecaptcha?.render) return;

		// Don't render if already rendered
		if (recaptchaWidgetId !== null) return;

		try {
			recaptchaWidgetId = window.grecaptcha.render(container, {
				sitekey: PUBLIC_RECAPTCHA_SITE_KEY,
				callback: onRecaptchaSuccess,
				'expired-callback': onRecaptchaExpired,
				'error-callback': onRecaptchaError,
				theme: 'light' // Could be dynamic based on dark mode
			});
		} catch (error) {
			console.error('Failed to render reCAPTCHA:', error);
			recaptchaError = 'Failed to display reCAPTCHA. Please refresh the page.';
		}
	}

	function onRecaptchaSuccess(token: string) {
		recaptchaToken = token;
		recaptchaError = '';
	}

	function onRecaptchaExpired() {
		recaptchaToken = '';
		recaptchaError = 'reCAPTCHA expired. Please verify again.';
	}

	function onRecaptchaError() {
		recaptchaToken = '';
		recaptchaError = 'reCAPTCHA error. Please try again.';
	}

	function resetRecaptcha() {
		recaptchaToken = '';
		recaptchaError = '';
		if (recaptchaWidgetId !== null && window.grecaptcha?.reset) {
			try {
				window.grecaptcha.reset(recaptchaWidgetId);
			} catch (error) {
				console.error('Failed to reset reCAPTCHA:', error);
			}
		}
	}

	// Initialize reCAPTCHA when form opens
	async function initRecaptcha() {
		if (!recaptchaRequired || !PUBLIC_RECAPTCHA_SITE_KEY) return;

		try {
			await loadRecaptchaScript();
			// Small delay to ensure DOM is ready
			setTimeout(renderRecaptcha, 100);
		} catch (error) {
			console.error('Failed to initialize reCAPTCHA:', error);
		}
	}
</script>

<SEOHead
	title="Join Beta Program - BuildOS | Early Access to AI Productivity"
	description="Join the BuildOS beta program. Get early access to AI-powered brain dump organization, weekly founder calls, and help shape the future of productivity. Limited spots available."
	canonical="https://build-os.com/beta"
	keywords="BuildOS beta, early access, beta program, AI productivity beta, brain dump app beta, founder access, productivity tool beta testing"
/>

<main class="min-h-screen bg-background">
	<!-- Simple Hero Section -->
	<section class="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto text-center">
			<div class="flex justify-center mb-8">
				<div class="relative">
					<div
						class="w-20 h-20 rounded-lg flex items-center justify-center border border-border bg-card shadow-ink tx tx-bloom tx-weak"
					>
						<img
							src="/brain-bolt.png"
							alt="BuildOS application icon"
							class="w-16 h-16"
							width="64"
							height="64"
						/>
					</div>
					<div
						class="absolute -top-2 -right-2 rounded-full bg-accent text-accent-foreground text-xs font-bold px-2 py-1"
						aria-label="Beta program"
					>
						BETA
					</div>
				</div>
			</div>

			<h1 class="text-4xl md:text-5xl font-bold mb-6 text-foreground">
				Join the BuildOS Beta
			</h1>

			<p class="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
				Get early access to BuildOS and help shape how it develops. Work directly with me to
				build better AI-powered productivity.
			</p>

			{#if existingSignupStatus}
				<div
					class="rounded-lg border border-border bg-card p-6 mb-8 max-w-md mx-auto shadow-ink tx tx-grain tx-weak"
					role="status"
					aria-live="polite"
				>
					<h3 class="font-semibold mb-2 text-foreground">
						{#if existingSignupStatus === 'pending'}
							Application Under Review
						{:else if existingSignupStatus === 'approved'}
							You're In! 🎉
						{:else if existingSignupStatus === 'waitlist'}
							You're on the Waitlist
						{/if}
					</h3>
					<p class="text-muted-foreground text-sm">
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
						class="px-8 py-4 text-lg font-semibold rounded-lg bg-accent text-accent-foreground shadow-ink hover:opacity-90 transition-opacity pressable"
						aria-describedby="join-beta-description"
					>
						<Users class="w-5 h-5 inline mr-2" />
						Join Beta
					</button>
					<a
						href="#what-you-get"
						class="inline-flex items-center px-8 py-4 text-lg font-semibold text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
						aria-label="View what you get in the beta program"
					>
						Learn More
					</a>
				</div>
				<p id="join-beta-description" class="text-sm text-muted-foreground mt-4">
					Free during beta • Work directly with the founder
				</p>
			{/if}
		</div>
	</section>

	<!-- Beta Signup Form Modal -->
	{#if showSignupForm}
		<div
			class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="signup-modal-title"
		>
			<div
				class="rounded-lg border border-border bg-card max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-ink-strong tx tx-grain tx-weak"
			>
				<div class="p-8">
					<header class="flex justify-between items-center mb-6">
						<h2 id="signup-modal-title" class="text-2xl font-bold text-foreground">
							Join BuildOS Beta
						</h2>
						<button
							onclick={closeSignupForm}
							class="p-2 hover:bg-muted rounded-lg transition-colors"
							aria-label="Close signup form"
						>
							<X class="w-5 h-5 text-muted-foreground" />
						</button>
					</header>

					{#if submitError}
						<div
							class="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4"
							role="alert"
							aria-live="polite"
						>
							<div class="flex items-center">
								<AlertTriangle
									class="w-5 h-5 text-destructive mr-3"
									aria-hidden="true"
								/>
								<p class="text-destructive">{submitError}</p>
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
									<p class="mt-1 text-sm text-destructive">
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
							<legend class="block text-sm font-medium text-foreground mb-3">
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
											? 'bg-accent/10 border-accent text-accent'
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
							<legend class="text-sm font-medium text-foreground">Preferences</legend>
							<div class="flex items-center">
								<input
									id="weeklyCalls"
									type="checkbox"
									bind:checked={wantsWeeklyCalls}
									class="w-4 h-4 text-accent border-border rounded focus:ring-ring"
								/>
								<label for="weeklyCalls" class="ml-3 text-sm text-muted-foreground">
									I'm interested in joining calls with the founder
								</label>
							</div>
							<div class="flex items-center">
								<input
									id="communityAccess"
									type="checkbox"
									bind:checked={wantsCommunityAccess}
									class="w-4 h-4 text-accent border-border rounded focus:ring-ring"
								/>
								<label
									for="communityAccess"
									class="ml-3 text-sm text-muted-foreground"
								>
									I'd like to connect with other beta users
								</label>
							</div>
						</fieldset>

						<!-- reCAPTCHA -->
						{#if recaptchaRequired && PUBLIC_RECAPTCHA_SITE_KEY}
							<div class="space-y-2">
								<div
									id="recaptcha-container"
									class="flex justify-center"
									aria-label="reCAPTCHA verification"
								></div>
								{#if recaptchaError}
									<p class="text-sm text-destructive text-center" role="alert">
										{recaptchaError}
									</p>
								{/if}
							</div>
						{/if}

						<!-- Submit Button -->
						<div class="flex gap-4" role="group" aria-label="Form actions">
							<button
								type="button"
								onclick={closeSignupForm}
								class="flex-1 px-6 py-3 text-foreground border border-border hover:bg-muted rounded-lg transition-colors font-semibold"
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={isSubmitting}
								class="flex-1 px-6 py-3 font-semibold rounded-lg bg-accent text-accent-foreground shadow-ink hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed pressable"
								aria-describedby="submit-help"
							>
								{#if isSubmitting}
									<LoaderCircle
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
						<p id="submit-help" class="text-xs text-muted-foreground text-center">
							By submitting, you agree to our beta program terms.
						</p>
					</form>
				</div>
			</div>
		</div>
	{/if}

	<!-- What You Get -->
	<section id="what-you-get" class="py-16 bg-muted" aria-labelledby="benefits-heading">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
			<header class="text-center mb-12">
				<h2 id="benefits-heading" class="text-3xl font-bold text-foreground mb-4">
					What You Get
				</h2>
				<p class="text-lg text-muted-foreground">
					Beta members get early access and direct collaboration with the founder.
				</p>
			</header>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div
					class="rounded-lg border border-border bg-card p-6 shadow-ink tx tx-grain tx-weak"
				>
					<div class="flex items-start space-x-4">
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border border-border bg-muted"
						>
							<CheckCircle class="w-5 h-5 text-foreground" />
						</div>
						<div>
							<h3 class="font-semibold text-foreground mb-2">Early Access</h3>
							<p class="text-muted-foreground text-sm">
								Get BuildOS before public launch and help shape how it develops.
							</p>
						</div>
					</div>
				</div>

				<div
					class="rounded-lg border border-border bg-card p-6 shadow-ink tx tx-grain tx-weak"
				>
					<div class="flex items-start space-x-4">
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border border-border bg-muted"
						>
							<MessageCircle class="w-5 h-5 text-foreground" />
						</div>
						<div>
							<h3 class="font-semibold text-foreground mb-2">Direct Collaboration</h3>
							<p class="text-muted-foreground text-sm">
								Work directly with me. If you have product-minded feedback, it will
								be directly heard.
							</p>
						</div>
					</div>
				</div>

				<div
					class="rounded-lg border border-border bg-card p-6 shadow-ink tx tx-grain tx-weak"
				>
					<div class="flex items-start space-x-4">
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border border-border bg-muted"
						>
							<Star class="w-5 h-5 text-foreground" />
						</div>
						<div>
							<h3 class="font-semibold text-foreground mb-2">
								Lock-in Special Pricing
							</h3>
							<p class="text-muted-foreground text-sm">
								Beta members get to lock in special pricing when BuildOS launches.
							</p>
						</div>
					</div>
				</div>

				<div
					class="rounded-lg border border-border bg-card p-6 shadow-ink tx tx-grain tx-weak"
				>
					<div class="flex items-start space-x-4">
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border border-border bg-muted"
						>
							<Zap class="w-5 h-5 text-foreground" />
						</div>
						<div>
							<h3 class="font-semibold text-foreground mb-2">Priority Feedback</h3>
							<p class="text-muted-foreground text-sm">
								Your requests and feedback go to the top of the development queue.
							</p>
						</div>
					</div>
				</div>

				<div
					class="rounded-lg border border-border bg-card p-6 shadow-ink tx tx-grain tx-weak"
				>
					<div class="flex items-start space-x-4">
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border border-border bg-muted"
						>
							<Gift class="w-5 h-5 text-foreground" />
						</div>
						<div>
							<h3 class="font-semibold text-foreground mb-2">Free Premium Access</h3>
							<p class="text-muted-foreground text-sm">
								Use all BuildOS features completely free during the beta period.
							</p>
						</div>
					</div>
				</div>

				<div
					class="rounded-lg border border-border bg-card p-6 shadow-ink tx tx-grain tx-weak"
				>
					<div class="flex items-start space-x-4">
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border border-border bg-muted"
						>
							<Users class="w-5 h-5 text-foreground" />
						</div>
						<div>
							<h3 class="font-semibold text-foreground mb-2">Connect with Others</h3>
							<p class="text-muted-foreground text-sm">
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
			<h2 class="text-3xl font-bold mb-4 text-foreground">Ready to Help Build BuildOS?</h2>
			<p class="text-lg text-muted-foreground mb-8">
				Join the beta program and work with me to create better AI-powered productivity.
			</p>

			{#if !existingSignupStatus}
				<div class="flex flex-col sm:flex-row gap-4 justify-center">
					<button
						onclick={openSignupForm}
						class="px-8 py-4 text-lg font-semibold rounded-lg bg-accent text-accent-foreground shadow-ink hover:opacity-90 transition-opacity pressable"
						aria-label="Join the BuildOS beta program"
					>
						<Users class="w-5 h-5 inline mr-2" />
						Join Beta Program
					</button>
					<a
						href="/contact"
						class="inline-flex items-center px-8 py-4 text-lg font-semibold text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
						aria-label="Contact with questions about the beta program"
					>
						<MessageCircle class="w-5 h-5 mr-3" aria-hidden="true" />
						Questions?
					</a>
				</div>
			{/if}

			<p class="text-sm text-muted-foreground mt-6">
				Beta spots are limited to maintain quality feedback.
			</p>
		</div>
	</section>
</main>
