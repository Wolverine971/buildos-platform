<!-- apps/web/src/lib/components/profile/SettingsNavigation.svelte -->
<script lang="ts">
	import { tick } from 'svelte';
	import { Check, ChevronDown } from '$lib/icons/lucide';
	import { getProfileTabHref, type ProfileTabId } from './profile-tabs';
	import {
		getSettingsGroupLabel,
		SETTINGS_GROUPS,
		type SettingsDestination
	} from './settings-navigation';

	interface Props {
		destinations: SettingsDestination[];
		activeId: ProfileTabId;
		onchange: (tab: ProfileTabId) => void;
	}

	let { destinations, activeId, onchange }: Props = $props();

	let mobileOpen = $state(false);
	let mobileTrigger = $state<HTMLButtonElement | null>(null);
	let mobileMenu = $state<HTMLDivElement | null>(null);

	let activeDestination = $derived(
		destinations.find((destination) => destination.id === activeId) ?? destinations[0]
	);
	let activeGroupLabel = $derived(
		activeDestination ? getSettingsGroupLabel(activeDestination.group) : 'Settings'
	);

	function destinationsForGroup(groupId: SettingsDestination['group']) {
		return destinations.filter((destination) => destination.group === groupId);
	}

	function mobileOptions(): HTMLElement[] {
		return mobileMenu
			? Array.from(mobileMenu.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))
			: [];
	}

	async function openMobileMenu(focus: 'active' | 'first' | 'last' = 'active') {
		mobileOpen = true;
		await tick();
		const options = mobileOptions();
		if (focus === 'first') options[0]?.focus();
		else if (focus === 'last') options.at(-1)?.focus();
		else
			(
				options.find((option) => option.getAttribute('aria-checked') === 'true') ??
				options[0]
			)?.focus();
	}

	function closeMobileMenu(returnFocus = false) {
		mobileOpen = false;
		if (returnFocus) mobileTrigger?.focus();
	}

	async function selectDestination(destination: SettingsDestination) {
		mobileOpen = false;
		onchange(destination.id);
		await tick();
		mobileTrigger?.focus();
	}

	function handleTriggerKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			void openMobileMenu(event.key === 'ArrowDown' ? 'first' : 'last');
		}
	}

	function handleMenuKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeMobileMenu(true);
			return;
		}

		const options = mobileOptions();
		if (!options.length) return;
		const current = options.indexOf(document.activeElement as HTMLElement);
		let nextIndex: number;
		switch (event.key) {
			case 'ArrowDown':
				nextIndex = current < 0 ? 0 : (current + 1) % options.length;
				break;
			case 'ArrowUp':
				nextIndex =
					current < 0
						? options.length - 1
						: (current - 1 + options.length) % options.length;
				break;
			case 'Home':
				nextIndex = 0;
				break;
			case 'End':
				nextIndex = options.length - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		options[nextIndex]?.focus();
	}

	function handleDesktopSelection(event: MouseEvent, destination: SettingsDestination) {
		event.preventDefault();
		onchange(destination.id);
	}
</script>

<!-- Desktop: compact, grouped rail. -->
<nav
	class="hidden rounded-lg border border-border bg-card p-2 shadow-ink tx tx-frame tx-weak md:block"
	aria-label="Settings sections"
>
	{#each SETTINGS_GROUPS as group (group.id)}
		{@const groupDestinations = destinationsForGroup(group.id)}
		{#if groupDestinations.length > 0}
			<div class="py-2 first:pt-1 last:pb-1">
				<p class="micro-label px-2 pb-1.5 text-muted-foreground">{group.label}</p>
				<ul class="space-y-1">
					{#each groupDestinations as destination (destination.id)}
						{@const Icon = destination.icon}
						<li>
							<a
								href={getProfileTabHref(destination.id)}
								onclick={(event) => handleDesktopSelection(event, destination)}
								aria-current={destination.id === activeId ? 'page' : undefined}
								class={[
									'group flex min-h-11 min-w-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
									destination.id === activeId
										? 'bg-accent/10 text-accent'
										: 'text-muted-foreground hover:bg-muted hover:text-foreground'
								]}
							>
								<span
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background"
								>
									<Icon class="h-4 w-4" aria-hidden="true" />
								</span>
								<span class="min-w-0 break-words">{destination.label}</span>
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/each}
</nav>

<!-- Mobile: one labeled disclosure instead of a horizontal tab scroller. -->
<div class="relative min-w-0 md:hidden">
	<p class="micro-label mb-1.5 text-muted-foreground">Settings section</p>
	<button
		bind:this={mobileTrigger}
		type="button"
		onclick={() => (mobileOpen ? closeMobileMenu() : void openMobileMenu())}
		onkeydown={handleTriggerKeydown}
		class="pressable flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg border border-border-strong bg-card px-3 py-2 text-left shadow-ink transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-haspopup="menu"
		aria-expanded={mobileOpen}
		aria-label={`Settings section, ${activeDestination?.label ?? 'Account'}`}
	>
		{#if activeDestination}
			{@const ActiveIcon = activeDestination.icon}
			<span
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-accent"
			>
				<ActiveIcon class="h-4 w-4" aria-hidden="true" />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block truncate text-sm font-semibold text-foreground">
					{activeDestination.label}
				</span>
				<span class="block truncate text-xs text-muted-foreground">{activeGroupLabel}</span>
			</span>
		{/if}
		<ChevronDown
			class={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${mobileOpen ? 'rotate-180' : ''}`}
			aria-hidden="true"
		/>
	</button>

	{#if mobileOpen}
		<button
			type="button"
			class="fixed inset-0 z-40 cursor-default"
			aria-label="Close Settings section picker"
			tabindex="-1"
			onclick={() => closeMobileMenu()}
		></button>
		<div
			bind:this={mobileMenu}
			class="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(70vh,34rem)] overflow-y-auto rounded-lg border border-border bg-card p-2 shadow-ink-strong tx tx-frame tx-weak"
			role="menu"
			aria-label="Settings sections"
			tabindex="-1"
			onkeydown={handleMenuKeydown}
		>
			{#each SETTINGS_GROUPS as group (group.id)}
				{@const groupDestinations = destinationsForGroup(group.id)}
				{#if groupDestinations.length > 0}
					<div class="py-1.5 first:pt-0 last:pb-0">
						<p class="micro-label px-2 pb-1 text-muted-foreground">{group.label}</p>
						{#each groupDestinations as destination (destination.id)}
							{@const Icon = destination.icon}
							<a
								href={getProfileTabHref(destination.id)}
								role="menuitemradio"
								aria-checked={destination.id === activeId}
								tabindex={destination.id === activeId ? 0 : -1}
								onclick={(event) => {
									event.preventDefault();
									void selectDestination(destination);
								}}
								class="flex min-h-11 min-w-0 items-center gap-3 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<span
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground"
								>
									<Icon class="h-4 w-4" aria-hidden="true" />
								</span>
								<span class="min-w-0 flex-1 break-words font-medium"
									>{destination.label}</span
								>
								{#if destination.id === activeId}
									<Check
										class="h-4 w-4 shrink-0 text-accent"
										aria-hidden="true"
									/>
								{/if}
							</a>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
