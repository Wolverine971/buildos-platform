<!-- apps/web/src/routes/about/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ArrowRight,
		Brain,
		Calendar,
		FileText,
		Layers3,
		MessageCircle,
		Sparkles,
		Users
	} from '$lib/icons/lucide';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import {
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_ORGANIZATION_LOGO_IMAGE,
		DEFAULT_ORGANIZATION_SOCIAL_PROFILES
	} from '$lib/constants/seo';

	let brandVideo: HTMLVideoElement;

	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

		const syncPlayback = () => {
			if (mediaQuery.matches) {
				brandVideo.pause();
				try {
					brandVideo.currentTime = 0;
				} catch {
					// Metadata may not be ready yet; pausing still honors the preference.
				}
				return;
			}

			void brandVideo.play().catch(() => {
				// Browser autoplay policy may keep the decorative video paused.
			});
		};

		syncPlayback();
		mediaQuery.addEventListener('change', syncPlayback);
		return () => mediaQuery.removeEventListener('change', syncPlayback);
	});

	const productPrinciples = [
		{
			icon: Brain,
			title: 'Project memory, not session memory',
			description:
				'Important decisions, open questions, and project history stay available after the chat closes.'
		},
		{
			icon: Layers3,
			title: 'Structure, not another answer',
			description:
				'Messy input becomes connected projects, tasks, documents, and decisions you can keep working from.'
		},
		{
			icon: Calendar,
			title: 'Continuity, not another blank page',
			description:
				'Daily briefs and calendar-aware planning bring the right context back when it is time to act.'
		}
	] as const;

	const workflowSteps = [
		{
			icon: Sparkles,
			step: '01',
			title: 'Bring the messy version',
			description: 'Talk through the idea before you have a clean brief, plan, or task list.'
		},
		{
			icon: Layers3,
			step: '02',
			title: 'Build durable context',
			description:
				'BuildOS organizes the useful pieces into a project you can inspect and refine.'
		},
		{
			icon: FileText,
			step: '03',
			title: 'Continue from where you left off',
			description:
				'Return to a brief, a next action, and project memory instead of starting over.'
		}
	] as const;
</script>

<SEOHead
	title="About BuildOS — Turn scattered thinking into structured work"
	description="BuildOS is a founder-led thinking environment that turns scattered notes, conversations, and project fragments into structured projects with memory."
	canonical="https://build-os.com/about"
	keywords="BuildOS story, DJ Wayne, thinking environment, project memory, structured work, project context"
	author="DJ Wayne"
	twitterCreator="@djwayne3"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'Organization',
		'@id': DEFAULT_ORGANIZATION_ID,
		name: 'BuildOS',
		url: 'https://build-os.com',
		logo: DEFAULT_ORGANIZATION_LOGO_IMAGE,
		description:
			'Thinking environment that turns scattered project context into structured work with memory.',
		foundingDate: '2025-11-01',
		founder: {
			'@type': 'Person',
			name: 'DJ Wayne',
			jobTitle: 'Founder & CEO',
			description:
				'Former USMC Scout Sniper turned software engineer with 8 years of experience building software.',
			sameAs: ['https://twitter.com/djwayne3']
		},
		sameAs: DEFAULT_ORGANIZATION_SOCIAL_PROFILES,
		contactPoint: {
			'@type': 'ContactPoint',
			email: 'dj@build-os.com',
			contactType: 'customer service'
		},
		address: {
			'@type': 'PostalAddress',
			addressLocality: 'Glen Burnie',
			addressRegion: 'Maryland',
			addressCountry: 'US'
		}
	}}
/>

<div class="min-h-screen bg-background">
	<!-- Orientation -->
	<section class="border-b border-border bg-muted tx tx-bloom tx-weak">
		<div class="mx-auto max-w-7xl px-2 py-10 sm:px-4 sm:py-14 lg:px-6 lg:py-16">
			<header class="mx-auto max-w-4xl text-center">
				<div class="mb-5 flex justify-center">
					<div
						class="flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-card shadow-ink"
					>
						<video
							bind:this={brandVideo}
							src="/onboarding-assets/animations/brain-bolt-electric-transparent.webm"
							poster="/brain-bolt-80.png"
							class="h-10 w-10 motion-reduce:hidden"
							width="40"
							height="40"
							preload="metadata"
							loop
							muted
							playsinline
							aria-hidden="true"
						></video>
						<img
							src="/brain-bolt-80.png"
							alt=""
							class="hidden h-10 w-10 motion-reduce:block"
							width="40"
							height="40"
							aria-hidden="true"
						/>
					</div>
				</div>

				<p class="micro-label mb-3 text-accent">About BuildOS</p>
				<h1
					class="mx-auto max-w-4xl text-pretty text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl"
				>
					Your work should not reset every time the chat closes.
				</h1>
				<p
					class="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
				>
					BuildOS is a thinking environment that turns scattered notes, conversations, and
					project fragments into structured context you can keep building from.
				</p>

				<div class="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
					<a
						href="/auth/register"
						class="pressable inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-ink transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none sm:w-auto"
						aria-label="Start in chat with BuildOS"
					>
						<Users class="h-4 w-4 shrink-0" aria-hidden="true" />
						Start in chat
					</a>
					<a
						href="#founder-story"
						class="pressable inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none sm:w-auto"
					>
						Read the founder story
						<ArrowRight class="h-4 w-4 shrink-0" aria-hidden="true" />
					</a>
				</div>
			</header>
		</div>
	</section>

	<!-- Founder origin -->
	<section
		id="founder-story"
		class="border-b border-border bg-background"
		aria-labelledby="founder-heading"
	>
		<div class="mx-auto max-w-7xl px-2 py-10 sm:px-4 sm:py-14 lg:px-6">
			<div class="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
				<aside class="text-center lg:text-left">
					<img
						src="/s-dj-wayne-profile.webp"
						alt="DJ Wayne, founder of BuildOS"
						class="mx-auto h-28 w-28 rounded-full border-2 border-border object-cover shadow-ink-strong lg:mx-0 lg:h-32 lg:w-32"
						width="128"
						height="128"
						loading="lazy"
						decoding="async"
					/>
					<div class="mt-4 space-y-1 text-sm text-muted-foreground">
						<p class="text-lg font-bold text-foreground">DJ Wayne</p>
						<p class="font-medium text-foreground">Founder of BuildOS</p>
						<p>Former USMC Scout Sniper</p>
						<p>8 years building software</p>
					</div>
				</aside>

				<div>
					<p class="micro-label mb-3 text-accent">Why BuildOS exists</p>
					<h2
						id="founder-heading"
						class="text-pretty text-2xl font-bold text-foreground sm:text-3xl"
					>
						It began with the cost of rebuilding context.
					</h2>
					<div class="mt-5 space-y-4 text-base leading-7 text-muted-foreground">
						<p>
							I was juggling BuildOS, 9takes.com, client work, family life, and a pile
							of half-structured ideas spread across Notion, Obsidian, Google Docs,
							Moleskines, Apple Notes, and random text files.
						</p>
						<p>
							Claude and ChatGPT were useful, but only after I reconstructed the same
							project background again. The tools could answer a question; they could
							not hold the work together over time.
						</p>
						<p class="font-medium text-foreground">
							So I built the place I needed: one environment where messy thinking can
							become durable project memory. BuildOS now helps build BuildOS every
							day.
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Product thesis -->
	<section class="border-b border-border bg-muted" aria-labelledby="thesis-heading">
		<div class="mx-auto max-w-7xl px-2 py-10 sm:px-4 sm:py-12 lg:px-6">
			<header class="mx-auto mb-6 max-w-3xl text-center">
				<p class="micro-label mb-3 text-accent">The product thesis</p>
				<h2 id="thesis-heading" class="text-2xl font-bold text-foreground sm:text-3xl">
					A thinking environment, not another chatbot
				</h2>
				<p
					class="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base"
				>
					A chat box is useful for a session. Complex work needs a system that can
					remember, structure, and return the work to you.
				</p>
			</header>

			<div class="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
				{#each productPrinciples as principle}
					{@const PrincipleIcon = principle.icon}
					<article
						class="rounded-lg border border-border bg-card p-5 shadow-ink tx tx-frame tx-weak"
					>
						<div
							class="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-accent"
						>
							<PrincipleIcon class="h-5 w-5" aria-hidden="true" />
						</div>
						<h3 class="mt-4 text-lg font-semibold text-foreground">
							{principle.title}
						</h3>
						<p class="mt-2 text-sm leading-6 text-muted-foreground">
							{principle.description}
						</p>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<!-- How it works -->
	<section
		id="how-it-works"
		class="border-b border-border bg-background"
		aria-labelledby="how-heading"
	>
		<div class="mx-auto max-w-7xl px-2 py-10 sm:px-4 sm:py-12 lg:px-6">
			<header class="mx-auto mb-7 max-w-3xl text-center">
				<p class="micro-label mb-3 text-accent">How it works</p>
				<h2 id="how-heading" class="text-2xl font-bold text-foreground sm:text-3xl">
					From rough thought to reusable context
				</h2>
			</header>

			<ol class="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
				{#each workflowSteps as item}
					{@const StepIcon = item.icon}
					<li class="rounded-lg border border-border bg-card p-5 shadow-ink">
						<div class="flex items-center justify-between gap-3">
							<span
								class="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-accent"
							>
								<StepIcon class="h-5 w-5" aria-hidden="true" />
							</span>
							<span class="text-2xs font-semibold text-muted-foreground"
								>{item.step}</span
							>
						</div>
						<h3 class="mt-4 text-lg font-semibold text-foreground">{item.title}</h3>
						<p class="mt-2 text-sm leading-6 text-muted-foreground">
							{item.description}
						</p>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<!-- Proof and current status -->
	<section class="border-b border-border bg-muted" aria-labelledby="proof-heading">
		<div class="mx-auto max-w-7xl px-2 py-10 sm:px-4 sm:py-12 lg:px-6">
			<div
				class="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]"
			>
				<div>
					<p class="micro-label mb-3 text-accent">Operating proof</p>
					<h2 id="proof-heading" class="text-2xl font-bold text-foreground sm:text-3xl">
						BuildOS runs on BuildOS
					</h2>
					<p class="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
						The roadmap, feature work, bugs, positioning, content calendar, and outreach
						live inside the product. If a workflow cannot survive daily use, it does not
						ship.
					</p>

					<div class="mt-5 grid gap-3 sm:grid-cols-2">
						<article
							class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grain tx-weak"
						>
							<h3 class="font-semibold text-foreground">The product builds itself</h3>
							<p class="mt-1 text-sm leading-6 text-muted-foreground">
								Roadmap decisions and delivery work use the same project-memory flow
								available to users.
							</p>
						</article>
						<article
							class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grain tx-weak"
						>
							<h3 class="font-semibold text-foreground">
								The company work lives here
							</h3>
							<p class="mt-1 text-sm leading-6 text-muted-foreground">
								Marketing and operating context stay connected to the product
								instead of becoming another abandoned archive.
							</p>
						</article>
					</div>
				</div>

				<aside
					class="rounded-lg border border-border bg-card p-5 shadow-ink tx tx-frame tx-weak"
					aria-label="Current company status"
				>
					<p class="micro-label mb-4 text-accent">Current status</p>
					<dl class="space-y-4">
						<div>
							<dt class="font-semibold text-foreground">Product</dt>
							<dd class="mt-1 text-sm leading-6 text-muted-foreground">
								Live and actively developed.
							</dd>
						</div>
						<div class="border-t border-border pt-4">
							<dt class="font-semibold text-foreground">Billing</dt>
							<dd class="mt-1 text-sm leading-6 text-muted-foreground">
								Not live. Creating an account does not charge you.
							</dd>
						</div>
						<div class="border-t border-border pt-4">
							<dt class="font-semibold text-foreground">Company</dt>
							<dd class="mt-1 text-sm leading-6 text-muted-foreground">
								Bootstrapped and founder-led.
							</dd>
						</div>
					</dl>
				</aside>
			</div>
		</div>
	</section>

	<!-- Closing path -->
	<section class="bg-background" aria-labelledby="join-heading">
		<div class="mx-auto max-w-7xl px-2 py-10 sm:px-4 sm:py-12 lg:px-6">
			<div class="mx-auto max-w-3xl text-center">
				<h2 id="join-heading" class="text-2xl font-bold text-foreground sm:text-3xl">
					Start with the messy version
				</h2>
				<p
					class="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base"
				>
					Bring one scattered project into BuildOS and see whether persistent context
					makes the next step easier to find.
				</p>

				<nav
					class="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center"
					aria-label="About page actions"
				>
					<a
						href="/auth/register"
						class="pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-6 text-sm font-semibold text-accent-foreground shadow-ink transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
						aria-label="Start in chat with BuildOS"
					>
						<Users class="h-4 w-4 shrink-0" aria-hidden="true" />
						Start in chat
					</a>
					<a
						href="/contact"
						class="pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
					>
						<MessageCircle class="h-4 w-4 shrink-0" aria-hidden="true" />
						Contact DJ
					</a>
				</nav>
			</div>
		</div>
	</section>
</div>
