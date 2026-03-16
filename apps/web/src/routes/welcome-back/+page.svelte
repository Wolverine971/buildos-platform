<!-- apps/web/src/routes/welcome-back/+page.svelte -->
<script lang="ts">
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { ArrowRight, Brain, Clock3, Layers3, Users2 } from 'lucide-svelte';

	let { data } = $props();

	const stepLabel = $derived(
		data.step === '2' ? 'What changed' : data.step === '3' ? 'Final note' : 'Welcome back'
	);
</script>

<SEOHead
	title="Welcome Back to BuildOS"
	description="A short returning-user path for the BuildOS reactivation pilot: what changed, what to try first, and the fastest 5-minute test."
	canonical="https://build-os.com/welcome-back"
	keywords="BuildOS welcome back, reactivation, brain dump, context, project collaboration"
	author="DJ Wayne"
/>

<div class="min-h-screen bg-background">
	<section class="relative overflow-hidden border-b border-border bg-card">
		<div
			class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(217,108,30,0.16),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(26,26,29,0.08),transparent_38%)]"
		></div>
		<div class="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
			<div class="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
				<div class="space-y-6">
					<div
						class="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent shadow-ink tx tx-bloom tx-weak"
					>
						<span>{stepLabel}</span>
						{#if data.campaignId}
							<span class="text-muted-foreground">{data.campaignId}</span>
						{/if}
					</div>

					<div class="space-y-4">
						<h1
							class="max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl"
						>
							BuildOS is better when you use it on real work and keep the context.
						</h1>
						<p class="max-w-2xl text-lg leading-8 text-muted-foreground">
							This page is here to answer three questions quickly: what changed, what
							to try first, and what result to expect from a short retry.
						</p>
					</div>

					<div class="flex flex-col gap-3 sm:flex-row">
						<a
							href={data.continueUrl}
							class="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-6 py-3 text-base font-semibold tracking-tight text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 tx tx-bloom tx-weak"
						>
							Try your brain dump
							<ArrowRight class="h-5 w-5" />
						</a>
						<a
							href="/help"
							class="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-border bg-background px-6 py-3 text-base font-semibold tracking-tight text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent"
						>
							Need a quick refresher?
						</a>
					</div>
				</div>

				<div
					class="rounded-2xl border border-border bg-background p-6 shadow-ink tx tx-grain tx-weak"
				>
					<p
						class="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground"
					>
						Recommended Test
					</p>
					<h2 class="mt-3 text-2xl font-semibold tracking-tight text-foreground">
						Spend five minutes on one active project.
					</h2>
					<ol class="mt-5 space-y-3 text-sm leading-7 text-muted-foreground">
						<li>1. Use something you are already trying to organize.</li>
						<li>
							2. Dump the messy version first. Do not clean it up before you start.
						</li>
						<li>3. Come back tomorrow and keep working inside the same project.</li>
					</ol>
					<div class="mt-6 rounded-xl border border-accent/20 bg-accent/5 p-4">
						<p class="text-sm font-medium text-foreground">Expected result:</p>
						<p class="mt-2 text-sm leading-7 text-muted-foreground">
							You should end up with reusable project context, not a one-off AI answer
							that disappears when the session ends.
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
		<div class="grid gap-6 md:grid-cols-3">
			<div
				class="rounded-2xl border border-border bg-card p-6 shadow-ink tx tx-bloom tx-weak"
			>
				<div
					class="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent"
				>
					<Brain class="h-5 w-5" />
				</div>
				<h2 class="mt-4 text-xl font-semibold tracking-tight text-foreground">
					Brain dumps turn into reusable context
				</h2>
				<p class="mt-3 text-sm leading-7 text-muted-foreground">
					BuildOS is not supposed to be another tab you clear and restart from zero. The
					point is to build project memory that compounds.
				</p>
			</div>

			<div
				class="rounded-2xl border border-border bg-card p-6 shadow-ink tx tx-thread tx-weak"
			>
				<div
					class="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-foreground"
				>
					<Layers3 class="h-5 w-5" />
				</div>
				<h2 class="mt-4 text-xl font-semibold tracking-tight text-foreground">
					You can keep refining the same project
				</h2>
				<p class="mt-3 text-sm leading-7 text-muted-foreground">
					The useful change is continuity. Dump messy thinking now, return later, and work
					from the same source of truth instead of re-explaining everything.
				</p>
			</div>

			<div
				class="rounded-2xl border border-border bg-card p-6 shadow-ink tx tx-grain tx-weak"
			>
				<div
					class="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-foreground"
				>
					<Users2 class="h-5 w-5" />
				</div>
				<h2 class="mt-4 text-xl font-semibold tracking-tight text-foreground">
					Shared context helps people move in parallel
				</h2>
				<p class="mt-3 text-sm leading-7 text-muted-foreground">
					If more than one person is involved, the project can keep its context in one
					place instead of getting rebuilt in meetings, docs, and chat threads.
				</p>
			</div>
		</div>
	</section>

	<section class="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
		<div class="rounded-2xl border border-border bg-card p-8 shadow-ink">
			<div class="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
				<div>
					<p
						class="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground"
					>
						What To Expect
					</p>
					<h2 class="mt-3 text-3xl font-semibold tracking-tight text-foreground">
						Start small. Judge it on whether the second session feels better than the
						first.
					</h2>
					<p class="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">
						This is not asking you to adopt a whole new system today. The test is
						smaller than that: put one real project into BuildOS, then see whether the
						context makes the next session easier.
					</p>
				</div>

				<div
					class="rounded-2xl border border-accent/20 bg-accent/5 p-6 shadow-ink tx tx-bloom tx-weak"
				>
					<div class="flex items-center gap-3">
						<div
							class="flex h-11 w-11 items-center justify-center rounded-xl bg-background text-accent shadow-ink"
						>
							<Clock3 class="h-5 w-5" />
						</div>
						<div>
							<p class="text-sm font-semibold text-foreground">Fastest path</p>
							<p class="text-sm text-muted-foreground">One real brain dump today.</p>
						</div>
					</div>
					<a
						href={data.continueUrl}
						class="mt-6 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-6 py-3 text-base font-semibold tracking-tight text-accent-foreground shadow-ink transition-colors hover:bg-accent/90"
					>
						Open BuildOS
						<ArrowRight class="h-5 w-5" />
					</a>
				</div>
			</div>
		</div>
	</section>
</div>
