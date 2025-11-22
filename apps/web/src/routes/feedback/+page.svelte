<!-- apps/web/src/routes/feedback/+page.svelte -->
<script lang="ts">
	import {
		MessageCircle,
		Heart,
		Lightbulb,
		Bug,
		Star,
		Zap,
		Target,
		Users,
		ThumbsUp,
		Send,
		CheckCircle,
		AlertTriangle
	} from 'lucide-svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { validateOptionalEmailClient } from '$lib/utils/client-email-validation';

	let selectedCategory = $state('');
	let rating = $state(0);
	let feedbackText = $state('');
	let userEmail = $state('');
	let honeypot = $state(''); // Hidden field for bot detection
	let isSubmitting = $state(false);
	let submitSuccess = $state(false);
	let submitError = $state('');
	let emailError = $state('');

	const feedbackCategories = [
		{ id: 'feature', label: 'Feature Request', icon: Lightbulb, color: 'blue' },
		{ id: 'bug', label: 'Bug Report', icon: Bug, color: 'red' },
		{ id: 'improvement', label: 'Improvement', icon: Zap, color: 'green' },
		{ id: 'general', label: 'General Feedback', icon: MessageCircle, color: 'purple' }
	];

	function setRating(value: number) {
		rating = value;
	}

	// Validate email on blur for instant feedback (optional field)
	function validateEmail() {
		emailError = '';
		if (!userEmail.trim()) {
			return; // Empty is valid for optional field
		}

		const validation = validateOptionalEmailClient(userEmail.trim());
		if (!validation.valid) {
			emailError = validation.error || 'Invalid email address';
		}
	}

	function validateForm(): string | null {
		// Check honeypot (should be empty)
		if (honeypot.trim() !== '') {
			return 'Spam detected';
		}

		// Validate feedback text
		if (!feedbackText.trim()) {
			return 'Please provide your feedback';
		}

		if (feedbackText.length < 10) {
			return 'Please provide more detailed feedback (at least 10 characters)';
		}

		if (feedbackText.length > 5000) {
			return 'Feedback is too long (maximum 5000 characters)';
		}

		// Validate category
		if (!selectedCategory) {
			return 'Please select a feedback category';
		}

		// Validate email format if provided (enhanced security)
		if (userEmail.trim()) {
			const emailValidation = validateOptionalEmailClient(userEmail.trim());
			if (!emailValidation.valid) {
				emailError = emailValidation.error || 'Invalid email address';
				return emailValidation.error || 'Please provide a valid email address';
			}
		}

		// Check for spam patterns
		const spamPatterns = [
			/https?:\/\/[^\s]+/gi, // URLs
			/\b(bitcoin|crypto|investment|loan|money)\b/gi, // Common spam words
			/(.)\1{10,}/g // Repeated characters
		];

		for (const pattern of spamPatterns) {
			if (pattern.test(feedbackText)) {
				return 'Your message appears to contain spam. Please revise and try again.';
			}
		}

		return null;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();

		// Reset states
		submitError = '';
		submitSuccess = false;

		// Validate form
		const validationError = validateForm();
		if (validationError) {
			submitError = validationError;
			return;
		}

		isSubmitting = true;

		try {
			// Submit feedback via API
			const response = await fetch('/api/feedback', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					category: selectedCategory,
					rating: rating || undefined,
					feedback_text: feedbackText.trim(),
					user_email: userEmail.trim() || undefined,
					honeypot: honeypot
				})
			});

			const result = await response.json();

			if (!response.ok) {
				submitError =
					result.error ||
					'There was an error submitting your feedback. Please try again.';
				return;
			}

			// Success!
			submitSuccess = true;

			// Reset form
			selectedCategory = '';
			rating = 0;
			feedbackText = '';
			userEmail = '';
			honeypot = '';

			// Scroll to success message
			setTimeout(() => {
				document.getElementById('success-message')?.scrollIntoView({
					behavior: 'smooth',
					block: 'center'
				});
			}, 100);
		} catch (error) {
			console.error('Submission error:', error);
			submitError = 'There was an unexpected error. Please try again later.';
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
	description="Help us improve BuildOS. Share your feedback, report bugs, request new features, or ask questions. Your input directly shapes our AI-native productivity platform."
	canonical="https://build-os.com/feedback"
	keywords="BuildOS feedback, feature request, bug report, user feedback, product improvement, AI productivity feedback"
/>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Header -->
	<div class="bg-white dark:bg-gray-800 py-20">
		<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<div class="flex justify-center mb-8">
				<div
					class="flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-2xl"
				>
					<MessageCircle class="w-8 h-8 text-primary-600 dark:text-primary-400" />
				</div>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
				Your Feedback is hella important
			</h1>
			<p class="text-xl text-gray-600 dark:text-gray-400 mb-8 max-w-3xl mx-auto">
				Help us build the best personal operating system by sharing your thoughts, ideas,
				and experiences.
			</p>
			<div
				class="flex items-center justify-center space-x-2 text-sm text-gray-600 dark:text-gray-400"
			>
				<Heart class="w-4 h-4 text-red-500" />
				<span>Built with love by two founders who read every message</span>
			</div>
		</div>
	</div>

	<!-- Success Message -->
	{#if submitSuccess}
		<section id="success-message" class="py-20">
			<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
				<div
					class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-8 text-center"
				>
					<div class="flex justify-center mb-6">
						<CheckCircle class="w-16 h-16 text-green-600 dark:text-green-400" />
					</div>
					<h2 class="text-2xl font-bold text-green-800 dark:text-green-300 mb-4">
						Thank You for Your Feedback!
					</h2>
					<p class="text-green-700 dark:text-green-400 mb-6">
						Your feedback has been submitted successfully. DJ will review it personally
						and may reach out if you provided your email address.
					</p>
					<Button onclick={resetForm} variant="primary" size="lg">
						Submit More Feedback
					</Button>
				</div>
			</div>
		</section>
	{:else}
		<!-- Feedback Form -->
		<section class="py-20">
			<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
				<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 md:p-12 shadow-lg">
					<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center">
						Share Your Feedback
					</h2>

					<!-- Error Message -->
					{#if submitError}
						<div
							class="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4"
						>
							<div class="flex items-center">
								<AlertTriangle
									class="w-5 h-5 text-red-600 dark:text-red-400 mr-3"
								/>
								<p class="text-red-700 dark:text-red-400">{submitError}</p>
							</div>
						</div>
					{/if}

					<form onsubmit={handleSubmit} class="space-y-8">
						<!-- Honeypot field (hidden from users, visible to bots) -->
						<div class="hidden">
							<label for="website">Website (leave blank)</label>
							<TextInput
								id="website"
								type="text"
								bind:value={honeypot}
								tabindex="-1"
								autocomplete="off"
								size="md"
							/>
						</div>

						<!-- Feedback Category -->
						<fieldset class="space-y-4">
							<legend
								id="feedback-category-legend"
								class="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								What type of feedback do you have?
								<span class="text-red-500">*</span>
							</legend>
							<div
								class="grid grid-cols-1 md:grid-cols-2 gap-4"
								role="radiogroup"
								aria-labelledby="feedback-category-legend"
							>
								{#each feedbackCategories as category}
									{@const CategoryIcon = category.icon}
									<Button
										type="button"
										onclick={() => (selectedCategory = category.id)}
										variant="ghost"
										size="lg"
										class="flex items-center p-4 w-full justify-start border-2 rounded-xl transition-all duration-200 {selectedCategory ===
										category.id
											? `border-${category.color}-500 bg-${category.color}-50 dark:bg-${category.color}-900/20`
											: 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'}"
										role="radio"
										aria-checked={selectedCategory === category.id}
										aria-label={category.label}
									>
										<div
											class="flex items-center justify-center w-10 h-10 bg-{category.color}-100 dark:bg-{category.color}-900/30 rounded-lg mr-4"
										>
											<CategoryIcon
												class="w-5 h-5 text-{category.color}-600 dark:text-{category.color}-400"
											/>
										</div>
										<div class="text-left">
											<h3 class="font-semibold text-gray-900 dark:text-white">
												{category.label}
											</h3>
										</div>
									</Button>
								{/each}
							</div>
						</fieldset>

						<!-- Rating -->
						<fieldset class="space-y-4">
							<legend
								id="feedback-rating-legend"
								class="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								How would you rate your overall experience with BuildOS?
							</legend>
							<div
								class="flex items-center space-x-2"
								role="radiogroup"
								aria-labelledby="feedback-rating-legend"
							>
								{#each Array(5) as _, i}
									{@const ratingValue = i + 1}
									<Button
										type="button"
										onclick={() => setRating(ratingValue)}
										variant="ghost"
										size="sm"
										class="p-1"
										icon={Star}
										role="radio"
										aria-checked={rating === ratingValue}
										aria-label={`Rate ${ratingValue} out of 5`}
									></Button>
								{/each}
								{#if rating > 0}
									<span class="ml-4 text-sm text-gray-600 dark:text-gray-400">
										{rating === 5
											? 'Excellent!'
											: rating === 4
												? 'Great!'
												: rating === 3
													? 'Good'
													: rating === 2
														? 'Fair'
														: 'Poor'}
									</span>
								{/if}
							</div>
						</fieldset>

						<!-- Feedback Text -->
						<FormField
							label="Tell us more about your experience"
							labelFor="feedback"
							required
							hint="{feedbackText.length} / 5000 characters"
						>
							<Textarea
								id="feedback"
								bind:value={feedbackText}
								rows={6}
								size="md"
								enterkeyhint="next"
								placeholder="Share your thoughts, ideas, or describe any issues you've encountered. The more detail, the better we can help! (Minimum 10 characters)"
								required
							/>
						</FormField>

						<!-- Email (Optional) -->
						<FormField
							label="Email (optional) - if you'd like us to follow up"
							labelFor="email"
							size="md"
						>
							<TextInput
								id="email"
								type="email"
								inputmode="email"
								enterkeyhint="send"
								bind:value={userEmail}
								placeholder="your@email.com"
								size="md"
								onblur={validateEmail}
							/>
							{#if emailError}
								<p class="mt-1 text-sm text-red-600 dark:text-red-400">
									{emailError}
								</p>
							{/if}
						</FormField>

						<!-- Submit Button -->
						<div class="text-center">
							<Button
								type="submit"
								disabled={!feedbackText.trim() || !selectedCategory || isSubmitting}
								variant="primary"
								size="xl"
								class="shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none transition-all duration-200"
								loading={isSubmitting}
								icon={Send}
							>
								{#if isSubmitting}
									Sending...
								{:else}
									Send Feedback
								{/if}
							</Button>
						</div>

						<!-- Form Info -->
						<div class="text-center text-sm text-gray-500 dark:text-gray-400">
							<p>
								Protected against spam with rate limiting and validation.
								<br />
								Your feedback is stored securely and only used to improve BuildOS.
							</p>
						</div>
					</form>
				</div>
			</div>
		</section>
	{/if}

	<!-- Why Feedback Matters -->
	<section class="py-20 bg-white dark:bg-gray-800">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-16">
				<h2 class="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6">
					Why Your Feedback <span class="text-blue-600">Matters</span>
				</h2>
				<p class="text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
					As a solo founder building BuildOS, your input directly shapes the product
					roadmap and development priorities.
				</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
				<div class="text-center">
					<div
						class="flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-2xl mb-6 mx-auto"
					>
						<Target class="w-8 h-8 text-primary-600 dark:text-primary-400" />
					</div>
					<h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
						Direct Impact
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						Your suggestions often get implemented within days. Every piece of feedback
						is read by the founder personally.
					</p>
				</div>

				<div class="text-center">
					<div
						class="flex items-center justify-center w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-2xl mb-6 mx-auto"
					>
						<Users class="w-8 h-8 text-violet-600 dark:text-violet-400" />
					</div>
					<h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
						Community Building
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						Help us build a community of productive, goal-oriented individuals who
						support each other's growth.
					</p>
				</div>

				<div class="text-center">
					<div
						class="flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-2xl mb-6 mx-auto"
					>
						<Zap class="w-8 h-8 text-green-600 dark:text-green-400" />
					</div>
					<h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
						Rapid Iteration
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						We ship features fast. Your feedback helps us prioritize what matters most
						to our users.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Recent Feedback Examples -->
	<section class="py-20 bg-gray-50 dark:bg-gray-900">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-16">
				<h2 class="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6">
					Feedback in <span class="text-green-600">Action</span>
				</h2>
				<p class="text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
					Here are some recent examples of how user feedback directly improved BuildOS.
				</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
				<!-- Feedback Example 1 -->
				<div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
					<div class="flex items-center mb-4">
						<div
							class="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mr-3"
						>
							<span class="text-sm font-bold text-blue-600">SJ</span>
						</div>
						<div>
							<div class="font-semibold text-gray-900 dark:text-white text-sm">
								Phillip P.
							</div>
							<div class="text-xs text-gray-500 dark:text-gray-400">Beta User</div>
						</div>
					</div>
					<blockquote class="text-gray-600 dark:text-gray-400 text-sm mb-4 italic">
						"It would be nice to braindump on any page."
					</blockquote>
					<div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
						<div class="flex items-center text-green-700 dark:text-green-300 text-sm">
							<ThumbsUp class="w-4 h-4 mr-2" />
							<span class="font-medium">Implemented!</span>
						</div>
						<p class="text-xs text-green-600 dark:text-green-400 mt-1">
							Added quick brain dump icon in nav bar.
						</p>
					</div>
				</div>

				<!-- Feedback Example 2 -->
				<div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
					<div class="flex items-center mb-4">
						<div
							class="w-8 h-8 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center mr-3"
						>
							<span class="text-sm font-bold text-violet-600">MK</span>
						</div>
						<div>
							<div class="font-semibold text-gray-900 dark:text-white text-sm">
								Mike K.
							</div>
							<div class="text-xs text-gray-500 dark:text-gray-400">
								Product Manager
							</div>
						</div>
					</div>
					<blockquote class="text-gray-600 dark:text-gray-400 text-sm mb-4 italic">
						"The daily brief is great, but could it show progress percentages for each
						goal?"
					</blockquote>
					<div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
						<div class="flex items-center text-green-700 dark:text-green-300 text-sm">
							<ThumbsUp class="w-4 h-4 mr-2" />
							<span class="font-medium">Implemented!</span>
						</div>
						<p class="text-xs text-green-600 dark:text-green-400 mt-1">
							Added progress bars to daily briefs
						</p>
					</div>
				</div>

				<!-- Feedback Example 3 -->
				<div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
					<div class="flex items-center mb-4">
						<div
							class="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mr-3"
						>
							<span class="text-sm font-bold text-green-600">AL</span>
						</div>
						<div>
							<div class="font-semibold text-gray-900 dark:text-white text-sm">
								Alex L.
							</div>
							<div class="text-xs text-gray-500 dark:text-gray-400">Designer</div>
						</div>
					</div>
					<blockquote class="text-gray-600 dark:text-gray-400 text-sm mb-4 italic">
						"Love the app! Could we have a dark mode? I work late and it would be easier
						on my eyes."
					</blockquote>
					<div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
						<div class="flex items-center text-green-700 dark:text-green-300 text-sm">
							<ThumbsUp class="w-4 h-4 mr-2" />
							<span class="font-medium">Implemented!</span>
						</div>
						<p class="text-xs text-green-600 dark:text-green-400 mt-1">
							Full dark mode support added
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Other Ways to Connect -->
	<section class="py-20 bg-white dark:bg-gray-800">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<h2 class="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6">
				Other Ways to Connect
			</h2>
			<p class="text-lg text-gray-600 dark:text-gray-400 mb-12">
				Prefer a different way to share your thoughts? We're available through multiple
				channels.
			</p>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
				<a
					href="/contact"
					class="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-2xl p-8 hover:shadow-lg transition-all duration-300 group text-left"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-xl mb-4 group-hover:scale-110 transition-transform"
					>
						<MessageCircle class="w-6 h-6 text-primary-600 dark:text-primary-400" />
					</div>
					<h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">
						Direct Contact
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						Reach out directly to the founder for detailed discussions or private
						feedback.
					</p>
				</a>

				<a
					href="/beta"
					class="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-2xl p-8 hover:shadow-lg transition-all duration-300 group text-left"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-violet-100 dark:bg-violet-900/30 rounded-xl mb-4 group-hover:scale-110 transition-transform"
					>
						<Users class="w-6 h-6 text-violet-600 dark:text-violet-400" />
					</div>
					<h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">
						Beta Community
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						Join our beta community for ongoing discussions and collaborative feedback
						sessions.
					</p>
				</a>
			</div>
		</div>
	</section>
</div>
