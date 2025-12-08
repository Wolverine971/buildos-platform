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

<div class="min-h-screen bg-background py-12">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="text-center mb-16">
			<div class="flex justify-center mb-6">
				<div
					class="w-16 h-16 rounded bg-card border border-border shadow-ink flex items-center justify-center tx tx-frame tx-weak"
				>
					<Shield class="w-8 h-8 text-foreground" />
				</div>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-foreground mb-4">Privacy Policy</h1>
			<p class="text-xl text-muted-foreground max-w-2xl mx-auto">
				Your privacy matters to us. Here's how we handle your data in BuildOS.
			</p>
		</div>

		<!-- Quick Summary -->
		<div class="bg-card rounded border border-border p-8 mb-12 shadow-ink tx tx-frame tx-weak">
			<h2 class="text-2xl font-bold text-foreground mb-6 flex items-center">
				<Eye class="w-6 h-6 mr-3 text-foreground" />
				Privacy at a Glance
			</h2>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div class="text-center">
					<div
						class="w-12 h-12 rounded bg-muted border border-border flex items-center justify-center mb-3 mx-auto"
					>
						<Download class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">Access Your Data</h3>
					<p class="text-sm text-muted-foreground">
						View and export all your projects, tasks, and notes through the app
					</p>
				</div>
				<div class="text-center">
					<div
						class="w-12 h-12 rounded bg-muted border border-border flex items-center justify-center mb-3 mx-auto"
					>
						<Trash2 class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">Delete Your Data</h3>
					<p class="text-sm text-muted-foreground">
						Delete projects, tasks, and profile data directly in the app
					</p>
				</div>
				<div class="text-center">
					<div
						class="w-12 h-12 rounded bg-muted border border-border flex items-center justify-center mb-3 mx-auto"
					>
						<Lock class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">No Data Sales</h3>
					<p class="text-sm text-muted-foreground">
						We never sell your data or use it for advertising
					</p>
				</div>
			</div>
		</div>

		<!-- Main Content -->
		<div
			class="bg-card rounded border border-border p-8 md:p-12 shadow-ink tx tx-grain tx-weak space-y-8"
		>
			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">Data We Collect</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">
						BuildOS collects the following data to provide you with a productivity
						platform:
					</p>
					<ul class="space-y-2 text-muted-foreground">
						<li class="text-muted-foreground">
							<strong class="text-foreground">Account Information:</strong> Email address
							and name from Google OAuth authentication
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">Content Data:</strong> Your projects, tasks,
							notes, brain dumps, and onboarding questionnaire responses
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">Phone Number (Optional):</strong> Your phone
							number, only if you choose to enable SMS notifications. Phone numbers are
							verified before use and are used solely for sending you reminders and notifications
							you've opted into
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">Google Calendar Data:</strong> Calendar events
							and scheduling information (only if you enable calendar integration)
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">Usage Analytics:</strong> Page views and
							user interactions via Google Analytics
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">Technical Data:</strong> Login timestamps,
							IP address, and browser information for security
						</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">How We Use Your Data</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">Your data is used to:</p>
					<ul class="space-y-2 text-muted-foreground">
						<li class="text-muted-foreground">
							Provide the BuildOS service and store your content
						</li>
						<li class="text-muted-foreground">
							Generate AI-powered insights and task organization
						</li>
						<li class="text-muted-foreground">
							Send you SMS reminders and notifications (only if you opt in and verify
							your phone number)
						</li>
						<li class="text-muted-foreground">
							Sync with your Google Calendar (when enabled)
						</li>
						<li class="text-muted-foreground">
							Improve the product through usage analytics
						</li>
						<li class="text-muted-foreground">
							Communicate with you about your account
						</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					Data Sharing with AI Providers
				</h2>
				<div class="bg-amber-500/10 rounded-lg p-6 mb-4">
					<div class="flex items-start">
						<ExternalLink
							class="w-5 h-5 text-amber-600 dark:text-amber-400 mr-3 mt-0.5 flex-shrink-0"
						/>
						<div>
							<h3 class="font-semibold text-foreground mb-2">
								Important: AI Processing
							</h3>
							<p class="text-sm text-muted-foreground">
								To provide AI-powered insights, we send your project data, task
								information, brain dumps, and onboarding responses to AI providers
								including OpenAI and Anthropic. This data is processed to organize
								and enhance your productivity workflow.
							</p>
						</div>
					</div>
				</div>
				<p class="text-muted-foreground">
					The AI providers process this data according to their own privacy policies and
					terms of service. We do not send personally identifiable information beyond
					what's necessary for the AI processing functionality.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">Third-Party Services</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">
						BuildOS integrates with these third-party services:
					</p>
					<ul class="space-y-2 text-muted-foreground">
						<li class="text-muted-foreground">
							<strong class="text-foreground">Google:</strong> OAuth authentication and
							Calendar integration (optional)
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">Supabase:</strong> Database, authentication,
							and file storage infrastructure
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">Twilio:</strong> SMS message delivery service
							for sending notifications (only if you opt in to SMS notifications)
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">Google Analytics:</strong>
							Website usage analytics
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">AI Providers:</strong> OpenAI, Anthropic,
							and other LLM services for content processing
						</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">SMS Notifications</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">
						BuildOS offers optional SMS notifications to help you stay on track with
						your schedule:
					</p>
					<ul class="space-y-2 text-muted-foreground">
						<li class="text-muted-foreground">
							<strong class="text-foreground">Opt-In Only:</strong> SMS notifications are
							completely optional. You must explicitly enable them and verify your phone
							number before receiving any messages
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">Verification Required:</strong> We verify
							phone numbers via Twilio Verify to ensure accuracy and prevent misuse
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">Message Types:</strong> We send task reminders,
							daily brief notifications, and other productivity-related alerts you've chosen
							to receive
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">Unsubscribe Anytime:</strong> Reply STOP
							to any message to immediately opt out of all SMS notifications
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">No Spam:</strong> We only send notifications
							you've explicitly enabled. We never send marketing or promotional messages
						</li>
						<li class="text-muted-foreground">
							<strong class="text-foreground">Rates May Apply:</strong> Standard message
							and data rates from your carrier may apply
						</li>
					</ul>
					<p class="text-muted-foreground mt-4">
						Your phone number is stored securely and is used exclusively for delivering
						notifications. We do not sell, share, or use your phone number for any other
						purpose.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">Google API Data Use</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">
						BuildOS's use and transfer of information received from Google APIs to any
						other app will adhere to the <a
							href="https://developers.google.com/workspace/workspace-api-user-data-developer-policy#limited-use"
							target="_blank"
							rel="noopener noreferrer"
							class="text-accent hover:text-accent/80 underline"
							>Google API Services User Limited Use Data Policy</a
						>, including the Limited Use requirements.
					</p>
					<p class="text-muted-foreground">
						We only use your Google Calendar data to sync and display your events within
						BuildOS when you choose to enable calendar integration, and we do not use
						this data for advertising, resell it, or share it with unauthorized parties.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">Your Data Rights</h2>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div class="bg-accent/10 rounded-lg p-6">
						<div class="flex items-center mb-3">
							<Download class="w-5 h-5 text-accent mr-2" />
							<h3 class="font-semibold text-foreground">Access & Export</h3>
						</div>
						<p class="text-sm text-muted-foreground">
							All your data is visible and exportable through the BuildOS interface.
							You can download your projects, tasks, and notes at any time.
						</p>
					</div>
					<div class="bg-red-500/10 rounded-lg p-6">
						<div class="flex items-center mb-3">
							<Trash2 class="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
							<h3 class="font-semibold text-foreground">Data Deletion</h3>
						</div>
						<p class="text-sm text-muted-foreground">
							Delete individual projects, tasks, notes, or your entire account
							directly in the app. Deletions are permanent and immediate.
						</p>
					</div>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">Security</h2>
				<p class="text-muted-foreground">
					Your data is secured using Supabase's infrastructure, which includes encryption
					in transit and at rest, secure authentication protocols, and regular security
					monitoring. We use authentication cookies managed by Supabase for secure access
					to your account.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">About BuildOS</h2>
				<p class="text-muted-foreground">
					BuildOS is developed by a solo developer based in Glen Burnie, Maryland. We're
					in the process of incorporating as a startup. This privacy policy may be updated
					as we grow and add new features.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">Updates to This Policy</h2>
				<p class="text-muted-foreground">
					We may update this privacy policy as BuildOS evolves. We'll notify users of any
					significant changes and update the "Last Updated" date below.
				</p>
			</section>

			<!-- Last Updated -->
			<div class="border-t border-border pt-6">
				<p class="text-sm text-muted-foreground">Last updated: October 6, 2025</p>
			</div>
		</div>

		<!-- CTA Section -->
		<div class="mt-12 text-center">
			<div class="bg-accent rounded-lg shadow-ink p-8 text-accent-foreground">
				<h3 class="text-2xl font-bold mb-4">Questions about your data?</h3>
				<p class="mb-6 opacity-90">We're here to help. Reach out anytime.</p>
				<a
					href="/contact"
					class="inline-flex items-center px-6 py-3 bg-card text-accent font-semibold rounded-lg hover:bg-card/90 transition-colors"
				>
					Contact Us
				</a>
			</div>
		</div>
	</div>
</div>
