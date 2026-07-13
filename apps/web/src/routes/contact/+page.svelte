<!-- apps/web/src/routes/contact/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ArrowRight,
		ExternalLink,
		Lightbulb,
		Linkedin,
		Mail,
		MessageCircle,
		TrendingUp,
		Twitter
	} from '$lib/icons/lucide';
	import SEOHead from '$lib/components/SEOHead.svelte';

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

	const contactPaths = [
		{
			href: 'mailto:team@build-os.com',
			icon: Mail,
			title: 'Email BuildOS',
			description:
				'Partnerships, press, customer questions, and anything that needs a reply.',
			meta: 'team@build-os.com',
			featured: true
		},
		{
			href: '/feedback',
			icon: Lightbulb,
			title: 'Share product feedback',
			description:
				'Tell us what is working, what is confusing, or what would make BuildOS useful.',
			meta: 'Product feedback',
			featured: false
		},
		{
			href: '/investors',
			icon: TrendingUp,
			title: 'Investor information',
			description:
				'Read the current company overview and thesis before starting a conversation.',
			meta: 'Overview and thesis',
			featured: false
		}
	] as const;

	const socialLinks = [
		{
			href: 'https://www.linkedin.com/company/build-os-app',
			icon: Linkedin,
			label: 'BuildOS on LinkedIn'
		},
		{ href: 'https://x.com/build_os', icon: Twitter, label: 'BuildOS on X' }
	] as const;
</script>

<SEOHead
	title="Contact BuildOS — Partnerships, Press, and Founder Contact"
	description="Reach BuildOS founder DJ Wayne. Partnerships, press, investor inquiries, and user feedback. BuildOS is a thinking environment for people making complex things."
	canonical="https://build-os.com/contact"
	keywords="BuildOS contact, DJ Wayne, thinking environment, partnerships, press, founder contact, investor contact"
	author="DJ Wayne"
/>

<div class="min-h-screen bg-background">
	<!-- Orientation -->
	<section class="border-b border-border bg-muted">
		<div class="mx-auto max-w-7xl px-2 py-10 sm:px-4 sm:py-14 lg:px-6">
			<header class="mx-auto max-w-3xl text-center">
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

				<p class="micro-label mb-3 text-accent">Founder-led support</p>
				<h1 class="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
					Contact BuildOS
				</h1>
				<p
					class="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
				>
					Tell us what you are building, where BuildOS is falling short, or what kind of
					partnership you have in mind.
				</p>
				<p class="mt-4 text-sm text-muted-foreground">
					Partnerships <span aria-hidden="true">·</span> Press
					<span aria-hidden="true">·</span> Product feedback
				</p>
			</header>
		</div>
	</section>

	<!-- Primary contact paths -->
	<section class="border-b border-border bg-background" aria-labelledby="contact-paths-heading">
		<div class="mx-auto max-w-7xl px-2 py-10 sm:px-4 sm:py-12 lg:px-6">
			<header class="mx-auto mb-6 max-w-2xl text-center">
				<h2
					id="contact-paths-heading"
					class="text-2xl font-bold text-foreground sm:text-3xl"
				>
					Choose the right path
				</h2>
				<p class="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
					Email is the best starting point when you are not sure where your message
					belongs.
				</p>
			</header>

			<div class="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
				{#each contactPaths as path}
					{@const PathIcon = path.icon}
					<a
						href={path.href}
						class="pressable group flex min-w-0 items-start gap-4 rounded-lg border p-5 shadow-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none {path.featured
							? 'border-accent/50 bg-accent/5 hover:border-accent'
							: 'border-border bg-card hover:border-accent/50 hover:bg-muted'}"
					>
						<span
							class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors group-hover:border-accent/40 group-hover:text-accent motion-reduce:transition-none"
						>
							<PathIcon class="h-5 w-5" aria-hidden="true" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block font-semibold text-foreground">{path.title}</span>
							<span class="mt-1 block text-sm leading-relaxed text-muted-foreground">
								{path.description}
							</span>
							<span
								class="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent"
							>
								{path.meta}
								<ArrowRight class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
							</span>
						</span>
					</a>
				{/each}
			</div>
		</div>
	</section>

	<!-- Founder context -->
	<section class="border-b border-border bg-card/40" aria-labelledby="founder-contact-heading">
		<div class="mx-auto max-w-7xl px-2 py-10 sm:px-4 sm:py-12 lg:px-6">
			<div
				class="mx-auto grid max-w-5xl items-center gap-6 rounded-lg border border-border bg-card p-5 shadow-ink tx tx-frame tx-weak sm:p-6 md:grid-cols-[auto_1fr_auto]"
			>
				<img
					src="/s-dj-wayne-profile.webp"
					alt="DJ Wayne, founder of BuildOS"
					class="h-20 w-20 rounded-lg object-cover"
					width="80"
					height="80"
					loading="lazy"
					decoding="async"
				/>
				<div class="min-w-0">
					<p class="micro-label mb-2">A note from the founder</p>
					<h2
						id="founder-contact-heading"
						class="text-xl font-bold text-foreground sm:text-2xl"
					>
						Founder-led, not routed through a queue
					</h2>
					<p
						class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base"
					>
						I read the messages that come through BuildOS. Clear context helps: tell me
						what you are trying to do, what happened, and what a useful response would
						look like.
					</p>
				</div>
				<a
					href="https://linkedin.com/in/djwayne"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
				>
					<Linkedin class="h-4 w-4 shrink-0" aria-hidden="true" />
					DJ on LinkedIn
					<ExternalLink class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				</a>
			</div>
		</div>
	</section>

	<!-- Secondary channels -->
	<section class="border-b border-border bg-background" aria-labelledby="follow-heading">
		<div class="mx-auto max-w-7xl px-2 py-10 sm:px-4 sm:py-12 lg:px-6">
			<div class="mx-auto max-w-4xl text-center">
				<p class="micro-label mb-2">Building in public</p>
				<h2 id="follow-heading" class="text-2xl font-bold text-foreground">
					Follow the build
				</h2>
				<p
					class="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base"
				>
					Product notes and company updates live on the BuildOS social channels.
				</p>

				<div class="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
					{#each socialLinks as social}
						{@const SocialIcon = social.icon}
						<a
							href={social.href}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
						>
							<SocialIcon class="h-4 w-4 shrink-0" aria-hidden="true" />
							{social.label}
							<ExternalLink class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
						</a>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- Tertiary product path -->
	<section class="bg-muted" aria-labelledby="try-heading">
		<div class="mx-auto max-w-7xl px-2 py-10 sm:px-4 sm:py-12 lg:px-6">
			<div class="mx-auto max-w-3xl text-center">
				<MessageCircle class="mx-auto h-6 w-6 text-accent" aria-hidden="true" />
				<h2 id="try-heading" class="mt-3 text-2xl font-bold text-foreground">
					Want to try BuildOS instead?
				</h2>
				<p
					class="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base"
				>
					Create a free account and start in chat. Paid billing is not active, so creating
					an account will not charge you.
				</p>
				<a
					href="/auth/register"
					class="pressable mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
				>
					Start in chat
					<ArrowRight class="h-4 w-4 shrink-0" aria-hidden="true" />
				</a>
			</div>
		</div>
	</section>
</div>
