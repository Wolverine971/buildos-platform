<!-- apps/web/src/routes/privacy/+page.svelte -->
<!--
	Every sentence on this page must be literally true of the code.
	docs/privacy/CLAIMS.md maps each claim to the code or setting that makes it true.
	Change a claim here → update CLAIMS.md in the same commit (and bump CURRENT_PRIVACY_VERSION).
-->
<script lang="ts">
	import { Archive, Clock, Download, EyeOff, Shield, Sparkles, Trash2 } from '$lib/icons/lucide';
	import SEOHead from '$lib/components/SEOHead.svelte';

	const retentionRows = [
		{
			what: 'Projects, documents, tasks (archived ones too), brain dumps, chats, briefs, uploads',
			keep: 'Until you delete them'
		},
		{
			what: 'Voice notes (the recording and its transcript)',
			keep: 'Until you delete them'
		},
		{
			what: 'Anything you delete',
			keep: 'Erased for good 30 days after you delete it'
		},
		{
			what: 'What the assistant looked up during a chat (for email, calendar, and web: the search terms it used, plus ids, dates, and counts)',
			keep: '30 days'
		},
		{
			what: 'Behind-the-scenes records of each chat turn',
			keep: '7 to 30 days'
		},
		{
			what: 'Records of changes the assistant made to your workspace',
			keep: '30 days (up to 180 if a change needed checking)'
		},
		{ what: 'Saved AI prompts used to debug a bad answer', keep: '14 days' },
		{
			what: 'AI usage records (model, tokens, cost; no text)',
			keep: '13 months'
		},
		{ what: 'Email-scan memory (hashed ids, relevance scores)', keep: '30 days' },
		{
			what: 'Title and time of the calendar events behind a calendar-analysis suggestion',
			keep: 'Up to 30 days'
		},
		{
			what: 'Text of the brief emails, notification emails, and texts we send you, in our database',
			keep: '30 days'
		},
		{ what: 'In-app notifications', keep: '90 days after you read or dismiss them' },
		{ what: 'Error logs', keep: '90 days' },
		{ what: 'IP address and browser on visit and email-open records', keep: '30 days' },
		{ what: 'Record of when Gmail or Calendar was accessed (no content)', keep: '180 days' },
		{ what: 'Security events', keep: '180 to 400 days' },
		{ what: 'Your data export files', keep: '7 days' },
		{
			what: 'Consent records (policy version, time, IP address, browser)',
			keep: 'Kept, even after deletion, as proof of what you agreed to'
		}
	];
</script>

<SEOHead
	title="Privacy - BuildOS | What we keep, what we don't"
	description="What BuildOS keeps, what it only reads and never stores, how AI is used with zero data retention, and how to export or delete everything."
	canonical="https://build-os.com/privacy"
	keywords="BuildOS privacy, zero data retention, Gmail privacy, data deletion, data export, AI privacy"
	author="BuildOS"
/>

<div class="min-h-screen bg-background py-12">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="text-center mb-12">
			<div class="flex justify-center mb-6">
				<div
					class="w-16 h-16 rounded-lg bg-card border border-border shadow-ink flex items-center justify-center tx tx-frame tx-weak"
				>
					<Shield class="w-8 h-8 text-foreground" />
				</div>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-foreground mb-4">Privacy</h1>
			<p class="text-xl text-muted-foreground max-w-2xl mx-auto">
				What BuildOS keeps, what it only reads, and how to take it all back.
			</p>
		</div>

		<!-- In plain words -->
		<div
			class="bg-card rounded-lg border border-border p-6 sm:p-8 mb-12 shadow-ink tx tx-frame tx-weak"
		>
			<h2 class="text-2xl font-bold text-foreground mb-6">In plain words</h2>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div>
					<div class="flex items-center gap-2 mb-2">
						<Archive class="w-5 h-5 text-foreground" />
						<h3 class="font-semibold text-foreground">We keep what you build</h3>
					</div>
					<p class="text-sm text-muted-foreground">
						Your projects, documents, tasks, chats, briefs, voice notes, and uploads are
						yours. We keep them until you delete them. Anything you delete is erased for
						good 30 days later.
					</p>
				</div>
				<div>
					<div class="flex items-center gap-2 mb-2">
						<EyeOff class="w-5 h-5 text-foreground" />
						<h3 class="font-semibold text-foreground">
							We don't keep what we only read
						</h3>
					</div>
					<p class="text-sm text-muted-foreground">
						BuildOS may scan your email so it knows what's going on, but we don't keep
						your email. The same goes for calendar events BuildOS didn't create and web
						pages it reads for you. We use them to answer you, then drop them. We keep
						only a short trace: the search terms the assistant used, plus ids, dates,
						and counts. Those expire in 30 days. The one exception is calendar analysis
						(section 5).
					</p>
				</div>
				<div>
					<div class="flex items-center gap-2 mb-2">
						<Sparkles class="w-5 h-5 text-foreground" />
						<h3 class="font-semibold text-foreground">AI with zero retention</h3>
					</div>
					<p class="text-sm text-muted-foreground">
						Every AI request requires zero data retention: the model host may not store
						your data or train on it. The one exception is voice, which OpenAI processes
						and may keep for up to 30 days. Nobody trains AI on your data, including us.
					</p>
				</div>
			</div>
			<div
				class="mt-6 pt-6 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm"
			>
				<div class="flex items-start gap-2">
					<Download class="w-4 h-4 mt-0.5 text-foreground shrink-0" />
					<p class="text-muted-foreground">
						<strong class="text-foreground">Take it with you.</strong> Download
						everything you've created from
						<a class="text-accent underline underline-offset-2" href="/profile?tab=data"
							>Settings → Your data</a
						>.
					</p>
				</div>
				<div class="flex items-start gap-2">
					<Trash2 class="w-4 h-4 mt-0.5 text-foreground shrink-0" />
					<p class="text-muted-foreground">
						<strong class="text-foreground">Leave cleanly.</strong> Delete your account in
						Settings. Access ends at once, and your data is erased within 30 days.
					</p>
				</div>
			</div>
			<p class="mt-4 text-sm text-muted-foreground">
				We don't sell your data or use your content for advertising.
			</p>
		</div>

		<!-- Main Content -->
		<div
			class="bg-card rounded-lg border border-border p-6 sm:p-8 md:p-12 shadow-ink tx tx-grain tx-weak space-y-10"
		>
			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">1. Who we are</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						BuildOS is a thinking environment for people making complex things. It is
						run by DJ Wayne as a sole proprietorship in Glen Burnie, Maryland. This
						policy covers the BuildOS website, app, emails, published pages, and related
						services. "We" means BuildOS.
					</p>
					<p>
						When you send something from BuildOS to another service, such as a connected
						AI agent, that service's own policy governs what it does next.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">2. What we collect</h2>
				<div class="prose dark:prose-invert max-w-none">
					<ul class="space-y-3 text-muted-foreground list-disc pl-6">
						<li>
							<strong class="text-foreground">Account:</strong> your name, email, username,
							sign-in method (email and password, or Google), and preferences.
						</li>
						<li>
							<strong class="text-foreground">Your workspace:</strong> everything you create
							or say to BuildOS: brain dumps, projects, goals, plans, tasks, documents,
							comments, contacts you add, chat messages, and the assistant's replies.
						</li>
						<li>
							<strong class="text-foreground">Files and voice:</strong> images and files
							you upload, text we read from images, voice recordings, and their transcripts.
						</li>
						<li>
							<strong class="text-foreground">Connected accounts (optional):</strong> Google
							Calendar and Gmail, if you connect them. Section 5 explains exactly what
							we read and keep.
						</li>
						<li>
							<strong class="text-foreground">Notifications:</strong> your phone number
							and verification status if you turn on texts, plus email and push notification
							settings.
						</li>
						<li>
							<strong class="text-foreground">Billing:</strong> plan, trial, and Stripe
							ids. Stripe handles card details; we never see or store full card numbers.
						</li>
						<li>
							<strong class="text-foreground">Consent records:</strong> which version of
							the Terms and this policy you accepted, when, how, and the IP address and
							browser you used.
						</li>
						<li>
							<strong class="text-foreground">Usage and security:</strong> sign-in activity,
							errors, security events, feature usage counts, and, with your permission,
							product analytics (section 7).
						</li>
					</ul>
					<p class="text-muted-foreground mt-4">
						Your content may mention other people. Please only add information you have
						the right to share.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">3. How we use it</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						We use your information to run BuildOS for you: organizing your thinking,
						answering in chat, writing your briefs, syncing your calendar, sending the
						notifications you chose, handling billing, keeping accounts secure, fixing
						errors, and understanding which features help.
					</p>
					<p>
						We don't sell your information. We don't use your workspace content for
						advertising. We don't train AI models on your content, and we don't let our
						AI providers train on it (section 4).
					</p>
					<p>
						Where the law asks for a legal basis, we rely on our contract with you, our
						legitimate interest in running a secure service, your consent, or a legal
						obligation, depending on the activity.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">4. AI</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						When you use an AI feature, BuildOS sends the model what it needs for that
						request: your message and the relevant parts of your workspace. That can
						include personal details you wrote.
					</p>
					<p>
						<strong class="text-foreground">Zero data retention.</strong> Every AI request
						goes through OpenRouter with two rules we set in code: the model host must offer
						zero data retention, and it may not collect your data for training. A request
						that can't be served under those rules fails instead of going elsewhere. This
						covers chat, the assistant's safety review of changes, daily briefs, search indexing,
						reading text from images, and Jev, the small model that picks tools and scores
						email relevance.
					</p>
					<p>
						<strong class="text-foreground">Which models.</strong> Today these are mainly
						open-weight DeepSeek models run by independent hosting companies, OpenAI models
						hosted on Microsoft Azure, Google Gemini on Google Cloud, and TypeSafe's Jev.
						The lineup changes as models improve. The zero-retention rule doesn't.
					</p>
					<p>
						<strong class="text-foreground">The one exception: voice.</strong> Dictation
						(your recorded audio) and spoken briefs (the text of your brief) go to OpenAI
						audio models, which don't offer zero retention. OpenAI may keep that data for
						up to 30 days to check for abuse, and it doesn't use it for training. If you'd
						rather avoid this, type instead of dictating and leave spoken briefs off.
					</p>
					<p>
						<strong class="text-foreground">Web research.</strong> When the assistant searches
						the web, the search query goes to Tavily, our search provider. BuildOS fetches
						pages from our own servers. When a page won't load that way, it asks Tavily to
						fetch the page's address.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					5. Gmail and Google Calendar
				</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						Both are optional, and they are separate connections. Connecting one doesn't
						connect the other. You can disconnect either one at any time in Settings.
						When you do, we revoke BuildOS's access at Google and delete the stored
						credentials.
					</p>
					<p>
						<strong class="text-foreground">Gmail is read-only.</strong> We ask Google for
						read-only access and nothing more. BuildOS can't send, draft, delete, archive,
						label, or mark mail, and it never downloads attachments.
					</p>
					<p>
						<strong class="text-foreground">When BuildOS reads your email.</strong> Only
						while working on something you asked for, in a chat or from the Gmail panel in
						Settings. To answer something like "did anything come in about my book?", BuildOS
						searches your inbox. Jev scores each email's subject, sender, and preview for
						relevance, under zero retention. The chat model then reads the relevant emails,
						also under zero retention, and answers you.
					</p>
					<p>
						<strong class="text-foreground">What we keep from your email.</strong> No subjects,
						senders, previews, or message text. We keep short traces:
					</p>
					<ul class="space-y-2 list-disc pl-6">
						<li>
							the search terms the assistant used, plus message and thread ids, dates,
							counts, and relevance scores, for 30 days;
						</li>
						<li>
							a short memory of which emails were already checked, stored as keyed
							hashes, for 30 days;
						</li>
						<li>
							a log of when Gmail was accessed and whether it worked, for 180 days.
						</li>
					</ul>
					<p>
						One thing to know: your chat keeps what the assistant told you. If its reply
						summarizes an email, that reply stays in your chat like any other message,
						until you delete it.
					</p>
					<p>
						<strong class="text-foreground">Google Calendar.</strong> Calendar access is
						read and write, so BuildOS can show your schedule, answer questions about it,
						and create, move, or delete the events it manages for you. We store the events
						BuildOS creates, and the links that keep them in sync. For events BuildOS didn't
						create, we never store descriptions, locations, or attendees. The record of what
						the assistant looked up keeps only event ids and times, for 30 days. When you
						run a calendar analysis, we keep only the title and time of the events behind
						each suggestion, and delete them within 30 days, or sooner if the suggestion
						is deleted. Events that don't back a suggestion are never stored.
					</p>
					<p>
						<strong class="text-foreground">Google's rules.</strong> BuildOS's use and
						transfer of information received from Google APIs adheres to the
						<a
							href="https://developers.google.com/workspace/workspace-api-user-data-developer-policy#limited-use"
							target="_blank"
							rel="noopener noreferrer"
							class="text-accent hover:text-accent/80 underline"
							>Google API Services User Data Policy</a
						>, including the Limited Use requirements. We use Google data only to
						provide the features you turned on. We don't use it for advertising, don't
						sell it, and don't use it to train or improve AI models. People don't read
						it, except with your permission, for security, to comply with the law, or in
						aggregated and anonymized form for internal operations. Because we don't
						store your email content, there is nothing for anyone at BuildOS to read
						later.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">6. Connected AI agents</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						You can connect agents such as Claude or ChatGPT through the BuildOS
						Connector or an agent key. They can reach only the projects and permissions
						you approve. With write access, they can change your BuildOS content.
					</p>
					<ul class="space-y-2 list-disc pl-6">
						<li>We store agent keys and tokens only as one-way hashes.</li>
						<li>
							We log each agent action, keeping its inputs and results for 30 days and
							the record that it happened after that.
						</li>
						<li>
							Revoking an agent stops future access. It can't pull back what the agent
							already received.
						</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">7. Analytics and cookies</h2>
				<div class="prose dark:prose-invert max-w-none">
					<ul class="space-y-3 text-muted-foreground list-disc pl-6">
						<li>
							<strong class="text-foreground">Essential storage:</strong> sign-in cookies
							and local settings, such as theme and your tracking choices.
						</li>
						<li>
							<strong class="text-foreground">Product analytics (optional):</strong> only
							if you allow it, PostHog measures which pages you visit and which features
							you use. A page view carries the page's address but never its title or your
							search text. The only link parameters it keeps are marketing campaign tags,
							such as utm_source. We identify you to PostHog by an internal id, not your
							email. Autocapture and session recording are off.
						</li>
						<li>
							<strong class="text-foreground">Operational events:</strong> BuildOS records
							server-side events such as sign-ups, onboarding, core actions, and email
							opens, using ids and counts only. These run regardless of your browser choice,
							because we use them to operate the service.
						</li>
						<li>
							<strong class="text-foreground">Visit counts:</strong> if you allow analytics,
							we count daily visits. The visit record stores your IP address and browser
							for 30 days, then those are removed.
						</li>
						<li>
							<strong class="text-foreground">Vercel measurement:</strong> our host counts
							traffic and page speed without cookies and without linking it to your account.
						</li>
						<li>
							<strong class="text-foreground">Meta Pixel (optional):</strong> only if you
							allow marketing measurement, and only on our public marketing pages, never
							inside the app. Depending on where you live, this may count as "sharing"
							for advertising.
						</li>
					</ul>
					<p class="text-muted-foreground mt-4">
						Change your choices anytime under <strong class="text-foreground"
							>Privacy choices</strong
						> in the site footer. We treat Global Privacy Control and Do Not Track signals
						as a no to optional analytics and marketing.
					</p>
					<p class="text-muted-foreground mt-4">
						We keep your content out of our server logs and error logs. Our code strips
						titles, messages, email text, and similar fields, and automated checks guard
						this.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					8. Who else handles your data
				</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">
						We share information only with the services that run BuildOS, and only what
						each one needs:
					</p>
					<ul class="space-y-2 text-muted-foreground list-disc pl-6">
						<li>
							<strong class="text-foreground">Supabase:</strong> database, sign-in, and
							file storage.
						</li>
						<li>
							<strong class="text-foreground">Vercel:</strong> hosts the website and app.
						</li>
						<li>
							<strong class="text-foreground">Railway:</strong> runs our background work,
							such as chat replies, briefs, and reading images.
						</li>
						<li>
							<strong class="text-foreground"
								>OpenRouter and its zero-retention model hosts:</strong
							>
							AI processing (section 4).
						</li>
						<li>
							<strong class="text-foreground">OpenAI (through OpenRouter):</strong> voice
							only (section 4).
						</li>
						<li>
							<strong class="text-foreground">TypeSafe (through OpenRouter):</strong> Jev,
							under zero retention.
						</li>
						<li>
							<strong class="text-foreground">Tavily:</strong> web search queries, and
							addresses of pages we can't fetch directly.
						</li>
						<li>
							<strong class="text-foreground">Google:</strong> sign-in, the Calendar and
							Gmail connections you choose, and Google Workspace, which sends our emails.
							A copy of each email we send you, including daily briefs, stays in the BuildOS
							mailbox that sent it.
						</li>
						<li>
							<strong class="text-foreground">Stripe:</strong> payments and invoices.
						</li>
						<li>
							<strong class="text-foreground">Twilio:</strong> phone verification and the
							texts you opt into.
						</li>
						<li>
							<strong class="text-foreground">PostHog:</strong> product analytics (section
							7).
						</li>
						<li>
							<strong class="text-foreground">Meta:</strong> optional marketing measurement
							(section 7).
						</li>
						<li>
							<strong class="text-foreground">Browser push services:</strong> deliver encrypted
							push notifications if you turn them on.
						</li>
					</ul>
					<p class="text-muted-foreground mt-4">
						We may also disclose information when the law requires it, to protect
						people's rights and safety, to investigate abuse, or as part of a merger or
						sale of the business. Any successor must protect your information as this
						policy does.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">
					9. Published pages and emails
				</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						If you publish a page, anyone can see, copy, and share it. To count views,
						we store a one-way hash of the visitor's IP address and browser, plus the
						referring page, for 90 days. A Do Not Track signal skips the record.
					</p>
					<p>
						Our emails can include open and click measurement. Optional emails have an
						unsubscribe link. Account, security, and billing emails still arrive.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">10. Text messages</h2>
				<div class="prose dark:prose-invert max-w-none">
					<p class="text-muted-foreground mb-4">
						Texts are optional. You must turn them on and verify your phone number
						first.
					</p>
					<ul class="space-y-2 text-muted-foreground list-disc pl-6">
						<li>
							How often depends on your settings. Message and data rates may apply.
						</li>
						<li>
							Reply STOP to opt out, or HELP for help. Once our texting provider
							reports a STOP, BuildOS turns your texts off.
						</li>
						<li>Texts are never a condition of using BuildOS.</li>
						<li>
							We share your number only with Twilio, and only to verify it and send
							your texts. We don't use it for marketing.
						</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">11. Sensitive information</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						BuildOS is a general productivity tool, not a medical records system or a
						HIPAA-covered service. If you write health, financial, or other sensitive
						details into your workspace, we handle them like the rest of your content:
						to run the features you use, and never for advertising.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">12. How long we keep things</h2>
				<div class="overflow-x-auto -mx-2 px-2">
					<table class="w-full text-sm border-collapse">
						<thead>
							<tr class="border-b border-border text-left">
								<th class="py-2 pr-4 font-semibold text-foreground">What</th>
								<th class="py-2 font-semibold text-foreground">How long</th>
							</tr>
						</thead>
						<tbody>
							{#each retentionRows as row (row.what)}
								<tr class="border-b border-border/60 align-top">
									<td class="py-2 pr-4 text-muted-foreground">{row.what}</td>
									<td class="py-2 text-foreground">{row.keep}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div
					class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4 mt-4"
				>
					<p>
						Scheduled jobs enforce these windows every day. Billing records stay with
						Stripe for as long as tax law requires.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">13. Deleting your account</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						Delete your account in Settings, or email us. <strong
							class="text-foreground">Right away</strong
						>, we:
					</p>
					<ul class="space-y-2 list-disc pl-6">
						<li>sign you out and block sign-in;</li>
						<li>
							disconnect Gmail and Google Calendar, revoke BuildOS's access at Google,
							and stop calendar sync;
						</li>
						<li>cut off any connected AI agents and agent keys;</li>
						<li>stop briefs, notifications, and texts;</li>
						<li>take down pages you published;</li>
						<li>schedule your subscription to cancel.</li>
					</ul>
					<p>
						<strong class="text-foreground">Within 30 days</strong>, we permanently
						delete your account and everything in it: projects you own, chats, files,
						voice recordings, briefs, exports, connections, and the records tied to you.
						We also delete your profile from our analytics provider.
					</p>
					<p>
						<strong class="text-foreground">What remains.</strong> If you worked in a project
						someone else owns, your contributions stay so their project isn't broken. Your
						name is replaced with "Deleted user", though your own words stay as written.
						We keep consent records, and Stripe keeps billing records as the law requires.
						Emails we already sent you stay in your inbox and in our sending mailbox. Twilio
						keeps its own delivery logs. Backups held by our database host roll off on its
						schedule. If we ever restore one, we delete your data again.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">14. Your rights</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						You can see and edit your content in BuildOS at any time. You can download
						everything you've created as a zip from
						<a class="text-accent underline underline-offset-2" href="/profile?tab=data"
							>Settings → Your data</a
						>. You can delete individual items or your whole account. You can change
						your analytics and marketing choices in the footer.
					</p>
					<p>
						Depending on where you live, you may also have the right to know what we
						hold, correct it, restrict or object to processing, opt out of targeted
						advertising, and appeal a decision. To use any of these rights, email
						<a
							href="mailto:dj@build-os.com"
							class="text-accent hover:text-accent/80 underline">dj@build-os.com</a
						> from your account's email address. We may confirm it's you first, and we'll
						answer within the time the law sets (usually 45 days). To appeal a decision,
						reply with "Privacy Appeal". We won't treat you differently for using your rights.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">15. Security</h2>
				<div class="prose dark:prose-invert max-w-none text-muted-foreground space-y-4">
					<p>
						We encrypt all traffic in transit. We encrypt Google credentials with
						AES-256 before storing them, and we store agent keys only as hashes.
						Database rules limit each account to its own data.
					</p>
					<p>
						BuildOS is run by its founder. Admin tools open account data only for
						support, security, or legal reasons. Every time an admin opens or exports
						another person's chats, it is recorded.
					</p>
					<p>
						No system is perfectly secure. If a breach affects your information, we'll
						tell you as the law requires.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">16. Children</h2>
				<p class="text-muted-foreground">
					BuildOS isn't for children under 13, and we don't knowingly collect their
					information. If you think a child has given us information, tell us and we'll
					delete it. If you're under the age of majority where you live, use BuildOS only
					with a parent or guardian's permission.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">17. Where data is processed</h2>
				<p class="text-muted-foreground">
					BuildOS is run from the United States, and your information is processed there
					and wherever our providers operate. Where the law requires, we use recognized
					safeguards for international transfers.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">18. Changes</h2>
				<p class="text-muted-foreground">
					When this policy changes, we update this page and its date. If a change would
					reduce your privacy, we'll email you before it takes effect.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-bold text-foreground mb-4">19. Contact</h2>
				<p class="text-muted-foreground">
					Questions or requests: <a
						href="mailto:dj@build-os.com"
						class="text-accent hover:text-accent/80 underline">dj@build-os.com</a
					>.<br />
					BuildOS, Glen Burnie, Maryland, United States
				</p>
			</section>

			<div class="border-t border-border pt-6 flex items-center gap-2">
				<Clock class="w-4 h-4 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">
					Effective and last updated: September 24, 2026 (version 2026-09-24)
				</p>
			</div>
		</div>
	</div>
</div>
