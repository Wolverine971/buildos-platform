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
	<title>BuildOS — Talk to BuildOS, see your stuff organized.</title>
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
					see your stuff
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
						holds the whole project in one place — notes, tasks, research, decisions —
						so you stop losing the thread between sessions.
					</p>

					<p class="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
						You talk. We organize. You come back tomorrow and pick up exactly where you
						left off.
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
								Daily brief, return-and-update, the ritual of clarity. You stay in
								the work, not above it.
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
							href="/blogs/philosophy"
							class="inline-flex items-center gap-2 text-sm font-semibold text-foreground hover:gap-3 transition-all"
						>
							Read: Framework + Harness
							<ArrowRight class="w-4 h-4" />
						</a>
					</div>
				</article>
			</div>
		</div>
	</section>

	<!-- ─── §03 what it holds (the data model) ──────────────────────── -->
	<section class="border-b border-border">
		<div class="mx-auto max-w-6xl px-4 py-10 sm:py-12 space-y-6">
			<div class="text-center">
				<div
					class="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground inline-flex items-center gap-3"
				>
					<span class="h-px w-10 bg-border"></span>
					<span>§03 — What it holds</span>
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

	<!-- ─── §04 what it becomes — future pacing timeline ────────────── -->
	<section class="border-b border-border bg-card/40">
		<div class="mx-auto max-w-6xl px-4 py-12 sm:py-16 space-y-8">
			<div class="text-center">
				<div
					class="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground inline-flex items-center gap-3"
				>
					<span class="h-px w-10 bg-border"></span>
					<span>§04 — What it becomes</span>
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

	<!-- ─── §05 case study placeholder ──────────────────────────────── -->
	<section class="border-b border-border">
		<div class="mx-auto max-w-6xl px-4 py-12 sm:py-14">
			<div class="text-center mb-6">
				<div
					class="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground inline-flex items-center gap-3"
				>
					<span class="h-px w-10 bg-border"></span>
					<span>§05 — Case study</span>
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

	<!-- ─── §06 honest comparison + final CTA ──────────────────────── -->
	<section class="py-12 sm:py-16">
		<div class="mx-auto max-w-6xl px-4 space-y-8">
			<div class="text-center">
				<div
					class="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground inline-flex items-center gap-3"
				>
					<span class="h-px w-10 bg-border"></span>
					<span>§06 — You have three options</span>
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
