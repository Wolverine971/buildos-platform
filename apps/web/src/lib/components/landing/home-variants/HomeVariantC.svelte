<!-- apps/web/src/lib/components/landing/home-variants/HomeVariantC.svelte -->
<!--
  Homepage version C, "Watch it work". Built around one demo (c/BrainDumpDemo.svelte): a
  messy brain dump turns into a project in front of you, the camera zooms out to the
  workspace, and a second dump lands in the right projects. The box right under it hands the
  visitor the same move. Real screenshots follow as proof. No API calls.
-->
<script lang="ts">
	import { ArrowDown, ArrowRight, Bot, CalendarClock, History } from '$lib/icons/lucide';
	import { START_PROJECT_CTA } from '$lib/constants/brand';
	import HomeDraftBox from './HomeDraftBox.svelte';
	import BrainDumpDemo from './c/BrainDumpDemo.svelte';

	let demoDraft = $state<ReturnType<typeof HomeDraftBox> | null>(null);
	let demoDraftSection = $state<HTMLElement | null>(null);

	function yourTurn() {
		demoDraftSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		demoDraft?.focusAtEnd();
	}

	const POINTS = [
		{
			icon: History,
			title: 'It remembers.',
			body: 'Notes, decisions, tasks, and documents stay attached to the project. Coming back never means rebuilding it in your head.'
		},
		{
			icon: CalendarClock,
			title: 'It keeps you moving.',
			body: 'A morning brief with what is due and what to do next. When plans change, say so in plain words and the project follows.'
		},
		{
			icon: Bot,
			title: 'It works with your agents.',
			body: 'Connect Claude or ChatGPT and they read the same project you do, then write their work back to it.',
			link: { href: '/integrations', label: 'See how agents connect' }
		}
	] as const;

	const SCREEN_PAIRS = [
		{
			title: 'Update a task by saying so.',
			ask: {
				name: 'case-update-chat',
				width: 1040,
				height: 302,
				alt: 'Chat: push the beta-reader pass out a week and bump it to priority 1. BuildOS updates the task and replies with the exact date and priority changes.'
			},
			result: {
				name: 'case-board',
				width: 980,
				height: 310,
				label: 'Task updated',
				alt: 'The task board with Beta-reader pass now priority 1 in the Scheduled column'
			}
		},
		{
			title: 'Move time on your calendar.',
			ask: {
				name: 'case-schedule-chat',
				width: 1040,
				height: 178,
				alt: 'Chat: move my chapter 13 writing block to Thursday afternoon. BuildOS updates the writing block task.'
			},
			result: {
				name: 'case-schedule-cal',
				width: 974,
				height: 344,
				label: 'Calendar updated',
				alt: 'The BuildOS calendar with the writing block now on Thursday'
			}
		}
	] as const;

	const primaryCta =
		'tx-button tx-button-accent inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-accent px-6 text-sm font-semibold text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
</script>

<div class="bg-background text-foreground">
	<!-- Hero -->
	<section class="px-4 pt-14 pb-12 sm:px-6 sm:pt-20 sm:pb-16 lg:pt-24">
		<div class="mx-auto max-w-4xl text-center">
			<h1
				class="text-balance text-4xl font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl"
			>
				Turn messy thinking into structured work.
			</h1>
			<p
				class="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg"
			>
				BuildOS is a thinking environment for people making complex things. Talk through the
				whole tangle and get back a project you can keep working from.
			</p>
			<div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
				<a href="/auth/register" class={primaryCta}>
					{START_PROJECT_CTA}
					<ArrowRight class="h-4 w-4 shrink-0" />
				</a>
				<a
					href="#stage"
					class="inline-flex min-h-12 items-center gap-2 rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				>
					Watch it work
					<ArrowDown class="h-4 w-4 shrink-0" />
				</a>
			</div>
			<p class="mt-4 text-xs text-muted-foreground">
				14-day free trial. No credit card required.
			</p>
		</div>
	</section>

	<!-- The stage: always the dark "ink room", whatever the site theme. -->
	<section
		id="stage"
		aria-labelledby="stage-heading"
		class="dark scroll-mt-4 border-y border-border bg-bench px-4 py-14 text-foreground sm:px-6 sm:py-20"
	>
		<div class="mx-auto max-w-6xl">
			<div class="mb-8 max-w-2xl sm:mb-10">
				<h2 id="stage-heading" class="text-3xl font-semibold tracking-tight sm:text-4xl">
					Watch a brain dump become a project.
				</h2>
				<p class="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
					Every piece of a messy note gets picked out and filed: tasks, docs, milestones,
					the next step. Then it keeps going, across all your projects.
				</p>
			</div>

			<BrainDumpDemo onyourturn={yourTurn} />

			<p class="mt-4 text-xs text-muted-foreground">
				A scripted replay of the BuildOS interface. <a
					href="#real-screens"
					class="font-medium text-foreground underline underline-offset-4 hover:text-accent"
					>See real screens</a
				>.
			</p>

			<div bind:this={demoDraftSection} class="mx-auto mt-14 max-w-2xl scroll-mt-24 sm:mt-20">
				<h3 class="text-2xl font-semibold tracking-tight sm:text-3xl">Now yours.</h3>
				<p class="mt-2 mb-5 text-base leading-relaxed text-muted-foreground">
					Dump whatever you are carrying around about one project. BuildOS sorts it the
					same way.
				</p>
				<HomeDraftBox
					bind:this={demoDraft}
					id="home-c-demo-draft"
					rows={4}
					label="Brain dump one project"
				/>
			</div>
		</div>
	</section>

	<!-- Built for long projects -->
	<section class="px-4 py-16 sm:px-6 sm:py-24">
		<div
			class="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-16"
		>
			<div>
				<h2 class="text-3xl font-semibold tracking-tight sm:text-4xl">
					Built for projects that take months.
				</h2>
				<p class="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
					A novel, a channel, a launch, a renovation. The kind of work that outlives any
					single to-do list or chat thread.
				</p>
			</div>
			<ol class="border-t border-border">
				{#each POINTS as point, i (point.title)}
					<li
						class="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-b border-border py-6 sm:grid-cols-[3rem_minmax(0,1fr)] sm:py-8"
					>
						<span class="stamp pt-1 text-sm text-muted-foreground">
							{String(i + 1).padStart(2, '0')}
						</span>
						<div>
							<h3
								class="flex items-center gap-2.5 text-xl font-semibold tracking-tight"
							>
								<point.icon class="h-5 w-5 shrink-0 text-accent" />
								{point.title}
							</h3>
							<p
								class="mt-2 max-w-xl text-base leading-relaxed text-muted-foreground"
							>
								{point.body}
							</p>
							{#if 'link' in point}
								<a
									href={point.link.href}
									class="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-foreground transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
								>
									{point.link.label}
									<ArrowRight class="h-4 w-4 shrink-0" />
								</a>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<!-- Real screens -->
	<section
		id="real-screens"
		aria-labelledby="real-screens-heading"
		class="scroll-mt-4 border-t border-border bg-card/40 px-4 py-16 sm:px-6 sm:py-24"
	>
		<div class="mx-auto max-w-6xl">
			<div class="max-w-2xl">
				<h2
					id="real-screens-heading"
					class="text-3xl font-semibold tracking-tight sm:text-4xl"
				>
					The real thing.
				</h2>
				<p class="mt-3 text-base leading-relaxed text-muted-foreground">
					Real screens from the Fading Crown example project. Ask in chat, and the project
					updates.
				</p>
			</div>

			<div class="mt-10 flex flex-col gap-12 sm:mt-12">
				{#each SCREEN_PAIRS as pair (pair.title)}
					<div>
						<h3 class="text-lg font-semibold tracking-tight">{pair.title}</h3>
						<div
							class="mt-4 grid items-center gap-3 md:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1fr)] md:gap-4"
						>
							<figure
								class="overflow-hidden rounded-lg border border-border bg-background shadow-ink"
							>
								<figcaption
									class="flex h-9 items-center border-b border-border px-3 text-xs font-medium text-muted-foreground"
								>
									Ask in chat
								</figcaption>
								<img
									src="/home/{pair.ask.name}-light.jpg"
									alt={pair.ask.alt}
									class="w-full dark:hidden"
									width={pair.ask.width}
									height={pair.ask.height}
									loading="lazy"
									decoding="async"
								/>
								<img
									src="/home/{pair.ask.name}-dark.jpg"
									alt=""
									aria-hidden="true"
									class="hidden w-full dark:block"
									width={pair.ask.width}
									height={pair.ask.height}
									loading="lazy"
									decoding="async"
								/>
							</figure>
							<div
								class="flex justify-center text-muted-foreground"
								aria-hidden="true"
							>
								<ArrowDown class="h-5 w-5 md:hidden" />
								<ArrowRight class="hidden h-5 w-5 md:block" />
							</div>
							<figure
								class="overflow-hidden rounded-lg border border-border bg-background shadow-ink"
							>
								<figcaption
									class="flex h-9 items-center border-b border-border px-3 text-xs font-medium text-muted-foreground"
								>
									{pair.result.label}
								</figcaption>
								<img
									src="/home/{pair.result.name}-light.jpg"
									alt={pair.result.alt}
									class="w-full dark:hidden"
									width={pair.result.width}
									height={pair.result.height}
									loading="lazy"
									decoding="async"
								/>
								<img
									src="/home/{pair.result.name}-dark.jpg"
									alt=""
									aria-hidden="true"
									class="hidden w-full dark:block"
									width={pair.result.width}
									height={pair.result.height}
									loading="lazy"
									decoding="async"
								/>
							</figure>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Closing CTA -->
	<section class="border-t border-border px-4 py-16 sm:px-6 sm:py-24">
		<div class="mx-auto max-w-2xl text-center">
			<h2 class="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
				Start with the messy version.
			</h2>
			<p class="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
				Bring one thing you are working on. The rough notes you already have are enough.
			</p>
			<div class="mt-8 flex flex-col items-center gap-3">
				<a href="/auth/register" class={primaryCta}>
					{START_PROJECT_CTA}
					<ArrowRight class="h-4 w-4 shrink-0" />
				</a>
				<p class="text-xs text-muted-foreground">
					14-day free trial. No credit card required.
				</p>
			</div>
		</div>

		<div class="mx-auto mt-12 max-w-2xl">
			<p class="mb-3 text-center text-sm font-medium text-muted-foreground">
				Or paste what you have now
			</p>
			<HomeDraftBox id="home-c-draft" rows={3} label="Paste your notes to start a project" />
		</div>
	</section>
</div>
