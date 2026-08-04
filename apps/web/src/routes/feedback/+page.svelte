<!-- apps/web/src/routes/feedback/+page.svelte -->
<script lang="ts">
	import {
		AlertTriangle,
		Bug,
		CheckCircle,
		Lightbulb,
		Mail,
		MessageCircle,
		Send,
		Star,
		Zap
	} from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { validateOptionalEmailClient } from '$lib/utils/client-email-validation';

	let selectedCategory = $state('');
	let rating = $state(0);
	let feedbackText = $state('');
	let userEmail = $state('');
	let honeypot = $state('');
	let isSubmitting = $state(false);
	let submitSuccess = $state(false);
	let submitError = $state('');
	let emailError = $state('');

	const feedbackCategories = [
		{
			id: 'feature',
			label: 'Feature request',
			description: 'Something new that would improve your workflow.',
			icon: Lightbulb
		},
		{
			id: 'bug',
			label: 'Bug report',
			description: 'Something broke or behaved unexpectedly.',
			icon: Bug
		},
		{
			id: 'improvement',
			label: 'Improvement',
			description: 'A current experience that could work better.',
			icon: Zap
		},
		{
			id: 'general',
			label: 'General feedback',
			description: 'Anything else you want the team to know.',
			icon: MessageCircle
		}
	];

	const ratingLabels = ['Poor', 'Fair', 'Good', 'Great', 'Excellent'];
	let feedbackCharacterCount = $derived(feedbackText.length);
	let ratingLabel = $derived(rating > 0 ? ratingLabels[rating - 1] : 'Optional');
	let canSubmit = $derived(
		Boolean(selectedCategory && feedbackText.trim().length >= 10 && !isSubmitting)
	);

	function validateEmail() {
		emailError = '';
		if (!userEmail.trim()) return;

		const validation = validateOptionalEmailClient(userEmail.trim());
		if (!validation.valid) {
			emailError = validation.error || 'Enter a valid email address';
		}
	}

	function validateForm(): string | null {
		if (honeypot.trim() !== '') return 'Spam detected';

		const trimmedFeedback = feedbackText.trim();
		if (!trimmedFeedback) return 'Please share your feedback.';
		if (trimmedFeedback.length < 10) return 'Please add a little more detail.';
		if (trimmedFeedback.length > 5000) return 'Keep your feedback under 5,000 characters.';
		if (!selectedCategory) return 'Choose a feedback type.';

		if (userEmail.trim()) {
			const emailValidation = validateOptionalEmailClient(userEmail.trim());
			if (!emailValidation.valid) {
				emailError = emailValidation.error || 'Enter a valid email address';
				return emailValidation.error || 'Enter a valid email address.';
			}
		}

		const spamPatterns = [
			/https?:\/\/[^\s]+/i,
			/\b(bitcoin|crypto|investment|loan|money)\b/i,
			/(.)\1{10,}/
		];

		for (const pattern of spamPatterns) {
			if (pattern.test(trimmedFeedback)) {
				return 'Your message looks like spam. Please revise it and try again.';
			}
		}

		return null;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		submitError = '';
		submitSuccess = false;

		const validationError = validateForm();
		if (validationError) {
			submitError = validationError;
			return;
		}

		isSubmitting = true;

		try {
			const response = await fetch('/api/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					category: selectedCategory,
					rating: rating || undefined,
					feedback_text: feedbackText.trim(),
					user_email: userEmail.trim() || undefined,
					honeypot
				})
			});

			const result = await response.json();

			if (!response.ok) {
				submitError = result.error || 'Your feedback could not be sent. Please try again.';
				return;
			}

			submitSuccess = true;
			selectedCategory = '';
			rating = 0;
			feedbackText = '';
			userEmail = '';
			honeypot = '';
			emailError = '';
		} catch (error) {
			console.error('Submission error:', error);
			submitError = 'Something unexpected happened. Please try again later.';
		} finally {
			isSubmitting = false;
		}
	}

	function resetForm() {
		submitSuccess = false;
		submitError = '';
	}
</script>

<SEOHead
	title="Feedback - BuildOS | Share Your Thoughts & Ideas"
	description="Help us improve BuildOS. Share feedback, report bugs, request features, or ask questions about the thinking environment for complex work."
	canonical="https://build-os.com/feedback"
	keywords="BuildOS feedback, feature request, bug report, user feedback, thinking environment feedback"
/>

<div class="min-h-screen bg-background">
	<header class="border-b border-border bg-card tx tx-bloom tx-weak">
		<div class="mx-auto max-w-7xl px-2 py-12 sm:px-4 sm:py-16 lg:px-6">
			<div class="max-w-3xl">
				<div
					class="mb-5 flex h-11 w-11 items-center justify-center rounded-md bg-accent/10 text-accent"
				>
					<MessageCircle class="h-5 w-5" aria-hidden="true" />
				</div>
				<p class="micro-label text-accent">FEEDBACK</p>
				<h1 class="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
					Help shape BuildOS
				</h1>
				<p
					class="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
				>
					Tell me what worked, what broke, or where your workflow still feels scattered.
					Every message is read personally.
				</p>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-12 lg:px-6">
		<div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
			<section aria-labelledby="feedback-form-title" class="min-w-0">
				{#if submitSuccess}
					<div
						id="success-message"
						class="rounded-lg border border-success/30 bg-success/10 p-6 shadow-ink sm:p-8"
						role="status"
						aria-live="polite"
					>
						<div
							class="flex h-12 w-12 items-center justify-center rounded-md bg-success/15 text-success"
						>
							<CheckCircle class="h-6 w-6" aria-hidden="true" />
						</div>
						<p class="micro-label mt-6 text-success">SENT</p>
						<h2 class="mt-2 text-2xl font-semibold text-foreground">Thank you</h2>
						<p class="mt-3 max-w-xl text-muted-foreground">
							Your feedback is in. If you left an email address, DJ may follow up for
							more context.
						</p>
						<Button class="mt-6" onclick={resetForm} variant="outline">
							Send another note
						</Button>
					</div>
				{:else}
					<div
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak sm:p-6 lg:p-8"
					>
						<div class="border-b border-border pb-6">
							<h2
								id="feedback-form-title"
								class="text-2xl font-semibold text-foreground"
							>
								Share your feedback
							</h2>
							<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
								A category and a short description are all that is required.
							</p>
						</div>

						{#if submitError}
							<div
								class="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4"
								role="alert"
								aria-live="assertive"
							>
								<div class="flex items-start gap-3">
									<AlertTriangle
										class="mt-0.5 h-5 w-5 shrink-0 text-destructive"
										aria-hidden="true"
									/>
									<div class="min-w-0">
										<p class="font-semibold text-destructive">
											Check your feedback
										</p>
										<p class="mt-1 text-sm text-foreground">{submitError}</p>
									</div>
								</div>
							</div>
						{/if}

						<form onsubmit={handleSubmit} class="mt-8 space-y-8">
							<div class="hidden" aria-hidden="true">
								<label for="website">Website (leave blank)</label>
								<TextInput
									id="website"
									type="text"
									bind:value={honeypot}
									tabindex={-1}
									autocomplete="off"
								/>
							</div>

							<fieldset>
								<legend class="mb-4">
									<span class="micro-label text-accent">01 · TYPE</span>
									<span
										class="mt-1 block text-base font-semibold text-foreground"
									>
										What are you sharing?
										<span class="text-destructive" aria-hidden="true">*</span>
										<span class="sr-only">(required)</span>
									</span>
								</legend>
								<div class="grid gap-3 sm:grid-cols-2">
									{#each feedbackCategories as category (category.id)}
										{@const CategoryIcon = category.icon}
										<label
											for={`feedback-category-${category.id}`}
											class="flex min-h-[76px] cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 motion-reduce:transition-none {selectedCategory ===
											category.id
												? 'border-accent bg-accent/10'
												: 'border-border-strong bg-background hover:border-accent/60 hover:bg-muted/40'}"
										>
											<input
												id={`feedback-category-${category.id}`}
												class="sr-only"
												type="radio"
												name="feedback-category"
												value={category.id}
												bind:group={selectedCategory}
												required
											/>
											<span
												class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md {selectedCategory ===
												category.id
													? 'bg-accent/15 text-accent'
													: 'bg-muted text-foreground'}"
											>
												<CategoryIcon class="h-5 w-5" aria-hidden="true" />
											</span>
											<span class="min-w-0">
												<span class="block font-semibold text-foreground"
													>{category.label}</span
												>
												<span
													class="mt-0.5 block text-xs leading-snug text-muted-foreground"
												>
													{category.description}
												</span>
											</span>
										</label>
									{/each}
								</div>
							</fieldset>

							<fieldset>
								<legend>
									<span class="micro-label text-accent">02 · RATING</span>
									<span
										class="mt-1 block text-base font-semibold text-foreground"
									>
										How is BuildOS working for you?
									</span>
								</legend>
								<div class="mt-3 flex flex-wrap items-center gap-2">
									{#each Array(5) as _, index (index)}
										{@const ratingValue = index + 1}
										<label
											class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 motion-reduce:transition-none {rating >=
											ratingValue
												? 'border-warning/50 bg-warning/10 text-warning'
												: 'border-border-strong bg-background text-muted-foreground hover:border-warning/50 hover:text-warning'}"
										>
											<input
												class="sr-only"
												type="radio"
												name="feedback-rating"
												value={ratingValue}
												bind:group={rating}
												aria-label={`${ratingValue} out of 5`}
											/>
											<Star
												class="h-5 w-5 {rating >= ratingValue
													? 'fill-current'
													: ''}"
												aria-hidden="true"
											/>
										</label>
									{/each}
									<span
										class="ml-1 text-sm text-muted-foreground"
										aria-live="polite"
									>
										{ratingLabel}
									</span>
								</div>
							</fieldset>

							<div>
								<p class="micro-label mb-1 text-accent">03 · DETAILS</p>
								<FormField
									label="What should we know?"
									labelFor="feedback"
									required
									uppercase={false}
								>
									<Textarea
										id="feedback"
										bind:value={feedbackText}
										rows={7}
										placeholder="What happened, what did you expect, and what would make it better?"
										required
										minlength={10}
										maxlength={5000}
										aria-describedby="feedback-help"
									/>
									<div
										id="feedback-help"
										class="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground"
									>
										<span>At least 10 characters.</span>
										<span class="shrink-0 tabular-nums"
											>{feedbackCharacterCount} / 5,000</span
										>
									</div>
								</FormField>
							</div>

							<div>
								<p class="micro-label mb-1 text-accent">04 · REPLY</p>
								<FormField
									label="Email for a reply"
									labelFor="email"
									uppercase={false}
								>
									<TextInput
										id="email"
										type="email"
										inputmode="email"
										enterkeyhint="send"
										bind:value={userEmail}
										placeholder="you@example.com"
										onblur={validateEmail}
										error={Boolean(emailError)}
										errorMessage={emailError}
										helperText="Only used to reply to this submission."
									/>
								</FormField>
							</div>

							<div
								class="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between"
							>
								<p class="max-w-md text-xs leading-relaxed text-muted-foreground">
									Protected with rate limiting. Your note is used to improve
									BuildOS.
								</p>
								<Button
									type="submit"
									disabled={!canSubmit}
									loading={isSubmitting}
									icon={Send}
									class="w-full sm:w-auto"
								>
									{isSubmitting ? 'Sending…' : 'Send feedback'}
								</Button>
							</div>
						</form>
					</div>
				{/if}
			</section>

			<aside class="lg:border-l lg:border-border lg:pl-8" aria-labelledby="next-title">
				<p class="micro-label text-accent">WHAT HAPPENS NEXT</p>
				<h2 id="next-title" class="mt-2 text-xl font-semibold text-foreground">
					A direct line to the product
				</h2>
				<ul class="mt-6 space-y-5">
					<li class="flex gap-3">
						<span
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground"
						>
							<MessageCircle class="h-4 w-4" aria-hidden="true" />
						</span>
						<div class="min-w-0">
							<p class="font-semibold text-foreground">Read personally</p>
							<p class="mt-1 text-sm leading-relaxed text-muted-foreground">
								DJ reviews every submission.
							</p>
						</div>
					</li>
					<li class="flex gap-3">
						<span
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground"
						>
							<Mail class="h-4 w-4" aria-hidden="true" />
						</span>
						<div class="min-w-0">
							<p class="font-semibold text-foreground">Follow-up is optional</p>
							<p class="mt-1 text-sm leading-relaxed text-muted-foreground">
								Leave an email only if you want a reply.
							</p>
						</div>
					</li>
					<li class="flex gap-3">
						<span
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground"
						>
							<CheckCircle class="h-4 w-4" aria-hidden="true" />
						</span>
						<div class="min-w-0">
							<p class="font-semibold text-foreground">Details speed up fixes</p>
							<p class="mt-1 text-sm leading-relaxed text-muted-foreground">
								Include what happened and what you expected.
							</p>
						</div>
					</li>
				</ul>

				<div class="mt-8 border-t border-border pt-6">
					<p class="text-sm text-muted-foreground">
						Need help with something private or urgent?
					</p>
					<a
						href="/contact"
						class="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-accent underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						<Mail class="h-4 w-4 shrink-0" aria-hidden="true" />
						Contact DJ directly
					</a>
				</div>
			</aside>
		</div>
	</main>
</div>
