<!-- apps/web/src/lib/components/landing/home-variants/HomeVariantSwitcher.svelte -->
<!-- Review-only pill on the /home-a|b|c previews for flipping between homepage versions. -->
<script lang="ts">
	import { page } from '$app/state';
	import { ChevronDown, X } from '$lib/icons/lucide';
	let { dismissible = false }: { dismissible?: boolean } = $props();

	const VERSIONS = [
		{ href: '/home-a', label: 'A', name: 'The Desk' },
		{ href: '/home-b', label: 'B', name: 'Try it' },
		{ href: '/home-c', label: 'C', name: 'Watch it work' },
		{ href: '/home-d', label: 'D', name: 'Clear pitch' },
		{ href: '/landing-v2', label: 'Now', name: 'Current homepage' }
	] as const;

	let collapsed = $state(false);
	let dismissed = $state(false);
</script>

{#if !dismissed}
	<nav
		aria-label="Homepage versions"
		class="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center rounded-full border border-border bg-card/95 p-1 shadow-ink-strong backdrop-blur-sm"
	>
		{#if collapsed}
			<button
				type="button"
				onclick={() => (collapsed = false)}
				class="flex min-h-9 items-center rounded-full px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
			>
				Versions
			</button>
			{#if dismissible}
				<button
					type="button"
					onclick={() => (dismissed = true)}
					aria-label="Dismiss version switcher"
					class="flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
					><X class="h-4 w-4" aria-hidden="true" /></button
				>
			{/if}
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
						<ChevronDown class="h-4 w-4" aria-hidden="true" />
					</button>
				</li>
				{#if dismissible}
					<li>
						<button
							type="button"
							onclick={() => (dismissed = true)}
							aria-label="Dismiss version switcher"
							class="flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
							><X class="h-4 w-4" aria-hidden="true" /></button
						>
					</li>
				{/if}
			</ul>
		{/if}
	</nav>
{/if}
