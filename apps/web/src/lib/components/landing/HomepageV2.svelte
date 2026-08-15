<!-- apps/web/src/lib/components/landing/HomepageV2.svelte -->
<!--
  Homepage redesign — preview at /landing-v2
  Goal: make the path from messy input to a durable project obvious,
  using real product proof and one restrained visual language.
  Strategy: docs/marketing/strategy/buildos-positioning-and-homepage-rewrite-2026-05-07.md
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		FolderKanban,
		Target,
		Calendar,
		ListChecks,
		Flag,
		FileText,
		TriangleAlert,
		ArrowRight,
		ArrowDown,
		CircleCheck,
		Circle,
		Mail
	} from '$lib/icons/lucide';

	let isExampleOpen = $state(false);
	let ExampleModal = $state<any>(null);
	let PublicProjectView = $state<any>(null);
	let publicProjectLoadFailed = $state(false);
	let exampleComponentsLoadPromise: Promise<void> | undefined;

	function loadExampleComponents(): Promise<void> {
		if (ExampleModal && (PublicProjectView || publicProjectLoadFailed)) {
			return Promise.resolve();
		}
		if (exampleComponentsLoadPromise) return exampleComponentsLoadPromise;

		const modalLoad = import('$lib/components/ui/Modal.svelte')
			.then((module) => {
				ExampleModal = module.default;
			})
			.catch((error) => {
				console.error('[HomepageV2] Failed to load the example modal:', error);
			});
		const projectLoad = import(
			'$lib/components/landing/public-project-preview/PublicProjectView.svelte'
		)
			.then((module) => {
				PublicProjectView = module.default;
			})
			.catch((error) => {
				console.error('[HomepageV2] Failed to load PublicProjectView:', error);
				publicProjectLoadFailed = true;
			});

		exampleComponentsLoadPromise = Promise.all([modalLoad, projectLoad])
			.then(() => undefined)
			.finally(() => {
				exampleComponentsLoadPromise = undefined;
			});

		return exampleComponentsLoadPromise;
	}

	function preloadExampleModal() {
		void loadExampleComponents();
	}

	async function openExampleModal() {
		isExampleOpen = true;
		await loadExampleComponents();
	}

	onMount(() => {
		const rawHash = window.location.hash.slice(1);
		if (!rawHash) return;

		let targetId = rawHash;
		try {
			targetId = decodeURIComponent(rawHash);
		} catch {
			// Keep the literal fragment when it is not valid URI-encoded text.
		}

		const target = document.getElementById(targetId);
		if (!target) return;

		// Native fragment scrolling runs before deferred sections have stable geometry.
		// Align once to reveal the path, then again after that reveal has settled.
		const alignTarget = () =>
			target.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });

		requestAnimationFrame(() => {
			alignTarget();
			requestAnimationFrame(() => requestAnimationFrame(alignTarget));
		});
	});

	const dataModel = [
		{
			icon: FolderKanban,
			name: 'Projects',
			desc: "The work you're moving."
		},
		{ icon: Target, name: 'Goals', desc: "The outcome you're aiming for." },
		{ icon: Calendar, name: 'Plans', desc: 'The path from here to done.' },
		{ icon: ListChecks, name: 'Tasks', desc: 'The next concrete actions.' },
		{ icon: Flag, name: 'Milestones', desc: 'Proof that the work is moving.' },
		{ icon: FileText, name: 'Documents', desc: 'Notes, research, and drafts.' },
		{ icon: TriangleAlert, name: 'Risks', desc: 'Blockers and open questions.' },
		{
			icon: FolderKanban,
			name: 'Flexible structure',
			desc: 'A shape that fits the project.'
		}
	] as const;
</script>

<div class="min-h-screen bg-background text-foreground">
	<!-- ─── §01 hero ────────────────────────────────────────────────── -->
	<section class="border-b border-border">
		<div class="mx-auto max-w-7xl px-2 py-12 sm:px-4 sm:py-16 lg:px-6 lg:py-20">
			<div class="mx-auto max-w-4xl space-y-5 text-center sm:space-y-6">
				<div class="inline-flex items-center gap-2 text-muted-foreground">
					<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
					<span class="micro-label">For creators with too much in their head</span>
				</div>

				<h1
					class="text-4xl font-semibold leading-[1.02] tracking-tight sm:text-5xl md:text-6xl"
				>
					Turn messy thinking into a working project.
				</h1>

				<p
					class="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
				>
					Type it, paste it, or say it out loud. BuildOS turns the raw version into tasks,
					docs, and a clear next step.
				</p>

				<div class="flex flex-wrap items-center justify-center gap-3 pt-1">
					<a
						href="/auth/register"
						class="pressable rounded-md bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground shadow-ink transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
					>
						Start in chat
					</a>
					<a
						href="#walkthrough"
						class="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
					>
						See how it works
						<ArrowDown class="h-4 w-4 shrink-0" />
					</a>
				</div>
			</div>

			<!--
			  Real product walkthrough — actual screenshots of one live session.
			  The screenshots remain near their native width so the UI stays legible.
			  Captured from the Fading Crown demo account
			  (apps/web/scripts/seed-demo-account.ts); re-capture rather than mock up.
			-->
			<div
				id="walkthrough"
				class="mt-12 scroll-mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-ink sm:mt-16"
			>
				<div class="border-b border-border px-4 py-6 text-center sm:px-6">
					<p class="micro-label text-accent">From brain dump to project</p>
					<h2 class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
						One message in. A working project out.
					</h2>
					<p
						class="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base"
					>
						BuildOS creates the structure while you watch, then gives you a project you
						can keep using.
					</p>
					<p class="micro-label mt-3 text-muted-foreground">Real BuildOS screenshots</p>
				</div>

				<div>
					<article
						class="grid gap-5 p-4 sm:p-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8 lg:p-8"
					>
						<div>
							<span
								class="micro-label inline-flex h-7 items-center rounded-md border border-border px-2.5 text-muted-foreground"
							>
								Step 1
							</span>
							<h3 class="mt-3 text-xl font-semibold leading-snug tracking-tight">
								Tell BuildOS what you're making.
							</h3>
							<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
								Type, paste, or talk.
							</p>
						</div>

						<figure
							class="min-w-0 self-start overflow-hidden rounded-lg border border-accent/50 bg-background"
						>
							<figcaption
								class="flex min-h-10 items-center border-b border-border bg-muted/30 px-3"
							>
								<span class="text-sm font-semibold text-foreground"
									>Your brain dump</span
								>
							</figcaption>
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<div
								class="overflow-x-auto"
								role="region"
								tabindex="0"
								aria-label="Scrollable product screenshot"
							>
								<img
									src="/home/hero-say-light.jpg"
									alt="A messy brain dump about a fantasy novel typed into BuildOS chat"
									class="min-w-[720px] dark:hidden md:min-w-0 md:w-full"
									width="1000"
									height="120"
									fetchpriority="high"
								/>
								<img
									src="/home/hero-say-dark.jpg"
									alt=""
									aria-hidden="true"
									class="hidden min-w-[720px] dark:block md:min-w-0 md:w-full"
									width="1000"
									height="120"
									fetchpriority="high"
								/>
							</div>
							<p
								class="border-t border-border px-3 py-2 text-xs text-muted-foreground md:hidden"
							>
								Swipe the screenshot to read the full example →
							</p>
						</figure>
					</article>

					<article
						class="grid gap-5 border-t border-border p-4 sm:p-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8 lg:p-8"
					>
						<div>
							<span
								class="micro-label inline-flex h-7 items-center rounded-md border border-border px-2.5 text-muted-foreground"
							>
								Step 2
							</span>
							<h3 class="mt-3 text-xl font-semibold leading-snug tracking-tight">
								BuildOS creates the structure.
							</h3>
							<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
								Tasks, goals, and docs appear as it works.
							</p>
						</div>

						<figure
							class="min-w-0 self-start overflow-hidden rounded-lg border border-accent/50 bg-background"
						>
							<figcaption
								class="flex min-h-10 items-center border-b border-border bg-muted/30 px-3"
							>
								<span class="text-sm font-semibold text-foreground"
									>Build in progress</span
								>
							</figcaption>
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<div
								class="overflow-x-auto"
								role="region"
								tabindex="0"
								aria-label="Scrollable product screenshot"
							>
								<img
									src="/home/hero-work-light.jpg"
									alt="BuildOS chat receipts showing the Fading Crown project being created, followed by a summary of the project structure"
									class="min-w-[720px] dark:hidden md:min-w-0 md:w-full"
									width="1000"
									height="212"
									loading="lazy"
								/>
								<img
									src="/home/hero-work-dark.jpg"
									alt=""
									aria-hidden="true"
									class="hidden min-w-[720px] dark:block md:min-w-0 md:w-full"
									width="1000"
									height="212"
									loading="lazy"
								/>
							</div>
							<p
								class="border-t border-border px-3 py-2 text-xs text-muted-foreground md:hidden"
							>
								Swipe the screenshot to follow each action →
							</p>
						</figure>
					</article>

					<article
						class="grid gap-5 border-t border-border p-4 sm:p-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8 lg:p-8"
					>
						<div>
							<span
								class="micro-label inline-flex h-7 items-center rounded-md border border-border px-2.5 text-muted-foreground"
							>
								Step 3
							</span>
							<h3 class="mt-3 text-xl font-semibold leading-snug tracking-tight">
								Keep working outside the chat.
							</h3>
							<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
								Open the project, make changes, and pick up where you left off.
							</p>
						</div>

						<figure
							class="min-w-0 self-start overflow-hidden rounded-lg border border-accent/50 bg-background"
						>
							<figcaption
								class="flex min-h-10 items-center border-b border-border bg-muted/30 px-3"
							>
								<span class="text-sm font-semibold text-foreground"
									>Working project</span
								>
							</figcaption>
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<div
								class="overflow-x-auto"
								role="region"
								tabindex="0"
								aria-label="Scrollable product screenshot"
							>
								<img
									src="/home/hero-real-light.jpg"
									alt="The Fading Crown project page in BuildOS with recent activity, scheduled tasks, milestones, and an AI-suggested next move"
									class="min-w-[720px] dark:hidden md:min-w-0 md:w-full"
									width="1010"
									height="500"
									loading="lazy"
								/>
								<img
									src="/home/hero-real-dark.jpg"
									alt=""
									aria-hidden="true"
									class="hidden min-w-[720px] dark:block md:min-w-0 md:w-full"
									width="1010"
									height="500"
									loading="lazy"
								/>
							</div>
							<p
								class="border-t border-border px-3 py-2 text-xs text-muted-foreground md:hidden"
							>
								Swipe to explore the project →
							</p>
						</figure>
					</article>
				</div>

				<div class="border-t border-border bg-background px-4 py-5 text-center sm:px-6">
					<p class="mx-auto max-w-3xl text-base font-semibold text-foreground sm:text-lg">
						The result is a project—not another chat thread.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ─── §02 two ways to use BuildOS ─────────────────────────────── -->
	<section id="split" class="border-b border-border bg-card/30">
		<div class="mx-auto max-w-7xl px-2 py-12 sm:px-4 sm:py-16 lg:px-6">
			<div class="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
				<p class="micro-label text-muted-foreground">Built for both</p>
				<h2 class="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
					Use it yourself. Bring agents when you're ready.
				</h2>
			</div>

			<div class="grid gap-4 md:grid-cols-2 sm:gap-5">
				<article
					class="flex flex-col rounded-lg border border-border bg-background p-5 sm:p-6"
				>
					<p class="micro-label text-muted-foreground">Just you</p>
					<h3 class="mt-3 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
						Keep the whole project together.
					</h3>
					<p class="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
						BuildOS remembers the notes, tasks, decisions, and loose ends so you can
						return without rebuilding the context.
					</p>

					<div class="mt-auto pt-6">
						<button
							type="button"
							onclick={openExampleModal}
							onpointerenter={preloadExampleModal}
							onpointerdown={preloadExampleModal}
							onfocus={preloadExampleModal}
							class="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-foreground transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
						>
							Open an example project
							<ArrowRight class="h-4 w-4 shrink-0" />
						</button>
					</div>
				</article>

				<article
					class="flex flex-col rounded-lg border border-border bg-background p-5 sm:p-6"
				>
					<p class="micro-label text-muted-foreground">You + agents</p>
					<h3 class="mt-3 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
						Give agents the context to do useful work.
					</h3>
					<p class="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
						Agents read and update the same project state you use. No prompt
						archaeology. No hand-built handoffs.
					</p>

					<div class="mt-5 divide-y divide-border border-y border-border">
						<div class="grid gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-3">
							<p class="micro-label text-muted-foreground">You</p>
							<p class="text-sm text-foreground">Set direction and make decisions.</p>
						</div>
						<div class="grid gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-3">
							<p class="micro-label text-muted-foreground">Agents</p>
							<p class="text-sm text-foreground">
								Execute scoped work with real context.
							</p>
						</div>
						<div class="grid gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-3">
							<p class="micro-label text-muted-foreground">BuildOS</p>
							<p class="text-sm text-foreground">
								Keeps the shared project memory current.
							</p>
						</div>
					</div>

					<div class="mt-auto pt-6">
						<a
							href="#agents"
							class="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-foreground transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
						>
							See how agents use BuildOS
							<ArrowDown class="h-4 w-4 shrink-0" />
						</a>
					</div>
				</article>
			</div>
		</div>
	</section>

	<!-- ─── §03 real changes in the product ─────────────────────────── -->
	<section id="loop" class="border-b border-border">
		<div
			class="home-deferred home-deferred-loop mx-auto max-w-7xl px-2 py-12 sm:px-4 sm:py-16 lg:px-6"
		>
			<div class="space-y-8">
				<div class="text-center">
					<p class="micro-label text-muted-foreground">Real changes, made in chat</p>
					<h2 class="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
						Ask once. See the project update.
					</h2>
					<p class="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
						BuildOS finds the right item, makes the change, and shows you what moved.
					</p>
					<div
						class="mt-4 inline-flex items-center gap-2 rounded-md border border-accent/50 px-3 py-1.5"
					>
						<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
						<span class="micro-label text-accent">Real BuildOS screenshots</span>
						<span class="hidden h-3 w-px bg-accent/30 md:block"></span>
						<span class="micro-label hidden text-muted-foreground md:block"
							>Hover to zoom</span
						>
					</div>
				</div>

				<div class="mx-auto max-w-5xl space-y-6">
					<!-- USE CASE: update a task by talking -->
					<p class="micro-label text-muted-foreground">Update a task</p>

					<div
						class="flex flex-col md:grid md:grid-cols-[1.15fr_auto_1fr] gap-3 md:gap-4 md:items-center"
					>
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<figure
							class="app-screenshot app-screenshot--left overflow-hidden rounded-lg border border-accent/50 bg-card shadow-ink outline-none hover:border-accent hover:shadow-ink-strong focus-visible:border-accent focus-visible:shadow-ink-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
							tabindex="0"
						>
							<figcaption
								class="micro-label flex h-8 items-center border-b border-border bg-muted/30 px-3"
							>
								Ask in chat
							</figcaption>
							<img
								src="/home/case-update-chat-light.jpg"
								alt="Chat: push the beta-reader pass out a week and bump it to priority 1. BuildOS lists tasks, updates the task, and replies with the exact date and priority changes."
								class="w-full dark:hidden"
								width="1040"
								height="302"
								loading="lazy"
							/>
							<img
								src="/home/case-update-chat-dark.jpg"
								alt=""
								aria-hidden="true"
								class="w-full hidden dark:block"
								width="1040"
								height="302"
								loading="lazy"
							/>
						</figure>
						<div class="flex items-center justify-center text-muted-foreground">
							<ArrowRight class="hidden md:block w-5 h-5" />
							<ArrowDown class="md:hidden w-5 h-5" />
						</div>
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<figure
							class="app-screenshot app-screenshot--right overflow-hidden rounded-lg border border-accent/50 bg-card shadow-ink outline-none hover:border-accent hover:shadow-ink-strong focus-visible:border-accent focus-visible:shadow-ink-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
							tabindex="0"
						>
							<figcaption
								class="micro-label flex h-8 items-center border-b border-border bg-muted/30 px-3"
							>
								Task updated
							</figcaption>
							<img
								src="/home/case-board-light.jpg"
								alt="The task board with Beta-reader pass now priority 1 and due Aug 24 in the Scheduled column"
								class="w-full dark:hidden"
								width="980"
								height="310"
								loading="lazy"
							/>
							<img
								src="/home/case-board-dark.jpg"
								alt=""
								aria-hidden="true"
								class="w-full hidden dark:block"
								width="980"
								height="310"
								loading="lazy"
							/>
						</figure>
					</div>

					<!-- USE CASE: reschedule by talking -->
					<p class="micro-label border-t border-border pt-6 text-muted-foreground">
						Move something on your calendar
					</p>

					<div
						class="flex flex-col md:grid md:grid-cols-[1.15fr_auto_1fr] gap-3 md:gap-4 md:items-center"
					>
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<figure
							class="app-screenshot app-screenshot--left overflow-hidden rounded-lg border border-accent/50 bg-card shadow-ink outline-none hover:border-accent hover:shadow-ink-strong focus-visible:border-accent focus-visible:shadow-ink-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
							tabindex="0"
						>
							<figcaption
								class="micro-label flex h-8 items-center border-b border-border bg-muted/30 px-3"
							>
								Ask in chat
							</figcaption>
							<img
								src="/home/case-schedule-chat-light.jpg"
								alt="Chat: move my chapter 13 writing block to Thursday afternoon. BuildOS updates the Writing block task."
								class="w-full dark:hidden"
								width="1040"
								height="178"
								loading="lazy"
							/>
							<img
								src="/home/case-schedule-chat-dark.jpg"
								alt=""
								aria-hidden="true"
								class="hidden w-full dark:block"
								width="1040"
								height="178"
								loading="lazy"
							/>
						</figure>
						<div class="flex items-center justify-center text-muted-foreground">
							<ArrowRight class="hidden md:block w-5 h-5" />
							<ArrowDown class="md:hidden w-5 h-5" />
						</div>
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<figure
							class="app-screenshot app-screenshot--right overflow-hidden rounded-lg border border-accent/50 bg-card shadow-ink outline-none hover:border-accent hover:shadow-ink-strong focus-visible:border-accent focus-visible:shadow-ink-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
							tabindex="0"
						>
							<figcaption
								class="micro-label flex h-8 items-center border-b border-border bg-muted/30 px-3"
							>
								Calendar updated
							</figcaption>
							<img
								src="/home/case-schedule-cal-light.jpg"
								alt="The BuildOS calendar with the writing block now scheduled on Thursday the 13th"
								class="w-full dark:hidden"
								width="974"
								height="344"
								loading="lazy"
							/>
							<img
								src="/home/case-schedule-cal-dark.jpg"
								alt=""
								aria-hidden="true"
								class="hidden w-full dark:block"
								width="974"
								height="344"
								loading="lazy"
							/>
						</figure>
					</div>

					<!-- footer caption -->
					<p
						class="text-center text-xs sm:text-sm text-muted-foreground pt-6 max-w-2xl mx-auto leading-relaxed"
					>
						Every change stays attached to the project.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ─── §04 humans and agents share one project ─────────────────── -->
	<section id="agents" class="border-b border-border bg-card/30">
		<div
			class="home-deferred home-deferred-agents mx-auto max-w-7xl space-y-8 px-2 py-12 sm:px-4 sm:py-16 lg:px-6"
		>
			<div class="space-y-6">
				<div class="text-center">
					<p class="micro-label text-muted-foreground">Shared project memory</p>
					<h2 class="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
						One project for you and your agents.
					</h2>
					<p class="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
						You set direction. Agents execute. Both work from the same live context.
					</p>
				</div>

				<!-- the chart: 3-column architecture (You · Shared state · Agent) -->
				<div>
					<div class="grid md:grid-cols-3 gap-3 sm:gap-4 items-stretch">
						<!-- LEFT: Framework — for you -->
						<article
							class="flex flex-col rounded-lg border border-border bg-background p-5"
						>
							<div class="micro-label mb-2 text-muted-foreground">You</div>
							<h3 class="text-lg font-semibold tracking-tight">Direction</h3>
							<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
								Share ideas, make decisions, and choose what matters next.
							</p>
							<div class="mt-auto border-t border-border pt-4">
								<div class="micro-label mb-1 text-muted-foreground">Example</div>
								<p class="text-xs leading-relaxed">
									"Push the beta-reader pass to next week. Maya's act-3 turn
									should hinge on her sister."
								</p>
							</div>
						</article>

						<!-- MIDDLE: Shared project state -->
						<article
							class="flex flex-col rounded-lg border border-accent/50 bg-background p-5"
						>
							<div class="micro-label mb-2 text-accent">BuildOS</div>
							<h3 class="text-lg font-semibold tracking-tight">Project memory</h3>
							<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
								The project, its decisions, and its current state stay connected.
							</p>
							<div class="mt-4 space-y-1.5 text-sm">
								<div class="flex items-center gap-1.5">
									<FolderKanban
										class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
									/>
									<span
										>Project: <strong class="font-medium">Fading Crown</strong
										></span
									>
								</div>
								<div class="flex items-center gap-1.5">
									<FileText
										class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
									/>
									<span>Doc: Maya — character arc</span>
								</div>
								<div class="flex items-center gap-1.5">
									<Calendar
										class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
									/>
									<span>Task: Beta pass → +1 week</span>
								</div>
								<div class="flex items-center gap-1.5">
									<CircleCheck class="w-3.5 h-3.5 text-success flex-shrink-0" />
									<span class="line-through text-muted-foreground">
										Ch. 12 rewrite
									</span>
								</div>
							</div>
						</article>

						<!-- RIGHT: Harness — for your agent -->
						<article
							class="flex flex-col rounded-lg border border-border bg-background p-5"
						>
							<div class="micro-label mb-2 text-muted-foreground">Agents</div>
							<h3 class="text-lg font-semibold tracking-tight">Execution</h3>
							<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
								Agents pick up scoped work, use the context, and write results back.
							</p>

							<!-- compatible agents row -->
							<div class="mt-4 space-y-2">
								<div class="micro-label">Works with</div>
								<div class="flex flex-wrap items-center gap-2">
									<span
										class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1"
										title="Claude / Claude Code"
									>
										<svg
											aria-hidden="true"
											viewBox="0 0 24 24"
											class="w-3.5 h-3.5 text-foreground"
											fill="currentColor"
										>
											<path
												d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5527h3.7442L10.5363 3.541Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"
											/>
										</svg>
										<span class="text-2xs font-medium text-foreground">
											Claude
										</span>
									</span>
									<span
										class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1"
										title="ChatGPT / Codex"
									>
										<svg
											aria-hidden="true"
											viewBox="0 0 24 24"
											class="w-3.5 h-3.5 text-foreground"
											fill="currentColor"
										>
											<path
												d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
											/>
										</svg>
										<span class="text-2xs font-medium text-foreground">
											ChatGPT / Codex
										</span>
									</span>
									<span
										class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1"
										title="OpenClaw"
									>
										<img
											src="/brands/openclaw.png"
											alt=""
											aria-hidden="true"
											class="w-4 h-4 object-contain"
											width="16"
											height="16"
											loading="lazy"
											decoding="async"
											fetchpriority="low"
										/>
										<span class="text-2xs font-medium text-foreground">
											OpenClaw
										</span>
									</span>
								</div>
							</div>

							<div class="mt-auto border-t border-border pt-4">
								<div class="micro-label mb-1 text-muted-foreground">Example</div>
								<p class="text-xs leading-relaxed">
									"Draft the beta-reader email, move the calendar block, and log
									the result."
								</p>
							</div>
						</article>
					</div>

					<p
						class="mx-auto mt-8 max-w-2xl text-center text-sm font-medium text-foreground"
					>
						BuildOS is the project memory. You and your agents are the workers.
					</p>
				</div>
			</div>
		</div>
	</section>
	<!-- ─── §05 what it holds (the data model) ──────────────────────── -->
	<section class="home-deferred home-deferred-model border-b border-border">
		<div class="mx-auto max-w-7xl space-y-6 px-2 py-10 sm:px-4 sm:py-12 lg:px-6">
			<div class="text-center">
				<p class="micro-label text-muted-foreground">Project structure</p>
				<h2 class="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
					Everything has a place.
				</h2>
				<p class="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
					The pieces stay connected without forcing every project into the same template.
				</p>
			</div>

			<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
				{#each dataModel as item (item.name)}
					{@const Icon = item.icon}
					<div class="rounded-lg border border-border bg-card p-4">
						<div class="flex items-center gap-2 mb-1.5">
							<Icon class="h-4 w-4 shrink-0 text-muted-foreground" />
							<span class="text-sm font-semibold text-foreground">{item.name}</span>
						</div>
						<p class="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ─── §06 what it becomes — future pacing timeline ────────────── -->
	<section class="home-deferred home-deferred-timeline border-b border-border bg-card/30">
		<div class="mx-auto max-w-7xl space-y-8 px-2 py-12 sm:px-4 sm:py-16 lg:px-6">
			<div class="text-center">
				<p class="micro-label text-muted-foreground">Project memory</p>
				<h2 class="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
					More useful every day.
				</h2>
				<p class="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
					Every update adds context. BuildOS remembers where you left off and what comes
					next.
				</p>
			</div>

			<div class="grid md:grid-cols-3 gap-4 sm:gap-5">
				<!-- DAY 1 -->
				<article class="space-y-3">
					<div class="micro-label text-muted-foreground">Day 1 · first brain dump</div>
					<div class="overflow-hidden rounded-lg border border-border bg-background">
						<div
							class="micro-label flex h-8 items-center border-b border-border bg-muted/30 px-3"
						>
							New project
						</div>
						<div class="p-3 space-y-2 text-xs">
							<p class="text-muted-foreground italic leading-relaxed">
								"A queen is losing her magic. Act two is fuzzy. I need a first draft
								and beta readers."
							</p>
							<div class="border-t border-border/60 pt-2 space-y-1">
								<div class="flex items-center gap-1.5 text-foreground">
									<FolderKanban class="w-3 h-3 text-muted-foreground" />
									Project: <span class="font-medium">Fading Crown</span>
								</div>
								<div class="flex items-center gap-1.5 text-muted-foreground">
									<FileText class="w-3 h-3" /> Doc: Magic rules (draft)
								</div>
								<div class="flex items-center gap-1.5 text-muted-foreground">
									<Target class="w-3 h-3" /> Goal: First-draft complete
								</div>
							</div>
						</div>
					</div>
					<p class="text-xs text-muted-foreground leading-relaxed">
						BuildOS creates the first useful structure.
					</p>
				</article>

				<!-- WEEK 3 -->
				<article class="space-y-3">
					<div class="micro-label text-muted-foreground">Week 3 · momentum</div>
					<div class="overflow-hidden rounded-lg border border-border bg-background">
						<div
							class="micro-label flex h-8 items-center border-b border-border bg-muted/30 px-3"
						>
							Fading Crown — active
						</div>
						<div class="p-3 space-y-2 text-xs">
							<div class="space-y-1">
								<div class="flex items-center gap-1.5 text-foreground">
									<CircleCheck class="w-3 h-3 text-success" />
									<span class="line-through text-muted-foreground"
										>Outline act 1 beats</span
									>
								</div>
								<div class="flex items-center gap-1.5 text-foreground">
									<CircleCheck class="w-3 h-3 text-success" />
									<span class="line-through text-muted-foreground"
										>Magic system v2 draft</span
									>
								</div>
								<div class="flex items-center gap-1.5 text-foreground">
									<Circle class="w-3 h-3 text-muted-foreground" />
									Rewrite chapter 12 opening
								</div>
								<div class="flex items-center gap-1.5 text-foreground">
									<Circle class="w-3 h-3 text-muted-foreground" />
									Reconcile Maya's motivation
								</div>
							</div>
							<div class="border-t border-border/60 pt-2 micro-label">
								Recently captured · 4 docs · 12 tasks
							</div>
						</div>
					</div>
					<p class="text-xs text-muted-foreground leading-relaxed">
						The project shows what moved and what needs attention.
					</p>
				</article>

				<!-- MONTH 2 -->
				<article class="space-y-3">
					<div class="micro-label text-muted-foreground">Month 2 · daily brief</div>
					<div class="overflow-hidden rounded-lg border border-border bg-background">
						<div
							class="micro-label flex h-8 items-center justify-between border-b border-border bg-muted/30 px-3"
						>
							<span class="flex items-center gap-1.5">
								<Mail class="w-3 h-3" /> Daily brief — Tue
							</span>
							<span>Fading Crown</span>
						</div>
						<div class="p-3 space-y-2 text-xs">
							<p class="text-foreground font-medium">
								Yesterday: 3 chapters revised.
							</p>
							<div class="space-y-1 text-muted-foreground">
								<div>▸ Today: finish Ch. 12, beta-read pass</div>
								<div>▸ Calendar: 2pm writing block, 4pm beta call</div>
								<div>▸ Open question: Maya's act-3 turn</div>
							</div>
							<div class="border-t border-border/60 pt-2 micro-label">
								Synced to inbox · synced to calendar
							</div>
						</div>
					</div>
					<p class="text-xs text-muted-foreground leading-relaxed">
						The project tells you where to restart.
					</p>
				</article>
			</div>
		</div>
	</section>

	<!-- ─── §07 optional Google integrations ────────────────────────── -->
	<section id="google-integrations" class="home-deferred border-b border-border">
		<div class="mx-auto max-w-7xl px-2 py-12 sm:px-4 sm:py-16 lg:px-6">
			<div class="mx-auto max-w-3xl text-center">
				<p class="micro-label text-muted-foreground">Optional Google integrations</p>
				<h2 class="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
					Connect Google only if you choose.
				</h2>
				<p
					class="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base"
				>
					BuildOS works without a Google connection. Calendar and Gmail are separate,
					opt-in integrations: you start each connection and approve its requested
					permissions before BuildOS can access that Google account.
				</p>
			</div>

			<div class="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
				<article class="rounded-lg border border-border bg-card p-5 sm:p-6">
					<div class="flex items-center gap-2">
						<Calendar class="h-4 w-4 text-muted-foreground" />
						<p class="micro-label text-muted-foreground">Google Calendar</p>
					</div>
					<h3 class="mt-3 text-lg font-semibold tracking-tight">
						Bring schedules together.
					</h3>
					<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
						Choose which connected calendars BuildOS displays. When you enable syncing
						or request a calendar action, BuildOS can read availability and create,
						update, or remove events using the permissions you approved.
					</p>
				</article>

				<article class="rounded-lg border border-border bg-card p-5 sm:p-6">
					<div class="flex items-center gap-2">
						<Mail class="h-4 w-4 text-muted-foreground" />
						<p class="micro-label text-muted-foreground">Gmail · read-only</p>
					</div>
					<h3 class="mt-3 text-lg font-semibold tracking-tight">
						Find context when you ask.
					</h3>
					<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
						The current Gmail integration can search and read messages for features you
						invoke. It cannot send, edit, delete, archive, label, or mark email as read.
					</p>
				</article>
			</div>

			<p
				class="mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-muted-foreground sm:text-sm"
			>
				You can disconnect either integration at any time. See the
				<a class="font-medium text-foreground underline underline-offset-4" href="/privacy"
					>Privacy Policy</a
				>
				for how Google data is handled and the
				<a class="font-medium text-foreground underline underline-offset-4" href="/terms"
					>Terms of Service</a
				>.
			</p>
		</div>
	</section>

	<!-- ─── Final CTA ───────────────────────────────────────────────── -->
	<section class="home-deferred home-deferred-cta border-t border-border py-14 sm:py-20">
		<div class="mx-auto max-w-3xl px-4 text-center sm:px-6">
			<div class="micro-label text-muted-foreground">Start with one project</div>
			<h2 class="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
				Start with the messy version.
			</h2>
			<p class="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
				Tell BuildOS what you're making. Leave with a project you can move.
			</p>

			<div class="mt-7 flex flex-wrap items-center justify-center gap-3">
				<a
					href="/auth/register"
					class="pressable rounded-md bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					Start in chat
				</a>
				<a
					href="/blogs/philosophy"
					class="pressable rounded-md border border-border bg-background px-6 py-3 text-sm font-semibold transition-colors hover:border-foreground/40 hover:bg-muted/40 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					Read the philosophy
				</a>
			</div>
		</div>
	</section>
</div>

{#if isExampleOpen && ExampleModal}
	<ExampleModal
		isOpen={isExampleOpen}
		onClose={() => (isExampleOpen = false)}
		size="xl"
		title="Example project in BuildOS"
		ariaLabel="Example BuildOS project preview"
	>
		{#if PublicProjectView}
			<PublicProjectView embedded />
		{:else if publicProjectLoadFailed}
			<div class="px-4 sm:px-6 py-12 text-center text-sm text-muted-foreground">
				Couldn't load the example project. Close this and try again.
			</div>
		{:else}
			<div
				class="px-4 sm:px-6 py-16 flex items-center justify-center gap-2 text-sm text-muted-foreground"
			>
				<span
					aria-hidden="true"
					class="h-5 w-5 rounded-full border-2 border-border border-t-accent animate-spin motion-reduce:animate-none"
				></span>
				<span>Loading example project…</span>
			</div>
		{/if}
	</ExampleModal>
{/if}

<style>
	.app-screenshot {
		position: relative;
		z-index: 0;
		transition:
			border-color 120ms ease,
			box-shadow 180ms ease;
	}

	@media (min-width: 768px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
		.app-screenshot {
			will-change: transform;
			transition:
				transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
				border-color 120ms ease,
				box-shadow 180ms ease;
		}

		.app-screenshot:hover,
		.app-screenshot:focus-visible {
			z-index: 30;
			transform: scale(1.72);
		}

		.app-screenshot--left {
			transform-origin: left center;
		}

		.app-screenshot--right {
			transform-origin: right center;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.app-screenshot {
			transition: none;
		}
	}

	@supports (content-visibility: auto) {
		.home-deferred {
			content-visibility: auto;
		}

		.home-deferred-loop {
			contain-intrinsic-size: auto 900px;
		}

		.home-deferred-agents {
			contain-intrinsic-size: auto 835px;
		}

		.home-deferred-model {
			contain-intrinsic-size: auto 420px;
		}

		.home-deferred-timeline {
			contain-intrinsic-size: auto 525px;
		}

		.home-deferred-cta {
			contain-intrinsic-size: auto 330px;
		}
	}

	@media (max-width: 767px) {
		@supports (content-visibility: auto) {
			.home-deferred-loop {
				contain-intrinsic-size: auto 1862px;
			}

			.home-deferred-agents {
				contain-intrinsic-size: auto 1534px;
			}

			.home-deferred-model {
				contain-intrinsic-size: auto 975px;
			}

			.home-deferred-timeline {
				contain-intrinsic-size: auto 1040px;
			}

			.home-deferred-cta {
				contain-intrinsic-size: auto 635px;
			}
		}
	}
</style>
