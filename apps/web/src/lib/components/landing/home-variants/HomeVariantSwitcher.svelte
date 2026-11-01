<!-- apps/web/src/lib/components/landing/home-variants/HomeVariantSwitcher.svelte -->
<!-- Review-only pill on the /home-a|b|c previews for flipping between homepage versions. -->
<script lang="ts">
	import { page } from '$app/state';

	const VERSIONS = [
		{ href: '/home-a', label: 'A', name: 'The Desk' },
		{ href: '/home-b', label: 'B', name: 'Try it' },
		{ href: '/home-c', label: 'C', name: 'Watch it work' },
		{ href: '/landing-v2', label: 'Now', name: 'Current homepage' }
	] as const;

	let collapsed = $state(false);
</script>

<nav
	aria-label="Homepage versions"
	class="fixed bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-full border border-border bg-card/95 p-1 shadow-ink-strong backdrop-blur-sm"
>
	{#if collapsed}
		<button
			type="button"
			onclick={() => (collapsed = false)}
			class="flex min-h-9 items-center rounded-full px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
		>
			Versions
		</button>
	{:else}
		<ul class="flex items-center gap-0.5">
			{#each VERSIONS as version (version.href)}
				{@const active = page.url.pathname === version.href}
				<li>
					<a
						href={version.href}
						title={version.name}
						aria-current={active ? 'page' : undefined}
						class="flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors motion-reduce:transition-none {active
							? 'bg-foreground text-background'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						{version.label}
						<span class="hidden sm:inline">· {version.name}</span>
					</a>
				</li>
			{/each}
			<li>
				<button
					type="button"
					onclick={() => (collapsed = true)}
					aria-label="Hide version switcher"
					class="flex min-h-9 min-w-9 items-center justify-center rounded-full text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					✕
				</button>
			</li>
		</ul>
	{/if}
</nav>
