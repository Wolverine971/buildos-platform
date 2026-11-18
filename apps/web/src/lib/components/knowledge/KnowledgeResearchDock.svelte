<!-- apps/web/src/lib/components/knowledge/KnowledgeResearchDock.svelte -->
<!--
	Research follows you around the app (tasker 160 follow-up). The root layout loads this only
	after research starts in this tab (or was live within 30 minutes before a reload). It shows the
	research tray on every page except /knowledge (which has its own), and pings with a toast when
	an entry's research lands: "Found 3 new details about Kyle Kulinski · Open". Both read the
	shared queue in research-session.svelte.ts, so there is still one poll per tab.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toastService } from '$lib/stores/toast.store';
	import KnowledgeResearchTray from './KnowledgeResearchTray.svelte';
	import { forgetResearchDock, wantResearchDock } from './research-dock-flag.svelte';
	import {
		knowledgeResearch,
		onKnowledgeResearchSettled,
		resetKnowledgeResearch,
		watchKnowledgeResearch
	} from './research-session.svelte';
	import type { ResearchTarget } from './research-tray';
	import type { KnowledgeKind } from './knowledge-client';

	const onKnowledgePage = $derived(page.url.pathname.startsWith('/knowledge'));

	/** With its kind, the entry opens in its list (People, Organizations…) scrolled to its row. */
	function openEntry(id: string, kind?: KnowledgeKind | null) {
		const params = new URLSearchParams({ ...(kind ? { kind } : {}), e: id });
		void goto(`/knowledge?${params}`);
	}

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

	/** One toast per settle, however many entries finished together. */
	function ping(targets: ResearchTarget[]) {
		const done = targets.filter((t) => t.status === 'done');
		const failed = targets.filter((t) => t.status === 'failed');
		const found = done.filter((t) => t.facts_added > 0);
		const details = found.reduce((sum, t) => sum + t.facts_added, 0);

		if (done.length === 1 && !failed.length) {
			const [target] = done;
			if (!target) return;
			if (target.facts_added > 0) {
				toastService.success(
					`Found ${plural(target.facts_added, 'new detail')} about ${target.name}`,
					{
						action: {
							label: 'Open',
							onClick: () => openEntry(target.entity_id, target.kind)
						}
					}
				);
			} else {
				toastService.info(`Research on ${target.name} finished. Nothing new turned up.`, {
					action: {
						label: 'Open',
						onClick: () => openEntry(target.entity_id, target.kind)
					}
				});
			}
			return;
		}
		if (done.length > 1) {
			const first = found[0] ?? done[0];
			toastService.success(
				`Research finished on ${done.length} entries` +
					(details ? ` · ${plural(details, 'new detail')}` : ' · nothing new'),
				first
					? {
							action: {
								label: 'Open',
								onClick: () => openEntry(first.entity_id, first.kind)
							}
						}
					: undefined
			);
		}
		if (failed.length) {
			toastService.error(
				failed.length === 1
					? `Research on ${failed[0]?.name} didn't finish`
					: `Research didn't finish on ${failed.length} entries`
			);
		}
	}

	onMount(() => {
		watchKnowledgeResearch();
		const stopListening = onKnowledgeResearchSettled(ping);
		// The layout unmounts the dock when the user signs out: forget their research.
		return () => {
			stopListening();
			resetKnowledgeResearch();
		};
	});

	// Running: keep the reload marker fresh (so a reload mid-research still pings). Nothing
	// running any more: a reload no longer needs to look.
	$effect(() => {
		if (knowledgeResearch.live) wantResearchDock();
		else if (knowledgeResearch.loaded) forgetResearchDock();
	});
</script>

{#if !onKnowledgePage}
	<KnowledgeResearchTray queue={knowledgeResearch} onOpenEntity={openEntry} />
{/if}
