<!-- apps/web/src/routes/investors/+page.svelte -->
<script lang="ts">
	import {
		ArrowRight,
		BookOpen,
		Brain,
		GitBranch,
		Mail,
		Network,
		Share2,
		Target,
		type Icon as IconType
	} from 'lucide-svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import {
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_ORGANIZATION_LOGO_IMAGE,
		DEFAULT_ORGANIZATION_SOCIAL_PROFILES
	} from '$lib/constants/seo';

	type Card = {
		title: string;
		body: string;
		icon: typeof IconType;
	};

	const marketShift: Card[] = [
		{
			title: 'Context is the bottleneck',
			body: 'AI tools can generate, critique, and plan, but serious work still breaks when the project context is scattered across notes, docs, tasks, calendars, and chats.',
			icon: Brain
		},
		{
			title: 'Complex creators feel it first',
			body: 'Authors, YouTubers, course creators, and founder-creators live inside long-running projects with research, drafts, decisions, assets, and recurring deadlines.',
			icon: Target
		},
		{
			title: 'Project memory becomes infrastructure',
			body: 'As more work happens with in-app and external agents, the durable system of record matters more than the chat window itself.',
			icon: Network
		}
	];

	const productLoop: Card[] = [
		{
			title: 'Capture rough input',
			body: 'Users start with messy notes, voice dumps, research, scripts, tasks, or project updates instead of filling out a rigid template.',
			icon: Brain
		},
		{
			title: 'Structure the project',
			body: 'BuildOS turns that raw material into projects, tasks, documents, goals, milestones, risks, and plans that stay connected.',
			icon: GitBranch
		},
		{
			title: 'Operate with memory',
			body: 'The agent, daily briefs, calendar tools, and external agent gateway all work against the same project graph.',
			icon: BookOpen
		},
		{
			title: 'Share public artifacts',
			body: 'Public pages turn finished thinking, project writeups, and creator workflows into crawlable, shareable BuildOS artifacts.',
			icon: Share2
		}
	];

	const moatLayers = [
		'Persistent project context that gets richer with each capture, update, brief, and agent action.',
		'A structured ontology underneath the product: projects, tasks, plans, documents, goals, milestones, risks, assets, members, and events.',
		'A creator-first wedge where the value is visible: a book, channel, launch, or research project becomes easier to restart.',
		'A public-pages distribution layer where user-generated project artifacts can compound into search, social, and LLM citation surface area.'
	];
</script>

<SEOHead
	title="Investors — BuildOS"
	description="BuildOS is a thinking environment for people making complex things. The product turns rough project input into durable project memory for creators, builders, and the agent workflows around them."
	canonical="https://build-os.com/investors"
	keywords="BuildOS investors, thinking environment, project memory, creator workflow, agent context, DJ Wayne"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'Organization',
		'@id': DEFAULT_ORGANIZATION_ID,
		name: 'BuildOS',
		url: 'https://build-os.com',
		logo: DEFAULT_ORGANIZATION_LOGO_IMAGE,
		description:
			'Thinking environment for people making complex things. BuildOS turns messy project input into structured work with durable project memory.',
		founder: {
			'@type': 'Person',
			name: 'DJ Wayne',
			jobTitle: 'Founder',
			description:
				'Former USMC Scout Sniper turned software engineer building BuildOS as a founder-led product.'
		},
		contactPoint: {
			'@type': 'ContactPoint',
			email: 'dj@build-os.com',
			contactType: 'Business Inquiries'
		},
		sameAs: [...DEFAULT_ORGANIZATION_SOCIAL_PROFILES, 'https://twitter.com/djwayne3']
	}}
/>

<main class="min-h-screen bg-background text-foreground">
	<section class="border-b border-border bg-muted atmo atmo-med rim-accent">
		<div class="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:py-20">
			<div class="max-w-4xl">
				<p class="text-xs sm:text-sm font-semibold text-accent mb-3">Investor overview</p>
				<h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
					The thinking environment where complex work becomes reusable context.
				</h1>
				<p
					class="mt-5 text-base sm:text-lg text-muted-foreground max-w-3xl leading-relaxed"
				>
					BuildOS turns rough notes, voice dumps, research, documents, tasks, and
					stateless AI chats into structured projects with memory. The wedge is creators
					and builders making complex things. The larger bet is that durable project
					context becomes the coordination layer around agent-assisted work.
				</p>

				<div class="mt-7 flex flex-col sm:flex-row gap-3">
					<a
						href="mailto:dj@build-os.com?subject=BuildOS Investor Conversation"
						class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						<Mail class="w-4 h-4" aria-hidden="true" />
						Contact DJ
					</a>
					<a
						href="/"
						class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:border-accent hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						See the product story
						<ArrowRight class="w-4 h-4" aria-hidden="true" />
					</a>
				</div>
			</div>
		</div>
	</section>

	<section class="py-12 sm:py-14 border-b border-border">
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			<div class="max-w-2xl mb-7">
				<h2 class="text-2xl sm:text-3xl font-bold tracking-tight">Why this exists now</h2>
				<p class="mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed">
					The market does not need another generic AI app. It needs a persistent place
					where human thinking, project structure, and agent work stay connected.
				</p>
			</div>

			<div class="grid gap-4 md:grid-cols-3">
				{#each marketShift as card}
					{@const Icon = card.icon}
					<article class="p-5 wt-card sp-block tx tx-frame tx-weak">
						<div
							class="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent"
						>
							<Icon class="w-5 h-5" aria-hidden="true" />
						</div>
						<h3 class="text-base font-semibold text-foreground">{card.title}</h3>
						<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
							{card.body}
						</p>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<section class="py-12 sm:py-14 border-b border-border bg-muted tx tx-grain tx-weak">
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			<div class="max-w-2xl mb-7">
				<h2 class="text-2xl sm:text-3xl font-bold tracking-tight">The product loop</h2>
				<p class="mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed">
					BuildOS starts with a narrow user pain: people doing serious creative or builder
					work are tired of reconstructing context every time they return.
				</p>
			</div>

			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each productLoop as card}
					{@const Icon = card.icon}
					<article class="p-5 wt-paper sp-inline bg-card">
						<div
							class="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground"
						>
							<Icon class="w-4 h-4" aria-hidden="true" />
						</div>
						<h3 class="text-sm font-semibold text-foreground">{card.title}</h3>
						<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
							{card.body}
						</p>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<section class="py-12 sm:py-14 border-b border-border">
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			<div class="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
				<div>
					<p class="text-xs sm:text-sm font-semibold text-accent mb-3">
						Strategic thesis
					</p>
					<h2 class="text-2xl sm:text-3xl font-bold tracking-tight">
						Project memory is the durable layer.
					</h2>
					<p class="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
						BuildOS is not trying to out-chat ChatGPT or out-document Notion. It is
						building the persistent project environment where messy human input becomes
						usable structure, then stays available to every workflow that needs it.
					</p>
				</div>

				<div
					class="rounded-lg border border-border bg-card p-5 shadow-ink tx tx-thread tx-weak"
				>
					<ul class="space-y-4">
						{#each moatLayers as layer}
							<li class="flex gap-3 text-sm leading-relaxed text-muted-foreground">
								<span
									class="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0"
									aria-hidden="true"
								></span>
								<span>{layer}</span>
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
	</section>

	<section class="py-12 sm:py-14 border-b border-border bg-muted">
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			<div class="max-w-2xl mb-7">
				<h2 class="text-2xl sm:text-3xl font-bold tracking-tight">Current state</h2>
				<p class="mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed">
					BuildOS is live, founder-led, and still early. The product has the core surfaces
					required for the thesis; the immediate work is activation, proof, and narrow
					creator-led distribution.
				</p>
			</div>

			<div class="grid gap-4 md:grid-cols-3">
				<article class="p-5 text-center wt-paper sp-inline bg-card">
					<div class="text-2xl sm:text-3xl font-bold text-accent mb-1">Live</div>
					<h3 class="text-sm sm:text-base font-semibold text-foreground">
						Product access
					</h3>
					<p class="mt-1 text-sm text-muted-foreground">
						14-day trial, paid plan, docs, projects, briefs, calendar, and agent chat.
					</p>
				</article>
				<article class="p-5 text-center wt-paper sp-inline bg-card">
					<div class="text-2xl sm:text-3xl font-bold text-accent mb-1">Creator</div>
					<h3 class="text-sm sm:text-base font-semibold text-foreground">
						Primary wedge
					</h3>
					<p class="mt-1 text-sm text-muted-foreground">
						Authors and YouTubers first; podcasters, course creators, and
						founder-creators next.
					</p>
				</article>
				<article class="p-5 text-center wt-paper sp-inline bg-card">
					<div class="text-2xl sm:text-3xl font-bold text-accent mb-1">1</div>
					<h3 class="text-sm sm:text-base font-semibold text-foreground">Founder</h3>
					<p class="mt-1 text-sm text-muted-foreground">
						Built by DJ Wayne, a former USMC Scout Sniper turned software engineer.
					</p>
				</article>
			</div>
		</div>
	</section>

	<section class="py-12 sm:py-14 border-b border-border">
		<div class="mx-auto max-w-4xl px-4 sm:px-6">
			<div class="grid gap-6 sm:grid-cols-[120px_1fr] sm:items-start">
				<img
					src="/s-dj-wayne-profile.webp"
					alt="DJ Wayne, founder of BuildOS"
					class="h-24 w-24 rounded-full border-2 border-border object-cover shadow-ink sm:h-28 sm:w-28"
					width="112"
					height="112"
					loading="lazy"
				/>
				<div>
					<p class="text-xs sm:text-sm font-semibold text-accent mb-2">Founder</p>
					<h2 class="text-2xl sm:text-3xl font-bold tracking-tight">DJ Wayne</h2>
					<p class="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
						DJ is a former USMC Scout Sniper and software engineer with startup
						experience at Curri. BuildOS came from his own operating problem: juggling
						software work, writing, multiple projects, and AI tools while constantly
						rebuilding context from scratch.
					</p>
					<p class="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
						The founder-market fit is practical: BuildOS is what he uses to build
						BuildOS, and the product is opinionated around the pain of complex work that
						does not fit cleanly into a task manager or a blank document.
					</p>
				</div>
			</div>
		</div>
	</section>

	<section class="py-12 sm:py-14 bg-accent tx tx-frame tx-med">
		<div class="mx-auto max-w-4xl px-4 text-center sm:px-6">
			<h2 class="text-2xl sm:text-3xl font-bold text-accent-foreground">
				Interested in the thesis?
			</h2>
			<p class="mt-3 text-sm sm:text-base text-accent-foreground/90 leading-relaxed">
				Reach out for the current investor memo, product walkthrough, or a direct
				conversation about the BuildOS roadmap.
			</p>
			<div
				class="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3"
			>
				<a
					href="mailto:dj@build-os.com?subject=BuildOS Investor Conversation"
					class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-background px-5 py-2.5 text-sm font-semibold text-foreground shadow-ink pressable transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-accent"
				>
					<Mail class="w-4 h-4" aria-hidden="true" />
					Contact DJ
				</a>
				<a
					href="/docs"
					class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-accent-foreground/30 px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent-foreground/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-accent"
				>
					Read product docs
					<ArrowRight class="w-4 h-4" aria-hidden="true" />
				</a>
			</div>
		</div>
	</section>
</main>
