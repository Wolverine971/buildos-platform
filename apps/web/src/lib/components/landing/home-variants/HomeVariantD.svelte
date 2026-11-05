<!-- Home D: real product screens, Home C's animated story, and a place to start. -->
<script lang="ts">
	import { page } from '$app/state';
	import {
		ArrowDown,
		ArrowRight,
		Bot,
		Check,
		ChevronDown,
		Download,
		LockKeyhole,
		Play
	} from '$lib/icons/lucide';
	import HomeDraftBox from './HomeDraftBox.svelte';
	import Capabilities from './d/Capabilities.svelte';
	import AnimatedDemo from './d/AnimatedDemo.svelte';
	import ProjectReel from './d/ProjectReel.svelte';
	import { storyAt } from './d/project-reel';

	/** The one action on this page. Every start button says the same thing. */
	const START_CTA = 'Start with my notes';
	let draftBox = $state<ReturnType<typeof HomeDraftBox> | null>(null);
	/** The hero example on screen; the paste box placeholder follows it. */
	let reelIndex = $state(0);
	const billingIsLive = $derived(Boolean(page.data?.stripeEnabled));
	const signedIn = $derived(Boolean(page.data?.user));
	const riskLine = $derived(
		billingIsLive
			? '14 days free. No credit card required.'
			: 'Free during early access. No credit card required.'
	);
	const draftHint = $derived(
		signedIn
			? 'Your notes open in chat. Press Send when they look right.'
			: 'Next, create a free account. Your notes will be waiting.'
	);
	function yourTurn() {
		draftBox?.focusAtEnd();
	}

	const TRUST = [
		{ icon: LockKeyhole, text: 'Private by default' },
		{ icon: Bot, text: 'No AI training on your data' },
		{ icon: Download, text: 'Export your work anytime' }
	] as const;
	const PLAN_FEATURES = [
		'Unlimited projects',
		'Text and voice brain dumps',
		'Daily briefs',
		'Google Calendar sync',
		'Claude and ChatGPT connections',
		'Data export'
	] as const;
	const FAQ = [
		{
			q: 'How is this different from ChatGPT, Claude, or Notion?',
			a: [
				'A chat is great for thinking out loud, but the plan stays inside the conversation. Notion gives you blank pages to organize yourself.',
				'BuildOS turns what you say into a project you can work from: tasks, documents, dates, and a next step. Tell it what changed and it updates the project. You can also connect Claude or ChatGPT so they can read your projects and update them with your permission.'
			]
		},
		{
			q: 'Does it write my work for me?',
			a: [
				'No. Your book, code, or client work stays yours. BuildOS organizes the work around it: what to do next, what is due, and what you decided. It drafts something only when you ask it to.'
			]
		},
		{
			q: 'Do I have to get organized first?',
			a: [
				'No. Paste rough notes or talk through what you are working on. BuildOS organizes them into a project. Review what it creates, edit it directly, or ask for a change.'
			]
		},
		{
			q: 'How does this fit with my other tools?',
			a: [
				'BuildOS keeps tasks, documents, milestones, and project context together. Connect Claude or ChatGPT to read your projects and write work back with your permission.',
				'Google Calendar is optional, and you can disconnect it anytime.'
			],
			link: { href: '/integrations', label: 'Explore integrations' }
		},
		{
			q: 'Is my work private? Is it used to train AI?',
			a: [
				'Projects are private unless you share them.',
				'BuildOS and its AI providers do not train on your data. AI requests require zero data retention, with one exception: voice.',
				'Dictation audio and the text of spoken briefs go to OpenAI audio models and may be retained for up to 30 days, without training.'
			],
			link: { href: '/privacy', label: 'Read the privacy policy' }
		},
		{
			q: 'Can I take my work with me?',
			a: [
				'Download your data from Settings → Your data anytime.',
				'You can also delete your account in Settings. Access ends immediately and your data is erased within 30 days.'
			],
			link: { href: '/privacy', label: 'Export and deletion details' }
		},
		{
			q: 'Does it work on my phone?',
			a: [
				'Yes. Use BuildOS in your phone browser or add it to your home screen. You can type or dictate notes there too.'
			]
		}
	] as const;

	const shell = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-10';
	const textLink =
		'inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-foreground underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
</script>

{#snippet startButton()}
	<a
		href="#d-start"
		onclick={(event) => {
			event.preventDefault();
			yourTurn();
		}}
		class="tx-button tx-button-accent inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
		>{START_CTA}<ArrowDown class="h-4 w-4 shrink-0" aria-hidden="true" /></a
	>
{/snippet}

<div class="bg-background text-foreground">
	<section aria-labelledby="d-hero-heading" class="pt-14 pb-24 sm:pt-24 sm:pb-32 lg:pt-28">
		<div class={shell}>
			<div class="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-16">
				<h1
					id="d-hero-heading"
					class="text-balance text-[2.5rem] font-medium leading-[1.04] tracking-[-0.03em] sm:text-6xl lg:text-[4.5rem]"
				>
					Turn messy thinking into structured work
				</h1>
				<div>
					<p class="max-w-[36rem] text-pretty text-lg leading-8 text-muted-foreground">
						BuildOS is a thinking environment for people making complex things. Talk
						through the whole tangle, then see it organized into projects, tasks, and a
						clear next step.
					</p>
					<div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
						{@render startButton()}
						<a href="#d-how" class={textLink}
							><Play class="h-4 w-4" aria-hidden="true" />Watch it work</a
						>
					</div>
					<p class="mt-4 text-sm text-muted-foreground">{riskLine}</p>
				</div>
			</div>
			<div class="mt-24 sm:mt-28">
				<ProjectReel bind:index={reelIndex} />
			</div>
		</div>
	</section>

	<section
		id="d-how"
		tabindex="-1"
		aria-labelledby="d-how-heading"
		class="dark scroll-mt-24 border-y border-border bg-bench py-24 text-foreground focus:outline-none sm:py-32"
	>
		<div class={shell}>
			<div
				class="mb-12 flex flex-col justify-between gap-6 sm:mb-16 lg:flex-row lg:items-end lg:gap-16"
			>
				<div>
					<h2
						id="d-how-heading"
						class="max-w-xl text-balance text-4xl font-medium leading-[1.08] tracking-[-0.03em] sm:text-5xl"
					>
						Messy in.<br /><span class="text-muted-foreground">Momentum out</span>
					</h2>
				</div>
				<p class="max-w-sm text-lg leading-8 text-muted-foreground">
					Watch a rough note about the novel become a project. Then a voice note about
					soccer practice finds its way to the right one.
				</p>
			</div>
			<AnimatedDemo onyourturn={yourTurn} ctaLabel={START_CTA} />
			<p class="mt-6 text-sm text-muted-foreground">
				Interactive demo with example data. Pause it or choose a chapter to explore.
			</p>
		</div>
	</section>

	<section
		id="d-proof"
		tabindex="-1"
		aria-labelledby="d-proof-heading"
		class="scroll-mt-24 py-24 focus:outline-none sm:py-32"
	>
		<div class={shell}>
			<div class="mb-16 grid gap-6 sm:mb-20 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-16">
				<h2
					id="d-proof-heading"
					class="text-balance text-4xl font-medium leading-[1.08] tracking-[-0.03em] sm:text-5xl"
				>
					It keeps up,<br />so you don't have to
				</h2>
				<p class="max-w-md text-lg leading-8 text-muted-foreground">
					Getting it out of your head is the start. Here is what BuildOS does with your
					projects after that.
				</p>
			</div>
			<Capabilities />
		</div>
	</section>

	<section
		id="d-start"
		aria-labelledby="d-start-heading"
		class="scroll-mt-24 border-y border-border bg-card py-24 sm:py-32"
	>
		<div class="{shell} grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-20">
			<div>
				<h2
					id="d-start-heading"
					class="text-balance text-4xl font-medium leading-[1.08] tracking-[-0.03em] sm:text-5xl"
				>
					Start wherever<br />your head is
				</h2>
				<p class="mt-6 max-w-sm text-lg leading-8 text-muted-foreground">
					The idea. The half-made plan. The thing you keep putting off. Bring one project
					and whatever you have so far.
				</p>
				<p class="mt-6 text-sm font-medium">{riskLine}</p>
			</div>
			<div class="min-w-0">
				<HomeDraftBox
					bind:this={draftBox}
					id="home-d-draft"
					rows={5}
					label="What are you working on?"
					showLabel
					submitLabel={signedIn ? 'Continue in chat' : START_CTA}
					hint={draftHint}
					placeholder={storyAt(reelIndex).prompt}
				/>
				<ul class="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-8">
					{#each TRUST as item (item.text)}<li
							class="flex items-center gap-2 text-sm text-foreground"
						>
							<item.icon
								class="h-4 w-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>{item.text}
						</li>{/each}
				</ul>
			</div>
		</div>
	</section>

	<!-- Founder note. Copy drafted from the About page story; DJ to approve the wording. -->
	<section aria-labelledby="d-founder-heading" class="py-24 sm:py-32">
		<div class="mx-auto max-w-3xl px-4 sm:px-6">
			<h2 id="d-founder-heading" class="sr-only">Why BuildOS exists</h2>
			<div class="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
				<img
					src="/home/d/dj-founder.webp"
					alt="DJ Wayne, founder of BuildOS"
					width="96"
					height="96"
					loading="lazy"
					decoding="async"
					class="h-16 w-16 shrink-0 rounded-full border border-border object-cover sm:h-20 sm:w-20"
				/>
				<div>
					<blockquote class="space-y-4 text-xl leading-[1.6] text-foreground">
						<p>
							I built BuildOS because I was juggling a company, client work, a family,
							and a pile of half-made ideas spread across six apps. Every time I came
							back to something, I had to rebuild where I left off.
						</p>
						<p>
							This is the place I needed. Say what is in your head, and it keeps the
							project together so you don't have to. If you try it, tell me what is
							missing. I read every message.
						</p>
					</blockquote>
					<p class="mt-6 text-sm text-muted-foreground">
						<span class="font-medium text-foreground">DJ Wayne</span>, founder ·
						<a
							href="/about#founder-story"
							class="underline underline-offset-4 hover:text-foreground"
							>Read the story</a
						>
					</p>
				</div>
			</div>
		</div>
	</section>

	<section id="d-pricing" aria-labelledby="d-pricing-heading" class="scroll-mt-24 pb-24 sm:pb-28">
		<div class={shell}>
			<div
				class="grid gap-10 rounded-2xl border border-border bg-card p-8 shadow-ink sm:p-10 lg:grid-cols-[0.9fr_1.2fr_0.7fr] lg:items-center lg:gap-12"
			>
				<div>
					<h2 id="d-pricing-heading" class="text-2xl font-medium tracking-[-0.02em]">
						Everything, one plan
					</h2>
					<p class="mt-4">
						<span class="text-5xl font-medium tracking-[-0.03em] tabular-nums"
							>{billingIsLive ? '$20' : 'Free'}</span
						><span class="ml-2 text-sm text-muted-foreground"
							>{billingIsLive ? '/ month' : 'during early access'}</span
						>
					</p>
					<a href="/pricing" class="{textLink} mt-4"
						>Pricing details<ArrowRight class="h-4 w-4" aria-hidden="true" /></a
					>
				</div>
				<ul class="grid gap-x-8 gap-y-4 sm:grid-cols-2">
					{#each PLAN_FEATURES as feature (feature)}<li
							class="flex items-start gap-2 text-sm leading-relaxed"
						>
							<Check
								class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>{feature}
						</li>{/each}
				</ul>
				<div>
					{@render startButton()}
					<p class="mt-4 max-w-xs text-xs leading-5 text-muted-foreground">
						{#if billingIsLive}14 days free. No card to start. Then choose whether to
							subscribe.{:else}Planned price: $20/month when billing launches. You
							choose whether to subscribe.{/if}
					</p>
				</div>
			</div>
		</div>
	</section>

	<section aria-labelledby="d-faq-heading" class="pb-24 sm:pb-32">
		<div class="mx-auto max-w-3xl px-4 sm:px-6">
			<h2
				id="d-faq-heading"
				class="mb-10 text-3xl font-medium tracking-[-0.02em] sm:text-4xl"
			>
				A few things you might be wondering
			</h2>
			<div class="border-t border-border">
				{#each FAQ as item (item.q)}<details class="group border-b border-border">
						<summary
							class="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
							>{item.q}<ChevronDown
								class="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
								aria-hidden="true"
							/></summary
						>
						<div class="pb-6">
							<div class="space-y-3">
								{#each item.a as paragraph (paragraph)}<p
										class="text-base leading-relaxed text-muted-foreground"
									>
										{paragraph}
									</p>{/each}
							</div>
							{#if 'link' in item}<a href={item.link.href} class="{textLink} mt-2"
									>{item.link.label}<ArrowRight
										class="h-4 w-4"
										aria-hidden="true"
									/></a
								>{/if}
						</div>
					</details>{/each}
			</div>
		</div>
	</section>
</div>

<style>
	.product-mat {
		background-color: hsl(var(--accent) / 0.07);
		background-image:
			linear-gradient(hsl(var(--accent) / 0.08) 1px, transparent 1px),
			linear-gradient(90deg, hsl(var(--accent) / 0.08) 1px, transparent 1px);
		background-size: 24px 24px;
	}
</style>
