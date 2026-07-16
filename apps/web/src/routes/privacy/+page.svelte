<!-- apps/web/src/routes/privacy/+page.svelte -->
<script lang="ts">
	import { Download, Trash2, Shield, Eye, Lock, ExternalLink } from 'lucide-svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
</script>

<SEOHead
	title="Privacy Policy - BuildOS | Data Protection & User Privacy"
	description="BuildOS privacy policy: what data we collect, how AI and integrations process it, our analytics practices, retention, and your privacy choices."
	canonical="https://build-os.com/privacy"
	keywords="BuildOS privacy policy, data protection, user privacy, AI processing, analytics choices, project data security, OAuth connectors, data rights"
	author="BuildOS"
/>

<div class="min-h-screen bg-background py-12">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="text-center mb-16">
			<div class="flex justify-center mb-6">
				<div
					class="w-16 h-16 rounded-lg bg-card border border-border shadow-ink flex items-center justify-center tx tx-frame tx-weak"
				>
					<Shield class="w-8 h-8 text-foreground" />
				</div>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-foreground mb-4">Privacy Policy</h1>
			<p class="text-xl text-muted-foreground max-w-2xl mx-auto">
				How BuildOS collects, uses, shares, and protects personal information.
			</p>
		</div>

		<!-- Quick Summary -->
		<div
			class="bg-card rounded-lg border border-border p-8 mb-12 shadow-ink tx tx-frame tx-weak"
		>
			<h2 class="text-2xl font-bold text-foreground mb-6 flex items-center">
				<Eye class="w-6 h-6 mr-3 text-foreground" />
				Privacy at a Glance
			</h2>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div class="text-center">
					<div
						class="w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center mb-3 mx-auto"
					>
						<Download class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">Access and Control</h3>
					<p class="text-sm text-muted-foreground">
						Review your content and ask us for access, correction, a copy, or deletion
					</p>
				</div>
				<div class="text-center">
					<div
						class="w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center mb-3 mx-auto"
					>
						<Trash2 class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">Deletion Requests</h3>
					<p class="text-sm text-muted-foreground">
						Account access ends immediately and active-system data is deleted within 30
						days
					</p>
				</div>
				<div class="text-center">
					<div
						class="w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center mb-3 mx-auto"
					>
						<Lock class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">No Monetary Sales</h3>
					<p class="text-sm text-muted-foreground">
						We do not sell personal information for money, and optional measurement is
						controllable
					</p>
				</div>
			</div>
		</div>

		<!-- Main Content -->
		<div
			class="bg-card rounded-lg border border-border p-8 md:p-12 shadow-ink tx tx-grain tx-weak space-y-8"
		>
			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">1. Scope and Who We Are</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						This Privacy Policy applies to the BuildOS website, application,
						communications, public pages, and related services (the <strong
							class="text-foreground">Service</strong
						>). BuildOS is operated as a sole proprietorship based in Glen Burnie,
						Maryland. In this policy, “BuildOS,” “we,” “us,” and “our” refer to the
						operator of the Service.
					</p>
					<p>
						This policy does not govern a third-party service or connected agent after
						data leaves BuildOS at your direction. Those services apply their own terms
						and privacy policies.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">2. Information We Collect</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">
						The information we collect depends on the features you use and the choices
						you make.
					</p>
					<ul class="space-y-3 text-muted-foreground list-disc pl-6">
						<li>
							<strong class="text-foreground">Account and profile information:</strong
							> Your name, email address, username, profile details, authentication identifiers,
							and account preferences. You may register with email and password or use
							Google sign-in.
						</li>
						<li>
							<strong class="text-foreground">Workspace and content data:</strong> Brain
							dumps, projects, goals, plans, milestones, tasks, notes, documents, comments,
							contacts, calendar information, onboarding responses, prompts, chat messages,
							agent instructions, and other content you create or submit.
						</li>
						<li>
							<strong class="text-foreground">Files and media:</strong> Images, documents,
							attachments, voice recordings, transcripts, extracted text, file metadata,
							and generated audio or images when you use those features.
						</li>
						<li>
							<strong class="text-foreground"
								>Collaboration and publishing data:</strong
							>
							Project-member information, invitee email addresses, permissions, activity
							records, public-page content, author information, and interactions with shared
							or public pages.
						</li>
						<li>
							<strong class="text-foreground">Calendar and integration data:</strong> Events,
							attendees, scheduling information, connector grants, approved scopes, integration
							settings, and the information returned by services you choose to connect.
						</li>
						<li>
							<strong class="text-foreground">Phone and notification data:</strong> Your
							phone number, verification status, notification preferences, push-subscription
							information, and delivery or response records when you enable SMS, email,
							or browser notifications.
						</li>
						<li>
							<strong class="text-foreground">Billing data:</strong> Subscription status,
							plan, trial dates, Stripe customer and subscription identifiers, invoices,
							and payment status. Stripe processes payment-card details; BuildOS does not
							store full card numbers.
						</li>
						<li>
							<strong class="text-foreground">Consent and agreement records:</strong> The
							versions of the Terms and Privacy Policy you accepted, the server-recorded
							acceptance time, acceptance method, IP address, and user agent;
						</li>
						<li>
							<strong class="text-foreground">AI and agent activity:</strong> Prompts,
							outputs, model and tool-call metadata, connected-agent scopes, hashed API
							credentials, revocation state, audit logs, and records of proposed or completed
							agent actions.
						</li>
						<li>
							<strong class="text-foreground"
								>Device, security, and usage data:</strong
							> IP address, browser and device information, referring pages, timestamps,
							session and login activity, error and performance data, security events,
							feature interactions, and identifiers used for analytics or fraud prevention.
						</li>
						<li>
							<strong class="text-foreground">Communication engagement:</strong> Messages
							you send us and, where enabled, whether BuildOS emails were delivered, opened,
							or clicked. Open information can be imprecise because some email applications
							preload images.
						</li>
					</ul>
					<p class="text-muted-foreground mt-4">
						We receive information directly from you, automatically from your device and
						use of the Service, from collaborators, and from services you choose to
						connect. Content may include personal information about other people. You
						are responsible for having the right to provide that information.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">3. How We Use Information</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">We use information to:</p>
					<ul class="space-y-2 text-muted-foreground list-disc pl-6">
						<li>Provide, personalize, maintain, and secure the Service;</li>
						<li>Organize your content and generate AI-assisted outputs;</li>
						<li>
							Process files, voice notes, searches, integrations, and connected-agent
							requests;
						</li>
						<li>Manage subscriptions, trials, payments, and account access;</li>
						<li>
							Send service, security, collaboration, and opted-in notification
							messages;
						</li>
						<li>
							Measure reliability, diagnose errors, prevent abuse, and support users;
						</li>
						<li>Understand product adoption and improve BuildOS; and</li>
						<li>Comply with law and enforce our Terms of Service.</li>
					</ul>
					<p class="text-muted-foreground mt-4">
						Where applicable law requires a legal basis, we rely on performance of our
						contract, our legitimate interests in operating and securing the Service,
						your consent, or compliance with legal obligations, depending on the
						activity.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">4. AI Processing</h2>
				<div class="bg-warning/10 rounded-lg p-6 mb-4">
					<div class="flex items-start">
						<ExternalLink class="w-5 h-5 text-warning mr-3 mt-0.5 flex-shrink-0" />
						<div>
							<h3 class="font-semibold text-foreground mb-2">
								Information Sent for AI Tasks
							</h3>
							<p class="text-sm text-muted-foreground">
								When you use an AI feature, BuildOS sends the prompt and relevant
								workspace context to an AI provider. That context may contain
								personal or sensitive information that you included in your content.
								Outputs and related metadata may be stored in your workspace or logs
								so the feature can operate and be reviewed.
							</p>
						</div>
					</div>
				</div>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						AI processing may be performed by OpenRouter and model providers available
						through its routing service, by OpenAI, or by other providers selected for a
						particular AI, transcription, generation, or search function. Available
						models and providers may change as BuildOS improves the Service.
					</p>
					<p>
						Providers process submitted data under their own agreements and privacy
						practices. For requests routed through OpenRouter, BuildOS sends a
						provider-routing instruction that denies data collection. Private text,
						structured-output, and tool routes also require Zero Data Retention by
						default. Some speech or media models do not support strict zero retention;
						those routes still deny data collection, and we may use a direct provider or
						local processing instead. We seek to limit the context sent to what is
						relevant to the requested feature, but you should not submit information
						that you are not authorized to share with BuildOS and its service providers.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					5. Connected Agents and Third-Party Integrations
				</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">
						You may connect Google services, third-party AI tools, agent clients, or
						custom software through OAuth, agent keys, the BuildOS Connector, or similar
						flows.
					</p>
					<ul class="space-y-3 text-muted-foreground list-disc pl-6">
						<li>
							Connected tools receive data within the projects, scopes, and
							permissions you approve. If you grant write access, they may create or
							change BuildOS content on your behalf.
						</li>
						<li>
							We store grant metadata, scopes, encrypted OAuth credentials where
							required, hashed agent credentials, revocation records, and tool-call
							audit logs to authenticate and secure requests.
						</li>
						<li>
							When you direct BuildOS to send information to a connected tool, that
							third party controls its own subsequent processing. Revoking access
							blocks future BuildOS requests but does not retrieve copies already
							received by the third party.
						</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					6. Service Providers and Other Disclosures
				</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">
						We disclose information as needed to operate the Service, including to these
						categories:
					</p>
					<ul class="space-y-3 text-muted-foreground list-disc pl-6">
						<li>
							<strong class="text-foreground">Supabase:</strong> Database, authentication,
							and file storage;
						</li>
						<li>
							<strong class="text-foreground">Vercel:</strong> Hosting, performance, and
							aggregate web measurement;
						</li>
						<li>
							<strong class="text-foreground">Stripe:</strong> Checkout, subscriptions,
							invoicing, and payment processing;
						</li>
						<li>
							<strong class="text-foreground">Google:</strong> Sign-in and user-enabled
							Calendar or other Google integrations;
						</li>
						<li>
							<strong class="text-foreground">Twilio:</strong> Phone verification and opted-in
							SMS delivery;
						</li>
						<li>
							<strong class="text-foreground">Email and push providers:</strong> Message
							delivery, suppression, and delivery diagnostics;
						</li>
						<li>
							<strong class="text-foreground">PostHog:</strong> Operational and optional
							browser-based product analytics;
						</li>
						<li>
							<strong class="text-foreground">Meta:</strong> Optional marketing attribution
							when you enable marketing measurement;
						</li>
						<li>
							<strong class="text-foreground"
								>AI, transcription, media, and web-search providers:</strong
							> Processing requested features; and
						</li>
						<li>
							<strong class="text-foreground"
								>Connected services and collaborators:</strong
							> At your direction or as needed to provide sharing features.
						</li>
					</ul>
					<p class="text-muted-foreground mt-4">
						We may also disclose information when required by law, to protect rights and
						safety, to investigate fraud or abuse, or as part of a merger, financing,
						acquisition, bankruptcy, or sale of assets. We will require a successor to
						handle personal information consistently with applicable law.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					7. Analytics, Cookies, and Tracking Choices
				</h2>
				<div class="prose dark:prose-invert max-w-none">
					<ul class="space-y-3 text-muted-foreground list-disc pl-6">
						<li>
							<strong class="text-foreground">Essential storage:</strong> Authentication
							cookies and local preferences support sign-in, security, theme, and your
							tracking choices.
						</li>
						<li>
							<strong class="text-foreground">Operational analytics:</strong> BuildOS records
							server-side account and feature events, such as signup, onboarding, core
							actions, and notification delivery. We use these records to operate, secure,
							troubleshoot, and understand adoption of the Service. Your browser tracking
							choice does not disable these server-side operational records.
						</li>
						<li>
							<strong class="text-foreground">Aggregate web measurement:</strong> Vercel
							may collect cookie-free traffic and performance measurements that are not
							intentionally connected to your BuildOS user profile.
						</li>
						<li>
							<strong class="text-foreground">Optional product analytics:</strong> If you
							allow it, PostHog browser analytics stores state locally and measures page
							views and product interactions. Broad autocapture and session recording are
							disabled.
						</li>
						<li>
							<strong class="text-foreground">Optional marketing measurement:</strong>
							Meta Pixel loads only after you allow marketing measurement. Depending on
							applicable law, this disclosure to Meta may be considered “sharing” for targeted
							or cross-context advertising even though BuildOS does not sell information
							for money.
						</li>
					</ul>
					<p class="text-muted-foreground mt-4">
						You can change or withdraw optional browser analytics and marketing choices
						through
						<strong class="text-foreground">Privacy choices</strong> in the site footer.
						We treat a supported Global Privacy Control signal as an opt-out from optional
						browser analytics and marketing measurement. We also use browser Do Not Track
						signals to keep those optional tools off.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					8. Public Pages and Communications
				</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						If you publish a page, the content and author information you designate as
						public can be viewed, copied, indexed, and redistributed by others. BuildOS
						may record a public-page view using a one-way hash derived from IP address
						and browser information, along with referral and timing data, to count views
						and prevent duplicate or abusive traffic. A supported browser Do Not Track
						signal prevents that view record.
					</p>
					<p>
						Service and lifecycle emails may contain open or click measurement used to
						understand delivery and engagement. You may unsubscribe from optional email
						using the link in the message. We may still send account, security, billing,
						or other transactional messages needed to provide the Service.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">9. SMS Notifications</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">
						SMS notifications are optional. You must enable them and verify a phone
						number before BuildOS sends productivity-related text messages.
					</p>
					<ul class="space-y-2 text-muted-foreground list-disc pl-6">
						<li>Message frequency varies based on your settings and activity.</li>
						<li>Message and data rates may apply.</li>
						<li>Reply STOP to opt out and HELP for assistance.</li>
						<li>SMS consent is not a condition of purchasing or using BuildOS.</li>
						<li>We do not use opted-in SMS data for third-party marketing.</li>
					</ul>
					<p class="text-muted-foreground mt-4">
						We disclose your phone number and delivery information to Twilio only as
						needed to verify the number, deliver messages, prevent abuse, and support
						the messaging program.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">10. Google API Data</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						BuildOS's use and transfer of information received from Google APIs will
						adhere to the <a
							href="https://developers.google.com/workspace/workspace-api-user-data-developer-policy#limited-use"
							target="_blank"
							rel="noopener noreferrer"
							class="text-accent hover:text-accent/80 underline"
							>Google API Services User Data Policy</a
						>, including the Limited Use requirements.
					</p>
					<p>
						We use Google data only to provide the integration you enable, maintain
						security, and comply with law. We do not use Google Workspace API data for
						advertising, sell it, or allow humans to read it except with your
						permission, for security or support, when legally required, or when the data
						has been aggregated and anonymized for internal operations in a manner
						permitted by Google policy.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					11. Sensitive and Consumer Health Information
				</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						BuildOS is a general productivity service, not a healthcare provider,
						medical records system, or HIPAA-compliant service. Do not use BuildOS for
						emergency care, clinical decisions, or protected health information
						maintained for a regulated healthcare workflow.
					</p>
					<p>
						You may choose to include health, financial, location, or other sensitive
						information in free-form content. We process that information only as part
						of the content and features you request, for security, or as required by
						law. We do not use the substance of your private workspace content to target
						advertising or build an advertising health profile.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">12. Retention and Deletion</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						We retain account information and workspace content while your account is
						active and as needed to provide requested features. Retention varies by
						record: transient AI diagnostic artifacts may be kept for up to 14 days, and
						certain security-event records may be kept for approximately 180 to 400 days
						depending on their risk level. Billing, consent, audit, suppression, and
						legal records may be retained longer when needed for compliance, dispute
						resolution, fraud prevention, or enforcement.
					</p>
					<p>
						You may delete individual items where the feature is available or request
						account deletion in the application or by emailing us. When you request
						account deletion, we disable account access immediately, begin cancellation
						of subscription renewal, and permanently delete account data from active
						systems within 30 days. This includes projects you solely own, user-scoped
						records, stored files, integration credentials, and the authentication
						account.
					</p>
					<p>
						If you contributed to a project owned by someone else, the contribution may
						remain so deletion does not damage that person's workspace, but your actor
						identity is replaced with “Deleted user” and direct identifiers are removed.
						Limited consent, security, billing, suppression, and legal records may be
						retained where reasonably necessary for compliance, dispute resolution,
						fraud prevention, or enforcement.
					</p>
					<p>
						Encrypted backups are not part of normal product access and may retain a
						limited copy until the applicable backup is overwritten under the hosting
						provider's rotation schedule. If a backup is restored for disaster recovery,
						we will reapply completed deletion requests. We may retain aggregate or
						de-identified information that can no longer reasonably identify you.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">13. Your Privacy Rights</h2>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
					<div class="bg-accent/10 rounded-lg p-6">
						<div class="flex items-center mb-3">
							<Download class="w-5 h-5 text-accent mr-2" />
							<h3 class="font-semibold text-foreground">Access and Correction</h3>
						</div>
						<p class="text-sm text-muted-foreground">
							Review and update available account or workspace information, or ask us
							for access, correction, or a portable copy where required by law.
						</p>
					</div>
					<div class="bg-destructive/10 rounded-lg p-6">
						<div class="flex items-center mb-3">
							<Trash2 class="w-5 h-5 text-destructive mr-2" />
							<h3 class="font-semibold text-foreground">Deletion and Opt-Out</h3>
						</div>
						<p class="text-sm text-muted-foreground">
							Request deletion, withdraw optional consent, or opt out of covered
							targeted-advertising, sale, sharing, or profiling activities where
							applicable.
						</p>
					</div>
				</div>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						Depending on where you live, you may also have rights to know the categories
						and specific pieces of information collected, receive a list of certain
						third parties, restrict sensitive-data processing, object to processing, or
						appeal a denied request. We will not discriminate against you for exercising
						a privacy right.
					</p>
					<p>
						Submit a request to <a
							href="mailto:dj@build-os.com"
							class="text-accent hover:text-accent/80 underline">dj@build-os.com</a
						>. State the right you want to exercise and the email associated with your
						account. We may verify your identity and authority before acting. If we deny
						a request, reply with “Privacy Appeal” and your reason for appealing. We
						respond within the period required by applicable law, generally 45 days
						where a state privacy law applies.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">14. Security</h2>
				<p class="text-muted-foreground">
					We use administrative, technical, and organizational safeguards designed to
					protect personal information, including encrypted transport, access controls,
					secure authentication, credential hashing or encryption where appropriate, and
					security monitoring. No system is completely secure, and we cannot guarantee
					that unauthorized access, loss, or misuse will never occur.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">15. Children</h2>
				<p class="text-muted-foreground">
					BuildOS is not directed to children under 13, and we do not knowingly collect
					personal information from a child under 13. If you believe a child under 13 has
					provided personal information, contact us so we can investigate and delete it.
					If you are under the age of majority where you live, use BuildOS only with
					permission from a parent or legal guardian.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					16. International Data Transfers
				</h2>
				<p class="text-muted-foreground">
					BuildOS is operated from the United States. If you use the Service from another
					country, your information may be processed in the United States and other
					countries where our providers operate. Those countries may have different
					data-protection laws. Where required, we use recognized safeguards for
					international transfers.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">17. Changes to This Policy</h2>
				<p class="text-muted-foreground">
					We may update this policy as BuildOS, our providers, or applicable requirements
					change. We will post the updated policy and revise the date below. If a change
					materially affects how we use personal information, we will provide additional
					notice as required, such as an in-app message or email. If consent is required
					for a new use, we will request it.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">18. Contact Us</h2>
				<p class="text-muted-foreground">
					For privacy questions or requests, email <a
						href="mailto:dj@build-os.com"
						class="text-accent hover:text-accent/80 underline">dj@build-os.com</a
					>.<br />
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
			<div class="bg-accent rounded-lg shadow-ink p-8 text-accent-foreground">
				<h3 class="text-2xl font-bold mb-4">Questions about your data?</h3>
				<p class="mb-6 opacity-90">We're here to help. Reach out anytime.</p>
				<a
					href="mailto:dj@build-os.com"
					class="inline-flex items-center px-6 py-3 bg-card text-accent font-semibold rounded-lg hover:bg-card/90 transition-colors"
				>
					Contact Us
				</a>
			</div>
		</div>
	</div>
</div>
