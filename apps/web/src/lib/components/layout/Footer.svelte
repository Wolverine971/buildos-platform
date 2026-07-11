<!-- apps/web/src/lib/components/layout/Footer.svelte -->
<script lang="ts">
	import { BookOpen, Brain, Heart, Linkedin, Shield, Twitter } from '$lib/icons/lucide';
	import { DEFAULT_APP_ICON_URL } from '$lib/constants/seo';
	import { requestTrackingPreferences } from '$lib/services/tracking-consent';

	let { user = null }: { user: any | null } = $props();

	const CURRENT_YEAR = new Date().getFullYear();

	const SUPPORT_LINKS = [
		{ href: '/help', label: 'Help' },
		{ href: '/docs', label: 'Docs' },
		{ href: '/feedback', label: 'Feedback' }
	] as const;

	const GUEST_SECTIONS = [
		{
			title: 'Product',
			links: [
				{ href: '/about', label: 'About' },
				{ href: '/pricing', label: 'Pricing' },
				{ href: '/road-map', label: 'Roadmap' },
				{ href: '/beta', label: 'Join beta' }
			]
		},
		{
			title: 'Resources',
			links: [
				{ href: '/blogs', label: 'Blog' },
				{ href: '/skills', label: 'Skill Gallery' },
				{ href: '/help', label: 'Help' }
			]
		},
		{
			title: 'Company',
			links: [
				{ href: '/contact', label: 'Contact' },
				{ href: '/investors', label: 'Investors' },
				{ href: '/feedback', label: 'Feedback' }
			]
		}
	] as const;

	const LEGAL_LINKS = [
		{ href: '/privacy', label: 'Privacy' },
		{ href: '/terms', label: 'Terms' }
	] as const;

	const SOCIAL_LINKS = [
		{ href: 'https://x.com/build_os', icon: Twitter, label: 'BuildOS on X' },
		{
			href: 'https://www.linkedin.com/company/build-os-app',
			icon: Linkedin,
			label: 'BuildOS on LinkedIn'
		}
	] as const;

	let isAuthenticated = $derived(!!user);
</script>

<footer
	class="mt-auto border-t border-border bg-card no-print {isAuthenticated
		? ''
		: 'tx tx-frame tx-weak'}"
>
	<div class="mx-auto max-w-7xl">
		{#if isAuthenticated}
			<div class="px-2 py-3 sm:px-4 sm:py-4 lg:px-6">
				<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div
						class="flex items-center justify-center gap-2 text-sm font-semibold tracking-tight text-muted-foreground"
					>
						<span>© {CURRENT_YEAR} BuildOS</span>
						{#if user?.is_admin}
							<span class="text-border" aria-hidden="true">•</span>
							<a
								href="/admin"
								class="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
							>
								<Shield class="h-3.5 w-3.5" aria-hidden="true" />
								Admin
							</a>
						{/if}
					</div>

					<nav
						aria-label="App footer links"
						class="flex flex-wrap items-center justify-center gap-x-1 gap-y-0 text-sm font-semibold tracking-tight"
					>
						{#each SUPPORT_LINKS as link}
							<a
								href={link.href}
								class="inline-flex min-h-11 items-center rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
							>
								{link.label}
							</a>
						{/each}
						{#each LEGAL_LINKS as link}
							<a
								href={link.href}
								class="inline-flex min-h-11 items-center rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
							>
								{link.label}
							</a>
						{/each}
						<button
							type="button"
							onclick={requestTrackingPreferences}
							class="inline-flex min-h-11 items-center rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
						>
							Privacy choices
						</button>
					</nav>
				</div>
			</div>
		{:else}
			<div class="px-2 py-8 sm:px-4 lg:px-6">
				<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-12">
					<section
						class="text-center lg:text-left"
						aria-labelledby="footer-brand-heading"
					>
						<a
							href="/"
							aria-label="BuildOS home"
							class="group inline-flex min-h-11 items-center gap-2 rounded-md px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<img
								src={DEFAULT_APP_ICON_URL}
								alt=""
								class="h-8 w-8 rounded-md transition-opacity group-hover:opacity-80 motion-reduce:transition-none"
								loading="lazy"
								width="32"
								height="32"
								decoding="async"
							/>
							<span
								id="footer-brand-heading"
								class="text-xl font-bold text-foreground"
							>
								BuildOS
							</span>
						</a>
						<p
							class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground lg:mx-0"
						>
							Turn messy thinking into structured work with persistent project memory.
						</p>

						<div class="mx-auto mt-5 flex max-w-sm flex-col gap-3 sm:flex-row lg:mx-0">
							<a
								href="/auth/register"
								class="pressable inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-5 py-3 text-sm font-semibold tracking-tight text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
							>
								<Brain class="h-4 w-4 shrink-0" aria-hidden="true" />
								Start in chat
							</a>
							<a
								href="/docs"
								class="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold tracking-tight text-foreground shadow-ink transition-colors hover:border-accent hover:bg-muted hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
							>
								<BookOpen class="h-4 w-4 shrink-0" aria-hidden="true" />
								Read docs
							</a>
						</div>
					</section>

					<nav
						aria-label="Footer navigation"
						class="grid grid-cols-3 gap-x-3 gap-y-8 text-left sm:gap-x-6"
					>
						{#each GUEST_SECTIONS as section}
							<div>
								<p class="micro-label mb-2 text-foreground">{section.title}</p>
								<ul class="space-y-0.5">
									{#each section.links as link}
										<li>
											<a
												href={link.href}
												class="inline-flex min-h-11 items-center rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none lg:min-h-0 lg:py-1"
											>
												{link.label}
											</a>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</nav>
				</div>

				<div
					class="mt-8 flex flex-col items-center gap-4 border-t border-border pt-6 sm:flex-row sm:justify-between"
				>
					<p
						class="flex items-center gap-1 text-xs font-semibold tracking-tight text-muted-foreground"
					>
						<span>© {CURRENT_YEAR} BuildOS</span>
						<span aria-hidden="true">•</span>
						<span>Made with</span>
						<Heart
							class="h-3 w-3 fill-destructive text-destructive"
							aria-hidden="true"
						/>
						<span>for builders</span>
					</p>

					<nav
						aria-label="Legal and privacy links"
						class="flex flex-wrap items-center justify-center gap-x-1 text-sm"
					>
						{#each LEGAL_LINKS as link}
							<a
								href={link.href}
								class="inline-flex min-h-11 items-center rounded-md px-2 font-semibold tracking-tight text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
							>
								{link.label}
							</a>
						{/each}
						<button
							type="button"
							onclick={requestTrackingPreferences}
							class="inline-flex min-h-11 items-center rounded-md px-2 font-semibold tracking-tight text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
						>
							Privacy choices
						</button>
					</nav>

					<nav class="flex items-center gap-1" aria-label="BuildOS social links">
						{#each SOCIAL_LINKS as social}
							{@const SocialIcon = social.icon}
							<a
								href={social.href}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
								aria-label="{social.label} (opens in new tab)"
							>
								<SocialIcon class="h-5 w-5" aria-hidden="true" />
							</a>
						{/each}
					</nav>
				</div>
			</div>
		{/if}
	</div>
</footer>

<style>
	@media (max-width: 768px) {
		a,
		button {
			-webkit-tap-highlight-color: transparent;
		}
	}
</style>
