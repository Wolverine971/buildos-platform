<!-- apps/web/src/routes/terms/+page.svelte -->
<script lang="ts">
	import { FileText, AlertTriangle, Shield, Users, DollarSign } from 'lucide-svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
</script>

<SEOHead
	title="Terms of Service - BuildOS | Legal Terms & Conditions"
	description="BuildOS Terms of Service: account, subscription, content, AI, integration, collaboration, acceptable-use, and service terms."
	canonical="https://build-os.com/terms"
	keywords="BuildOS terms of service, user agreement, subscription terms, AI terms, content ownership, acceptable use"
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
				The legal terms governing your use of BuildOS.
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
					<h3 class="font-semibold text-foreground mb-2">Responsible Use</h3>
					<p class="text-sm text-muted-foreground">
						Use BuildOS lawfully and respect other people
					</p>
				</div>
				<div class="text-center">
					<div
						class="w-12 h-12 rounded bg-muted border border-border flex items-center justify-center mb-3 mx-auto"
					>
						<Shield class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">Your Content</h3>
					<p class="text-sm text-muted-foreground">
						You keep ownership of content you submit
					</p>
				</div>
				<div class="text-center">
					<div
						class="w-12 h-12 rounded bg-muted border border-border flex items-center justify-center mb-3 mx-auto"
					>
						<FileText class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">AI Assistance</h3>
					<p class="text-sm text-muted-foreground">
						Review AI output before relying on it
					</p>
				</div>
				<div class="text-center">
					<div
						class="w-12 h-12 rounded bg-muted border border-border flex items-center justify-center mb-3 mx-auto"
					>
						<DollarSign class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">Monthly Subscription</h3>
					<p class="text-sm text-muted-foreground">Paid plans renew until you cancel</p>
				</div>
			</div>
		</div>

		<!-- Main Content -->
		<div
			class="bg-card rounded border border-border p-8 md:p-12 shadow-ink tx tx-grain tx-weak space-y-8"
		>
			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					1. Agreement and Eligibility
				</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						These Terms of Service (<strong class="text-foreground">Terms</strong>) are
						a legal agreement between you and BuildOS, which is operated as a sole
						proprietorship based in Glen Burnie, Maryland (<strong
							class="text-foreground">BuildOS</strong
						>,
						<strong class="text-foreground">we</strong>,
						<strong class="text-foreground">us</strong>, or
						<strong class="text-foreground">our</strong>).
					</p>
					<p>
						By creating an account, clicking to accept, purchasing a subscription, or
						using the website, application, public pages, connectors, and related
						services (collectively, the <strong class="text-foreground">Service</strong
						>), you agree to these Terms and our
						<a href="/privacy" class="text-accent hover:text-accent/80 underline"
							>Privacy Policy</a
						>. If you do not agree, do not use the Service.
					</p>
					<p>
						At signup, BuildOS presents linked copies of these Terms and the Privacy
						Policy and requires an affirmative acceptance. We record the accepted policy
						versions and a server-generated timestamp as evidence of that agreement.
					</p>
					<p>
						You must be at least 13 years old. If you are under the age of legal
						majority where you live, your parent or legal guardian must review and agree
						to these Terms for you. You must be legally capable of entering this
						agreement. If you use BuildOS for an organization, you represent that you
						have authority to bind it, and “you” includes that organization.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">2. The Service</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">
						BuildOS is an AI-assisted thinking and project environment that can include:
					</p>
					<ul class="space-y-2 text-muted-foreground list-disc pl-6">
						<li>
							Brain-dump capture, documents, project memory, and structured work
							management;
						</li>
						<li>
							Projects, goals, plans, milestones, tasks, events, contacts, and
							collaboration;
						</li>
						<li>
							AI chat, recommendations, generated content, agent actions,
							transcription, and media features;
						</li>
						<li>Public pages, project sharing, comments, and invitations;</li>
						<li>
							Optional Google Calendar, third-party agent, and other integrations; and
						</li>
						<li>Optional email, push, and SMS notifications.</li>
					</ul>
					<p class="text-muted-foreground mt-4">
						Features may be labeled beta, preview, experimental, or may change as the
						Service evolves. Documentation and descriptions are informational and do not
						guarantee that every feature will always be available.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">3. Accounts and Security</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">
						You may create an account using email and password or a supported
						third-party sign-in method such as Google. You agree to:
					</p>
					<ul class="space-y-2 text-muted-foreground list-disc pl-6">
						<li>Provide accurate information and keep it current;</li>
						<li>
							Protect your password, connected accounts, agent keys, devices, and
							sessions;
						</li>
						<li>Not share credentials or allow unauthorized access;</li>
						<li>
							Accept responsibility for activity performed through your account; and
						</li>
						<li>
							Promptly notify us at dj@build-os.com of suspected unauthorized use.
						</li>
					</ul>
					<p class="text-muted-foreground mt-4">
						You are responsible for reviewing the scopes and permissions granted to
						collaborators, integrations, and connected agents. BuildOS may require
						identity, email, or phone verification to protect accounts and prevent
						abuse.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					4. Trials, Pricing, and Billing
				</h2>
				<div class="bg-accent/10 border border-accent/30 rounded-lg p-6 mb-4">
					<p class="text-foreground font-medium mb-2">Current Subscription Structure</p>
					<p class="text-muted-foreground">
						BuildOS currently offers a 14-day trial that does not require payment
						information. The trial does not automatically convert into a paid plan. To
						continue with paid access, you must separately complete Stripe checkout and
						authorize a subscription.
					</p>
				</div>
				<div class="prose dark:prose-invert max-w-none">
					<ul class="space-y-3 text-muted-foreground list-disc pl-6">
						<li>
							<strong class="text-foreground">Prices:</strong> Current prices,
							included features, and billing intervals are shown on the
							<a href="/pricing" class="text-accent hover:text-accent/80 underline"
								>Pricing page</a
							> and at checkout. Applicable taxes may be added.
						</li>
						<li>
							<strong class="text-foreground">Automatic renewal:</strong> Once started,
							a paid subscription renews for successive monthly periods until cancelled.
							You authorize Stripe to charge the payment method on file at the beginning
							of each billing period.
						</li>
						<li>
							<strong class="text-foreground">Cancellation:</strong> You may cancel at
							any time through the subscription-management portal or by contacting us.
							Cancellation takes effect at the end of the current paid period, and you
							retain paid access until then.
						</li>
						<li>
							<strong class="text-foreground">Failed payments and access:</strong> If a
							trial expires or payment fails, BuildOS may provide a limited read-only grace
							period and then restrict access until payment is completed. The current grace
							period, if any, is shown on the Pricing page or in the application.
						</li>
						<li>
							<strong class="text-foreground">Refunds:</strong> Except where required by
							law, payments are non-refundable and we do not provide credits for partial
							billing periods. We may grant a refund or credit in our discretion without
							creating an obligation to do so in another case.
						</li>
						<li>
							<strong class="text-foreground">Price changes:</strong> We may change prices
							for future billing periods. We will provide advance notice as required by
							law, and the change will apply no earlier than your next renewal after the
							notice period.
						</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					5. Your Content and License to BuildOS
				</h2>
				<div class="bg-accent/10 rounded-lg p-6 mb-4">
					<p class="text-foreground font-medium mb-2">Your Content Remains Yours</p>
					<p class="text-muted-foreground">
						As between you and BuildOS, you retain ownership of content you submit to
						the Service (<strong class="text-foreground">Your Content</strong>). BuildOS
						does not claim ownership of your private projects, notes, documents, or
						other original content.
					</p>
				</div>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						You grant BuildOS a worldwide, non-exclusive, royalty-free license to host,
						copy, process, transmit, display, modify solely for formatting or technical
						operation, and otherwise use Your Content only as needed to provide, secure,
						support, and improve the Service, comply with your instructions, and satisfy
						legal obligations. This license lasts while the content is stored in the
						Service and for any lawful retention period described in the Privacy Policy.
					</p>
					<p>
						You represent that you own Your Content or have all permissions needed to
						submit it and authorize the processing described in these Terms. You are
						responsible for Your Content and for ensuring that it does not violate law,
						these Terms, intellectual-property rights, privacy rights, confidentiality
						obligations, or another person's rights.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">6. AI Features and Outputs</h2>
				<div class="bg-warning/10 rounded-lg p-6 mb-4">
					<p class="text-foreground font-medium mb-2">AI Can Be Wrong</p>
					<p class="text-muted-foreground">
						AI-generated content may be incomplete, inaccurate, offensive, outdated, or
						similar to content generated for someone else. Always review outputs and
						proposed agent actions before relying on them.
					</p>
				</div>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						BuildOS sends prompts and relevant context to third-party AI, model-routing,
						transcription, media-generation, or search providers as described in the
						Privacy Policy. You authorize that processing when you use the applicable
						feature.
					</p>
					<p>
						Subject to applicable law and third-party rights, BuildOS does not claim
						ownership of output generated for you. Because machine-generated content may
						not qualify for intellectual-property protection and may not be unique, we
						do not guarantee ownership, exclusivity, or non-infringement of any output.
					</p>
					<p>
						BuildOS is a productivity tool, not a substitute for professional judgment.
						It does not provide legal, medical, financial, tax, accounting, employment,
						safety, or other professional advice. Do not use AI output as the sole basis
						for high-impact decisions, emergency action, or decisions affecting another
						person's rights or access to essential services.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					7. Collaboration and Public Content
				</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						When you invite a collaborator, you authorize BuildOS to share the selected
						project and activity with that person according to the permissions you
						grant. Collaborators may view, copy, export, comment on, or change content
						depending on their role. You are responsible for selecting appropriate
						people and permissions.
					</p>
					<p>
						If you publish content or create a public page, you grant BuildOS a license
						to host, display, distribute, and technically reproduce that content for
						public access until you unpublish it or the account is terminated. Public
						content may be copied, indexed, cached, or redistributed by others, and
						removing it from BuildOS may not remove copies outside our control.
					</p>
					<p>
						We may review, restrict, unpublish, or remove content that we reasonably
						believe violates these Terms, exposes private or illegal material, threatens
						safety or security, or creates legal risk. We are not obligated to monitor
						all user content.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					8. Connected Services and Agents
				</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						The Service may let you connect Google services, external AI clients, agent
						keys, OAuth applications, or other third-party services. You authorize
						BuildOS to exchange information with a connected service within the scopes
						and permissions you approve. If you grant write access, a connected agent
						may create, change, or delete content on your behalf.
					</p>
					<p>
						Third-party services are governed by their own terms and privacy policies.
						BuildOS is not responsible for their availability, security, output, or use
						of information. You are responsible for reviewing permissions, supervising
						agent actions, and revoking access you no longer want. Revocation does not
						undo actions already completed or delete data already received by the third
						party.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					9. SMS and Other Notifications
				</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						SMS is optional and is not a condition of purchase. By enabling SMS and
						verifying a phone number, you confirm that you are the subscriber or
						authorized user and consent to receive the productivity notifications you
						select. Message frequency varies; message and data rates may apply. Reply
						STOP to opt out and HELP for assistance. Carriers are not liable for delayed
						or undelivered messages.
					</p>
					<p>
						BuildOS uses Twilio for verification and delivery. We do not send
						third-party promotional marketing by SMS. You may manage optional email and
						push notifications in the Service or through the unsubscribe mechanism
						provided in a message, but we may still send transactional, security,
						billing, or legal notices.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">10. Acceptable Use</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">You may not use the Service to:</p>
					<ul class="space-y-2 text-muted-foreground list-disc pl-6">
						<li>
							Violate law or another person's intellectual-property, privacy,
							publicity, contractual, or other rights;
						</li>
						<li>
							Create, upload, distribute, or facilitate illegal, fraudulent,
							exploitative, abusive, threatening, or malicious content or activity;
						</li>
						<li>
							Harass people, send spam, impersonate others, mislead recipients, or
							collect information without authorization;
						</li>
						<li>
							Upload malware, probe or bypass security, disrupt the Service, or access
							accounts or systems without permission;
						</li>
						<li>
							Use automated means that impose an unreasonable load, scrape protected
							areas, or circumvent rate limits or access controls;
						</li>
						<li>
							Reverse engineer or copy non-public portions of the Service except where
							law expressly permits it;
						</li>
						<li>
							Use BuildOS for emergency response, weapons development, unlawful
							surveillance, or high-impact automated decisions without legally
							required human review and safeguards;
						</li>
						<li>
							Use BuildOS as a regulated medical-records system or submit protected
							health information for a HIPAA-regulated workflow; or
						</li>
						<li>Help another person do any of the above.</li>
					</ul>
					<p class="text-muted-foreground mt-4">
						We may use automated and human review to investigate suspected violations
						and may apply usage, storage, or rate limits to protect the Service.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					11. BuildOS Intellectual Property and Feedback
				</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						The Service, including its software, design, branding, documentation, and
						non-user content, is owned by BuildOS or its licensors and is protected by
						law. Subject to these Terms, BuildOS gives you a limited, non-exclusive,
						non-transferable, revocable right to use the Service for its intended
						purpose during your authorized access.
					</p>
					<p>
						If you submit feedback or suggestions, you grant BuildOS a perpetual,
						irrevocable, worldwide, royalty-free right to use them without restriction
						or compensation. This does not grant BuildOS ownership of Your Content.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">12. Privacy</h2>
				<p class="text-muted-foreground">
					Our <a href="/privacy" class="text-accent hover:text-accent/80 underline"
						>Privacy Policy</a
					>
					explains how BuildOS collects, uses, shares, retains, and protects personal information,
					including information processed by AI providers, integrations, analytics, billing,
					and communications services.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					13. Service Changes and Availability
				</h2>
				<p class="text-muted-foreground">
					We work to keep BuildOS available, but we do not guarantee uninterrupted,
					secure, or error-free operation. We may add, modify, limit, suspend, or
					discontinue features for maintenance, security, legal, provider, or product
					reasons. If we discontinue the paid Service as a whole, we will provide
					reasonable notice and any refund required by law. You are responsible for
					keeping copies of content you cannot afford to lose.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					14. Suspension, Cancellation, and Account Deletion
				</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						You may stop using BuildOS or cancel a paid subscription at any time.
						Cancelling a subscription stops future renewals but does not itself delete
						your account or content. You may separately submit an account-deletion
						request through the Service or by email.
					</p>
					<p>
						An account-deletion request is irreversible. BuildOS disables account access
						immediately, begins cancellation of subscription renewal, and permanently
						deletes account data from active systems within 30 days. Projects you solely
						own are deleted. Contributions to a project owned by someone else may remain
						under a de-identified “Deleted user” actor so the other person's workspace
						is not damaged. Limited backups and records retained for legal, security,
						billing, consent, or fraud-prevention purposes are handled as described in
						the Privacy Policy. Before requesting deletion, save any content you want to
						keep and contact us if you need assistance obtaining a copy; not all data
						may currently be available through a self-service export.
					</p>
					<p>
						We may suspend, restrict, or terminate access immediately if you materially
						breach these Terms, create security or legal risk, fail to pay amounts due,
						or use the Service in a manner that could harm BuildOS, our providers, or
						other users. Where reasonable, we will provide notice and an opportunity to
						address the issue.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">15. Disclaimers</h2>
				<p class="text-muted-foreground uppercase">
					To the fullest extent permitted by law, the Service and all outputs are provided
					“as is” and “as available.” BuildOS disclaims all express, implied, and
					statutory warranties, including merchantability, fitness for a particular
					purpose, title, non-infringement, accuracy, and any warranty arising from course
					of dealing or usage of trade. BuildOS does not warrant that the Service or AI
					output will be accurate, complete, secure, uninterrupted, or free of harmful
					components. Some jurisdictions do not allow certain disclaimers, so some of this
					section may not apply to you.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">16. Limitation of Liability</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p class="uppercase">
						To the fullest extent permitted by law, BuildOS and its service providers
						will not be liable for indirect, incidental, special, consequential,
						exemplary, or punitive damages; loss of profits, revenue, business,
						goodwill, use, or data; or the cost of a substitute service, arising from or
						related to the Service or these Terms, even if advised that such damages
						were possible.
					</p>
					<p class="uppercase">
						To the fullest extent permitted by law, BuildOS's total liability for all
						claims arising from or related to the Service or these Terms will not exceed
						the greater of $100 or the amount you paid to BuildOS during the 12 months
						before the event giving rise to the claim.
					</p>
					<p>
						These limits do not apply where prohibited by law or to liability that
						cannot legally be limited. The limitations reflect the allocation of risk
						between you and BuildOS.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">17. Indemnification</h2>
				<p class="text-muted-foreground">
					To the extent permitted by law, you agree to defend, indemnify, and hold
					harmless BuildOS from third-party claims, liabilities, damages, losses, and
					reasonable legal fees arising from Your Content, your misuse of the Service,
					your violation of these Terms or law, or your infringement of another person's
					rights. BuildOS will give you reasonable notice of a covered claim and may
					control its defense and settlement. You may not settle a claim in a way that
					admits liability for or imposes obligations on BuildOS without our written
					consent.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					18. Governing Law and Disputes
				</h2>
				<p class="text-muted-foreground">
					These Terms are governed by the laws of Maryland, without regard to
					conflict-of-law principles. Except where applicable consumer law permits
					otherwise, disputes arising from these Terms or the Service will be brought in
					the state or federal courts located in Maryland, and you and BuildOS consent to
					their jurisdiction. Before filing a claim, please contact dj@build-os.com and
					provide a short description so we can try to resolve it.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">19. Changes to These Terms</h2>
				<p class="text-muted-foreground">
					We may update these Terms as the Service or applicable requirements change. We
					will post the revised Terms, update the date below, and provide additional
					notice of material changes as required by law. Changes apply prospectively. If a
					material change requires your consent, we will request it. Otherwise, continued
					use after the effective date of revised Terms constitutes acceptance. If you do
					not agree, you must stop using the Service and may cancel your subscription.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">20. General Terms</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						These Terms and the Privacy Policy are the entire agreement between you and
						BuildOS about the Service and supersede prior agreements about it. If a
						provision is found unenforceable, it will be limited to the minimum extent
						necessary and the remaining provisions will remain effective. Failure to
						enforce a provision is not a waiver.
					</p>
					<p>
						You may not assign these Terms without our written consent. BuildOS may
						assign them in connection with a reorganization, financing, merger,
						acquisition, or sale of the Service. BuildOS is not liable for delay or
						failure caused by circumstances beyond our reasonable control. Section
						headings are for convenience only.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">21. Contact</h2>
				<p class="text-muted-foreground">
					For support, legal notices, billing questions, or questions about these Terms:<br
					/>
					Email:
					<a
						href="mailto:dj@build-os.com"
						class="text-accent hover:text-accent/80 underline">dj@build-os.com</a
					><br />
					BuildOS — Glen Burnie, Maryland, United States
				</p>
			</section>

			<!-- Last Updated -->
			<div class="border-t border-border pt-6">
				<p class="text-sm text-muted-foreground">
					Effective and last updated: July 16, 2026 (version 2026-07-16)
				</p>
			</div>
		</div>

		<!-- CTA Section -->
		<div class="mt-12 text-center">
			<div
				class="bg-accent rounded-lg shadow-ink p-8 text-accent-foreground tx tx-grain tx-weak"
			>
				<h3 class="text-2xl font-bold mb-4">Ready to start building?</h3>
				<p class="opacity-90 mb-6">
					Start with messy project input and turn it into structured work.
				</p>
				<a
					href="/auth/register"
					class="inline-flex items-center px-6 py-3 bg-card text-accent font-semibold rounded-lg hover:bg-card/90 transition-colors"
				>
					Start in chat
				</a>
			</div>
		</div>
	</div>
</div>
