<!-- apps/web/src/routes/privacy/+page.svelte -->
<script lang="ts">
	import { Download, Trash2, Shield, Eye, Lock, ExternalLink } from 'lucide-svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
</script>

<SEOHead
	title="Privacy Policy - BuildOS | Data Protection & User Privacy"
	description="BuildOS privacy policy: Learn how we protect your data, handle brain dumps securely, and respect your privacy. GDPR compliant, data encrypted, you own your content."
	canonical="https://build-os.com/privacy"
	keywords="BuildOS privacy policy, data protection, GDPR compliance, user privacy, brain dump security, data encryption, privacy rights"
	author="BuildOS"
/>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="text-center mb-16">
			<div class="flex justify-center mb-6">
				<div
					class="flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-2xl"
				>
					<Shield class="w-8 h-8 text-green-600 dark:text-green-400" />
				</div>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
				Privacy Policy
			</h1>
			<p class="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
				Your privacy matters to us. Here's how we handle your data in BuildOS.
			</p>
		</div>

		<!-- Quick Summary -->
		<div
			class="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-2xl p-8 mb-12 border border-green-200 dark:border-green-800"
		>
			<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
				<Eye class="w-6 h-6 mr-3 text-green-600 dark:text-green-400" />
				Privacy at a Glance
			</h2>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div class="text-center">
					<div
						class="flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl mb-3 mx-auto"
					>
						<Download class="w-6 h-6 text-blue-600 dark:text-blue-400" />
					</div>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-2">
						Access Your Data
					</h3>
					<p class="text-sm text-gray-600 dark:text-gray-300">
						View and export all your projects, tasks, and notes through the app
					</p>
				</div>
				<div class="text-center">
					<div
						class="flex items-center justify-center w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-xl mb-3 mx-auto"
					>
						<Trash2 class="w-6 h-6 text-red-600 dark:text-red-400" />
					</div>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-2">
						Delete Your Data
					</h3>
					<p class="text-sm text-gray-600 dark:text-gray-300">
						Delete projects, tasks, and profile data directly in the app
					</p>
				</div>
				<div class="text-center">
					<div
						class="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl mb-3 mx-auto"
					>
						<Lock class="w-6 h-6 text-purple-600 dark:text-purple-400" />
					</div>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-2">No Data Sales</h3>
					<p class="text-sm text-gray-600 dark:text-gray-300">
						We never sell your data or use it for advertising
					</p>
				</div>
			</div>
		</div>

		<!-- Main Content -->
		<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 md:p-12 shadow-lg space-y-8">
			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					Data We Collect
				</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-gray-600 dark:text-gray-300 mb-4">
						BuildOS collects the following data to provide you with a productivity
						platform:
					</p>
					<ul class="space-y-2 text-gray-600 dark:text-gray-300">
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white"
								>Account Information:</strong
							> Email address and name from Google OAuth authentication
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white">Content Data:</strong> Your
							projects, tasks, notes, brain dumps, and onboarding questionnaire responses
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white"
								>Phone Number (Optional):</strong
							> Your phone number, only if you choose to enable SMS notifications. Phone
							numbers are verified before use and are used solely for sending you reminders
							and notifications you've opted into
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white"
								>Google Calendar Data:</strong
							> Calendar events and scheduling information (only if you enable calendar
							integration)
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white">Usage Analytics:</strong> Page
							views and user interactions via Google Analytics
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white">Technical Data:</strong> Login
							timestamps, IP address, and browser information for security
						</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					How We Use Your Data
				</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-gray-600 dark:text-gray-300 mb-4">Your data is used to:</p>
					<ul class="space-y-2 text-gray-600 dark:text-gray-300">
						<li class="text-gray-700 dark:text-gray-300">
							Provide the BuildOS service and store your content
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							Generate AI-powered insights and task organization
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							Send you SMS reminders and notifications (only if you opt in and verify
							your phone number)
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							Sync with your Google Calendar (when enabled)
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							Improve the product through usage analytics
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							Communicate with you about your account
						</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					Data Sharing with AI Providers
				</h2>
				<div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-6 mb-4">
					<div class="flex items-start">
						<ExternalLink
							class="w-5 h-5 text-amber-600 dark:text-amber-400 mr-3 mt-0.5 flex-shrink-0"
						/>
						<div>
							<h3 class="font-semibold text-gray-900 dark:text-white mb-2">
								Important: AI Processing
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-300">
								To provide AI-powered insights, we send your project data, task
								information, brain dumps, and onboarding responses to AI providers
								including OpenAI and Anthropic. This data is processed to organize
								and enhance your productivity workflow.
							</p>
						</div>
					</div>
				</div>
				<p class="text-gray-600 dark:text-gray-300">
					The AI providers process this data according to their own privacy policies and
					terms of service. We do not send personally identifiable information beyond
					what's necessary for the AI processing functionality.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					Third-Party Services
				</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-gray-600 dark:text-gray-300 mb-4">
						BuildOS integrates with these third-party services:
					</p>
					<ul class="space-y-2 text-gray-600 dark:text-gray-300">
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white">Google:</strong> OAuth authentication
							and Calendar integration (optional)
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white">Supabase:</strong> Database,
							authentication, and file storage infrastructure
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white">Twilio:</strong> SMS message
							delivery service for sending notifications (only if you opt in to SMS notifications)
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white">Google Analytics:</strong>
							Website usage analytics
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white">AI Providers:</strong> OpenAI,
							Anthropic, and other LLM services for content processing
						</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					SMS Notifications
				</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-gray-600 dark:text-gray-300 mb-4">
						BuildOS offers optional SMS notifications to help you stay on track with
						your schedule:
					</p>
					<ul class="space-y-2 text-gray-600 dark:text-gray-300">
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white">Opt-In Only:</strong> SMS notifications
							are completely optional. You must explicitly enable them and verify your
							phone number before receiving any messages
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white"
								>Verification Required:</strong
							> We verify phone numbers via Twilio Verify to ensure accuracy and prevent
							misuse
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white">Message Types:</strong> We
							send task reminders, daily brief notifications, and other productivity-related
							alerts you've chosen to receive
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white"
								>Unsubscribe Anytime:</strong
							> Reply STOP to any message to immediately opt out of all SMS notifications
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white">No Spam:</strong> We only send
							notifications you've explicitly enabled. We never send marketing or promotional
							messages
						</li>
						<li class="text-gray-700 dark:text-gray-300">
							<strong class="text-gray-900 dark:text-white">Rates May Apply:</strong> Standard
							message and data rates from your carrier may apply
						</li>
					</ul>
					<p class="text-gray-600 dark:text-gray-300 mt-4">
						Your phone number is stored securely and is used exclusively for delivering
						notifications. We do not sell, share, or use your phone number for any other
						purpose.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					Google API Data Use
				</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-gray-600 dark:text-gray-300 mb-4">
						BuildOS’s use and transfer of information received from Google APIs to any
						other app will adhere to the <a
							href="https://developers.google.com/workspace/workspace-api-user-data-developer-policy#limited-use"
							target="_blank"
							rel="noopener noreferrer"
							class="text-blue-600 dark:text-blue-400 underline"
							>Google API Services User Limited Use Data Policy</a
						>, including the Limited Use requirements.
					</p>
					<p class="text-gray-600 dark:text-gray-300">
						We only use your Google Calendar data to sync and display your events within
						BuildOS when you choose to enable calendar integration, and we do not use
						this data for advertising, resell it, or share it with unauthorized parties.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					Your Data Rights
				</h2>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
						<div class="flex items-center mb-3">
							<Download class="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2" />
							<h3 class="font-semibold text-gray-900 dark:text-white">
								Access & Export
							</h3>
						</div>
						<p class="text-sm text-gray-600 dark:text-gray-300">
							All your data is visible and exportable through the BuildOS interface.
							You can download your projects, tasks, and notes at any time.
						</p>
					</div>
					<div class="bg-red-50 dark:bg-red-900/20 rounded-xl p-6">
						<div class="flex items-center mb-3">
							<Trash2 class="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
							<h3 class="font-semibold text-gray-900 dark:text-white">
								Data Deletion
							</h3>
						</div>
						<p class="text-sm text-gray-600 dark:text-gray-300">
							Delete individual projects, tasks, notes, or your entire account
							directly in the app. Deletions are permanent and immediate.
						</p>
					</div>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">Security</h2>
				<p class="text-gray-600 dark:text-gray-300">
					Your data is secured using Supabase's infrastructure, which includes encryption
					in transit and at rest, secure authentication protocols, and regular security
					monitoring. We use authentication cookies managed by Supabase for secure access
					to your account.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">About BuildOS</h2>
				<p class="text-gray-600 dark:text-gray-300">
					BuildOS is developed by a solo developer based in Glen Burnie, Maryland. We're
					in the process of incorporating as a startup. This privacy policy may be updated
					as we grow and add new features.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					Updates to This Policy
				</h2>
				<p class="text-gray-600 dark:text-gray-300">
					We may update this privacy policy as BuildOS evolves. We'll notify users of any
					significant changes and update the "Last Updated" date below.
				</p>
			</section>

			<!-- Last Updated -->
			<div class="border-t border-gray-200 dark:border-gray-700 pt-6">
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Last updated: October 6, 2025
				</p>
			</div>
		</div>

		<!-- CTA Section -->
		<div class="mt-12 text-center">
			<div class="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white">
				<h3 class="text-2xl font-bold mb-4">Questions about your data?</h3>
				<p class="mb-6 opacity-90">We're here to help. Reach out anytime.</p>
				<a
					href="/contact"
					class="inline-flex items-center px-6 py-3 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
				>
					Contact Us
				</a>
			</div>
		</div>
	</div>
</div>
