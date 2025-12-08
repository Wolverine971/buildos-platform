<script lang="ts">
	const steps = [
		{
			label: '01 • Capture',
			title: 'Dump everything in your head.',
			texture: 'tx-bloom',
			body: 'Talk, type, or paste chaos. BuildOS ingests notes and half-baked ideas into a single project brain.'
		},
		{
			label: '02 • Shape',
			title: 'Carve structure out of noise.',
			texture: 'tx-grain',
			body: 'Agents split your dump into goals, tasks, plans, risks — using project ontologies instead of rigid templates.'
		},
		{
			label: '03 • Drive',
			title: 'Stay in flow. The OS remembers.',
			texture: 'tx-pulse',
			body: 'BuildOS surfaces next moves, tracks dependencies, and keeps long-term context warm.'
		}
	];
</script>

<div class="min-h-screen bg-background text-foreground">
	<!-- top strip -->
	<div class="h-10 border-b border-border tx tx-strip tx-med"></div>

	<!-- nav -->
	<header class="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
		<div class="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
			<div class="flex items-center gap-3">
				<div
					class="h-9 w-9 rounded-2xl border border-border bg-card shadow-ink tx tx-frame tx-weak ink-frame"
				></div>
				<div>
					<div class="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
						BuildOS
					</div>
					<div class="text-xs text-muted-foreground">
						AI-first project operating system
					</div>
				</div>
			</div>

			<div class="hidden md:flex items-center gap-6 text-xs text-muted-foreground">
				<a class="hover:text-foreground transition" href="#how">How it works</a>
				<a class="hover:text-foreground transition" href="#stack">Under the hood</a>
			</div>

			<div class="flex items-center gap-3">
				<button
					class="pressable rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-ink hover:opacity-95"
				>
					View demo
				</button>
				<button
					class="pressable rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground shadow-ink"
				>
					Get early access
				</button>
			</div>
		</div>
	</header>

	<!-- hero -->
	<section class="border-b border-border">
		<div class="mx-auto max-w-6xl px-4 py-14 grid md:grid-cols-2 gap-10 items-center">
			<div class="space-y-6">
				<div
					class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 tx tx-static tx-weak"
				>
					<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
					<span class="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
						>Built for chaotic brains</span
					>
				</div>

				<h1 class="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">
					Turn scattered ideas into a <span class="relative">
						living project brain
						<span
							class="absolute inset-x-0 bottom-1 -z-10 h-[0.65em] tx tx-bloom tx-med rounded"
						></span>
					</span>
				</h1>

				<p class="text-sm sm:text-base text-muted-foreground max-w-xl">
					BuildOS listens to brain dumps, carves structure out of noise, and keeps context
					warm — so you can stay in flow.
				</p>

				<div class="flex flex-wrap gap-3 items-center">
					<button
						class="pressable rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-ink"
					>
						Join the founder beta
					</button>
					<a
						class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
						href="#how"
					>
						See how it works →
					</a>
				</div>
			</div>

			<div
				class="rounded-3xl border border-border bg-card shadow-ink-strong tx tx-frame tx-weak ink-frame overflow-hidden"
			>
				<div
					class="h-10 border-b border-border tx tx-strip tx-med flex items-center px-4 text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground"
				>
					Project: Raise Seed & Ship v1
				</div>
				<div class="p-5 space-y-4">
					<div class="grid sm:grid-cols-2 gap-4">
						<div
							class="rounded-2xl border border-border bg-background tx tx-static tx-weak p-3"
						>
							<div
								class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-2"
							>
								Raw brain dump
							</div>
							<p class="text-[0.8rem] text-muted-foreground leading-relaxed">
								“Schedule investor calls, fix landing copy, ship onboarding. Also
								want a content plan tied to signups…”
							</p>
						</div>
						<div
							class="rounded-2xl border border-border bg-background tx tx-grain tx-weak p-3"
						>
							<div
								class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-2"
							>
								Structured by BuildOS
							</div>
							<ul class="text-[0.8rem] leading-relaxed">
								<li>▸ Goal: Close 3–5 angel checks</li>
								<li>▸ Tasks: Investor pipeline</li>
								<li>▸ Sprint: Landing page clarity</li>
								<li>▸ Plan: Weekly content engine</li>
							</ul>
						</div>
					</div>

					<div
						class="rounded-2xl border border-border bg-background tx tx-thread tx-weak p-3 flex items-center justify-between gap-3"
					>
						<p class="text-[0.85rem]">
							<span class="text-muted-foreground">Next move:</span> Follow up with the
							4 investors who opened your deck twice.
						</p>
						<button
							class="pressable rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-ink"
						>
							Do this now
						</button>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- how -->
	<section id="how" class="border-b border-border">
		<div class="mx-auto max-w-6xl px-4 py-14 space-y-8">
			<div>
				<h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">
					From noise → ontology → action.
				</h2>
				<p class="mt-2 text-sm text-muted-foreground max-w-xl">
					BuildOS builds a project ontology around you — goals, tasks, plans, risks,
					relationships — so the AI understands what you’re building.
				</p>
			</div>

			<div class="grid md:grid-cols-3 gap-5">
				{#each steps as s}
					<article
						class={`rounded-3xl border border-border bg-card shadow-ink tx ${s.texture} tx-weak ink-frame p-5`}
					>
						<div
							class="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
						>
							{s.label}
						</div>
						<h3 class="mt-2 text-sm font-semibold">{s.title}</h3>
						<p class="mt-2 text-[0.85rem] text-muted-foreground leading-relaxed">
							{s.body}
						</p>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<footer class="py-10">
		<div
			class="mx-auto max-w-6xl px-4 text-xs text-muted-foreground flex items-center justify-between"
		>
			<span>BuildOS • Inkprint design system</span>
			<span class="tx tx-strip tx-weak px-2 py-1 rounded-full border border-border bg-card"
				>v0</span
			>
		</div>
	</footer>
</div>
