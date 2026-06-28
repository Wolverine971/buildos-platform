<!-- apps/web/src/lib/components/admin/AdminSidebar.svelte -->
<script module lang="ts">
	export type { AdminNavGroup, AdminNavItem } from './adminNav.types';
</script>

<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';
	import type { AdminNavGroup, AdminNavItem } from './adminNav.types';

	interface Props {
		groups: AdminNavGroup[];
		pathname: string;
		onNavigate?: () => void;
		collapsed?: boolean;
		// When true (mobile drawer), parent items with children become a tappable
		// accordion so every sub-page is reachable and inactive sections stay
		// collapsed. Desktop leaves this off and keeps the active-only behavior.
		expandable?: boolean;
	}

	let { groups, pathname, onNavigate, collapsed = false, expandable = false }: Props = $props();

	// Accordion open-state (by item href) for the mobile drawer.
	let expandedHrefs = $state<Set<string>>(new Set());
	let expandedInitializedFor = '';

	// Default-open the section that matches the current route; re-run only when
	// the route changes so manual toggles persist while the drawer is open.
	$effect(() => {
		if (!expandable) return;
		if (expandedInitializedFor === pathname) return;
		expandedInitializedFor = pathname;
		const next = new Set<string>();
		for (const group of groups) {
			for (const item of group.items) {
				if (item.children?.length && isActive(item, pathname)) {
					next.add(item.href);
				}
			}
		}
		expandedHrefs = next;
	});

	function toggleExpand(href: string) {
		const next = new Set(expandedHrefs);
		if (next.has(href)) {
			next.delete(href);
		} else {
			next.add(href);
		}
		expandedHrefs = next;
	}

	const normalizePath = (path: string): string => {
		if (path === '/') return path;
		return path.replace(/\/+$/, '') || '/';
	};

	const matchesPath = (item: AdminNavItem, currentPath: string): boolean => {
		const current = normalizePath(currentPath);
		const href = normalizePath(item.href);

		if (current === href) return true;
		if (item.activePaths?.some((path) => normalizePath(path) === current)) return true;

		return (
			item.activePrefixes?.some((prefix) => {
				const normalizedPrefix = normalizePath(prefix);
				return current === normalizedPrefix || current.startsWith(`${normalizedPrefix}/`);
			}) ?? false
		);
	};

	const isActive = (item: AdminNavItem, currentPath: string): boolean => {
		if (item.children?.length) {
			return (
				matchesPath(item, currentPath) ||
				item.children.some((child) => isActive(child, currentPath))
			);
		}

		return matchesPath(item, currentPath);
	};

	const handleNavigate = () => {
		onNavigate?.();
	};
</script>

<nav class="flex h-full flex-col" aria-label="Admin navigation">
	<div class={collapsed ? 'flex-1 overflow-visible py-3' : 'flex-1 overflow-y-auto py-4'}>
		{#each groups as group (group.title)}
			<div class={collapsed ? 'px-2 pb-4' : 'px-3 pb-6'}>
				{#if collapsed}
					<div
						class="mx-auto mb-2 h-px w-8 bg-border"
						title={group.title}
						aria-hidden="true"
					></div>
					<span class="sr-only">{group.title}</span>
				{:else}
					<p
						class="mb-2 px-3 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted-foreground"
					>
						{group.title}
					</p>
				{/if}

				<ul class={collapsed ? 'space-y-1' : 'space-y-1'}>
					{#each group.items as item (item.href)}
						{@const active = isActive(item, pathname)}
						{@const Icon = item.icon}
						<li class={collapsed ? 'group relative' : ''}>
							{#if collapsed}
								<a
									href={item.href}
									class={`relative mx-auto flex h-11 w-11 items-center justify-center rounded-xl text-sm font-medium transition-all duration-200 pressable ${
										active
											? 'bg-accent/10 text-accent'
											: 'text-muted-foreground hover:bg-muted hover:text-foreground'
									}`}
									aria-label={item.title}
									aria-current={active && !item.children?.length
										? 'page'
										: undefined}
									title={item.description
										? `${item.title}: ${item.description}`
										: item.title}
									onclick={handleNavigate}
								>
									{#if active}
										<span
											class="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent"
										></span>
									{/if}

									<span
										class={`flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200 ${
											active
												? 'bg-accent text-accent-foreground shadow-ink'
												: 'bg-muted text-muted-foreground'
										}`}
									>
										<Icon class="h-4 w-4" />
									</span>
								</a>

								<div
									class="pointer-events-none absolute left-full top-0 z-50 ml-2 hidden w-64 rounded-lg border border-border bg-card p-2 opacity-0 shadow-ink-strong transition-opacity group-hover:pointer-events-auto group-hover:block group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:block group-focus-within:opacity-100"
								>
									<a
										href={item.href}
										class={`block rounded-lg px-3 py-2 transition-colors ${
											active
												? 'bg-accent/10 text-accent'
												: 'text-foreground hover:bg-muted'
										}`}
										onclick={handleNavigate}
									>
										<span class="block text-sm font-semibold">
											{item.title}
										</span>
										{#if item.description}
											<span
												class="mt-0.5 block text-xs text-muted-foreground"
											>
												{item.description}
											</span>
										{/if}
									</a>

									{#if item.children?.length}
										<ul class="mt-1 space-y-0.5 border-t border-border pt-2">
											{#each item.children as child (child.href)}
												{@const childActive = isActive(child, pathname)}
												{@const ChildIcon = child.icon}
												<li>
													<a
														href={child.href}
														class={`flex items-center rounded-lg px-3 py-2 text-[0.8rem] font-medium transition-all duration-200 pressable ${
															childActive
																? 'bg-accent/10 text-accent'
																: 'text-muted-foreground hover:bg-muted hover:text-foreground'
														}`}
														aria-current={childActive
															? 'page'
															: undefined}
														onclick={handleNavigate}
													>
														<span
															class={`mr-2.5 flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
																childActive
																	? 'bg-accent/20 text-accent'
																	: 'bg-muted text-muted-foreground'
															}`}
														>
															<ChildIcon class="h-3.5 w-3.5" />
														</span>
														<span>{child.title}</span>
													</a>
												</li>
											{/each}
										</ul>
									{/if}
								</div>
							{:else}
								{@const hasChildren = Boolean(item.children?.length)}
								{@const childrenOpen =
									expandable && hasChildren
										? expandedHrefs.has(item.href)
										: active}
								<div class="relative flex items-stretch">
									<a
										href={item.href}
										class={`group relative flex min-w-0 flex-1 items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 pressable ${
											active
												? 'bg-accent/10 text-accent'
												: 'text-muted-foreground hover:bg-muted hover:text-foreground'
										}`}
										aria-current={active && !hasChildren ? 'page' : undefined}
										onclick={handleNavigate}
									>
										{#if active}
											<div
												class="absolute inset-y-0 left-0 w-1 rounded-r-full bg-accent"
											></div>
										{/if}

										<span
											class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
												active
													? 'bg-accent text-accent-foreground shadow-ink'
													: 'bg-muted text-muted-foreground group-hover:bg-muted group-hover:text-foreground'
											}`}
										>
											<Icon class="h-4 w-4" />
										</span>

										<div class="ml-3 flex min-w-0 flex-1 flex-col">
											<span class="truncate leading-tight">{item.title}</span>
											{#if item.description}
												<span
													class={`mt-0.5 truncate text-[0.7rem] leading-tight transition-colors ${
														active
															? 'text-accent/80'
															: 'text-muted-foreground/70 group-hover:text-muted-foreground'
													}`}
												>
													{item.description}
												</span>
											{/if}
										</div>

										{#if item.badge}
											<span
												class={`ml-2 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
													active
														? 'bg-accent/20 text-accent'
														: 'bg-muted text-muted-foreground'
												}`}
											>
												{item.badge}
											</span>
										{/if}
									</a>

									{#if expandable && hasChildren}
										<button
											type="button"
											onclick={() => toggleExpand(item.href)}
											class="ml-1 flex w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors motion-reduce:transition-none hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											aria-label={`${childrenOpen ? 'Collapse' : 'Expand'} ${item.title}`}
											aria-expanded={childrenOpen}
										>
											<ChevronDown
												class={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${
													childrenOpen ? 'rotate-180' : ''
												}`}
											/>
										</button>
									{/if}
								</div>

								{#if hasChildren && childrenOpen}
									<ul class="mt-1 ml-7 space-y-0.5 border-l border-border pl-3">
										{#each item.children ?? [] as child (child.href)}
											{@const childActive = isActive(child, pathname)}
											{@const ChildIcon = child.icon}
											<li>
												<a
													href={child.href}
													class={`flex items-center rounded-lg px-2.5 py-2 text-[0.8rem] font-medium transition-all duration-200 pressable ${
														childActive
															? 'bg-accent/10 text-accent'
															: 'text-muted-foreground hover:bg-muted hover:text-foreground'
													}`}
													aria-current={childActive ? 'page' : undefined}
													onclick={handleNavigate}
												>
													<span
														class={`mr-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
															childActive
																? 'bg-accent/20 text-accent'
																: 'bg-muted text-muted-foreground'
														}`}
													>
														<ChildIcon class="h-3.5 w-3.5" />
													</span>
													<span class="truncate">{child.title}</span>
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</nav>
