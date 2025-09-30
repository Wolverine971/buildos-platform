<!-- apps/web/src/routes/terms/+page.svelte -->
<script lang="ts">
	import { FileText, AlertTriangle, Shield, Users, DollarSign } from 'lucide-svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
</script>

<SEOHead
	title="Terms of Service - BuildOS | Legal Terms & Conditions"
	description="BuildOS Terms of Service: Simple, fair legal terms for using our AI-powered productivity platform. Last updated December 2024. User agreements, content ownership, and usage guidelines."
	canonical="https://build-os.com/terms"
	keywords="BuildOS terms of service, user agreement, legal terms, content ownership, usage guidelines, subscription terms, AI productivity terms"
	author="BuildOS"
/>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="text-center mb-16">
			<div class="flex justify-center mb-6">
				<div
					class="flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl"
				>
					<FileText class="w-8 h-8 text-blue-600 dark:text-blue-400" />
				</div>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
				Terms of Service
			</h1>
			<p class="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
				The legal terms that govern your use of BuildOS. We've tried to keep it simple and
				fair.
			</p>
		</div>

		<!-- Key Points -->
		<div
			class="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-8 mb-12 border border-blue-200 dark:border-blue-800"
		>
			<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
				<AlertTriangle class="w-6 h-6 mr-3 text-blue-600 dark:text-blue-400" />
				Key Points
			</h2>
			<div class="grid grid-cols-1 md:grid-cols-4 gap-6">
				<div class="text-center">
					<div
						class="flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl mb-3 mx-auto"
					>
						<Users class="w-6 h-6 text-green-600 dark:text-green-400" />
					</div>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-2">Fair Use</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Use BuildOS responsibly and legally
					</p>
				</div>
				<div class="text-center">
					<div
						class="flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl mb-3 mx-auto"
					>
						<Shield class="w-6 h-6 text-blue-600 dark:text-blue-400" />
					</div>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-2">Your Content</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						You own your data, we just help you organize it
					</p>
				</div>
				<div class="text-center">
					<div
						class="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl mb-3 mx-auto"
					>
						<FileText class="w-6 h-6 text-purple-600 dark:text-purple-400" />
					</div>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-2">AI Processing</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Content sent to AI providers for insights
					</p>
				</div>
				<div class="text-center">
					<div
						class="flex items-center justify-center w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl mb-3 mx-auto"
					>
						<DollarSign class="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
					</div>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-2">Subscription</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Free now, subscription model coming soon
					</p>
				</div>
			</div>
		</div>

		<!-- Main Content -->
		<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 md:p-12 shadow-lg space-y-8">
			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					1. Acceptance of Terms
				</h2>
				<p class="text-gray-600 dark:text-gray-400">
					By accessing and using BuildOS, you accept and agree to be bound by these terms
					of service. If you do not agree to these terms, please do not use our service.
					These terms constitute a legal agreement between you and BuildOS (operated as a
					sole proprietorship in Glen Burnie, Maryland).
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					2. Description of Service
				</h2>
				<p class="text-gray-600 dark:text-gray-400 mb-4">
					BuildOS is a personal productivity platform that helps you organize your
					thoughts, projects, and goals. The service includes:
				</p>
				<ul class="space-y-2 text-gray-600 dark:text-gray-400 ml-6">
					<li>• Brain dump capture and organization</li>
					<li>• Project and goal management</li>
					<li>• Task tracking and prioritization</li>
					<li>• AI-powered insights and recommendations</li>
					<li>• Google Calendar integration (optional)</li>
					<li>• Data export capabilities</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					3. Pricing and Billing
				</h2>
				<div class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 mb-4">
					<p class="text-blue-800 dark:text-blue-200 font-medium mb-2">
						Current Status: Free Access
					</p>
					<p class="text-gray-600 dark:text-gray-400">
						BuildOS is currently free to use. We plan to introduce a subscription model
						in the near future, processed through Stripe. Free tier users will be
						limited to 3 projects when the subscription model launches.
					</p>
				</div>
				<p class="text-gray-600 dark:text-gray-400 mb-4">When billing begins:</p>
				<ul class="space-y-2 text-gray-600 dark:text-gray-400 ml-6">
					<li>• Subscriptions can be cancelled at any time</li>
					<li>• Billing is handled securely through Stripe</li>
					<li>• We will provide advance notice before implementing any charges</li>
					<li>• Refund policies will be established before paid subscriptions begin</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					4. User Accounts
				</h2>
				<p class="text-gray-600 dark:text-gray-400 mb-4">
					To access BuildOS, you must create an account using Google OAuth. You are
					responsible for:
				</p>
				<ul class="space-y-2 text-gray-600 dark:text-gray-400 ml-6">
					<li>• Providing accurate and complete information</li>
					<li>• Maintaining the security of your Google account</li>
					<li>• All activities that occur under your account</li>
					<li>• Being at least 13 years of age to use the service</li>
					<li>• Notifying us immediately of any unauthorized use</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					5. User Content and AI Processing
				</h2>
				<div class="bg-green-50 dark:bg-green-900/20 rounded-xl p-6 mb-4">
					<p class="text-gray-700 dark:text-gray-300 font-medium mb-2">
						Your Content Belongs to You
					</p>
					<p class="text-gray-600 dark:text-gray-400">
						You retain all rights to the content you create in BuildOS. We claim no
						ownership over your brain dumps, projects, goals, or any other content you
						input into the service.
					</p>
				</div>

				<div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-6 mb-4">
					<p class="text-amber-800 dark:text-amber-200 font-medium mb-2">
						AI Processing Notice
					</p>
					<p class="text-gray-600 dark:text-gray-400">
						To provide AI-powered insights, your project data, tasks, brain dumps, and
						onboarding responses are sent to third-party AI providers including OpenAI
						and Anthropic. Only content necessary for organizing and enhancing your
						productivity is processed.
					</p>
				</div>

				<p class="text-gray-600 dark:text-gray-400 mb-4">
					By using BuildOS, you grant us a limited license to:
				</p>
				<ul class="space-y-2 text-gray-600 dark:text-gray-400 ml-6">
					<li>• Store and process your content to provide the service</li>
					<li>• Send relevant content to AI providers for processing and insights</li>
					<li>• Display your content back to you in organized formats</li>
					<li>• Use aggregated, anonymized data to improve our features</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					6. Acceptable Use
				</h2>
				<p class="text-gray-600 dark:text-gray-400 mb-4">
					You agree not to use BuildOS to:
				</p>
				<ul class="space-y-2 text-gray-600 dark:text-gray-400 ml-6">
					<li>• Violate any laws or regulations</li>
					<li>• Upload illegal, harmful, or offensive content</li>
					<li>• Infringe on others' intellectual property rights</li>
					<li>• Upload malicious code or attempt to hack the service</li>
					<li>• Spam, harass, or abuse other users or our support</li>
					<li>• Use the service for any unauthorized commercial purpose</li>
					<li>• Attempt to reverse engineer or copy the service</li>
				</ul>
				<p class="text-gray-600 dark:text-gray-400 mt-4">
					We reserve the right to implement content validation and flagging systems to
					enforce these policies.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					7. Service Availability and Beta Status
				</h2>
				<p class="text-gray-600 dark:text-gray-400">
					We strive to keep BuildOS available 24/7, but we do not guarantee uninterrupted
					service. We may need to take the service down for maintenance, updates, or
					emergency repairs. As BuildOS continues to evolve, some features may change or
					be temporarily unavailable.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					8. Privacy and Data
				</h2>
				<p class="text-gray-600 dark:text-gray-400">
					Your privacy is important to us. Please review our
					<a href="/privacy" class="text-blue-600 dark:text-blue-400 hover:underline"
						>Privacy Policy</a
					>
					to understand how we collect, use, and protect your information, including our data
					sharing with AI providers.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					9. Limitation of Liability
				</h2>
				<p class="text-gray-600 dark:text-gray-400">
					BuildOS is provided "as is" without warranties of any kind, express or implied.
					To the fullest extent permitted by law, we disclaim all warranties and are not
					liable for any indirect, incidental, special, consequential, or punitive damages
					arising from your use of the service, including but not limited to data loss,
					business interruption, or loss of profits.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					10. Indemnification
				</h2>
				<p class="text-gray-600 dark:text-gray-400">
					You agree to indemnify and hold harmless BuildOS from any claims, damages,
					losses, or expenses (including legal fees) arising from your use of the service,
					your content, or your violation of these terms.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					11. Termination
				</h2>
				<p class="text-gray-600 dark:text-gray-400 mb-4">
					Either party may terminate this agreement at any time:
				</p>
				<ul class="space-y-2 text-gray-600 dark:text-gray-400 ml-6">
					<li>• You can delete your account and stop using BuildOS at any time</li>
					<li>• We may suspend or terminate accounts that violate these terms</li>
					<li>
						• Upon termination, you can export your data through the application
						interface
					</li>
					<li>
						• Paid subscriptions can be cancelled at any time with access continuing
						until the end of the billing period
					</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					12. Governing Law and Disputes
				</h2>
				<p class="text-gray-600 dark:text-gray-400">
					These terms are governed by the laws of Maryland, United States. Any disputes
					arising from these terms or your use of BuildOS will be resolved in the courts
					of Maryland. For legal notices or disputes, contact us at dj@build-os.com.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					13. Changes to Terms
				</h2>
				<p class="text-gray-600 dark:text-gray-400">
					We may update these terms as BuildOS evolves. We'll notify users of significant
					changes via email and update the "Last Updated" date below. Continued use of the
					service after changes constitutes acceptance of the new terms.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
					14. Contact Information
				</h2>
				<p class="text-gray-600 dark:text-gray-400">
					For questions about these terms or legal matters, contact us at:
					<br />
					Email:
					<a
						href="mailto:dj@build-os.com"
						class="text-blue-600 dark:text-blue-400 hover:underline">dj@build-os.com</a
					>
					<br />
					BuildOS - Glen Burnie, Maryland
				</p>
			</section>

			<!-- Last Updated -->
			<div class="border-t border-gray-200 dark:border-gray-700 pt-6">
				<p class="text-sm text-gray-500 dark:text-gray-400">Last updated: July 10, 2025</p>
			</div>
		</div>

		<!-- CTA Section -->
		<div class="mt-12 text-center">
			<div class="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white">
				<h3 class="text-2xl font-bold mb-4">Ready to start building?</h3>
				<p class="mb-6 opacity-90">
					Join BuildOS and transform how you organize your life.
				</p>
				<a
					href="/auth/register"
					class="inline-flex items-center px-6 py-3 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
				>
					Get Started
				</a>
			</div>
		</div>
	</div>
</div>
