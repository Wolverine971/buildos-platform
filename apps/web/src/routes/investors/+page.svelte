<!-- apps/web/src/routes/investors/+page.svelte -->
<script lang="ts">
	import {
		ArrowRight,
		Brain,
		Compass,
		Cpu,
		GitBranch,
		Layers,
		Mail,
		MessageSquare,
		PenTool,
		Puzzle,
		Quote,
		RefreshCw,
		Target,
		TrendingUp,
		TriangleAlert,
		Wrench,
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

	// The problem: real work runs through a chat box, and a chat box is the wrong container.
	const problemCards: Card[] = [
		{
			title: 'A meeting you can never leave',
			body: 'Chat is a great input and a terrible interface for a project. You can only see your last message, never the whole thing. Nothing gets written down, so you re-explain everything every time you walk back in.',
			icon: MessageSquare
		},
		{
			title: 'Every session starts at zero',
			body: 'Close the tab and the thinking evaporates. Context has nowhere durable to live, so work resets instead of compounding. Heavy users spend half the day paying the context-paste tax.',
			icon: RefreshCw
		},
		{
			title: 'The failure compounds',
			body: 'At 95% reliability per step, a 20-step task succeeds only ~36% of the time. Every error stays in the room and compounds — the thread does not just fail to help, it amplifies the failure.',
			icon: TriangleAlert
		}
	];

	// Why now: the fragmentation cost is about to explode.
	const whyNowCards: Card[] = [
		{
			title: '1 → 3 → 20 agents',
			body: 'In 2022 you had one AI tool. Today, three. In two years heavy users will have twenty. As agents-per-person climbs, the cost of fragmented, contradictory context climbs with it. There is no future where every agent stays siloed.',
			icon: Puzzle
		},
		{
			title: 'Models commoditize. Context does not.',
			body: 'Inference gets cheaper every quarter and models converge. The unbottleneck for AI usefulness is no longer the model — it is the context. And it has to be a neutral, user-owned surface, because no single provider can be trusted to hold it.',
			icon: Cpu
		},
		{
			title: 'The category is splitting',
			body: 'The Notion category splits the way email split from postal mail. Team OS stays; a new category — a personal context OS for one person and their agents — emerges. Slack did not kill email. It took a slice and built a $30B company.',
			icon: GitBranch
		}
	];

	// How it works: one place the human writes and every agent reads.
	const productLoop: Card[] = [
		{
			title: 'Capture rough input',
			body: 'Start with messy notes, a voice dump, research, a script, or a project update — not a rigid template.',
			icon: Brain
		},
		{
			title: 'Structure the project',
			body: 'BuildOS turns that raw material into connected projects, tasks, documents, goals, milestones, risks, and plans.',
			icon: Layers
		},
		{
			title: 'Operate with memory',
			body: 'The agent, daily briefs, calendar tools, and the external-agent gateway all work against the same project graph — read and write.',
			icon: RefreshCw
		},
		{
			title: 'Compound',
			body: 'Every capture, update, brief, and agent action makes the context richer. Public project pages turn finished work into a discovery surface.',
			icon: TrendingUp
		}
	];

	// Why it is defensible: what it looks like vs. why it is not that.
	const differentiators = [
		{
			looksLike: 'Not a better chat',
			body: 'We are not building a better chat. We are building the layer underneath that makes all the chats useful.'
		},
		{
			looksLike: 'Not Notion',
			body: 'Notion is the system of record for teams, with AI bolted on as a sidebar. BuildOS is built from day one for one human and N agents sharing one context surface.'
		},
		{
			looksLike: 'Not read-only memory',
			body: 'Agents do not just read the context — they update it. "Tell your agent to go update BuildOS" is a real sentence.'
		},
		{
			looksLike: 'Not delegation software',
			body: 'The product is checkpoint behavior, not delegation. Users return daily, update, then go act. Once it holds your project, you do not leave.'
		}
	];

	// Current state — honest, no fabricated metrics.
	const currentState = [
		{
			stat: 'Live',
			title: 'Product access',
			body: '14-day trial, paid plan, projects, documents, daily briefs, calendar sync, and agentic chat — in production.'
		},
		{
			stat: 'Read + write',
			title: 'Agent gateway',
			body: 'External agents connect through a hardened MCP gateway and work the same project graph as the human.'
		},
		{
			stat: 'Creator',
			title: 'Primary wedge',
			body: 'Authors and YouTubers first; podcasters, course creators, and founder-creators next.'
		},
		{
			stat: '1',
			title: 'Founder',
			body: 'Built by DJ Wayne — using BuildOS to build BuildOS.'
		}
	];

	// What I'm looking for.
	const idealInvestor: Card[] = [
		{
			title: 'You see the layer',
			body: 'You already believe the agent era needs a neutral, user-owned context surface — and you back that thesis before the metrics catch up.',
			icon: Layers
		},
		{
			title: 'You make complex things',
			body: 'Creators and operators who feel this problem in their own week. You bring distribution and product truth, not just capital.',
			icon: PenTool
		},
		{
			title: 'You back founders who ship',
			body: 'You bet on the person: a blue-collar builder who comes back from failure and ships.',
			icon: Wrench
		}
	];

	const investorVideoEmbedSrc =
		'https://www.youtube-nocookie.com/embed/LW-lK4R_fAg?rel=0&modestbranding=1';
</script>

<SEOHead
	title="Investors — BuildOS"
	description="BuildOS is a thinking environment for people making complex things. The bet: whoever owns a person's project context becomes the OS for the agent era."
	canonical="https://build-os.com/investors"
	keywords="BuildOS investors, thinking environment, project context, agent era, system of record, creator workflow, DJ Wayne"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'Organization',
		'@id': DEFAULT_ORGANIZATION_ID,
		name: 'BuildOS',
		url: 'https://build-os.com',
		logo: DEFAULT_ORGANIZATION_LOGO_IMAGE,
		description:
			"Thinking environment for people making complex things. BuildOS turns messy project input into a durable project context that people and their AI agents work from — the system of record for one person's work in the agent era.",
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
	<!-- Hero: lead with the bet -->
	<section class="border-b border-border bg-muted atmo atmo-med rim-accent">
		<div class="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:py-20">
			<div class="max-w-4xl">
				<p class="mb-3 text-xs font-semibold text-accent sm:text-sm">For investors</p>
				<h1 class="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
					Whoever owns your project context becomes the OS for the agent era.
				</h1>
				<p
					class="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg"
				>
					BuildOS is a thinking environment for people making complex things. It turns
					messy notes, voice, research, and stateless AI chats into one durable project —
					a place you and every agent you point at it can work from. We start with
					creators. The bet is that project context becomes the layer the whole agent era
					runs on.
				</p>

				<div
					class="mt-7 rounded-lg border border-border bg-card p-5 shadow-ink tx tx-frame tx-weak"
				>
					<p class="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
						“The model was never the bottleneck. The box was.”
					</p>
				</div>

				<div class="mt-7 flex flex-col gap-3 sm:flex-row">
					<a
						href="mailto:dj@build-os.com?subject=BuildOS Investor Conversation"
						class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						<Mail class="h-4 w-4" aria-hidden="true" />
						Contact DJ
					</a>
					<a
						href="#thesis"
						class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:border-accent hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						Read the thesis
						<ArrowRight class="h-4 w-4" aria-hidden="true" />
					</a>
				</div>
			</div>

			<div class="mt-10 max-w-2xl">
				<p class="mb-3 text-xs font-semibold text-accent sm:text-sm">
					“Investors? Could be you.” — the 15-second version
				</p>
				<div
					class="relative w-full overflow-hidden rounded-lg border border-border bg-card shadow-ink"
					style="aspect-ratio: 16 / 9;"
				>
					<iframe
						src={investorVideoEmbedSrc}
						title="Step Brothers investors could be you clip"
						class="absolute inset-0 h-full w-full"
						loading="lazy"
						frameborder="0"
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
						referrerpolicy="strict-origin-when-cross-origin"
						allowfullscreen
					></iframe>
				</div>
			</div>
		</div>
	</section>

	<!-- The problem -->
	<section class="border-b border-border py-12 sm:py-14">
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			<div class="mb-7 max-w-2xl">
				<p class="mb-2 text-xs font-semibold text-accent sm:text-sm">The problem</p>
				<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">
					We run serious work through the wrong container.
				</h2>
				<p class="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
					AI got radically more capable. The container we run it through did not change.
					Real projects still live in a chat box — and a chat box gives you exactly one
					primitive: a meeting you can never leave.
				</p>
			</div>

			<div class="grid gap-4 md:grid-cols-3">
				{#each problemCards as card}
					{@const Icon = card.icon}
					<article class="p-5 wt-card sp-block tx tx-frame tx-weak">
						<div
							class="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent"
						>
							<Icon class="h-5 w-5" aria-hidden="true" />
						</div>
						<h3 class="text-base font-semibold text-foreground">{card.title}</h3>
						<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
							{card.body}
						</p>
					</article>
				{/each}
			</div>

			<p
				class="mt-7 max-w-3xl text-base font-medium leading-relaxed text-foreground sm:text-lg"
			>
				Projects do not fail because the agent is dumb. They fail because we hired someone
				brilliant and gave them no onboarding, no memory, and no way to hand off work.
			</p>
		</div>
	</section>

	<!-- Why now -->
	<section class="border-b border-border bg-muted py-12 tx tx-grain tx-weak sm:py-14">
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			<div class="mb-7 max-w-2xl">
				<p class="mb-2 text-xs font-semibold text-accent sm:text-sm">Why now</p>
				<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">
					The fragmentation cost is about to explode.
				</h2>
				<p class="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
					A coding agent, a writing agent, a research agent, vertical agents for
					everything — they all start from zero and contradict each other. Someone has to
					be the surface they all read from.
				</p>
			</div>

			<div class="grid gap-4 md:grid-cols-3">
				{#each whyNowCards as card}
					{@const Icon = card.icon}
					<article class="p-5 wt-paper sp-inline bg-card">
						<div
							class="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground"
						>
							<Icon class="h-4 w-4" aria-hidden="true" />
						</div>
						<h3 class="text-sm font-semibold text-foreground">{card.title}</h3>
						<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
							{card.body}
						</p>
					</article>
				{/each}
			</div>

			<p class="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
				This is already visible: Gartner projects 40% of agentic-AI projects will be
				canceled by 2027, and MIT finds 95% of enterprise GenAI pilots deliver zero P&amp;L
				impact — and not for lack of model horsepower.
			</p>
		</div>
	</section>

	<!-- The bet / thesis -->
	<section id="thesis" class="scroll-mt-24 border-b border-border py-12 sm:py-14">
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			<div class="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
				<div>
					<p class="mb-3 text-xs font-semibold text-accent sm:text-sm">The bet</p>
					<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">
						If the agent era is real, ask one question: where does context live?
					</h2>
					<p class="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
						It cannot live in each model — they compete and lose state on every chat. It
						cannot live in each tool — they fragment. It has to be a neutral, user-owned
						surface. Either we build it or someone else does. BuildOS is the system of
						record for one person's work in the agent era.
					</p>
					<div class="mt-5 flex items-start gap-3">
						<Compass class="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
						<p class="text-sm font-medium leading-relaxed text-foreground sm:text-base">
							Start with a brain dump. It rolls. Every dump, task, and update packs on
							until the context moves under its own weight. That is the snowball.
						</p>
					</div>
				</div>

				<div
					class="rounded-lg border border-border bg-card p-5 shadow-ink tx tx-thread tx-weak"
				>
					<p class="text-sm font-semibold text-accent">Why it compounds</p>
					<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
						ChatGPT is the same on day 1 and day 100. BuildOS on day 100 knows your
						project — the characters, the brand voice, the blockers, the decisions, the
						history.
					</p>
					<p class="mt-3 text-sm font-medium leading-relaxed text-foreground">
						The model is not getting smarter. Your project state is. Every agent you
						point at it inherits that intelligence for free.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- How it works -->
	<section class="border-b border-border bg-muted py-12 sm:py-14">
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			<div class="mb-7 max-w-2xl">
				<p class="mb-2 text-xs font-semibold text-accent sm:text-sm">How it works</p>
				<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">
					One place the human writes and every agent reads.
				</h2>
				<p class="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
					BuildOS starts with a narrow pain: people doing serious creative or builder work
					are tired of rebuilding context every time they return.
				</p>
			</div>

			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each productLoop as card}
					{@const Icon = card.icon}
					<article class="p-5 wt-paper sp-inline bg-card">
						<div
							class="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground"
						>
							<Icon class="h-4 w-4" aria-hidden="true" />
						</div>
						<h3 class="text-sm font-semibold text-foreground">{card.title}</h3>
						<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
							{card.body}
						</p>
					</article>
				{/each}
			</div>

			<p
				class="mt-7 max-w-3xl text-base font-medium leading-relaxed text-foreground sm:text-lg"
			>
				Framework for the person. Harness for the agent. Both read the same project state;
				neither is abstracted away.
			</p>
		</div>
	</section>

	<!-- Why it is defensible -->
	<section class="border-b border-border py-12 sm:py-14">
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			<div class="mb-7 max-w-2xl">
				<p class="mb-2 text-xs font-semibold text-accent sm:text-sm">Defensibility</p>
				<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">
					An agent can clone a workflow in a weekend. It cannot clone a worldview.
				</h2>
			</div>

			<div
				class="mb-6 flex items-start gap-3 rounded-lg border border-border bg-card p-5 shadow-ink tx tx-thread tx-weak"
			>
				<Quote class="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
				<p class="text-sm font-medium leading-relaxed text-foreground sm:text-base">
					The moat is the shared context layer — and the user controls it. BuildOS does
					not compete on model quality; it competes on context quality, which the user
					owns.
				</p>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				{#each differentiators as item}
					<article class="p-5 wt-card sp-block">
						<p class="text-sm font-semibold text-accent">{item.looksLike}</p>
						<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
							{item.body}
						</p>
					</article>
				{/each}
			</div>

			<div
				class="mt-6 flex items-start gap-4 rounded-lg border border-accent/30 bg-accent/5 p-5 sm:p-6"
			>
				<div
					class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"
				>
					<Target class="h-5 w-5" aria-hidden="true" />
				</div>
				<div>
					<h3 class="text-base font-semibold text-foreground">
						The wedge is a megaphone.
					</h3>
					<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
						We start with creators making multi-modal, idiosyncratic projects — the
						novelist also building a Substack, the YouTuber writing a book. They have
						five vertical tools and no place where the whole project lives. That is
						BuildOS-shaped. And because their job is producing content, every happy user
						is a marketing channel.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Current state -->
	<section class="border-b border-border bg-muted py-12 sm:py-14">
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			<div class="mb-7 max-w-2xl">
				<p class="mb-2 text-xs font-semibold text-accent sm:text-sm">Current state</p>
				<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">
					Live, founder-led, still early.
				</h2>
				<p class="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
					The product has the core surfaces the thesis requires. The immediate work is
					activation, proof, and narrow creator-led distribution.
				</p>
			</div>

			<!-- METRICS SLOT: when verified traction numbers exist (active users, retention,
			     paid conversion, briefs generated), add a stat row here. Never use placeholder
			     or estimated numbers on this public page. -->
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each currentState as item}
					<article class="p-5 wt-paper sp-inline bg-card">
						<div class="mb-1 text-2xl font-bold text-accent sm:text-3xl">
							{item.stat}
						</div>
						<h3 class="text-sm font-semibold text-foreground sm:text-base">
							{item.title}
						</h3>
						<p class="mt-1 text-sm leading-relaxed text-muted-foreground">
							{item.body}
						</p>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<!-- Founder -->
	<section class="border-b border-border py-12 sm:py-14">
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
					<p class="mb-2 text-xs font-semibold text-accent sm:text-sm">Founder</p>
					<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">DJ Wayne</h2>
					<p class="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
						Pastor's kid → USMC Scout Sniper → software engineer → founder. DJ built
						BuildOS out of his own operating problem: juggling engineering work,
						writing, and multiple projects while re-pasting the same context into every
						AI chat — saving documents just to paste them back in.
					</p>
					<p class="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
						He was solving AI memory before the platforms admitted the problem existed.
						At Curri, a YC-backed logistics startup, he reverse-engineered delivery APIs
						into a matching engine — agentic tool use before it had a name. BuildOS is
						what he uses to build BuildOS.
					</p>
					<p
						class="mt-3 text-sm font-medium leading-relaxed text-foreground sm:text-base"
					>
						The through-line is a comeback pattern: cut from his sniper team right
						before deployment, he earned his way back and re-passed the brutal indoc
						from scratch. He is not afraid of failure — he is the one who ships.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- What I'm looking for -->
	<section class="border-b border-border bg-muted py-12 tx tx-grain tx-weak sm:py-14">
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			<div class="mb-7 max-w-2xl">
				<p class="mb-2 text-xs font-semibold text-accent sm:text-sm">
					What I'm looking for
				</p>
				<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">
					The right investors for this bet.
				</h2>
				<p class="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
					BuildOS is raising a seed round. The best-fit investors tend to share three
					things.
				</p>
			</div>

			<div class="grid gap-4 md:grid-cols-3">
				{#each idealInvestor as card}
					{@const Icon = card.icon}
					<article class="p-5 wt-card sp-block tx tx-frame tx-weak">
						<div
							class="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent"
						>
							<Icon class="h-5 w-5" aria-hidden="true" />
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

	<!-- Final CTA -->
	<section class="bg-accent py-12 tx tx-frame tx-med sm:py-14">
		<div class="mx-auto max-w-4xl px-4 text-center sm:px-6">
			<h2 class="text-2xl font-bold text-accent-foreground sm:text-3xl">
				Interested in the thesis?
			</h2>
			<p class="mt-3 text-sm leading-relaxed text-accent-foreground/90 sm:text-base">
				Reach out for the current investor memo, a product walkthrough, or a direct
				conversation about the BuildOS roadmap.
			</p>
			<div
				class="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center"
			>
				<a
					href="mailto:dj@build-os.com?subject=BuildOS Investor Conversation"
					class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-background px-5 py-2.5 text-sm font-semibold text-foreground shadow-ink pressable transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-accent"
				>
					<Mail class="h-4 w-4" aria-hidden="true" />
					Contact DJ
				</a>
				<a
					href="/docs"
					class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-accent-foreground/30 px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent-foreground/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-accent"
				>
					Read product docs
					<ArrowRight class="h-4 w-4" aria-hidden="true" />
				</a>
			</div>
		</div>
	</section>
</main>
