<!-- apps/web/src/lib/components/admin/AdminSidebar.svelte -->
<script lang="ts">
	import type { ComponentType } from 'svelte';

	export type AdminNavItem = {
		title: string;
		href: string;
		icon: ComponentType<{ class?: string }>;
		description?: string;
		badge?: string;
		children?: AdminNavItem[];
	};

	export type AdminNavGroup = {
		title: string;
		items: AdminNavItem[];
	};

	interface Props {
		groups: AdminNavGroup[];
		pathname: string;
		onNavigate?: () => void;
	}

	let { groups, pathname, onNavigate }: Props = $props();

	const isActive = (item: AdminNavItem, currentPath: string): boolean => {
		if (item.children?.length) {
			return item.children.some((child) => isActive(child, currentPath));
		}

		if (!item.href) return false;

		if (item.href === '/admin') {
			return currentPath === '/admin';
		}

		return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
	};

	const handleNavigate = () => {
		onNavigate?.();
	};
</script>

<nav class="flex h-full flex-col">
	<div class="flex-1 overflow-y-auto pb-8">
		{#each groups as group (group.title)}
			<div class="px-4 pt-6">
				<p
					class="px-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500"
				>
					{group.title}
				</p>
				<ul class="mt-3 space-y-1.5">
					{#each group.items as item (item.href)}
						{@const active = isActive(item, pathname)}
						{@const Icon = item.icon}
						<li>
							<a
								href={item.href}
								class={`group relative flex items-center rounded-lg px-3 py-2.5 text-sm transition-all duration-150 ${
									active
										? 'border border-slate-900/10 bg-slate-900/5 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white'
										: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/70'
								}`}
								aria-current={active ? 'page' : undefined}
								onclick={handleNavigate}
							>
								<span
									class={`flex h-9 w-9 items-center justify-center rounded-lg border text-base transition-all duration-150 ${
										active
											? 'bg-white text-slate-900 border-slate-900/10 dark:bg-slate-950 dark:text-white dark:border-white/10'
											: 'bg-white text-slate-500 border-slate-200 group-hover:text-slate-900 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'
									}`}
								>
									<Icon class="h-5 w-5" />
								</span>

								<div class="ml-4 flex flex-1 flex-col">
									<span class="font-medium leading-5 tracking-tight"
										>{item.title}</span
									>
									{#if item.description}
										<span
											class="text-xs leading-4 text-slate-500 transition-colors group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"
										>
											{item.description}
										</span>
									{/if}
								</div>

								{#if item.badge}
									<span
										class={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
											active
												? 'border-slate-900/20 text-slate-900 dark:border-white/20 dark:text-white'
												: 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'
										}`}
									>
										{item.badge}
									</span>
								{/if}
							</a>

							{#if item.children?.length}
								<ul class="mt-1.5 space-y-1">
									{#each item.children as child (child.href)}
										{@const childActive = isActive(child, pathname)}
										{@const ChildIcon = child.icon}
										<li>
											<a
												href={child.href}
												class={`ml-12 flex items-center rounded-md px-3 py-2 text-sm transition-all ${
													childActive
														? 'bg-slate-900/5 text-slate-900 dark:bg-white/5 dark:text-white'
														: 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-100'
												}`}
												aria-current={childActive ? 'page' : undefined}
												onclick={handleNavigate}
											>
												<span
													class="mr-2 flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-400 dark:bg-slate-900 dark:text-slate-500"
												>
													<ChildIcon class="h-4 w-4" />
												</span>
												<span class="leading-4">{child.title}</span>
											</a>
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</nav>
