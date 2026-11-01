<!-- apps/web/src/lib/components/landing/home-variants/HomeVariantA.svelte -->
<!--
  Homepage version A, "The Desk": calm and editorial, for professionals deciding whether to
  trust BuildOS with real work. Serif display headlines (system serif stack, no web fonts),
  hairline rules, numbered sections, accent used sparingly. Proof is the real Fading Crown
  example: a printed project sheet up top, real screenshots, and the live read-only project
  (loaded only when its section nears the viewport).
-->
<script lang="ts">
	import {
		ArrowDown,
		ArrowRight,
		CalendarDays,
		CircleCheck,
		Lock,
		Mail,
		Mic,
		Plug,
		Sun
	} from '$lib/icons/lucide';
	import HomeDraftBox from './HomeDraftBox.svelte';
	import ProjectSheet from './a/ProjectSheet.svelte';
	import LiveProject from './a/LiveProject.svelte';
	import { FADING_CROWN, FADING_CROWN_COUNTS } from './fading-crown';

	const madeFromDump = [
		{ count: 1, label: 'Goal', items: [FADING_CROWN.goal], more: 0 },
		{ count: 1, label: 'Plan', items: [FADING_CROWN.plan], more: 0 },
		{
			count: FADING_CROWN_COUNTS.milestones,
			label: 'Milestones',
			items: FADING_CROWN.milestones.map((milestone) => milestone.title),
			more: 0
		},
		{
			count: FADING_CROWN_COUNTS.tasks,
			label: 'Tasks',
			items: FADING_CROWN.tasks.slice(3, 6).map((task) => task.title),
			more: FADING_CROWN_COUNTS.tasks - 3
		},
		{
			count: FADING_CROWN_COUNTS.documents,
			label: 'Documents',
			items: FADING_CROWN.documents.slice(1, 4),
			more: FADING_CROWN_COUNTS.documents - 3
		},
		{ count: 1, label: 'Risk', items: [FADING_CROWN.risk], more: 0 }
	];

	const screens = [
		{
			light: '/home/hero-say-light.jpg',
			dark: '/home/hero-say-dark.jpg',
			width: 1000,
			height: 120,
			caption: 'The brain dump, typed into chat.',
			alt: 'A messy brain dump about a fantasy novel typed into BuildOS chat'
		},
		{
			light: '/home/hero-work-light.jpg',
			dark: '/home/hero-work-dark.jpg',
			width: 1000,
			height: 212,
			caption: 'BuildOS creating the project, item by item.',
			alt: 'BuildOS chat receipts showing the Fading Crown project being created, followed by a summary of the project structure'
		},
		{
			light: '/home/hero-real-light.jpg',
			dark: '/home/hero-real-dark.jpg',
			width: 1010,
			height: 500,
			caption: 'The finished project page, ready to work in.',
			alt: 'The Fading Crown project page in BuildOS with recent activity, scheduled tasks, milestones, and a suggested next move'
		}
	];

	type IncludedItem = {
		icon: typeof Sun;
		term: string;
		text: string;
		link?: { href: string; label: string };
	};

	const included: IncludedItem[] = [
		{
			icon: Sun,
			term: 'Daily brief',
			text: "A short morning summary of what's due and what to do next on each project."
		},
		{
			icon: CalendarDays,
			term: 'Google Calendar, if you want it',
			text: 'Connect a calendar and your scheduled tasks and time blocks sit next to the rest of your week. BuildOS works fine without it.'
		},
		{
			icon: Mic,
			term: 'Voice notes',
			text: 'Record a thought instead of typing it. BuildOS transcribes it so it can go into your project.'
		},
		{
			icon: Plug,
			term: 'Your agents, same project',
			text: 'Connect Claude, ChatGPT or Codex, or OpenClaw through the BuildOS connector. They read the project you work in and write their results back to it.',
			link: { href: '/integrations', label: 'How the connector works' }
		}
	];

	const trust = [
		{
			icon: Lock,
			term: 'Private by default.',
			text: 'Your projects are visible only to you until you choose to share them.'
		},
		{
			icon: CalendarDays,
			term: 'Google is opt-in.',
			text: 'Calendar and Gmail are separate connections that you start. You can disconnect either one at any time.'
		},
		{
			icon: Mail,
			term: 'Gmail access is read-only.',
			text: "BuildOS can search and read messages for features you use. It can't send, edit, delete, archive, or label email."
		}
	];
</script>

{#snippet sectionHead(number: string, title: string, lede: string, headingId: string)}
	<div class="grid gap-3 lg:grid-cols-[5rem_minmax(0,1fr)] lg:gap-0">
		<p class="stamp pt-2 text-sm text-muted-foreground" aria-hidden="true">{number}</p>
		<div class="max-w-2xl">
			<h2
				id={headingId}
				class="desk-serif text-balance text-3xl leading-tight text-foreground sm:text-4xl"
			>
				{title}
			</h2>
			<p class="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">{lede}</p>
		</div>
	</div>
{/snippet}

<div class="bg-background text-foreground">
	<!-- 00 · Hero -->
	<section class="px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20 lg:px-10">
		<div
			class="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16"
		>
			<div class="lg:pt-8">
				<h1
					class="desk-serif text-balance text-4xl leading-[1.05] text-foreground sm:text-5xl lg:text-6xl"
				>
					Turn messy thinking into structured work.
				</h1>
				<p class="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
					BuildOS is a thinking environment for people making complex things. Bring the
					notes, the half-plans, and the loose ends. Leave with a project you can pick
					back up on any day, right where you left it.
				</p>

				<div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
					<a
						href="/auth/register"
						class="tx-button tx-button-accent inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-6 text-sm font-semibold text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						Start with one project
						<ArrowRight class="h-4 w-4 shrink-0" />
					</a>
					<a
						href="#live-project"
						class="inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-sm font-semibold text-foreground underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						Explore a real project
						<ArrowDown class="h-4 w-4 shrink-0" />
					</a>
				</div>

				<p class="mt-8 max-w-md border-t border-border pt-4 text-sm text-muted-foreground">
					Private by default. Free for 14 days, no credit card needed.
				</p>
			</div>

			<div>
				<ProjectSheet />
				<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
					An example project as BuildOS keeps it, from the live project you can open
					below.
				</p>
			</div>
		</div>
	</section>

	<!-- 01 · From a brain dump to a project -->
	<section
		class="border-t border-border px-4 py-16 sm:px-6 sm:py-24 lg:px-10"
		aria-labelledby="desk-dump-heading"
	>
		<div class="mx-auto max-w-6xl">
			{@render sectionHead(
				'01',
				'From a brain dump to a project.',
				"You don't have to get organized before you start. Write it the way it sits in your head. BuildOS sorts it into the parts of a project and keeps them together.",
				'desk-dump-heading'
			)}

			<div class="mt-12 grid gap-8 lg:ml-20 lg:grid-cols-2 lg:gap-12">
				<figure class="min-w-0">
					<figcaption class="text-sm font-semibold text-foreground">
						What was written
					</figcaption>
					<div
						class="tx tx-grid tx-weak relative mt-3 overflow-hidden rounded-lg border border-border bg-background p-5 shadow-ink-inner sm:p-6"
					>
						<p class="desk-serif relative text-lg leading-relaxed text-foreground">
							{FADING_CROWN.brainDump}
						</p>
					</div>
				</figure>

				<div class="min-w-0">
					<p class="text-sm font-semibold text-foreground">What BuildOS made from it</p>
					<dl class="mt-3 divide-y divide-border border-y border-border">
						{#each madeFromDump as row (row.label)}
							<div class="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 py-3">
								<dt class="stamp pt-0.5 text-sm text-accent">
									{row.count}<span class="sr-only"> {row.label}</span>
								</dt>
								<dd class="min-w-0 text-sm leading-relaxed">
									<span class="font-semibold text-foreground" aria-hidden="true"
										>{row.label}</span
									>
									<span class="block text-muted-foreground">
										{row.items.join(' · ')}{#if row.more > 0}
											<span class="whitespace-nowrap"
												>, and {row.more} more</span
											>
										{/if}
									</span>
								</dd>
							</div>
						{/each}
						<div class="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 py-3">
							<dt class="pt-1 text-accent">
								<ArrowRight class="h-4 w-4" aria-hidden="true" />
								<span class="sr-only">Next step</span>
							</dt>
							<dd class="min-w-0 text-sm leading-relaxed">
								<span class="font-semibold text-foreground" aria-hidden="true"
									>Next step</span
								>
								<span class="block text-muted-foreground"
									>{FADING_CROWN.nextStep}</span
								>
							</dd>
						</div>
					</dl>
				</div>
			</div>

			<div class="mt-16 lg:ml-20">
				<p class="text-sm font-semibold text-foreground">
					The same project, in real screens
				</p>
				<ol class="mt-4 space-y-8">
					{#each screens as screen, index (screen.light)}
						<li>
							<figure
								class="overflow-hidden rounded-lg border border-border bg-card shadow-ink"
							>
								<figcaption
									class="flex min-h-10 items-baseline gap-3 border-b border-border px-4 py-2"
								>
									<span
										class="stamp text-xs text-muted-foreground"
										aria-hidden="true">{index + 1}</span
									>
									<span class="text-sm text-foreground">{screen.caption}</span>
								</figcaption>
								<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
								<div
									class="overflow-x-auto bg-background"
									role="region"
									tabindex="0"
									aria-label="Product screenshot {index +
										1}, scrolls sideways on small screens"
								>
									<img
										src={screen.light}
										alt={screen.alt}
										width={screen.width}
										height={screen.height}
										loading="lazy"
										decoding="async"
										class="min-w-[720px] dark:hidden md:w-full md:min-w-0"
									/>
									<img
										src={screen.dark}
										alt=""
										aria-hidden="true"
										width={screen.width}
										height={screen.height}
										loading="lazy"
										decoding="async"
										class="hidden min-w-[720px] dark:block md:w-full md:min-w-0"
									/>
								</div>
							</figure>
							{#if index === 0}
								<p class="mt-2 text-xs text-muted-foreground md:hidden">
									Swipe the screens sideways to read them at full size.
								</p>
							{/if}
						</li>
					{/each}
				</ol>
			</div>
		</div>
	</section>

	<!-- 02 · It keeps up with you -->
	<section
		class="border-t border-border px-4 py-16 sm:px-6 sm:py-24 lg:px-10"
		aria-labelledby="desk-updates-heading"
	>
		<div class="mx-auto max-w-6xl">
			{@render sectionHead(
				'02',
				'It keeps up with you.',
				'Plans change. Say what changed in plain words. BuildOS finds the right item, makes the edit, and shows you exactly what moved.',
				'desk-updates-heading'
			)}

			<ol class="mt-12 divide-y divide-border border-y border-border lg:ml-20">
				{#each FADING_CROWN.updates as update (update.say)}
					<li
						class="grid gap-4 py-8 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-8"
					>
						<div>
							<p class="text-xs font-semibold text-muted-foreground">You say</p>
							<blockquote
								class="desk-serif mt-2 text-xl leading-snug text-foreground sm:text-2xl"
							>
								“{update.say}”
							</blockquote>
						</div>
						<ArrowRight
							class="hidden h-5 w-5 text-muted-foreground md:block"
							aria-hidden="true"
						/>
						<div
							class="rounded-lg border border-border bg-card px-4 py-3 shadow-ink-inner"
						>
							<p class="text-xs font-semibold text-muted-foreground">What changes</p>
							<p
								class="mt-1.5 flex items-start gap-2 text-sm leading-relaxed text-foreground"
							>
								<CircleCheck
									class="mt-0.5 h-4 w-4 shrink-0 text-success"
									aria-hidden="true"
								/>
								<span>{update.result}</span>
							</p>
						</div>
					</li>
				{/each}
			</ol>
			<p class="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground lg:ml-20">
				Every change stays attached to the project, so the record of what moved is still
				there when you come back.
			</p>
		</div>
	</section>

	<!-- 03 · The live example project -->
	<section
		id="live-project"
		class="scroll-mt-4 border-t border-border px-4 py-16 sm:px-6 sm:py-24 lg:px-10"
		aria-labelledby="desk-live-heading"
	>
		<div class="mx-auto max-w-6xl">
			{@render sectionHead(
				'03',
				'Explore a real project.',
				"This is Fading Crown, an example novel project, loaded live from BuildOS. It's read-only, so look around: open the tasks, read the documents, or switch to the phone view.",
				'desk-live-heading'
			)}

			<div class="mt-12 lg:ml-20">
				<LiveProject />
			</div>
		</div>
	</section>

	<!-- 04 · What comes with it -->
	<section
		class="border-t border-border px-4 py-16 sm:px-6 sm:py-24 lg:px-10"
		aria-labelledby="desk-included-heading"
	>
		<div class="mx-auto max-w-6xl">
			{@render sectionHead(
				'04',
				'What comes with it.',
				'The project is the center. A few quiet tools keep it current without asking for more of your attention.',
				'desk-included-heading'
			)}

			<dl class="mt-12 divide-y divide-border border-y border-border lg:ml-20">
				{#each included as item (item.term)}
					{@const Icon = item.icon}
					<div class="grid gap-2 py-6 sm:grid-cols-[16rem_minmax(0,1fr)] sm:gap-8">
						<dt class="flex items-center gap-3 font-semibold text-foreground">
							<Icon
								class="h-4 w-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							{item.term}
						</dt>
						<dd class="text-sm leading-relaxed text-muted-foreground sm:text-base">
							{item.text}
							{#if item.link}
								<a
									href={item.link.href}
									class="mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-foreground underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:mt-0 sm:ml-1 sm:min-h-0"
								>
									{item.link.label}
									<ArrowRight class="h-3.5 w-3.5 shrink-0" />
								</a>
							{/if}
						</dd>
					</div>
				{/each}
			</dl>

			<div class="mt-16 lg:ml-20">
				<h3 class="desk-serif text-2xl leading-snug text-foreground">
					Your work stays yours.
				</h3>
				<ul class="mt-6 grid gap-6 md:grid-cols-3 md:gap-8">
					{#each trust as item (item.term)}
						{@const Icon = item.icon}
						<li class="border-t border-border pt-4">
							<Icon class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
							<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
								<span class="font-semibold text-foreground">{item.term}</span>
								{item.text}
							</p>
						</li>
					{/each}
				</ul>
				<a
					href="/privacy"
					class="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-foreground underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Read the Privacy Policy
					<ArrowRight class="h-3.5 w-3.5 shrink-0" />
				</a>
			</div>
		</div>
	</section>

	<!-- 05 · Close -->
	<section
		class="border-t border-border bg-card/40 px-4 py-16 sm:px-6 sm:py-24 lg:px-10"
		aria-labelledby="desk-close-heading"
	>
		<div
			class="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-16"
		>
			<div>
				<h2
					id="desk-close-heading"
					class="desk-serif text-balance text-3xl leading-tight text-foreground sm:text-5xl"
				>
					Start with the messy version.
				</h2>
				<p class="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
					Bring one thing you're working on and the notes you already have. BuildOS turns
					them into a project you can keep coming back to.
				</p>
				<p class="mt-6 text-sm text-muted-foreground">
					14-day free trial. No credit card required.
				</p>
			</div>

			<div>
				<HomeDraftBox
					id="desk-draft"
					label="What are you working on?"
					showLabel
					rows={4}
					submitLabel="Start with one project"
				/>
				<a
					href="/auth/register"
					class="mt-3 inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Or create an account and start blank
				</a>
			</div>
		</div>
	</section>
</div>

<style>
	.desk-serif {
		font-family: ui-serif, 'New York', 'Iowan Old Style', 'Apple Garamond', Georgia, serif;
		font-weight: 500;
		letter-spacing: -0.015em;
	}
</style>
