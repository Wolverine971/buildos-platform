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

<div class="min-h-screen bg-background py-12">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="text-center mb-16">
			<div class="flex justify-center mb-6">
				<div
					class="w-16 h-16 rounded bg-card border border-border shadow-ink flex items-center justify-center tx tx-frame tx-weak"
				>
					<FileText class="w-8 h-8 text-foreground" />
				</div>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-foreground mb-4">Terms of Service</h1>
			<p class="text-xl text-muted-foreground max-w-2xl mx-auto">
				The legal terms that govern your use of BuildOS. We've tried to keep it simple and
				fair.
			</p>
		</div>

		<!-- Key Points -->
		<div class="bg-card rounded border border-border p-8 mb-12 shadow-ink tx tx-frame tx-weak">
			<h2 class="text-2xl font-bold text-foreground mb-6 flex items-center">
				<AlertTriangle class="w-6 h-6 mr-3 text-foreground" />
				Key Points
			</h2>
			<div class="grid grid-cols-1 md:grid-cols-4 gap-6">
				<div class="text-center">
					<div
						class="w-12 h-12 rounded bg-muted border border-border flex items-center justify-center mb-3 mx-auto"
					>
						<Users class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">Fair Use</h3>
					<p class="text-sm text-muted-foreground">Use BuildOS responsibly and legally</p>
				</div>
				<div class="text-center">
					<div
						class="w-12 h-12 rounded bg-muted border border-border flex items-center justify-center mb-3 mx-auto"
					>
						<Shield class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">Your Content</h3>
					<p class="text-sm text-muted-foreground">
						You own your data, we just help you organize it
					</p>
				</div>
				<div class="text-center">
					<div
						class="w-12 h-12 rounded bg-muted border border-border flex items-center justify-center mb-3 mx-auto"
					>
						<FileText class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">AI Processing</h3>
					<p class="text-sm text-muted-foreground">
						Content sent to AI providers for insights
					</p>
				</div>
				<div class="text-center">
					<div
						class="w-12 h-12 rounded bg-muted border border-border flex items-center justify-center mb-3 mx-auto"
					>
						<DollarSign class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">Subscription</h3>
					<p class="text-sm text-muted-foreground">
						Free now, subscription model coming soon
					</p>
				</div>
			</div>
		</div>

		<!-- Main Content -->
		<div
			class="bg-card rounded border border-border p-8 md:p-12 shadow-ink tx tx-grain tx-weak space-y-8"
		>
			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">1. Acceptance of Terms</h2>
				<p class="text-muted-foreground">
					By accessing and using BuildOS, you accept and agree to be bound by these terms
					of service. If you do not agree to these terms, please do not use our service.
					These terms constitute a legal agreement between you and BuildOS (operated as a
					sole proprietorship in Glen Burnie, Maryland).
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">2. Description of Service</h2>
				<p class="text-muted-foreground mb-4">
					BuildOS is a personal productivity platform that helps you organize your
					thoughts, projects, and goals. The service includes:
				</p>
				<ul class="space-y-2 text-muted-foreground ml-6">
					<li>• Brain dump capture and organization</li>
					<li>• Project and goal management</li>
					<li>• Task tracking and prioritization</li>
					<li>• AI-powered insights and recommendations</li>
					<li>• SMS notifications (optional, opt-in only)</li>
					<li>• Google Calendar integration (optional)</li>
					<li>• Data export capabilities</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">3. Pricing and Billing</h2>
				<div class="bg-accent/10 rounded-lg p-6 mb-4">
					<p class="text-accent-foreground font-medium font-medium mb-2">
						Current Status: Free Access
					</p>
					<p class="text-muted-foreground">
						BuildOS is currently free to use. We plan to introduce a subscription model
						in the near future, processed through Stripe. Free tier users will be
						limited to 3 projects when the subscription model launches.
					</p>
				</div>
				<p class="text-muted-foreground mb-4">When billing begins:</p>
				<ul class="space-y-2 text-muted-foreground ml-6">
					<li>• Subscriptions can be cancelled at any time</li>
					<li>• Billing is handled securely through Stripe</li>
					<li>• We will provide advance notice before implementing any charges</li>
					<li>• Refund policies will be established before paid subscriptions begin</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">4. User Accounts</h2>
				<p class="text-muted-foreground mb-4">
					To access BuildOS, you must create an account using Google OAuth. You are
					responsible for:
				</p>
				<ul class="space-y-2 text-muted-foreground ml-6">
					<li>• Providing accurate and complete information</li>
					<li>• Maintaining the security of your Google account</li>
					<li>• All activities that occur under your account</li>
					<li>• Being at least 13 years of age to use the service</li>
					<li>• Notifying us immediately of any unauthorized use</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					5. User Content and AI Processing
				</h2>
				<div class="bg-accent/10 rounded-lg p-6 mb-4">
					<p class="text-foreground font-medium mb-2">Your Content Belongs to You</p>
					<p class="text-muted-foreground">
						You retain all rights to the content you create in BuildOS. We claim no
						ownership over your brain dumps, projects, goals, or any other content you
						input into the service.
					</p>
				</div>

				<div class="bg-amber-500/10 rounded-lg p-6 mb-4">
					<p class="text-accent-foreground font-medium font-medium mb-2">
						AI Processing Notice
					</p>
					<p class="text-muted-foreground">
						To provide AI-powered insights, your project data, tasks, brain dumps, and
						onboarding responses are sent to third-party AI providers including OpenAI
						and Anthropic. Only content necessary for organizing and enhancing your
						productivity is processed.
					</p>
				</div>

				<p class="text-muted-foreground mb-4">
					By using BuildOS, you grant us a limited license to:
				</p>
				<ul class="space-y-2 text-muted-foreground ml-6">
					<li>• Store and process your content to provide the service</li>
					<li>• Send relevant content to AI providers for processing and insights</li>
					<li>• Display your content back to you in organized formats</li>
					<li>• Use aggregated, anonymized data to improve our features</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					6. SMS Notifications and Consent
				</h2>
				<div class="bg-accent/10 rounded-lg p-6 mb-4">
					<p class="text-accent-foreground font-medium font-medium mb-2">
						SMS Notifications Are Optional
					</p>
					<p class="text-muted-foreground">
						BuildOS offers optional SMS notifications to help you stay on track with
						your tasks and schedule. You are never required to provide your phone number
						or enable SMS notifications to use BuildOS.
					</p>
				</div>

				<p class="text-muted-foreground mb-4">
					By providing your phone number and verifying it, you explicitly consent to
					receive SMS messages from BuildOS, including:
				</p>
				<ul class="space-y-2 text-muted-foreground ml-6">
					<li>• Task reminders and due date notifications</li>
					<li>• Daily brief completion notifications</li>
					<li>• Project milestone alerts</li>
					<li>• Other productivity-related notifications you've enabled</li>
				</ul>

				<p class="text-muted-foreground mt-4 mb-4">
					<strong class="text-foreground">Important SMS Terms:</strong>
				</p>
				<ul class="space-y-2 text-muted-foreground ml-6">
					<li>
						• <strong>Opt-In Required:</strong> You must explicitly enable SMS notifications
						and verify your phone number before receiving any messages
					</li>
					<li>
						• <strong>Verification:</strong> We use Twilio Verify to confirm phone numbers
						and prevent misuse
					</li>
					<li>
						• <strong>Message Frequency:</strong> Message frequency varies based on your
						notification preferences and activity
					</li>
					<li>
						• <strong>Rates May Apply:</strong> Message and data rates from your mobile carrier
						may apply
					</li>
					<li>
						• <strong>Opt-Out Anytime:</strong> Reply STOP to any message to immediately
						unsubscribe from all SMS notifications
					</li>
					<li>• <strong>Help:</strong> Reply HELP to any message for assistance</li>
					<li>
						• <strong>No Marketing:</strong> We never send promotional or marketing messages
						via SMS
					</li>
					<li>
						• <strong>Delivery Service:</strong> SMS messages are delivered via Twilio, a
						third-party service provider
					</li>
				</ul>

				<p class="text-muted-foreground mt-4">
					By verifying your phone number, you confirm that you are the owner or authorized
					user of that phone number and consent to receive SMS notifications from BuildOS
					as described above. Your phone number will not be sold, shared, or used for any
					purpose other than sending you the notifications you've opted into.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">7. Acceptable Use</h2>
				<p class="text-muted-foreground mb-4">You agree not to use BuildOS to:</p>
				<ul class="space-y-2 text-muted-foreground ml-6">
					<li>• Violate any laws or regulations</li>
					<li>• Upload illegal, harmful, or offensive content</li>
					<li>• Infringe on others' intellectual property rights</li>
					<li>• Upload malicious code or attempt to hack the service</li>
					<li>• Spam, harass, or abuse other users or our support</li>
					<li>• Use the service for any unauthorized commercial purpose</li>
					<li>• Attempt to reverse engineer or copy the service</li>
				</ul>
				<p class="text-muted-foreground mt-4">
					We reserve the right to implement content validation and flagging systems to
					enforce these policies.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					8. Service Availability and Beta Status
				</h2>
				<p class="text-muted-foreground">
					We strive to keep BuildOS available 24/7, but we do not guarantee uninterrupted
					service. We may need to take the service down for maintenance, updates, or
					emergency repairs. As BuildOS continues to evolve, some features may change or
					be temporarily unavailable.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">9. Privacy and Data</h2>
				<p class="text-muted-foreground">
					Your privacy is important to us. Please review our
					<a href="/privacy" class="text-accent hover:text-accent/80">Privacy Policy</a>
					to understand how we collect, use, and protect your information, including our data
					sharing with AI providers.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">10. Limitation of Liability</h2>
				<p class="text-muted-foreground">
					BuildOS is provided "as is" without warranties of any kind, express or implied.
					To the fullest extent permitted by law, we disclaim all warranties and are not
					liable for any indirect, incidental, special, consequential, or punitive damages
					arising from your use of the service, including but not limited to data loss,
					business interruption, or loss of profits.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">11. Indemnification</h2>
				<p class="text-muted-foreground">
					You agree to indemnify and hold harmless BuildOS from any claims, damages,
					losses, or expenses (including legal fees) arising from your use of the service,
					your content, or your violation of these terms.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">12. Termination</h2>
				<p class="text-muted-foreground mb-4">
					Either party may terminate this agreement at any time:
				</p>
				<ul class="space-y-2 text-muted-foreground ml-6">
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
				<h2 class="text-2xl font-bold text-foreground mb-4">
					13. Governing Law and Disputes
				</h2>
				<p class="text-muted-foreground">
					These terms are governed by the laws of Maryland, United States. Any disputes
					arising from these terms or your use of BuildOS will be resolved in the courts
					of Maryland. For legal notices or disputes, contact us at dj@build-os.com.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">14. Changes to Terms</h2>
				<p class="text-muted-foreground">
					We may update these terms as BuildOS evolves. We'll notify users of significant
					changes via email and update the "Last Updated" date below. Continued use of the
					service after changes constitutes acceptance of the new terms.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">15. Contact Information</h2>
				<p class="text-muted-foreground">
					For questions about these terms or legal matters, contact us at:
					<br />
					Email:
					<a href="mailto:dj@build-os.com" class="text-accent hover:text-accent/80"
						>dj@build-os.com</a
					>
					<br />
					BuildOS - Glen Burnie, Maryland
				</p>
			</section>

			<!-- Last Updated -->
			<div class="border-t border-border pt-6">
				<p class="text-sm text-muted-foreground">Last updated: October 6, 2025</p>
			</div>
		</div>

		<!-- CTA Section -->
		<div class="mt-12 text-center">
			<div
				class="bg-accent rounded-lg shadow-ink p-8 text-accent-foreground tx tx-grain tx-weak"
			>
				<h3 class="text-2xl font-bold mb-4">Ready to start building?</h3>
				<p class="opacity-90 mb-6">
					Join BuildOS and transform how you organize your life.
				</p>
				<a
					href="/auth/register"
					class="inline-flex items-center px-6 py-3 bg-card text-accent font-semibold rounded-lg hover:bg-card/90 transition-colors"
				>
					Get Started
				</a>
			</div>
		</div>
	</div>
</div>
