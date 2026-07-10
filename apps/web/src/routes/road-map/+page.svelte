<!-- apps/web/src/routes/road-map/+page.svelte -->
<script lang="ts">
	import SEOHead from '$lib/components/SEOHead.svelte';
	import {
		ArrowRight,
		Bot,
		Calendar,
		CheckCircle2,
		CircleCheck,
		Clock3,
		Compass,
		FolderTree,
		Globe,
		History,
		ListChecks,
		MessageCircle,
		MessageSquare,
		Mic,
		Network,
		Repeat,
		Search,
		ShieldCheck,
		Smartphone,
		Sparkles,
		Users
	} from '$lib/icons/lucide';
	import type { Icon } from '$lib/icons/lucide';
	import {
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_ORGANIZATION_LOGO_IMAGE,
		SITE_NAME,
		SITE_URL
	} from '$lib/constants/seo';

	type RoadmapItem = {
		title: string;
		description: string;
		icon: Icon;
	};

	const shipped: RoadmapItem[] = [
		{
			title: 'Capture and structure',
			description:
				'Turn rough text or voice into connected projects, goals, plans, tasks, documents, and context.',
			icon: Mic
		},
		{
			title: 'Persistent project memory',
			description:
				'Keep activity, source context, document history, relationships, and daily briefs attached to the work.',
			icon: History
		},
		{
			title: 'Project-aware chat',
			description:
				'Explore, update, audit, and forecast work with the relevant project, task, document, brief, and calendar context.',
			icon: MessageSquare
		},
		{
			title: 'Durable agent work',
			description:
				'Delegate bounded work to background Agent Runs that can be watched, steered, scheduled, and reviewed before commit.',
			icon: Bot
		},
		{
			title: 'Graph and collaboration',
			description:
				'Visualize how work connects, invite project members with scoped roles, and publish selected documents to the web.',
			icon: Network
		},
		{
			title: 'Connected workflows',
			description:
				'Sync with Google Calendar, search across structured work, repeat tasks, and connect outside agents through MCP.',
			icon: Calendar
		}
	];

	const now: RoadmapItem[] = [
		{
			title: 'Make the first session click',
			description:
				'Show the messy-input-to-structure transformation, prove that project memory persists, and make the first brief immediately useful.',
			icon: Sparkles
		},
		{
			title: 'Roll out proactive project review',
			description:
				'Finish production verification for AI Inbox, project review loops, and evidence-backed Complete Project Audits.',
			icon: ShieldCheck
		},
		{
			title: 'Harden agent work',
			description:
				'Complete live UI and calendar verification for Agent Runs and scheduled Operatives, then tighten reliability and safety.',
			icon: CheckCircle2
		},
		{
			title: 'Choose the paid model deliberately',
			description:
				'Billing is not active. We will define the paid experience and communicate it clearly before any account can be charged.',
			icon: Clock3
		}
	];

	const next: RoadmapItem[] = [
		{
			title: 'Public project discovery',
			description:
				'Build on public document pages with a showcase, cloneable project structures, and stronger creator attribution.',
			icon: Globe
		},
		{
			title: 'Recurring work, version two',
			description:
				'Edit schedules, regenerate future instances, and create the next occurrence without maintaining a large batch.',
			icon: Repeat
		},
		{
			title: 'Easier agent connections',
			description:
				'Package the local MCP bridge, improve connector setup, and make scoped BuildOS context easier to use from outside tools.',
			icon: FolderTree
		},
		{
			title: 'User-controlled review cadence',
			description:
				'Give people clearer control over audit history, review appetite, notifications, and when proactive suggestions appear.',
			icon: ListChecks
		}
	];

	const exploring: RoadmapItem[] = [
		{
			title: 'Stalled-project intervention',
			description:
				'Notice meaningful drift or blocked work early, then offer a grounded next move without creating notification noise.',
			icon: Compass
		},
		{
			title: 'Cross-project intelligence',
			description:
				'Help people see competing commitments and shared context across projects without turning BuildOS into enterprise portfolio software.',
			icon: Search
		},
		{
			title: 'Deeper user-controlled automation',
			description:
				'Let trusted agents act on recurring project work with explicit scope, observable runs, and review when the stakes require it.',
			icon: Users
		},
		{
			title: 'Native mobile, if the evidence supports it',
			description:
				'The responsive web app comes first. Native iOS and Android remain an option when mobile usage justifies a second client.',
			icon: Smartphone
		}
	];
</script>

<SEOHead
	title="BuildOS Roadmap | Shipped, Now, Next, and Exploring"
	description="See what BuildOS has shipped, what we are improving now, what comes next, and which longer-term ideas we are exploring for project memory and agent-assisted work."
	canonical="https://build-os.com/road-map"
	keywords="BuildOS roadmap, thinking environment roadmap, project memory, agent work, project context, BuildOS features"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'Article',
		'@id': `${SITE_URL}/road-map#article`,
		headline: 'BuildOS Roadmap',
		description:
			'What BuildOS has shipped, what is improving now, what comes next, and which longer-term ideas are being explored.',
		author: {
			'@type': 'Organization',
			'@id': DEFAULT_ORGANIZATION_ID,
			name: SITE_NAME,
			url: SITE_URL
		},
		publisher: {
			'@type': 'Organization',
			'@id': DEFAULT_ORGANIZATION_ID,
			name: SITE_NAME,
			url: SITE_URL,
			logo: DEFAULT_ORGANIZATION_LOGO_IMAGE
		},
		datePublished: '2025-07-21',
		dateModified: '2026-07-10',
		mainEntityOfPage: `${SITE_URL}/road-map`
	}}
/>

<div class="min-h-screen bg-background text-foreground">
	<section
		class="border-b border-border bg-muted atmo atmo-med"
		aria-labelledby="roadmap-heading"
	>
		<div class="mx-auto max-w-7xl px-2 py-12 sm:px-4 sm:py-16 lg:px-6 lg:py-20">
			<div class="mx-auto max-w-4xl text-center">
				<div class="mb-5 flex justify-center">
					<div
						class="flex h-16 w-16 items-center justify-center tx tx-frame tx-weak wt-card"
					>
						<img
							src="/brain-bolt.webp"
							alt=""
							class="h-11 w-11"
							width="44"
							height="44"
						/>
					</div>
				</div>

				<p class="micro-label mb-3 text-accent">PUBLIC ROADMAP · UPDATED JULY 10, 2026</p>
				<h1
					id="roadmap-heading"
					class="mx-auto max-w-4xl text-3xl font-semibold leading-tight text-pretty sm:text-5xl"
				>
					What BuildOS has shipped—and what comes next.
				</h1>
				<p
					class="mx-auto mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base"
				>
					BuildOS is becoming a thinking environment where rough input becomes structured
					work, project memory compounds, and people and agents operate from the same
					context.
				</p>
			</div>

			<div
				class="mx-auto mt-8 grid max-w-4xl gap-2 sm:grid-cols-4"
				aria-label="Roadmap status guide"
			>
				<div
					class="flex min-w-0 items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5"
				>
					<CircleCheck class="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
					<span class="text-sm font-medium text-foreground">Shipped</span>
				</div>
				<div
					class="flex min-w-0 items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5"
				>
					<Clock3 class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
					<span class="text-sm font-medium text-foreground">Now</span>
				</div>
				<div
					class="flex min-w-0 items-center gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2.5"
				>
					<ArrowRight class="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
					<span class="text-sm font-medium text-foreground">Next</span>
				</div>
				<div
					class="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5"
				>
					<Compass class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<span class="text-sm font-medium text-foreground">Exploring</span>
				</div>
			</div>
		</div>
	</section>

	<section class="py-12 sm:py-16" aria-labelledby="shipped-heading">
		<div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
			<header class="mb-6 max-w-3xl">
				<div class="mb-2 flex items-center gap-2">
					<CircleCheck class="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
					<p class="micro-label text-success">SHIPPED</p>
				</div>
				<h2 id="shipped-heading" class="text-2xl font-semibold sm:text-3xl">
					The foundation is already working.
				</h2>
				<p class="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
					These are current product capabilities, not future promises.
				</p>
			</header>

			<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{#each shipped as item}
					{@const ItemIcon = item.icon}
					<article
						class="min-w-0 border border-border bg-card p-5 shadow-ink tx tx-grain tx-weak wt-paper"
					>
						<div class="flex min-w-0 items-start gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success/10"
							>
								<ItemIcon class="h-5 w-5 text-success" aria-hidden="true" />
							</div>
							<div class="min-w-0">
								<h3 class="text-lg font-semibold text-foreground">{item.title}</h3>
								<p class="mt-1 text-sm leading-6 text-muted-foreground">
									{item.description}
								</p>
							</div>
						</div>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<section class="border-y border-border bg-muted py-12 sm:py-16" aria-labelledby="now-heading">
		<div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
			<header class="mb-6 max-w-3xl">
				<div class="mb-2 flex items-center gap-2">
					<Clock3 class="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
					<p class="micro-label text-accent">NOW</p>
				</div>
				<h2 id="now-heading" class="text-2xl font-semibold sm:text-3xl">
					Make the system easier to trust and return to.
				</h2>
				<p class="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
					The immediate work is activation, verification, reliability, and a clear
					business model.
				</p>
			</header>

			<div class="grid gap-3 lg:grid-cols-2">
				{#each now as item}
					{@const ItemIcon = item.icon}
					<article
						class="min-w-0 border border-accent/30 bg-card p-5 shadow-ink tx tx-pulse tx-weak wt-paper"
					>
						<div class="flex min-w-0 items-start gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/10"
							>
								<ItemIcon class="h-5 w-5 text-accent" aria-hidden="true" />
							</div>
							<div class="min-w-0">
								<h3 class="text-lg font-semibold text-foreground">{item.title}</h3>
								<p class="mt-1 text-sm leading-6 text-muted-foreground">
									{item.description}
								</p>
							</div>
						</div>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<section class="py-12 sm:py-16" aria-labelledby="next-heading">
		<div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
			<header class="mb-6 max-w-3xl">
				<div class="mb-2 flex items-center gap-2">
					<ArrowRight class="h-5 w-5 shrink-0 text-info" aria-hidden="true" />
					<p class="micro-label text-info">NEXT</p>
				</div>
				<h2 id="next-heading" class="text-2xl font-semibold sm:text-3xl">
					Extend what is already proving useful.
				</h2>
				<p class="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
					The next layer compounds public work, recurring workflows, connected agents, and
					review controls.
				</p>
			</header>

			<div class="grid gap-3 lg:grid-cols-2">
				{#each next as item}
					{@const ItemIcon = item.icon}
					<article
						class="min-w-0 border border-info/30 bg-card p-5 shadow-ink tx tx-thread tx-weak wt-paper"
					>
						<div class="flex min-w-0 items-start gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-info/10"
							>
								<ItemIcon class="h-5 w-5 text-info" aria-hidden="true" />
							</div>
							<div class="min-w-0">
								<h3 class="text-lg font-semibold text-foreground">{item.title}</h3>
								<p class="mt-1 text-sm leading-6 text-muted-foreground">
									{item.description}
								</p>
							</div>
						</div>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<section
		class="border-y border-border bg-muted py-12 sm:py-16"
		aria-labelledby="exploring-heading"
	>
		<div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
			<header class="mb-6 max-w-3xl">
				<div class="mb-2 flex items-center gap-2">
					<Compass class="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
					<p class="micro-label">EXPLORING</p>
				</div>
				<h2 id="exploring-heading" class="text-2xl font-semibold sm:text-3xl">
					Promising directions, without fake delivery dates.
				</h2>
				<p class="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
					These ideas need stronger user evidence before they become commitments.
				</p>
			</header>

			<div class="grid gap-3 lg:grid-cols-2">
				{#each exploring as item}
					{@const ItemIcon = item.icon}
					<article
						class="min-w-0 border border-border bg-card p-5 shadow-ink tx tx-bloom tx-weak wt-ghost"
					>
						<div class="flex min-w-0 items-start gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted"
							>
								<ItemIcon
									class="h-5 w-5 text-muted-foreground"
									aria-hidden="true"
								/>
							</div>
							<div class="min-w-0">
								<h3 class="text-lg font-semibold text-foreground">{item.title}</h3>
								<p class="mt-1 text-sm leading-6 text-muted-foreground">
									{item.description}
								</p>
							</div>
						</div>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<section class="py-12 sm:py-16" aria-labelledby="boundaries-heading">
		<div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
			<div
				class="mx-auto max-w-4xl border border-border bg-card p-5 shadow-ink tx tx-frame tx-weak wt-card sm:p-7"
			>
				<p class="micro-label mb-2 text-accent">DELIBERATE BOUNDARIES</p>
				<h2 id="boundaries-heading" class="text-2xl font-semibold sm:text-3xl">
					What we are not promising.
				</h2>
				<p class="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
					BuildOS is not trying to become heavyweight portfolio software, fabricate a
					percentage chance of success, or silently rewrite your schedule. We prefer
					evidence-backed project health, lightweight dependencies, visible agent work,
					and user-controlled changes.
				</p>
			</div>
		</div>
	</section>

	<section
		class="border-t border-border bg-muted py-12 sm:py-16"
		aria-labelledby="feedback-heading"
	>
		<div class="mx-auto max-w-7xl px-2 text-center sm:px-4 lg:px-6">
			<div class="mx-auto max-w-3xl">
				<p class="micro-label mb-2 text-accent">HELP SHAPE THE ROADMAP</p>
				<h2 id="feedback-heading" class="text-2xl font-semibold sm:text-3xl">
					Tell us where your work still breaks down.
				</h2>
				<p
					class="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base"
				>
					The most useful feedback starts with a real project: what you tried, what stayed
					scattered, and what would have helped you move forward.
				</p>

				<div class="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
					<a
						href="/auth/register"
						class="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
					>
						<Sparkles class="h-4 w-4 shrink-0" aria-hidden="true" />
						Start with a project
					</a>
					<a
						href="/feedback"
						class="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:border-accent hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
					>
						<MessageCircle class="h-4 w-4 shrink-0" aria-hidden="true" />
						Share feedback
					</a>
				</div>
			</div>
		</div>
	</section>
</div>
