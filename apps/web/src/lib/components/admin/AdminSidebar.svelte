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
	<div class="flex-1 overflow-y-auto py-4">
		{#each groups as group (group.title)}
			<div class="px-3 pb-6">
				<p
					class="mb-2 px-3 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-500"
				>
					{group.title}
				</p>
				<ul class="space-y-1">
					{#each group.items as item (item.href)}
						{@const active = isActive(item, pathname)}
						{@const Icon = item.icon}
						<li>
							<a
								href={item.href}
								class={`group relative flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
									active
										? 'bg-gradient-to-r from-blue-50 to-purple-50 text-purple-900 dark:from-blue-950/30 dark:to-purple-950/30 dark:text-purple-100'
										: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-100'
								}`}
								aria-current={active ? 'page' : undefined}
								onclick={handleNavigate}
							>
								{#if active}
									<div
										class="absolute inset-y-0 left-0 w-1 rounded-r-full bg-gradient-to-b from-blue-600 to-purple-600"
									></div>
								{/if}

								<span
									class={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 ${
										active
											? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg shadow-purple-500/25'
											: 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-slate-700 dark:group-hover:text-slate-300'
									}`}
								>
									<Icon class="h-4 w-4" />
								</span>

								<div class="ml-3 flex flex-1 flex-col">
									<span class="leading-tight">{item.title}</span>
									{#if item.description}
										<span
											class={`mt-0.5 text-[0.7rem] leading-tight transition-colors ${
												active
													? 'text-purple-700 dark:text-purple-300'
													: 'text-slate-500 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-400'
											}`}
										>
											{item.description}
										</span>
									{/if}
								</div>

								{#if item.badge}
									<span
										class={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
											active
												? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
												: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
										}`}
									>
										{item.badge}
									</span>
								{/if}
							</a>

							{#if item.children?.length && active}
								<ul class="mt-1 ml-11 space-y-0.5">
									{#each item.children as child (child.href)}
										{@const childActive = isActive(child, pathname)}
										{@const ChildIcon = child.icon}
										<li>
											<a
												href={child.href}
												class={`flex items-center rounded-lg px-3 py-2 text-[0.8rem] font-medium transition-all duration-200 ${
													childActive
														? 'bg-purple-100/50 text-purple-900 dark:bg-purple-950/20 dark:text-purple-200'
														: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-500 dark:hover:bg-slate-800/30 dark:hover:text-slate-300'
												}`}
												aria-current={childActive ? 'page' : undefined}
												onclick={handleNavigate}
											>
												<span
													class={`mr-2.5 flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
														childActive
															? 'bg-purple-200 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
															: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
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
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</nav>
