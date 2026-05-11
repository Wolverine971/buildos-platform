<!-- apps/web/src/routes/landing-v2/+page.svelte -->
<!--
  Homepage redesign — preview at /landing-v2
  Goal: lead with simple promise, split audience (creator vs technical/builder)
  using the §-numbered two-column pattern, then dramatize compounding value
  via a Day 1 → Week 3 → Month 2 future-pacing timeline.
  Strategy: docs/marketing/strategy/buildos-positioning-and-homepage-rewrite-2026-05-07.md
-->
<script lang="ts">
	import {
		FolderKanban,
		Target,
		Calendar,
		ListChecks,
		Flag,
		FileText,
		AlertTriangle,
		ArrowRight,
		ArrowLeft,
		ArrowDown,
		CheckCircle2,
		Circle,
		Mail
	} from 'lucide-svelte';

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
		{ icon: AlertTriangle, name: 'Risks', desc: 'Unknowns, blockers, and loose ends.' },
		{
			icon: FolderKanban,
			name: 'Flexible structure',
			desc: 'Project-specific shape that adapts to what you are building.'
		}
	] as const;
</script>

<svelte:head>
	<title>BuildOS — Talk to BuildOS, see your thoughts organized.</title>
	<meta
		name="description"
		content="BuildOS is a thinking environment for creators. Talk to BuildOS, see your projects organized. Same context for you and your agents — both make progress, in parallel."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<!-- ─── §01 hero ────────────────────────────────────────────────── -->
	<section class="border-b border-border">
		<div
			class="mx-auto max-w-6xl px-4 py-10 sm:py-14 grid md:grid-cols-2 gap-8 sm:gap-10 items-center"
		>
			<div class="space-y-5 sm:space-y-6">
				<div
					class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-ink tx tx-frame tx-weak"
				>
					<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
					<span class="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
						For authors, YouTubers, podcasters, and course creators
					</span>
				</div>

				<h1
					class="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.02]"
				>
					Talk to BuildOS,<br />
					see your thoughts
					<span class="relative">
						organized.
						<span
							class="absolute inset-x-0 bottom-1 -z-10 h-[0.65em] tx tx-bloom tx-med rounded"
						></span>
					</span>
				</h1>

				<p class="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
					A thinking environment where you and your agents work the same project, off the
					same context. You stay in the work. Your agents stay useful. Both of you make
					progress in parallel.
				</p>

				<div class="flex flex-wrap gap-3 items-center pt-1">
					<a
						href="/auth/register"
						class="pressable rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-ink hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						Start in chat
					</a>
					<a
						href="#split"
						class="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
					>
						Or scroll for the longer version ↓
					</a>
				</div>
			</div>

			<!-- single demonstration card -->
			<div
				class="rounded-lg border border-border bg-card shadow-ink-strong tx tx-frame tx-weak overflow-hidden wt-card"
			>
				<div
					class="h-10 border-b border-border tx tx-strip tx-med flex items-center px-4 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
				>
					Rough thinking → organized project
				</div>
				<div class="p-4 sm:p-5 grid sm:grid-cols-2 gap-3 sm:gap-4">
					<div
						class="rounded-lg border border-border bg-background shadow-ink-inner tx tx-static tx-weak p-4"
					>
						<div
							class="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground mb-3"
						>
							What you say
						</div>
						<p class="text-sm text-muted-foreground leading-relaxed">
							"Chapter 12 drags, Maya's motivation feels weak, I keep losing track of
							my magic rules, and beta-reader notes are scattered across email and
							Discord."
						</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background shadow-ink-inner tx tx-grain tx-weak p-4"
					>
						<div
							class="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground mb-3"
						>
							What BuildOS holds
						</div>
						<ul class="text-sm leading-relaxed space-y-1 text-foreground">
							<li>▸ Project: Novel revision</li>
							<li>▸ Doc: Character arc — Maya</li>
							<li>▸ Doc: Magic system rules</li>
							<li>▸ Task: Rewrite Ch. 12 opening</li>
							<li>▸ Inbox: Beta-reader notes (consolidating)</li>
						</ul>
					</div>
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
			<div class="mx-auto max-w-6xl h-full">
				<div class="relative h-full mx-4">
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
			<div class="mx-auto max-w-6xl px-4 py-12 sm:py-16">
				<div class="text-center mb-8 sm:mb-10">
					<div
						class="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground inline-flex items-center gap-3"
					>
						<span class="h-px w-10 bg-border"></span>
						<span>§02 — Do you work with AI agents yet?</span>
						<span class="h-px w-10 bg-border"></span>
					</div>
				</div>

				<div class="grid md:grid-cols-2 gap-4 sm:gap-5">
					<!-- LEFT: NO — for the long-tail creator -->
					<article
						class="rounded-lg border border-border bg-background shadow-ink tx tx-bloom tx-weak p-5 sm:p-6 flex flex-col"
					>
						<div
							class="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground mb-3 flex items-center gap-2"
						>
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
							<a
								href="/auth/register"
								class="inline-flex items-center gap-2 text-sm font-semibold text-foreground hover:gap-3 transition-all"
							>
								Start with one project
								<ArrowRight class="w-4 h-4" />
							</a>
						</div>
					</article>

					<!-- RIGHT: YES — for the technical / builder -->
					<article
						class="rounded-lg border border-border bg-background shadow-ink tx tx-grain tx-weak p-5 sm:p-6 flex flex-col"
					>
						<div
							class="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground mb-3 flex items-center gap-2"
						>
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
								<div
									class="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground mb-1"
								>
									Framework — for you
								</div>
								<p class="text-xs sm:text-sm text-foreground leading-snug">
									Daily brief, return-and-update, the ritual of clarity. You stay
									in the work, not above it.
								</p>
							</div>
							<div
								class="rounded-md border border-border bg-card shadow-ink-inner p-3 tx tx-grain tx-weak"
							>
								<div
									class="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground mb-1"
								>
									Harness — for your agent
								</div>
								<p class="text-xs sm:text-sm text-foreground leading-snug">
									Persistent project memory, structured tool calls, the context an
									agent needs to actually be useful in production.
								</p>
							</div>
							<div
								class="rounded-md border border-border bg-card shadow-ink-inner p-3 tx tx-thread tx-weak"
							>
								<div
									class="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground mb-1"
								>
									Shared context
								</div>
								<p class="text-xs sm:text-sm text-foreground leading-snug">
									Both sides read from the same project state. Parallel work, not
									delegation.
								</p>
							</div>
						</div>

						<div class="mt-auto pt-6">
							<a
								href="#agents"
								class="inline-flex items-center gap-2 text-sm font-semibold text-foreground hover:gap-3 transition-all"
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
			<div class="mx-auto max-w-6xl px-4 py-12 sm:py-16 space-y-8">
				<!--
				  entry marker: dead-center under LEFT rail via grid-mirroring.
				  Uses the same grid shape as §02 so the chip lands on the same X as the rail.
				  On mobile the outer div collapses to block and the chip just sits left-aligned.
				-->
				<div class="lg:grid lg:grid-cols-2 lg:gap-5">
					<div class="lg:flex lg:justify-center">
						<div class="relative">
							<!-- landing extension: short upward dashed line that meets the rail's bottom dot -->

							<div
								class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card shadow-ink-inner px-3 py-1.5 tx tx-bloom tx-weak"
							>
								<span class="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
								></span>
								<span
									class="text-[0.55rem] uppercase tracking-[0.22em] text-muted-foreground"
								>
									↓ from §02A — no
								</span>
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
						<div
							class="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground inline-flex items-center gap-3"
						>
							<span class="h-px w-10 bg-border"></span>
							<span>§03 — The loop</span>
							<span class="h-px w-10 bg-border"></span>
						</div>
						<h2 class="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
							How it actually works.
						</h2>
						<p class="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
							You talk. BuildOS organizes. You come back tomorrow with more — and the
							project keeps shape between sessions.
						</p>
					</div>

					<div class="max-w-4xl mx-auto space-y-5">
						<!-- TIME marker: Day 1 -->
						<div class="flex items-center gap-3">
							<div class="flex-1 border-t border-dashed border-border"></div>
							<span
								class="text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground font-medium"
							>
								Day 1
							</span>
							<div class="flex-1 border-t border-dashed border-border"></div>
						</div>

						<!-- ROW: brain dump → project created -->
						<div
							class="flex flex-col md:grid md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 md:items-stretch"
						>
							<div
								class="rounded-lg border border-border bg-background shadow-ink tx tx-bloom tx-weak p-4"
							>
								<div
									class="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground mb-2"
								>
									You · brain dump
								</div>
								<p class="text-sm leading-relaxed">
									"I want to write a fantasy novel — queen losing her magic. Magic
									rules are loose. Maya's motivation feels weak. Beta readers
									eventually."
								</p>
							</div>
							<div class="flex items-center justify-center text-muted-foreground">
								<ArrowRight class="hidden md:block w-5 h-5" />
								<ArrowDown class="md:hidden w-5 h-5" />
							</div>
							<div
								class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak p-4"
							>
								<div
									class="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground mb-2"
								>
									BuildOS · project created
								</div>
								<ul class="text-sm space-y-1.5">
									<li class="flex items-center gap-1.5">
										<FolderKanban
											class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
										/>
										<span
											>Project: <strong class="font-medium"
												>Fading Crown</strong
											></span
										>
									</li>
									<li class="flex items-center gap-1.5">
										<FileText
											class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
										/>
										<span>Doc: Magic system rules</span>
									</li>
									<li class="flex items-center gap-1.5">
										<FileText
											class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
										/>
										<span>Doc: Maya — character notes</span>
									</li>
									<li class="flex items-center gap-1.5">
										<Circle
											class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
										/>
										<span>Task: Rewrite Ch. 12 opening</span>
									</li>
									<li class="flex items-center gap-1.5">
										<Target
											class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
										/>
										<span>Goal: First-draft complete</span>
									</li>
								</ul>
							</div>
						</div>

						<!-- TIME SKIP: 1 week later -->
						<div class="flex items-center gap-3 py-2">
							<div class="flex-1 border-t border-dashed border-border"></div>
							<span
								class="text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground font-medium"
							>
								1 week later
							</span>
							<div class="flex-1 border-t border-dashed border-border"></div>
						</div>

						<!-- ROW: brain dump updates project -->
						<div
							class="flex flex-col md:grid md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 md:items-stretch"
						>
							<div
								class="rounded-lg border border-border bg-background shadow-ink tx tx-bloom tx-weak p-4"
							>
								<div
									class="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground mb-2"
								>
									You · brain dump
								</div>
								<p class="text-sm leading-relaxed">
									"Worked Maya's arc all week. Queen's motive should hinge on her
									sister. Add a beta-reader pass after Ch. 14."
								</p>
							</div>
							<div class="flex items-center justify-center text-muted-foreground">
								<ArrowRight class="hidden md:block w-5 h-5" />
								<ArrowDown class="md:hidden w-5 h-5" />
							</div>
							<div
								class="rounded-lg border border-border bg-card shadow-ink tx tx-grain tx-weak p-4"
							>
								<div
									class="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground mb-2"
								>
									BuildOS · project updates
								</div>
								<ul class="text-sm space-y-1.5">
									<li class="flex items-center gap-1.5">
										<FileText
											class="w-3.5 h-3.5 text-emerald-600 flex-shrink-0"
										/>
										<span>
											Doc: Maya —
											<span class="text-emerald-700 dark:text-emerald-400"
												>updated</span
											>
										</span>
									</li>
									<li class="flex items-center gap-1.5">
										<FileText
											class="w-3.5 h-3.5 text-emerald-600 flex-shrink-0"
										/>
										<span>
											Doc: Queen's motive —
											<span class="text-emerald-700 dark:text-emerald-400"
												>new</span
											>
										</span>
									</li>
									<li class="flex items-center gap-1.5">
										<Circle
											class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
										/>
										<span>
											Task: Beta-reader pass after Ch. 14
											<span class="text-emerald-700 dark:text-emerald-400"
												>(new)</span
											>
										</span>
									</li>
								</ul>
							</div>
						</div>

						<!-- ROW: BuildOS sends daily brief (next morning) -->
						<div
							class="flex flex-col md:grid md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 md:items-stretch"
						>
							<div
								class="rounded-lg border border-border bg-background shadow-ink tx tx-pulse tx-weak p-4"
							>
								<div
									class="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-1.5"
								>
									<Mail class="w-3 h-3" />
									<span>You · daily brief (next morning)</span>
								</div>
								<p class="text-sm leading-relaxed font-medium">
									Yesterday: 2 docs updated, 1 task added.
								</p>
								<div class="text-sm text-muted-foreground mt-1.5 space-y-0.5">
									<div>▸ Today: Ch. 12 rewrite</div>
									<div>▸ Open: queen's act-3 turn</div>
									<div>▸ Calendar: 2pm writing block</div>
								</div>
							</div>
							<div class="flex items-center justify-center text-muted-foreground">
								<ArrowLeft class="hidden md:block w-5 h-5" />
								<ArrowDown class="md:hidden w-5 h-5 rotate-180" />
							</div>
							<div
								class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak p-4"
							>
								<div
									class="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground mb-2"
								>
									BuildOS · sends brief
								</div>
								<p class="text-sm leading-relaxed">
									Pulls progress, today's tasks, open questions, and calendar
									holds — into your inbox and the app. Same content, same context.
								</p>
							</div>
						</div>

						<!-- TIME SKIP: later that day -->
						<div class="flex items-center gap-3 py-2">
							<div class="flex-1 border-t border-dashed border-border"></div>
							<span
								class="text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground font-medium"
							>
								later that day
							</span>
							<div class="flex-1 border-t border-dashed border-border"></div>
						</div>

						<!-- ROW: brain dump completes a task -->
						<div
							class="flex flex-col md:grid md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 md:items-stretch"
						>
							<div
								class="rounded-lg border border-border bg-background shadow-ink tx tx-bloom tx-weak p-4"
							>
								<div
									class="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground mb-2"
								>
									You · brain dump
								</div>
								<p class="text-sm leading-relaxed">
									"Finally finished the Ch. 12 rewrite. Feels much tighter.
									Pushing the beta-reader pass to next week."
								</p>
							</div>
							<div class="flex items-center justify-center text-muted-foreground">
								<ArrowRight class="hidden md:block w-5 h-5" />
								<ArrowDown class="md:hidden w-5 h-5" />
							</div>
							<div
								class="rounded-lg border border-border bg-card shadow-ink tx tx-grain tx-weak p-4"
							>
								<div
									class="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground mb-2"
								>
									BuildOS · state syncs
								</div>
								<ul class="text-sm space-y-1.5">
									<li class="flex items-center gap-1.5">
										<CheckCircle2
											class="w-3.5 h-3.5 text-emerald-600 flex-shrink-0"
										/>
										<span class="line-through text-muted-foreground"
											>Rewrite Ch. 12 opening</span
										>
										<span
											class="text-[0.55rem] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400 font-semibold"
										>
											done
										</span>
									</li>
									<li class="flex items-center gap-1.5">
										<Calendar
											class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
										/>
										<span
											>Beta-reader pass → moved <strong>+1 week</strong></span
										>
									</li>
									<li class="flex items-center gap-1.5">
										<FileText
											class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
										/>
										<span>Captured: "tighter" — Ch. 12 notes</span>
									</li>
								</ul>
							</div>
						</div>

						<!-- footer caption -->
						<p
							class="text-center text-xs sm:text-sm text-muted-foreground pt-6 max-w-2xl mx-auto leading-relaxed"
						>
							No re-explaining where you are. No re-finding what you decided last
							week. The project remembers — and the loop tightens as the work moves.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- ─── §04 same context — agents at the same project (for §02B readers) ── -->
		<section id="agents" class="relative border-b border-border bg-card/40">
			<div class="mx-auto max-w-6xl px-4 py-12 sm:py-16 space-y-8">
				<!--
				  entry marker: lands at the RIGHT rail's terminus (x=90% on lg+).
				  The chip sits inside a 20%-wide column anchored to the parent's right edge
				  (so it spans 80%-100%), then centers itself in that column → chip center at 90%.
				  On mobile, the outer's flex justify-end keeps the chip right-aligned.
				-->
				<div class="relative min-h-[2.5rem] flex justify-end">
					<div
						class="lg:absolute lg:right-0 lg:top-0 lg:w-[20%] lg:flex lg:justify-center"
					>
						<div class="relative">
							<div
								class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card shadow-ink-inner px-3 py-1.5 tx tx-grain tx-weak whitespace-nowrap"
							>
								<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
								<span
									class="text-[0.55rem] uppercase tracking-[0.22em] text-muted-foreground"
								>
									↓ from §02B — yes
								</span>
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
						<div
							class="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground inline-flex items-center gap-3"
						>
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
								<div
									class="text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground mb-2"
								>
									Framework — for you
								</div>
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
									<div
										class="text-[0.55rem] uppercase tracking-[0.2em] text-muted-foreground mb-1"
									>
										You · brain dump
									</div>
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
								<div
									class="text-[0.6rem] uppercase tracking-[0.22em] text-accent mb-2"
								>
									Shared project state
								</div>
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
										<CheckCircle2
											class="w-3.5 h-3.5 text-emerald-600 flex-shrink-0"
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
								<div
									class="text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground mb-2"
								>
									Harness — for your agent
								</div>
								<h3 class="text-lg font-semibold tracking-tight">
									Grounded execution.
								</h3>
								<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
									Your agent reads the project state, picks up tool calls, ships
									scoped work. Cheap models stay productive when the context layer
									is right.
								</p>
								<div
									class="mt-4 rounded-md border border-border bg-card shadow-ink-inner p-3 tx tx-thread tx-weak"
								>
									<div
										class="text-[0.55rem] uppercase tracking-[0.2em] text-muted-foreground mb-1"
									>
										Agent · acting on it
									</div>
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
							class="mt-5 grid md:grid-cols-3 gap-3 sm:gap-4 text-[0.55rem] uppercase tracking-[0.22em] text-muted-foreground/80 text-center"
						>
							<div class="flex items-center justify-center gap-2">
								<ArrowRight class="w-3.5 h-3.5" />
								<span>writes & reads</span>
							</div>
							<div class="flex items-center justify-center gap-2">
								<ArrowLeft class="w-3.5 h-3.5" />
								<span>shared</span>
								<ArrowRight class="w-3.5 h-3.5" />
							</div>
							<div class="flex items-center justify-center gap-2">
								<span>writes & reads</span>
								<ArrowLeft class="w-3.5 h-3.5" />
							</div>
						</div>

						<!-- closing caption -->
						<p
							class="mt-8 text-center text-xs sm:text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed"
						>
							An agent can clone a workflow in a weekend. It can't clone a worldview.
							The moat is the shared context layer — and you control it.
						</p>
					</div>
				</div>
			</div>
		</section>
	</div>
	<!-- ═══ END BRANCH WRAPPER ═══ -->

	<!-- ─── §05 what it holds (the data model) ──────────────────────── -->
	<section class="border-b border-border">
		<div class="mx-auto max-w-6xl px-4 py-10 sm:py-12 space-y-6">
			<div class="text-center">
				<div
					class="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground inline-flex items-center gap-3"
				>
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
	<section class="border-b border-border bg-card/40">
		<div class="mx-auto max-w-6xl px-4 py-12 sm:py-16 space-y-8">
			<div class="text-center">
				<div
					class="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground inline-flex items-center gap-3"
				>
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
					<div
						class="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-2"
					>
						<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
						<span>Day 1 — first brain dump</span>
					</div>
					<div
						class="rounded-lg border border-border bg-background shadow-ink tx tx-bloom tx-weak overflow-hidden"
					>
						<div
							class="h-7 border-b border-border tx tx-strip tx-weak px-3 flex items-center text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground"
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
					<div
						class="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-2"
					>
						<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
						<span>Week 3 — momentum visible</span>
					</div>
					<div
						class="rounded-lg border border-border bg-background shadow-ink tx tx-grain tx-weak overflow-hidden"
					>
						<div
							class="h-7 border-b border-border tx tx-strip tx-weak px-3 flex items-center text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground"
						>
							Fading Crown — active
						</div>
						<div class="p-3 space-y-2 text-xs">
							<div class="space-y-1">
								<div class="flex items-center gap-1.5 text-foreground">
									<CheckCircle2 class="w-3 h-3 text-emerald-600" />
									<span class="line-through text-muted-foreground"
										>Outline act 1 beats</span
									>
								</div>
								<div class="flex items-center gap-1.5 text-foreground">
									<CheckCircle2 class="w-3 h-3 text-emerald-600" />
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
							<div
								class="border-t border-border/60 pt-2 text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground"
							>
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
					<div
						class="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-2"
					>
						<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
						<span>Month 2 — the daily ritual</span>
					</div>
					<div
						class="rounded-lg border border-border bg-background shadow-ink tx tx-pulse tx-weak overflow-hidden"
					>
						<div
							class="h-7 border-b border-border tx tx-strip tx-weak px-3 flex items-center justify-between text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground"
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
							<div
								class="border-t border-border/60 pt-2 text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground"
							>
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

	<!-- ─── §07 case study placeholder ──────────────────────────────── -->
	<section class="border-b border-border">
		<div class="mx-auto max-w-6xl px-4 py-12 sm:py-14">
			<div class="text-center mb-6">
				<div
					class="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground inline-flex items-center gap-3"
				>
					<span class="h-px w-10 bg-border"></span>
					<span>§07 — Case study</span>
					<span class="h-px w-10 bg-border"></span>
				</div>
			</div>

			<article
				class="rounded-lg border border-dashed border-border bg-card shadow-ink tx tx-thread tx-weak p-6 sm:p-8"
			>
				<div class="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
					Placeholder · primary case study
				</div>
				<h3 class="mt-2 text-xl sm:text-2xl font-semibold tracking-tight">
					A novelist drafts a book over four months in BuildOS.
				</h3>
				<p class="mt-3 text-sm text-muted-foreground max-w-2xl leading-relaxed">
					Day 1 she dropped 600 words about a queen losing her magic. Month 4 she shipped
					a 90,000-word draft, a magic-system bible, beta-reader notes consolidated, a
					marketing project queued, and a launch plan with dates on the calendar. One
					project. One place. Same context for her and the agents she leans on.
				</p>
				<p class="mt-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">
					→ Case study to be written. Secondary: a YouTuber growing a channel.
				</p>
			</article>
		</div>
	</section>

	<!-- ─── §08 honest comparison + final CTA ──────────────────────── -->
	<section class="py-12 sm:py-16">
		<div class="mx-auto max-w-6xl px-4 space-y-8">
			<div class="text-center">
				<div
					class="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground inline-flex items-center gap-3"
				>
					<span class="h-px w-10 bg-border"></span>
					<span>§08 — You have three options</span>
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
