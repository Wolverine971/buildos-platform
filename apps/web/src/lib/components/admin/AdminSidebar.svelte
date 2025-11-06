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
			<div class="px-4 pt-8">
				<p
					class="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500"
				>
					{group.title}
				</p>
				<ul class="mt-4 space-y-2.5">
					{#each group.items as item (item.href)}
						{@const active = isActive(item, pathname)}
						{@const Icon = item.icon}
						<li>
							<a
								href={item.href}
								class={`group relative flex items-center rounded-xl border border-transparent px-4 py-3 transition-all duration-200 ${
									active
										? 'bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 border-blue-500/30 dark:border-blue-400/30 text-blue-700 dark:text-blue-200 shadow-sm'
										: 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100/60 dark:hover:bg-slate-800/70'
								}`}
								aria-current={active ? 'page' : undefined}
								on:click={handleNavigate}
							>
								<span
									class={`flex h-10 w-10 items-center justify-center rounded-2xl border text-base transition-all duration-200 ${
										active
											? 'bg-white/80 text-blue-600 border-blue-400/40 dark:bg-slate-900/70 dark:text-blue-200 dark:border-blue-400/30'
											: 'bg-white text-slate-500 border-slate-200 group-hover:text-blue-600 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700 dark:group-hover:text-blue-200'
									}`}
								>
									<Icon class="h-5 w-5" />
								</span>

								<div class="ml-4 flex flex-1 flex-col">
									<span class="text-sm font-semibold leading-5 tracking-wide"
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
												? 'border-blue-400/60 text-blue-600 dark:text-blue-200 dark:border-blue-400/40'
												: 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'
										}`}
									>
										{item.badge}
									</span>
								{/if}
							</a>

							{#if item.children?.length}
								<ul class="mt-2 space-y-1.5">
									{#each item.children as child (child.href)}
										{@const childActive = isActive(child, pathname)}
										{@const ChildIcon = child.icon}
										<li>
											<a
												href={child.href}
												class={`ml-14 flex items-center rounded-lg px-3.5 py-2 text-sm transition-all ${
													childActive
														? 'bg-blue-500/10 text-blue-700 dark:text-blue-200 dark:bg-blue-500/20'
														: 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-100'
												}`}
												aria-current={childActive ? 'page' : undefined}
												on:click={handleNavigate}
											>
												<span
													class="mr-2 flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-white text-slate-400 dark:bg-slate-900 dark:text-slate-500"
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
