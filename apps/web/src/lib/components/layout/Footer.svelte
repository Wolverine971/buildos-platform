<!-- apps/web/src/lib/components/layout/Footer.svelte -->
<script lang="ts">
	import Button from '$components/ui/Button.svelte';
	import {
		Brain,
		FolderOpen,
		StickyNote,
		Mail,
		Shield,
		Heart,
		Users,
		TrendingUp,
		FileText,
		BookOpen,
		CircleHelp,
		Info,
		DollarSign,
		MessageSquare
	} from 'lucide-svelte';
	import LinkedinIcon from 'lucide-svelte/icons/linkedin';
	import XIcon from 'lucide-svelte/icons/twitter';

	// Svelte 5 props
	let { user = null }: { user: any | null } = $props();

	const CURRENT_YEAR = new Date().getFullYear();

	// Streamlined navigation for authenticated users
	const AUTH_LINKS = [
		{ href: '/projects', label: 'Projects', icon: FolderOpen },
		{ href: '/history', label: 'History', icon: StickyNote }
	];

	const SUPPORT_LINKS = [
		{ href: '/help', label: 'Help', icon: CircleHelp },
		{ href: '/docs', label: 'Docs', icon: BookOpen },
		{ href: '/feedback', label: 'Feedback', icon: MessageSquare }
	];

	// Guest links - organized in sections
	const GUEST_SECTIONS = [
		{
			title: 'Product',
			links: [
				{ href: '/about', label: 'About', icon: Info },
				{ href: '/pricing', label: 'Pricing', icon: DollarSign },
				{ href: '/beta', label: 'Join Beta', icon: Users }
			]
		},
		{
			title: 'Resources',
			links: [
				{ href: '/blogs', label: 'Blog', icon: FileText },
				{ href: '/help', label: 'Help', icon: CircleHelp },
				{ href: '/docs', label: 'Docs', icon: BookOpen }
			]
		},
		{
			title: 'Company',
			links: [
				{ href: '/contact', label: 'Contact', icon: Mail },
				{ href: '/investors', label: 'Investors', icon: TrendingUp },
				{ href: '/feedback', label: 'Feedback', icon: MessageSquare }
			]
		}
	];

	// Legal links - always shown
	const LEGAL_LINKS = [
		{ href: '/privacy', label: 'Privacy' },
		{ href: '/terms', label: 'Terms' }
	];

	const SOCIAL_LINKS = [
		{ href: 'https://x.com/build_os', icon: XIcon, label: 'X' },
		{
			href: 'https://www.linkedin.com/company/build-os-app',
			icon: LinkedinIcon,
			label: 'LinkedIn'
		}
	];

	let isAuthenticated = $derived(!!user);
</script>

<footer class="bg-card border-t border-border mt-auto no-print tx tx-frame tx-weak">
	<div class="max-w-7xl mx-auto">
		{#if isAuthenticated}
			<!-- Authenticated User Footer -->
			<div class="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
				<!-- Mobile Layout -->
				<div class="lg:hidden space-y-6">
					<!-- Brand Section -->
					<div class="flex items-center justify-between">
						<a href="/" class="flex items-center space-x-2 group">
							<img
								src="/brain-bolt.png"
								alt="BuildOS"
								class="w-6 h-6 rounded-md transition-opacity duration-200 group-hover:opacity-80"
								loading="lazy"
							/>
							<span class="text-lg font-black tracking-tight text-foreground">
								BuildOS
							</span>
						</a>
						{#if user?.is_admin}
							<span
								class="px-2 py-1 text-xs font-bold bg-destructive text-destructive-foreground rounded"
							>
								Admin
							</span>
						{/if}
					</div>

					<!-- Quick Links Grid -->
					<div class="grid grid-cols-2 gap-3">
						{#each AUTH_LINKS as link}
							{@const LinkIcon = link.icon}
							<a
								href={link.href}
								class="flex items-center space-x-2 p-3 rounded-lg border border-border bg-card
									hover:border-accent hover:bg-accent/5 transition-colors group shadow-ink pressable"
							>
								<LinkIcon
									class="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors"
								/>
								<span
									class="text-sm font-semibold tracking-tight text-foreground group-hover:text-accent"
								>
									{link.label}
								</span>
							</a>
						{/each}
					</div>

					<!-- Support Links -->
					<div class="flex flex-wrap gap-x-4 gap-y-2 justify-center">
						{#each SUPPORT_LINKS as link}
							<a
								href={link.href}
								class="text-sm font-semibold tracking-tight text-muted-foreground hover:text-accent transition-colors"
							>
								{link.label}
							</a>
						{/each}
					</div>

					<!-- Social & Legal -->
					<div class="space-y-4 pt-4 border-t border-border">
						<!-- Social Icons -->
						<div class="flex justify-center space-x-4">
							{#each SOCIAL_LINKS as social}
								{@const SocialIcon = social.icon}
								<a
									href={social.href}
									class="p-2 text-muted-foreground hover:text-accent transition-colors rounded-lg hover:bg-muted"
									aria-label={social.label}
								>
									<SocialIcon class="w-5 h-5" />
								</a>
							{/each}
						</div>

						<!-- Legal Links -->
						<div class="flex justify-center space-x-4 text-sm">
							{#each LEGAL_LINKS as link}
								<a
									href={link.href}
									class="text-muted-foreground hover:text-foreground transition-colors font-semibold tracking-tight"
								>
									{link.label}
								</a>
							{/each}
						</div>
					</div>

					<!-- Admin Link -->
					{#if user?.is_admin}
						<div class="pt-4 border-t border-border">
							<a
								href="/admin"
								class="flex items-center justify-center space-x-2 p-3 text-destructive
									bg-destructive/10 hover:bg-destructive/15
									rounded-lg transition-colors shadow-ink pressable"
							>
								<Shield class="w-5 h-5" />
								<span class="font-semibold tracking-tight">Admin Dashboard</span>
							</a>
						</div>
					{/if}
				</div>

				<!-- Desktop Layout -->
				<div class="hidden lg:block space-y-6">
					<div class="flex items-center justify-between">
						<!-- Left: Brand and Navigation -->
						<div class="flex items-center space-x-8">
							<a href="/" class="flex items-center space-x-2 group">
								<img
									src="/brain-bolt.png"
									alt="BuildOS"
									class="w-6 h-6 rounded-md transition-opacity duration-200 group-hover:opacity-80"
									loading="lazy"
								/>
								<span class="text-lg font-black tracking-tight text-foreground">
									BuildOS
								</span>
							</a>

							<!-- Navigation Links -->
							<nav aria-label="Footer navigation" class="flex items-center space-x-1">
								{#each [...AUTH_LINKS, ...SUPPORT_LINKS] as link}
									<a
										href={link.href}
										class="inline-flex items-center px-3 py-2 text-sm font-semibold tracking-tight text-muted-foreground
											hover:text-accent hover:bg-muted rounded-lg transition-colors"
									>
										{#if link.icon}
											{@const Icon = link.icon}
											<Icon class="w-4 h-4 mr-2" />
										{/if}
										{link.label}
									</a>
								{/each}
								{#if user?.is_admin}
									<a
										href="/admin"
										class="inline-flex items-center px-3 py-2 text-sm font-semibold tracking-tight
											text-destructive hover:bg-destructive/10 rounded-lg transition-colors ml-2"
									>
										<Shield class="w-4 h-4 mr-2" />
										Admin
									</a>
								{/if}
							</nav>
						</div>

						<!-- Right: Legal and Social -->
						<div class="flex items-center space-x-6">
							<nav aria-label="Legal links" class="flex space-x-4">
								{#each LEGAL_LINKS as link}
									<a
										href={link.href}
										class="text-sm text-muted-foreground hover:text-foreground transition-colors"
									>
										{link.label}
									</a>
								{/each}
							</nav>
							<div class="flex space-x-2">
								{#each SOCIAL_LINKS as social}
									{@const SocialIcon = social.icon}
									<a
										href={social.href}
										class="p-2 text-muted-foreground hover:text-accent transition-colors rounded-lg hover:bg-muted"
										aria-label={social.label}
									>
										<SocialIcon class="w-4 h-4" />
									</a>
								{/each}
							</div>
						</div>
					</div>
				</div>

				<!-- Copyright -->
				<div
					class="flex items-center justify-center space-x-1 text-xs font-semibold tracking-tight text-muted-foreground
					mt-6 pt-6 border-t border-border"
				>
					<span>© {CURRENT_YEAR} BuildOS</span>
					<span>•</span>
					<span>Made with</span>
					<Heart class="w-3 h-3 text-destructive fill-destructive mx-1" />
					<span>for the builders</span>
				</div>
			</div>
		{:else}
			<!-- Non-authenticated User Footer -->
			<div class="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
				<!-- Mobile Layout -->
				<div class="lg:hidden space-y-6">
					<!-- Brand & CTA -->
					<div class="text-center space-y-4">
						<a href="/" class="inline-flex items-center space-x-2 group">
							<div class="relative">
								<img
									src="/brain-bolt.png"
									alt="BuildOS"
									class="w-8 h-8 rounded-md transition-opacity duration-200 group-hover:opacity-80"
									loading="lazy"
								/>
							</div>
							<span class="text-xl font-black tracking-tight text-foreground">
								BuildOS
							</span>
						</a>
						<p class="text-sm text-muted-foreground max-w-xs mx-auto">
							Transform thoughts into structured productivity with AI-powered
							organization.
						</p>

						<!-- CTA Buttons -->
						<div class="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
							<a
								href="/auth/register"
								class="flex-1 inline-flex items-center justify-center px-6 py-3 text-sm font-semibold tracking-tight
									text-accent-foreground bg-accent border border-accent hover:bg-accent/90
									rounded-lg transition-all shadow-ink pressable"
							>
								<Brain class="w-4 h-4 mr-2" />
								Start Free
							</a>
							<a
								href="/beta"
								class="flex-1 inline-flex items-center justify-center px-6 py-3 text-sm font-semibold tracking-tight
									text-foreground bg-card border border-border
									hover:bg-muted hover:border-accent rounded-lg transition-colors"
							>
								<Users class="w-4 h-4 mr-2" />
								Join Beta
							</a>
						</div>
					</div>

					<!-- Links Sections -->
					<div class="grid grid-cols-2 gap-6">
						{#each GUEST_SECTIONS.slice(0, 2) as section}
							<div>
								<h4 class="text-sm font-black tracking-tight text-foreground mb-3">
									{section.title}
								</h4>
								<ul class="space-y-2">
									{#each section.links as link}
										<li>
											<a
												href={link.href}
												class="text-sm font-semibold tracking-tight text-muted-foreground hover:text-accent transition-colors"
											>
												{link.label}
											</a>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>

					<!-- Company Links -->
					<div class="text-center">
						<h4 class="text-sm font-black tracking-tight text-foreground mb-3">
							Company
						</h4>
						<div class="flex flex-wrap justify-center gap-x-4 gap-y-2">
							{#each GUEST_SECTIONS[2]?.links ?? [] as link}
								<a
									href={link.href}
									class="text-sm text-muted-foreground hover:text-foreground transition-colors"
								>
									{link.label}
								</a>
							{/each}
						</div>
					</div>

					<!-- Social & Legal -->
					<div class="space-y-4 pt-6 border-t border-border">
						<!-- Social Icons -->
						<div class="flex justify-center space-x-4">
							{#each SOCIAL_LINKS as social}
								{@const SocialIcon = social.icon}
								<a
									href={social.href}
									class="p-2 text-muted-foreground hover:text-accent transition-colors rounded-lg hover:bg-muted"
									aria-label={social.label}
								>
									<SocialIcon class="w-5 h-5" />
								</a>
							{/each}
						</div>

						<!-- Legal Links -->
						<div class="flex justify-center space-x-4 text-sm">
							{#each LEGAL_LINKS as link}
								<a
									href={link.href}
									class="text-muted-foreground hover:text-foreground transition-colors font-semibold tracking-tight"
								>
									{link.label}
								</a>
							{/each}
						</div>
					</div>
				</div>

				<!-- Desktop Layout -->
				<div class="hidden lg:block space-y-6">
					<!-- Top Section -->
					<div class="flex items-start justify-between">
						<!-- Brand & Description -->
						<div class="max-w-sm space-y-4">
							<a href="/" class="inline-flex items-center space-x-2 group">
								<div class="relative">
									<img
										src="/brain-bolt.png"
										alt="BuildOS"
										class="w-8 h-8 rounded-md transition-opacity duration-200 group-hover:opacity-80"
										loading="lazy"
									/>
								</div>
								<span class="text-xl font-bold text-foreground">BuildOS</span>
							</a>
							<p class="text-sm text-muted-foreground">
								Transform thoughts into structured productivity with AI-powered
								organization. Capture ideas, manage projects, and stay organized
								effortlessly.
							</p>
							<!-- CTA Buttons -->
							<div class="flex gap-3 pt-2">
								<a href="/auth/register">
									<Button icon={Brain} variant="primary">Start Free</Button>
								</a>
								<a href="/beta">
									<Button icon={Users} variant="outline">Join Beta</Button>
								</a>
							</div>
						</div>

						<!-- Links Grid -->
						<div class="grid grid-cols-3 gap-8">
							{#each GUEST_SECTIONS as section}
								<div>
									<h4 class="text-sm font-semibold text-foreground mb-4">
										{section.title}
									</h4>
									<ul class="space-y-3">
										{#each section.links as link}
											<li>
												<a
													href={link.href}
													class="inline-flex items-center text-sm text-muted-foreground
														hover:text-foreground transition-colors group"
												>
													{#if link.icon}
														{@const Icon = link.icon}
														<Icon
															class="w-4 h-4 mr-2 text-muted-foreground group-hover:text-foreground transition-colors"
														/>
													{/if}
													{link.label}
												</a>
											</li>
										{/each}
									</ul>
								</div>
							{/each}
						</div>
					</div>

					<!-- Bottom Section -->
					<div class="flex items-center justify-between pt-6 border-t border-border">
						<!-- Legal Links -->
						<nav class="flex space-x-4">
							{#each LEGAL_LINKS as link}
								<a
									href={link.href}
									class="text-sm text-muted-foreground hover:text-foreground transition-colors"
								>
									{link.label}
								</a>
							{/each}
						</nav>

						<!-- Social Icons -->
						<div class="flex space-x-2">
							{#each SOCIAL_LINKS as social}
								{@const SocialIcon = social.icon}
								<a
									href={social.href}
									class="p-2 text-muted-foreground hover:text-accent transition-colors rounded-lg hover:bg-muted"
									aria-label={social.label}
								>
									<SocialIcon class="w-4 h-4" />
								</a>
							{/each}
						</div>
					</div>
				</div>

				<!-- Copyright -->
				<div
					class="flex items-center justify-center space-x-1 text-xs font-semibold tracking-tight text-muted-foreground
					mt-6 pt-6 border-t border-border"
				>
					<span>© {CURRENT_YEAR} BuildOS</span>
					<span>•</span>
					<span>Made with</span>
					<Heart class="w-3 h-3 text-destructive fill-destructive mx-1" />
					<span>for the builders</span>
				</div>
			</div>
		{/if}
	</div>
</footer>

<style>
	/* Enhanced focus states */
	a:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 2px;
		border-radius: 4px;
	}

	/* Smooth transitions */
	a {
		transition: all 0.2s ease;
	}

	/* Better touch targets for mobile */
	@media (max-width: 768px) {
		a {
			-webkit-tap-highlight-color: transparent;
		}
	}
</style>
