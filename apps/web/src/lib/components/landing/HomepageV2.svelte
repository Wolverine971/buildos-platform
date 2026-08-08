<!-- apps/web/src/lib/components/landing/HomepageV2.svelte -->
<!--
  Homepage redesign — preview at /landing-v2
  Goal: lead with simple promise, split audience (creator vs technical/builder)
  using the §-numbered two-column pattern, then dramatize compounding value
  via a Day 1 → Week 3 → Month 2 future-pacing timeline.
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
		ArrowLeft,
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
			desc: 'The bodies of work you are trying to finish.'
		},
		{ icon: Target, name: 'Goals', desc: 'The outcomes that give the work direction.' },
		{ icon: Calendar, name: 'Plans', desc: 'The stages the work moves through.' },
		{ icon: ListChecks, name: 'Tasks', desc: 'The concrete next moves that ship it.' },
		{ icon: Flag, name: 'Milestones', desc: 'Checkpoints that show the project is moving.' },
		{ icon: FileText, name: 'Documents', desc: 'Research, scripts, notes, references.' },
		{ icon: TriangleAlert, name: 'Risks', desc: 'Unknowns, blockers, and loose ends.' },
		{
			icon: FolderKanban,
			name: 'Flexible structure',
			desc: 'Project-specific shape that adapts to what you are building.'
		}
	] as const;
</script>

<div class="min-h-screen bg-background text-foreground">
	<!-- ─── §01 hero ────────────────────────────────────────────────── -->
	<section class="border-b border-border">
		<div class="mx-auto max-w-7xl px-2 py-10 sm:px-4 sm:py-14 lg:px-6 lg:py-16">
			<div class="mx-auto max-w-4xl space-y-5 text-center sm:space-y-6">
				<div
					class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-ink tx tx-frame tx-weak"
				>
					<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
					<span class="micro-label">
						For authors, YouTubers, podcasters, and course creators
					</span>
				</div>

				<h1
					class="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.02]"
				>
					Get it out of your head.<br />
					We'll make it
					<span class="relative">
						make sense.
						<span
							class="absolute inset-x-0 bottom-1 -z-10 h-[0.65em] tx tx-bloom tx-med rounded"
						></span>
					</span>
				</h1>

				<p
					class="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
				>
					Brain-dump everything — half-thoughts, voice memos, the 2am spiral. BuildOS
					turns it into projects, tasks, and a plan you can actually move on.
				</p>

				<div class="flex flex-wrap items-center justify-center gap-3 pt-1">
					<a
						href="/auth/register"
						class="pressable rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-ink hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						Start in chat
					</a>
					<a
						href="#walkthrough"
						class="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						See the transformation ↓
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
				class="mt-12 scroll-mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-ink-strong tx tx-frame tx-weak sm:mt-16"
			>
				<div
					class="border-b border-border px-4 py-5 text-center tx tx-strip tx-med sm:px-6"
				>
					<p class="micro-label text-accent">One conversation → one working project</p>
					<h2 class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
						See exactly what happens after you hit send.
					</h2>
					<p
						class="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base"
					>
						No templates to configure. No blank project to organize. Start with the
						messy version and watch it become something you can use.
					</p>
				</div>

				<div class="relative">
					<div
						aria-hidden="true"
						class="absolute bottom-12 left-12 top-12 hidden w-px bg-border xl:block"
					></div>
					<article
						class="relative grid gap-5 p-4 sm:p-6 lg:p-8 xl:grid-cols-[12rem_minmax(0,1fr)] xl:gap-8"
					>
						<div class="relative xl:pl-11">
							<span
								class="micro-label inline-flex h-7 items-center rounded-md border border-accent/40 bg-accent/10 px-2.5 text-accent shadow-ink-inner xl:absolute xl:left-0 xl:top-0 xl:h-8 xl:w-8 xl:justify-center xl:px-0"
							>
								<span class="xl:hidden">Step&nbsp;</span>1
							</span>
							<h3
								class="mt-3 text-xl font-semibold leading-snug tracking-tight xl:mt-0"
							>
								Brain-dump your project.
							</h3>
							<p
								class="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base"
							>
								Type, paste, or talk. Messy is fine.
							</p>
						</div>

						<figure
							class="min-w-0 self-start overflow-hidden rounded-lg border border-accent/50 bg-background shadow-ink"
						>
							<figcaption
								class="flex min-h-10 items-center justify-between gap-3 border-b border-border px-3 tx tx-strip tx-weak"
							>
								<span class="text-sm font-semibold text-foreground"
									>Your brain dump</span
								>
								<span class="micro-label hidden text-muted-foreground sm:block"
									>Messy is welcome</span
								>
							</figcaption>
							<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard access for horizontal screenshot overflow) -->
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
						class="relative grid gap-5 border-t border-border p-4 sm:p-6 lg:p-8 xl:grid-cols-[12rem_minmax(0,1fr)] xl:gap-8"
					>
						<div class="relative xl:pl-11">
							<span
								class="micro-label inline-flex h-7 items-center rounded-md border border-accent/40 bg-accent/10 px-2.5 text-accent shadow-ink-inner xl:absolute xl:left-0 xl:top-0 xl:h-8 xl:w-8 xl:justify-center xl:px-0"
							>
								<span class="xl:hidden">Step&nbsp;</span>2
							</span>
							<h3
								class="mt-3 text-xl font-semibold leading-snug tracking-tight xl:mt-0"
							>
								BuildOS builds the project.
							</h3>
							<p
								class="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base"
							>
								It creates the structure, goals, and starting documents.
							</p>
						</div>

						<figure
							class="min-w-0 self-start overflow-hidden rounded-lg border border-accent/50 bg-background shadow-ink"
						>
							<figcaption
								class="flex min-h-10 items-center justify-between gap-3 border-b border-border px-3 tx tx-strip tx-weak"
							>
								<span class="text-sm font-semibold text-foreground"
									>BuildOS creates the project</span
								>
								<span class="micro-label hidden text-muted-foreground sm:block"
									>Visible as it happens</span
								>
							</figcaption>
							<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard access for horizontal screenshot overflow) -->
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
						class="relative grid gap-5 border-t border-border p-4 sm:p-6 lg:p-8 xl:grid-cols-[12rem_minmax(0,1fr)] xl:gap-8"
					>
						<div class="relative xl:pl-11">
							<span
								class="micro-label inline-flex h-7 items-center rounded-md border border-accent/40 bg-accent/10 px-2.5 text-accent shadow-ink-inner xl:absolute xl:left-0 xl:top-0 xl:h-8 xl:w-8 xl:justify-center xl:px-0"
							>
								<span class="xl:hidden">Step&nbsp;</span>3
							</span>
							<h3
								class="mt-3 text-xl font-semibold leading-snug tracking-tight xl:mt-0"
							>
								Open your working project.
							</h3>
							<p
								class="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base"
							>
								Explore and update everything beyond the chat.
							</p>
						</div>

						<figure
							class="min-w-0 self-start overflow-hidden rounded-lg border border-accent/50 bg-background shadow-ink"
						>
							<figcaption
								class="flex min-h-10 items-center justify-between gap-3 border-b border-border px-3 tx tx-strip tx-weak"
							>
								<span class="text-sm font-semibold text-foreground"
									>Your project, ready to use</span
								>
								<span class="micro-label hidden text-muted-foreground sm:block"
									>Beyond the chat</span
								>
							</figcaption>
							<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard access for horizontal screenshot overflow) -->
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

				<div
					class="border-t border-accent/30 bg-accent/5 px-4 py-5 text-center sm:px-6 sm:py-6"
				>
					<p
						class="mx-auto max-w-3xl text-base font-semibold leading-relaxed text-foreground sm:text-lg"
					>
						<span class="text-accent">The aha:</span> you don't finish with a better chat
						response. You finish with a project that's ready to move.
					</p>
					<p class="mt-2 text-xs text-muted-foreground sm:text-sm">
						Real screenshots from one live session — nothing mocked up.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ═══ BRANCH WRAPPER: continuous decision-tree rails — §02 → §03 (No) and §02 → §04 (Yes, skirts §03) ═══ -->
	<div class="relative">
		<!--
		  decorative rail layer (lg+ only).
		  - LEFT path: straight vertical from §02A card-bottom (x=25%) to §03 chip (x=25%, y=31.5%).
		  - RIGHT path: right-angle around §03 — from §02B card-bottom (x=75%) drops a hair,
		    turns right to x=90% (clears §03's 78%-wide card), then drops past §03's bottom and
		    lands at the §04 chip at (x=90%, y=75%).
		  SVG keeps the dash pattern continuous around corners (CSS borders break dashes at joins).
		  Coordinate space: viewBox 0-100 stretched non-uniformly over the rail wrapper.
		  vector-effect="non-scaling-stroke" keeps the stroke 2px regardless of the stretch.
		-->
		<div aria-hidden="true" class="hidden lg:block absolute inset-0 pointer-events-none z-[1]">
			<div class="mx-auto h-full max-w-7xl px-2 sm:px-4 lg:px-6">
				<div class="relative h-full">
					<svg
						class="absolute inset-0 w-full h-full text-foreground/55"
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
					>
						<!-- LEFT: §02A → §03 -->
						<path
							d="M 25,27 L 25,31.5"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-dasharray="6 4"
							vector-effect="non-scaling-stroke"
						/>
						<!-- RIGHT: §02B → around §03 → §04 -->
						<path
							d="M 75,27 L 75,29 L 90,29 L 90,75"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-dasharray="6 4"
							stroke-linejoin="miter"
							vector-effect="non-scaling-stroke"
						/>
					</svg>
					<!-- exit dots (HTML so they stay round under the SVG's non-uniform stretch) -->
					<span
						class="absolute left-[25%] top-[27%] -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-foreground/60"
					></span>
					<span
						class="absolute left-[75%] top-[27%] -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-foreground/60"
					></span>
					<!-- landing dots -->
					<span
						class="absolute left-[25%] top-[31.5%] -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-foreground/60"
					></span>
					<span
						class="absolute left-[90%] top-[75%] -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-foreground/60"
					></span>
				</div>
			</div>
		</div>

		<!-- ─── §02 the two-persona split (modeled on Stakes screenshot) ─── -->
		<section id="split" class="border-b border-border bg-card/40">
			<div class="mx-auto max-w-7xl px-2 py-12 sm:px-4 sm:py-16 lg:px-6">
				<div class="text-center mb-8 sm:mb-10">
					<h2 class="micro-label inline-flex items-center gap-3">
						<span class="h-px w-10 bg-border"></span>
						<span>§02 — Do you work with AI agents yet?</span>
						<span class="h-px w-10 bg-border"></span>
					</h2>
				</div>

				<div class="grid md:grid-cols-2 gap-4 sm:gap-5">
					<!-- LEFT: NO — for the long-tail creator -->
					<article
						class="rounded-lg border border-border bg-background shadow-ink tx tx-bloom tx-weak p-5 sm:p-6 flex flex-col"
					>
						<div class="micro-label mb-3 flex items-center gap-2">
							<span class="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"></span>
							<span>§02A — No</span>
						</div>

						<h3 class="text-xl sm:text-2xl font-semibold tracking-tight leading-snug">
							That's most people. Most of the work isn't AI — it's keeping the project
							from falling apart.
						</h3>

						<p class="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
							Chapters drift. Episodes pile up. Launches sprawl into ten tabs. BuildOS
							holds the whole project in one place — notes, tasks, research, decisions
							— so you stop losing the thread between sessions.
						</p>

						<p class="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
							You talk. We organize. You come back tomorrow and pick up exactly where
							you left off.
						</p>

						<div class="mt-auto pt-6">
							<button
								type="button"
								onclick={openExampleModal}
								onpointerenter={preloadExampleModal}
								onpointerdown={preloadExampleModal}
								onfocus={preloadExampleModal}
								class="group inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground transition-all hover:gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
							>
								See an example project
								<ArrowRight class="h-4 w-4 shrink-0" />
							</button>
						</div>
					</article>

					<!-- RIGHT: YES — for the technical / builder -->
					<article
						class="rounded-lg border border-border bg-background shadow-ink tx tx-grain tx-weak p-5 sm:p-6 flex flex-col"
					>
						<div class="micro-label mb-3 flex items-center gap-2">
							<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
							<span>§02B — Yes</span>
						</div>

						<h3 class="text-xl sm:text-2xl font-semibold tracking-tight leading-snug">
							Then you already know context is the bottleneck. BuildOS is the layer
							between you and your agents.
						</h3>

						<p class="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
							A framework for the person. A harness for the agent. Same context drives
							both. Cheap models stay productive when the context layer is right — and
							your non-technical collaborators can finally read off the same sheet of
							music.
						</p>

						<!-- mini "type cards" mirroring the Stakes pattern -->
						<div class="mt-5 space-y-2">
							<div
								class="rounded-md border border-border bg-card shadow-ink-inner p-3 tx tx-frame tx-weak"
							>
								<div class="micro-label mb-1">Framework — for you</div>
								<p class="text-xs sm:text-sm text-foreground leading-snug">
									Daily brief, return-and-update, the ritual of clarity. You stay
									in the work, not above it.
								</p>
							</div>
							<div
								class="rounded-md border border-border bg-card shadow-ink-inner p-3 tx tx-grain tx-weak"
							>
								<div class="micro-label mb-1">Harness — for your agent</div>
								<p class="text-xs sm:text-sm text-foreground leading-snug">
									Persistent project memory, structured tool calls, the context an
									agent needs to actually be useful in production.
								</p>
							</div>
							<div
								class="rounded-md border border-border bg-card shadow-ink-inner p-3 tx tx-thread tx-weak"
							>
								<div class="micro-label mb-1">Shared context</div>
								<p class="text-xs sm:text-sm text-foreground leading-snug">
									Both sides read from the same project state. Parallel work, not
									delegation.
								</p>
							</div>
						</div>

						<div class="mt-auto pt-6">
							<a
								href="#agents"
								class="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground transition-all hover:gap-3 focus:outline-none focus-visible:gap-3 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
							>
								Skip to: how agents work in BuildOS
								<ArrowDown class="w-4 h-4" />
							</a>
						</div>
					</article>
				</div>
			</div>
		</section>

		<!-- ─── §03 the loop — flow chart for non-AI users (rail enters from §02A above) ── -->
		<section id="loop" class="border-b border-border">
			<div
				class="home-deferred home-deferred-loop relative z-[2] mx-auto max-w-7xl space-y-8 px-2 py-12 sm:px-4 sm:py-16 lg:px-6"
			>
				<!--
				  entry marker: dead-center under LEFT rail via grid-mirroring.
				  Uses the same grid shape as §02 so the chip lands on the same X as the rail.
				  On mobile the outer div collapses to block and the chip just sits left-aligned.
				-->
				<div class="relative z-10 lg:grid lg:grid-cols-2 lg:gap-5">
					<div class="lg:flex lg:justify-center">
						<div class="relative">
							<div
								class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card shadow-ink-inner px-3 py-1.5 tx tx-bloom tx-weak"
							>
								<span class="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
								></span>
								<span class="micro-label"> ↓ from §02A — no </span>
							</div>
						</div>
					</div>
					<div class="hidden lg:block"></div>
				</div>

				<!--
				  §03 card (78% width on lg+). The right ~22% gutter stays empty so the §02B
				  rail can wrap around to the right and continue down to §04.
				-->
				<div
					class="lg:max-w-[78%] rounded-lg border border-border bg-background shadow-ink-strong tx tx-frame tx-weak p-5 sm:p-8 space-y-8"
				>
					<div class="text-center">
						<div class="micro-label inline-flex items-center gap-3">
							<span class="h-px w-10 bg-border"></span>
							<span>§03 — The loop</span>
							<span class="h-px w-10 bg-border"></span>
						</div>
						<h2 class="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
							How it actually works.
						</h2>
						<p class="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
							Two real sessions on the same project — every change made by talking,
							every tool call on the record.
						</p>
						<div
							class="mt-4 inline-flex items-center gap-2 rounded-md border border-accent/50 bg-accent/5 px-3 py-1.5 shadow-ink-inner"
						>
							<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
							<span class="micro-label text-accent">Real BuildOS screenshots</span>
							<span class="hidden h-3 w-px bg-accent/30 md:block"></span>
							<span class="micro-label hidden text-muted-foreground md:block"
								>Hover to inspect</span
							>
						</div>
					</div>

					<div class="max-w-4xl mx-auto space-y-5">
						<!-- USE CASE: update a task by talking -->
						<div class="flex items-center gap-3">
							<div class="flex-1 border-t border-dashed border-border"></div>
							<span class="micro-label font-medium">
								Change anything in one sentence
							</span>
							<div class="flex-1 border-t border-dashed border-border"></div>
						</div>

						<div
							class="flex flex-col md:grid md:grid-cols-[1.15fr_auto_1fr] gap-3 md:gap-4 md:items-center"
						>
							<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard focus mirrors the desktop hover inspection) -->
							<figure
								class="app-screenshot app-screenshot--left overflow-hidden rounded-lg border border-accent/50 bg-card shadow-ink tx tx-bloom tx-weak outline-none hover:border-accent hover:shadow-ink-strong focus-visible:border-accent focus-visible:shadow-ink-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
								tabindex="0"
							>
								<figcaption
									class="h-7 border-b border-border tx tx-strip tx-weak px-3 flex items-center micro-label"
								>
									You say it · BuildOS finds the task
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
							<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard focus mirrors the desktop hover inspection) -->
							<figure
								class="app-screenshot app-screenshot--right overflow-hidden rounded-lg border border-accent/50 bg-card shadow-ink tx tx-grain tx-weak outline-none hover:border-accent hover:shadow-ink-strong focus-visible:border-accent focus-visible:shadow-ink-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
								tabindex="0"
							>
								<figcaption
									class="h-7 border-b border-border tx tx-strip tx-weak px-3 flex items-center micro-label"
								>
									It lands on the board · P1, new date
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
						<div class="flex items-center gap-3 py-2">
							<div class="flex-1 border-t border-dashed border-border"></div>
							<span class="micro-label font-medium"> Reschedule by talking </span>
							<div class="flex-1 border-t border-dashed border-border"></div>
						</div>

						<div
							class="flex flex-col md:grid md:grid-cols-[1.15fr_auto_1fr] gap-3 md:gap-4 md:items-center"
						>
							<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard focus mirrors the desktop hover inspection) -->
							<figure
								class="app-screenshot app-screenshot--left overflow-hidden rounded-lg border border-accent/50 bg-card shadow-ink tx tx-bloom tx-weak outline-none hover:border-accent hover:shadow-ink-strong focus-visible:border-accent focus-visible:shadow-ink-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
								tabindex="0"
							>
								<figcaption
									class="h-7 border-b border-border tx tx-strip tx-weak px-3 flex items-center micro-label"
								>
									"Move my writing block to Thursday"
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
							<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard focus mirrors the desktop hover inspection) -->
							<figure
								class="app-screenshot app-screenshot--right overflow-hidden rounded-lg border border-accent/50 bg-card shadow-ink tx tx-grain tx-weak outline-none hover:border-accent hover:shadow-ink-strong focus-visible:border-accent focus-visible:shadow-ink-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
								tabindex="0"
							>
								<figcaption
									class="h-7 border-b border-border tx tx-strip tx-weak px-3 flex items-center micro-label"
								>
									It lands on the calendar · Thursday
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
							No re-explaining where you are. No re-finding what you decided last
							week. The project remembers — and every change is a tool call on the
							record, not a vibe.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- ─── §04 same context — agents at the same project (for §02B readers) ── -->
		<section id="agents" class="relative border-b border-border bg-card/40">
			<div
				class="home-deferred home-deferred-agents relative z-[2] mx-auto max-w-7xl space-y-8 px-2 py-12 sm:px-4 sm:py-16 lg:px-6"
			>
				<!--
				  entry marker: lands at the RIGHT rail's terminus (x=90% on lg+).
				  The chip sits inside a 20%-wide column anchored to the parent's right edge
				  (so it spans 80%-100%), then centers itself in that column → chip center at 90%.
				  On mobile, the outer's flex justify-end keeps the chip right-aligned.
				-->
				<div class="relative z-10 min-h-[2.5rem] flex justify-end">
					<div
						class="lg:absolute lg:right-0 lg:top-0 lg:w-[20%] lg:flex lg:justify-center"
					>
						<div class="relative">
							<div
								class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card shadow-ink-inner px-3 py-1.5 tx tx-grain tx-weak whitespace-nowrap"
							>
								<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
								<span class="micro-label"> ↓ from §02B — yes </span>
							</div>
						</div>
					</div>
				</div>

				<!--
				  §04 card — wider than §03 (full content-area width), so the architecture
				  chart can breathe and the rail's landing on its top-right reads as deliberate.
				-->
				<div
					class="rounded-lg border border-border bg-background shadow-ink-strong tx tx-frame tx-weak p-5 sm:p-8 space-y-6"
				>
					<div class="text-center">
						<div class="micro-label inline-flex items-center gap-3">
							<span class="h-px w-10 bg-border"></span>
							<span>§04 — Same context</span>
							<span class="h-px w-10 bg-border"></span>
						</div>
						<h2 class="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
							You and your agents, on the same project.
						</h2>
						<p class="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
							Same context, two surfaces. You stay in the work. Your agents stay
							useful. Both contribute to the same project state.
						</p>
					</div>

					<!-- the chart: 3-column architecture (You · Shared state · Agent) -->
					<div>
						<div class="grid md:grid-cols-3 gap-3 sm:gap-4 items-stretch">
							<!-- LEFT: Framework — for you -->
							<article
								class="rounded-lg border border-border bg-background shadow-ink tx tx-bloom tx-weak p-5 flex flex-col"
							>
								<div class="micro-label mb-2">Framework — for you</div>
								<h3 class="text-lg font-semibold tracking-tight">
									High-level direction.
								</h3>
								<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
									Brain dumps, decisions, taste. The daily brief surfaces what
									deserves your attention. You stay the author.
								</p>
								<div
									class="mt-4 rounded-md border border-border bg-card shadow-ink-inner p-3 tx tx-grid tx-weak"
								>
									<div class="micro-label mb-1">You · brain dump</div>
									<p class="text-xs leading-relaxed">
										"Push the beta-reader pass to next week. Maya's act-3 turn
										should hinge on her sister."
									</p>
								</div>
							</article>

							<!-- MIDDLE: Shared project state -->
							<article
								class="rounded-lg border border-accent/40 bg-accent/5 shadow-ink-strong tx tx-frame tx-med p-5 flex flex-col"
							>
								<div class="micro-label text-accent mb-2">Shared project state</div>
								<h3 class="text-lg font-semibold tracking-tight">
									The same context.
								</h3>
								<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
									Project, docs, decisions, conversations. Both sides write to it.
									Both sides read from it.
								</p>
								<div class="mt-4 space-y-1.5 text-sm">
									<div class="flex items-center gap-1.5">
										<FolderKanban
											class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
										/>
										<span
											>Project: <strong class="font-medium"
												>Fading Crown</strong
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
										<CircleCheck
											class="w-3.5 h-3.5 text-success flex-shrink-0"
										/>
										<span class="line-through text-muted-foreground">
											Ch. 12 rewrite
										</span>
									</div>
								</div>
							</article>

							<!-- RIGHT: Harness — for your agent -->
							<article
								class="rounded-lg border border-border bg-background shadow-ink tx tx-grain tx-weak p-5 flex flex-col"
							>
								<div class="micro-label mb-2">Harness — for your agent</div>
								<h3 class="text-lg font-semibold tracking-tight">
									Grounded execution.
								</h3>
								<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
									Your agent reads the project state, picks up tool calls, ships
									scoped work. Cheap models stay productive when the context layer
									is right.
								</p>

								<!-- compatible agents row -->
								<div class="mt-4 space-y-2">
									<div class="micro-label">Works with</div>
									<div class="flex flex-wrap items-center gap-2">
										<span
											class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card shadow-ink-inner px-2 py-1"
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
											class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card shadow-ink-inner px-2 py-1"
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
											class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card shadow-ink-inner px-2 py-1"
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

								<div
									class="mt-4 rounded-md border border-border bg-card shadow-ink-inner p-3 tx tx-thread tx-weak"
								>
									<div class="micro-label mb-1">Agent · acting on it</div>
									<p class="text-xs leading-relaxed">
										"Drafting beta-reader email with the latest Ch. 12.
										Rescheduling the calendar block. Logging notes back to the
										project."
									</p>
								</div>
							</article>
						</div>

						<!-- bidirectional flow indicators -->
						<div
							class="micro-label mt-5 grid gap-3 text-center md:grid-cols-3 sm:gap-4"
						>
							<div class="flex items-center justify-center gap-2">
								<span>writes & reads</span>
								<ArrowRight class="w-3.5 h-3.5" />
							</div>
							<div class="flex items-center justify-center gap-2">
								<ArrowLeft class="w-3.5 h-3.5" />
								<span>shared</span>
								<ArrowRight class="w-3.5 h-3.5" />
							</div>
							<div class="flex items-center justify-center gap-2">
								<ArrowLeft class="w-3.5 h-3.5" />
								<span>writes & reads</span>
							</div>
						</div>

						<!-- closing caption -->
						<p
							class="mt-8 text-center text-xs sm:text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed"
						>
							<span class="mb-2 block font-medium text-foreground">
								BuildOS is not another agent. BuildOS is where the project lives so
								every human and agent can work from the same memory.
							</span>
							An agent can clone a workflow in a weekend. It can't clone a worldview. The
							moat is the shared context layer — and you control it.
						</p>
					</div>
				</div>
			</div>
		</section>
	</div>
	<!-- ═══ END BRANCH WRAPPER ═══ -->

	<!-- ─── §05 what it holds (the data model) ──────────────────────── -->
	<section class="home-deferred home-deferred-model border-b border-border">
		<div class="mx-auto max-w-7xl space-y-6 px-2 py-10 sm:px-4 sm:py-12 lg:px-6">
			<div class="text-center">
				<div class="micro-label inline-flex items-center gap-3">
					<span class="h-px w-10 bg-border"></span>
					<span>§05 — What it holds</span>
					<span class="h-px w-10 bg-border"></span>
				</div>
				<h2 class="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
					One project. One place. Everything connected.
				</h2>
			</div>

			<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
				{#each dataModel as item}
					{@const Icon = item.icon}
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-4">
						<div class="flex items-center gap-2 mb-1.5">
							<Icon class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-semibold text-foreground">{item.name}</span>
						</div>
						<p class="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ─── §06 what it becomes — future pacing timeline ────────────── -->
	<section class="home-deferred home-deferred-timeline border-b border-border bg-card/40">
		<div class="mx-auto max-w-7xl space-y-8 px-2 py-12 sm:px-4 sm:py-16 lg:px-6">
			<div class="text-center">
				<div class="micro-label inline-flex items-center gap-3">
					<span class="h-px w-10 bg-border"></span>
					<span>§06 — What it becomes</span>
					<span class="h-px w-10 bg-border"></span>
				</div>
				<h2 class="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
					The longer you use it, the more it holds.
				</h2>
				<p class="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
					Most tools are flat. BuildOS compounds. Here's what one project looks like over
					time.
				</p>
			</div>

			<div class="grid md:grid-cols-3 gap-4 sm:gap-5">
				<!-- DAY 1 -->
				<article class="space-y-3">
					<div class="micro-label flex items-center gap-2">
						<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
						<span>Day 1 — first brain dump</span>
					</div>
					<div
						class="rounded-lg border border-border bg-background shadow-ink tx tx-bloom tx-weak overflow-hidden"
					>
						<div
							class="h-7 border-b border-border tx tx-strip tx-weak px-3 flex items-center micro-label"
						>
							New project
						</div>
						<div class="p-3 space-y-2 text-xs">
							<p class="text-muted-foreground italic leading-relaxed">
								"I want to write a fantasy novel about a queen losing her magic. Not
								sure about act 2 yet. Have a magic system but it's loose. Beta
								readers eventually."
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
						You talk. BuildOS extracts the project, the goal, the docs you'll need. No
						setup ritual.
					</p>
				</article>

				<!-- WEEK 3 -->
				<article class="space-y-3">
					<div class="micro-label flex items-center gap-2">
						<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
						<span>Week 3 — momentum visible</span>
					</div>
					<div
						class="rounded-lg border border-border bg-background shadow-ink tx tx-grain tx-weak overflow-hidden"
					>
						<div
							class="h-7 border-b border-border tx tx-strip tx-weak px-3 flex items-center micro-label"
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
						The project has shape. You can see what's done, what's next, what you
						decided last week.
					</p>
				</article>

				<!-- MONTH 2 -->
				<article class="space-y-3">
					<div class="micro-label flex items-center gap-2">
						<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
						<span>Month 2 — the daily ritual</span>
					</div>
					<div
						class="rounded-lg border border-border bg-background shadow-ink tx tx-pulse tx-weak overflow-hidden"
					>
						<div
							class="h-7 border-b border-border tx tx-strip tx-weak px-3 flex items-center justify-between micro-label"
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
						You open your inbox. The project tells you where you left off and what
						deserves today.
					</p>
				</article>
			</div>
		</div>
	</section>

	<!-- ─── §07 honest comparison + final CTA ──────────────────────── -->
	<section class="home-deferred home-deferred-cta py-12 sm:py-16">
		<div class="mx-auto max-w-7xl space-y-8 px-2 sm:px-4 lg:px-6">
			<div class="text-center">
				<div class="micro-label inline-flex items-center gap-3">
					<span class="h-px w-10 bg-border"></span>
					<span>§07 — You have three options</span>
					<span class="h-px w-10 bg-border"></span>
				</div>
				<p class="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
					Two of them leave your thinking scattered. One starts compounding today.
				</p>
			</div>

			<div class="grid md:grid-cols-3 gap-3 sm:gap-4">
				<article
					class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak p-4"
				>
					<div class="text-xs font-medium text-muted-foreground">Option 1</div>
					<h3 class="mt-1 text-base font-semibold text-foreground">
						Keep managing the sprawl.
					</h3>
					<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
						Notes in one app, tasks in another, context in a chat thread you'll never
						find again.
					</p>
				</article>
				<article
					class="rounded-lg border border-border bg-card shadow-ink tx tx-grain tx-weak p-4"
				>
					<div class="text-xs font-medium text-muted-foreground">Option 2</div>
					<h3 class="mt-1 text-base font-semibold text-foreground">
						Wait for the perfect tool.
					</h3>
					<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
						There's always a better one coming. Meanwhile your ideas pile up
						unstructured.
					</p>
				</article>
				<article
					class="rounded-lg border border-accent/40 bg-accent/5 shadow-ink-strong tx tx-bloom tx-weak p-4"
				>
					<div class="text-xs font-semibold text-accent">Option 3</div>
					<h3 class="mt-1 text-base font-semibold text-foreground">Start in chat.</h3>
					<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
						The system gets better with every conversation, note, and project update.
						The value compounds from day one.
					</p>
				</article>
			</div>

			<div class="flex flex-wrap items-center justify-center gap-2 sm:gap-3 pt-2">
				<a
					href="/auth/register"
					class="pressable rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-ink hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					Start in chat
				</a>
				<a
					href="/blogs/philosophy"
					class="pressable rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold shadow-ink hover:border-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
