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
		X,
		Sparkles,
		Clock3
	} from 'lucide-svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
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
	let applicationNote = '';
	let productivityTools: string[] = [];
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
		'Asana',
		'ClickUp',
		'Linear',
		'Slack',
		'Discord',
		'Trello',
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
		} catch (_error) {
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

	function inferNameFromEmail(inputEmail: string): string {
		const localPart = inputEmail.split('@')[0] ?? '';
		const cleaned = localPart
			.replace(/\+.*$/, '')
			.replace(/[._-]+/g, ' ')
			.replace(/\d+/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

		if (cleaned.length < 2) {
			return 'BuildOS Beta User';
		}

		return cleaned
			.split(' ')
			.slice(0, 3)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function validateForm(): string | null {
		if (honeypot.trim() !== '') return 'Spam detected';
		if (!email.trim()) return 'Email is required';

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
					full_name: fullName.trim() || inferNameFromEmail(email.trim()),
					job_title: jobTitle.trim() || undefined,
					company_name: companyName.trim() || undefined,
					why_interested: applicationNote.trim() || undefined,
					productivity_tools: productivityTools,
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
			submitError =
				error instanceof Error
					? error.message
					: 'There was an unexpected error. Please try again later.';
		} finally {
			isSubmitting = false;
		}
	}

	function openSignupForm() {
		submitError = '';
		showSignupForm = true;
	}

	function closeSignupForm() {
		submitError = '';
		showSignupForm = false;
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
	<section class="pt-20 pb-12 px-4 sm:px-6 lg:px-8">
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
						class="px-8 py-4 text-lg font-semibold rounded-lg bg-accent text-accent-foreground shadow-ink hover:opacity-90 transition-opacity pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						aria-describedby="join-beta-description"
					>
						<Users class="w-5 h-5 inline mr-2" aria-hidden="true" />
						Join Beta
					</button>
					<a
						href="#what-you-get"
						class="inline-flex items-center px-8 py-4 text-lg font-semibold text-foreground border border-border hover:bg-muted rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
	<Modal
		bind:isOpen={showSignupForm}
		onClose={closeSignupForm}
		size="xl"
		showCloseButton={false}
		ariaLabel="Join BuildOS beta"
		customClasses="max-w-[960px] border-border/80 bg-card shadow-[0_30px_90px_rgba(15,23,42,0.24)]"
	>
		{#snippet children()}
			<div class="grid overflow-hidden md:grid-cols-[0.95fr_1.05fr]">
				<section
					class="relative overflow-hidden border-b border-border bg-muted/55 p-6 sm:p-8 md:border-b-0 md:border-r"
				>
					<div
						class="absolute -left-14 top-0 h-40 w-40 rounded-full bg-accent/20 blur-3xl"
					></div>
					<div
						class="absolute -bottom-12 right-0 h-32 w-32 rounded-full bg-foreground/5 blur-2xl"
					></div>

					<div class="relative flex h-full flex-col">
						<div class="flex items-start justify-between gap-4">
							<div
								class="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
							>
								<Sparkles class="h-3.5 w-3.5 text-accent" aria-hidden="true" />
								Fast beta signup
							</div>
							<button
								type="button"
								onclick={closeSignupForm}
								class="rounded-full border border-border/70 bg-background/80 p-2 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
								aria-label="Close signup form"
							>
								<X class="h-4 w-4" aria-hidden="true" />
							</button>
						</div>

						<div class="mt-8 space-y-4">
							<h2
								class="max-w-sm text-3xl font-semibold tracking-tight text-foreground"
							>
								Get early access without the friction.
							</h2>
							<p class="max-w-md text-base leading-7 text-muted-foreground">
								Start with your email. Everything else is optional, and one short
								note is plenty if you want to give a little context.
							</p>
						</div>

						<div class="mt-8 grid gap-3">
							<div
								class="rounded-2xl border border-border/80 bg-background/80 p-4 shadow-sm"
							>
								<div class="flex items-start gap-3">
									<div
										class="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-accent/10"
									>
										<Clock3 class="h-4 w-4 text-accent" aria-hidden="true" />
									</div>
									<div>
										<p class="text-sm font-semibold text-foreground">
											Quick review
										</p>
										<p class="mt-1 text-sm text-muted-foreground">
											I read every signup personally and keep the follow-up
											simple.
										</p>
									</div>
								</div>
							</div>

							<div
								class="rounded-2xl border border-border/80 bg-background/80 p-4 shadow-sm"
							>
								<div class="flex items-start gap-3">
									<div
										class="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-accent/10"
									>
										<MessageCircle
											class="h-4 w-4 text-accent"
											aria-hidden="true"
										/>
									</div>
									<div>
										<p class="text-sm font-semibold text-foreground">
											Direct line
										</p>
										<p class="mt-1 text-sm text-muted-foreground">
											If you're thoughtful with feedback, it goes straight
											into the product.
										</p>
									</div>
								</div>
							</div>

							<div
								class="rounded-2xl border border-border/80 bg-background/80 p-4 shadow-sm"
							>
								<div class="flex items-start gap-3">
									<div
										class="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-accent/10"
									>
										<Gift class="h-4 w-4 text-accent" aria-hidden="true" />
									</div>
									<div>
										<p class="text-sm font-semibold text-foreground">
											Free in beta
										</p>
										<p class="mt-1 text-sm text-muted-foreground">
											Join early, shape the product, and lock in beta pricing
											later.
										</p>
									</div>
								</div>
							</div>
						</div>

						<p class="mt-8 text-sm text-muted-foreground">
							You do not need a long application. An email is enough to start.
						</p>
					</div>
				</section>

				<section class="bg-background p-6 sm:p-8">
					{#if submitError}
						<div
							class="mb-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-4"
							role="alert"
							aria-live="polite"
						>
							<div class="flex items-start gap-3">
								<AlertTriangle
									class="mt-0.5 h-5 w-5 text-destructive"
									aria-hidden="true"
								/>
								<p class="text-sm text-destructive">{submitError}</p>
							</div>
						</div>
					{/if}

					<form onsubmit={handleSubmit} class="space-y-6" novalidate>
						<div class="hidden">
							<label for="honeypot">Don't fill this out</label>
							<TextInput
								id="honeypot"
								type="text"
								bind:value={honeypot}
								tabindex={-1}
								autocomplete="off"
								size="md"
							/>
						</div>

						<FormField
							label="Work email"
							labelFor="email"
							required
							uppercase={false}
							error={emailError}
						>
							<TextInput
								id="email"
								type="email"
								bind:value={email}
								placeholder="you@company.com"
								required
								aria-required="true"
								autocomplete="email"
								autofocus
								size="md"
								error={!!emailError}
								onblur={validateEmail}
							/>
						</FormField>

						<fieldset class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<legend class="sr-only">Profile details</legend>
							<FormField
								label="Name"
								labelFor="fullName"
								hint="Optional. If you skip it, I’ll infer one from your email."
								uppercase={false}
								showOptional={false}
							>
								<TextInput
									id="fullName"
									type="text"
									bind:value={fullName}
									placeholder="Your name"
									autocomplete="name"
									size="md"
								/>
							</FormField>
							<FormField
								label="Role"
								labelFor="jobTitle"
								uppercase={false}
								showOptional={false}
							>
								<TextInput
									id="jobTitle"
									type="text"
									bind:value={jobTitle}
									placeholder="Founder, operator, student..."
									autocomplete="organization-title"
									size="md"
								/>
							</FormField>
						</fieldset>

						<fieldset class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<legend class="sr-only">Company details</legend>
							<FormField
								label="Company"
								labelFor="companyName"
								uppercase={false}
								showOptional={false}
							>
								<TextInput
									id="companyName"
									type="text"
									bind:value={companyName}
									placeholder="Company or team"
									autocomplete="organization"
									size="md"
								/>
							</FormField>
							<FormField
								label="How did you hear about BuildOS?"
								labelFor="referralSource"
								uppercase={false}
								showOptional={false}
							>
								<Select id="referralSource" bind:value={referralSource} size="md">
									<option value="">Select an option</option>
									{#each referralSources as source}
										<option value={source}>{source}</option>
									{/each}
								</Select>
							</FormField>
						</fieldset>

						<FormField
							label="What are you hoping BuildOS helps with?"
							labelFor="applicationNote"
							hint="Optional. A sentence or two is enough."
							uppercase={false}
							showOptional={false}
						>
							<Textarea
								id="applicationNote"
								bind:value={applicationNote}
								rows={4}
								size="md"
								autoResize
								placeholder="Examples: turning messy notes into projects, staying organized across work and life, or replacing a scattered tool stack."
							/>
						</FormField>

						<fieldset class="space-y-3">
							<legend class="flex items-center justify-between gap-3">
								<span class="text-sm font-semibold text-foreground">
									Current tools
								</span>
								<span class="text-xs font-normal text-muted-foreground">
									Optional
								</span>
							</legend>
							<div
								class="flex flex-wrap gap-2"
								role="group"
								aria-label="Current tools"
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
											? 'border-accent bg-accent text-accent-foreground shadow-ink'
											: 'rounded-full border-border/80 bg-background/80 text-muted-foreground hover:text-foreground'}
										aria-pressed={productivityTools.includes(tool)}
									>
										{tool}
									</Button>
								{/each}
							</div>
						</fieldset>

						<fieldset class="space-y-3">
							<legend class="text-sm font-semibold text-foreground">
								Keep me in the loop
							</legend>

							<label
								for="weeklyCalls"
								class="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-muted/35 p-4 transition-colors hover:border-accent/40 hover:bg-muted/60"
							>
								<input
									id="weeklyCalls"
									type="checkbox"
									bind:checked={wantsWeeklyCalls}
									class="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-ring"
								/>
								<span>
									<span class="block text-sm font-medium text-foreground">
										Founder calls
									</span>
									<span class="mt-1 block text-sm text-muted-foreground">
										I'm open to small-group calls and direct feedback sessions.
									</span>
								</span>
							</label>

							<label
								for="communityAccess"
								class="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-muted/35 p-4 transition-colors hover:border-accent/40 hover:bg-muted/60"
							>
								<input
									id="communityAccess"
									type="checkbox"
									bind:checked={wantsCommunityAccess}
									class="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-ring"
								/>
								<span>
									<span class="block text-sm font-medium text-foreground">
										Beta community
									</span>
									<span class="mt-1 block text-sm text-muted-foreground">
										Send me invites if you open a space for beta users to
										compare notes.
									</span>
								</span>
							</label>
						</fieldset>

						<div class="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
							<Button
								type="button"
								variant="outline"
								size="md"
								class="justify-center sm:w-auto"
								onclick={closeSignupForm}
							>
								Not now
							</Button>
							<Button
								type="submit"
								variant="primary"
								size="md"
								class="w-full justify-center sm:flex-1"
								loading={isSubmitting}
								icon={Send}
							>
								{isSubmitting ? 'Joining beta...' : 'Join the beta'}
							</Button>
						</div>

						<p class="text-xs leading-5 text-muted-foreground">
							Free during beta. Once you’re in, I’ll follow up by email with next
							steps.
						</p>
					</form>
				</section>
			</div>
		{/snippet}
	</Modal>

	<!-- What You Get -->
	<section id="what-you-get" class="py-12 sm:py-14 bg-muted" aria-labelledby="benefits-heading">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
			<header class="text-center mb-10">
				<h2 id="benefits-heading" class="text-3xl font-bold text-foreground mb-4">
					What You Get
				</h2>
				<p class="text-lg text-muted-foreground">
					Beta members get early access and direct collaboration with the founder.
				</p>
			</header>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
				<div
					class="rounded-lg border border-border bg-card p-5 sm:p-6 shadow-ink tx tx-grain tx-weak"
				>
					<div class="flex items-start space-x-4">
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border border-border bg-muted"
						>
							<CheckCircle class="w-5 h-5 text-foreground" aria-hidden="true" />
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
							<MessageCircle class="w-5 h-5 text-foreground" aria-hidden="true" />
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
							<Star class="w-5 h-5 text-foreground" aria-hidden="true" />
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
							<Zap class="w-5 h-5 text-foreground" aria-hidden="true" />
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
							<Gift class="w-5 h-5 text-foreground" aria-hidden="true" />
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
							<Users class="w-5 h-5 text-foreground" aria-hidden="true" />
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
	<section class="py-12 sm:py-14">
		<div class="max-w-3xl mx-auto text-center px-4 sm:px-6 lg:px-8">
			<h2 class="text-3xl font-bold mb-4 text-foreground">Ready to Help Build BuildOS?</h2>
			<p class="text-lg text-muted-foreground mb-8">
				Join the beta program and work with me to create better AI-powered productivity.
			</p>

			{#if !existingSignupStatus}
				<div class="flex flex-col sm:flex-row gap-4 justify-center">
					<button
						onclick={openSignupForm}
						class="px-8 py-4 text-lg font-semibold rounded-lg bg-accent text-accent-foreground shadow-ink hover:opacity-90 transition-opacity pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						aria-label="Join the BuildOS beta program"
					>
						<Users class="w-5 h-5 inline mr-2" aria-hidden="true" />
						Join Beta Program
					</button>
					<a
						href="/contact"
						class="inline-flex items-center px-8 py-4 text-lg font-semibold text-foreground border border-border hover:bg-muted rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
