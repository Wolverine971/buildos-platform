<!-- apps/web/src/lib/components/profile/PeopleAgentsTab.svelte -->
<!--
	Profile > People & agents: one place for who you share with and what agents
	can reach. You (handle, findable, agent requests) · Your page (build-os.com/@handle) ·
	requests waiting on you ·
	People (everyone in your projects, list or grid; invites; shared with you) ·
	Agents (your connections) · History (who got access, and when). Each
	project's Share window changes the same settings.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { AlertCircle, History, Users } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TabHeader from './_shared/TabHeader.svelte';
	import SettingsCard from './_shared/SettingsCard.svelte';
	import AgentKeysTab from './AgentKeysTab.svelte';
	import YouSection from '$lib/components/people/hub/YouSection.svelte';
	import YourPageCard from '$lib/components/builder-profile/YourPageCard.svelte';
	import PeopleSection from '$lib/components/people/hub/PeopleSection.svelte';
	import PeopleRequests from '$lib/components/people/PeopleRequests.svelte';
	import AccessHistory from '$lib/components/people/AccessHistory.svelte';
	import type { PeopleHubData } from '$lib/components/people/hub/hub-types';

	let {
		userName,
		initialSection = null,
		onsuccess,
		onerror
	}: {
		userName: string;
		/** Section to scroll to after load ('you' | 'people' | 'requests' | 'agents' | 'history'). */
		initialSection?: string | null;
		onsuccess?: (event: { message: string }) => void;
		onerror?: (event: { message: string }) => void;
	} = $props();

	let hub = $state<PeopleHubData | null>(null);
	let loading = $state(true);
	let loadFailed = $state(false);
	let historyKey = $state(0);
	/** Bumped when the handle may have changed, so Your page picks up the new address. */
	let handleRevision = $state(0);
	let sharePicking = $state(false);
	let shareProjectId = $state<string | null>(null);

	const incomingCount = $derived(hub?.requests.incoming.length ?? 0);

	async function load() {
		try {
			const res = await fetch('/api/people/hub', { credentials: 'same-origin' });
			const payload = await res.json().catch(() => null);
			if (!res.ok || !payload?.data) {
				loadFailed = true;
				return;
			}
			hub = payload.data as PeopleHubData;
			loadFailed = false;
		} catch {
			loadFailed = true;
		} finally {
			loading = false;
		}
	}

	async function reload() {
		await load();
		historyKey += 1;
	}

	function scrollToSection(id: string | null) {
		if (!id) return;
		const target = document.getElementById(id);
		target?.scrollIntoView({ block: 'start', behavior: 'instant' });
	}

	onMount(async () => {
		await load();
		await tick();
		const target = window.location.hash.replace(/^#/, '') || initialSection;
		scrollToSection(target);
		// Sections above (your handle, the request cards) finish loading a beat later and
		// push the target down; land on it again once they have, unless you scrolled.
		const landedAt = window.scrollY;
		setTimeout(() => {
			if (Math.abs(window.scrollY - landedAt) < 4) scrollToSection(target);
		}, 600);
	});

	function openShare() {
		if (!shareProjectId) return;
		void goto(`/projects/${encodeURIComponent(shareProjectId)}?share=1`);
	}

	const linkBase =
		'inline-flex min-h-[32px] items-center gap-2 rounded-lg text-sm transition-colors duration-150 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none';
	const linkClass = `${linkBase} text-muted-foreground`;
	const countClass = 'font-mono text-xs tabular-nums text-muted-foreground';
</script>

<div class="space-y-4 sm:space-y-5">
	<TabHeader
		icon={Users}
		title="People & agents"
		description="Who you share with, and what agents can reach. Each project's Share window changes the same settings."
	/>

	<nav aria-label="People and agents sections" class="flex flex-wrap gap-x-6 gap-y-1">
		<a href="#you" class={linkClass}>You</a>
		<a href="#your-page" class={linkClass}>Your page</a>
		{#if incomingCount > 0}
			<a href="#requests" class="{linkBase} text-foreground"
				><span class="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true"
				></span>Waiting on you <span class={countClass}>{incomingCount}</span></a
			>
		{/if}
		<a href="#people" class={linkClass}
			>People{#if hub}<span class={countClass}>{hub.people.length}</span>{/if}</a
		>
		<a href="#agents" class={linkClass}>Agents</a>
		<a href="#history" class={linkClass}>History</a>
	</nav>

	{#if loadFailed || hub?.loadError}
		<div
			class="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground"
			role="alert"
		>
			<AlertCircle class="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
			<span class="flex-1"
				>{hub?.loadError ?? 'Could not load the people in your projects.'}</span
			>
			<Button variant="outline" size="sm" onclick={reload}>Try again</Button>
		</div>
	{/if}

	<div id="you" class="scroll-mt-4">
		<YouSection
			name={userName}
			onchanged={() => {
				handleRevision += 1;
				void reload();
			}}
		/>
	</div>

	<div id="your-page" class="scroll-mt-4">
		{#key handleRevision}
			<YourPageCard />
		{/key}
	</div>

	{#if hub && incomingCount > 0}
		<div id="requests" class="scroll-mt-4">
			<PeopleRequests
				requests={hub.requests}
				ownedProjects={hub.ownedProjects}
				onchanged={reload}
			/>
		</div>
	{/if}

	{#if loading && !hub}
		<div
			class="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
		>
			Loading people
		</div>
	{:else if hub}
		<PeopleSection
			people={hub.people}
			invites={hub.invites}
			ownedProjects={hub.ownedProjects}
			sharedWithYou={hub.sharedWithYou}
			onreload={reload}
			onshare={hub.ownedProjects.length > 0
				? () => (sharePicking = !sharePicking)
				: undefined}
		/>
		{#if sharePicking}
			<div
				class="-mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 sm:-mt-3"
			>
				<label for="hub-share-project" class="text-sm font-medium text-foreground"
					>Share which project?</label
				>
				<Select
					id="hub-share-project"
					size="sm"
					placeholder="Pick a project"
					value={shareProjectId}
					class="min-w-[12rem] flex-1"
					onchange={(value) => (shareProjectId = String(value))}
				>
					{#each hub.ownedProjects as project (project.id)}
						<option value={project.id}>{project.name}</option>
					{/each}
				</Select>
				<Button variant="primary" size="sm" disabled={!shareProjectId} onclick={openShare}
					>Open its Share window</Button
				>
				<Button variant="ghost" size="sm" onclick={() => (sharePicking = false)}
					>Cancel</Button
				>
			</div>
		{/if}
		{#if incomingCount === 0}
			<div id="requests" class="scroll-mt-4">
				<PeopleRequests
					requests={hub.requests}
					ownedProjects={hub.ownedProjects}
					onchanged={reload}
				/>
			</div>
		{/if}
	{/if}

	<section id="agents" class="scroll-mt-4 space-y-4" aria-label="Agents">
		<AgentKeysTab {onsuccess} {onerror} />
	</section>

	<div id="history" class="scroll-mt-4">
		<SettingsCard
			title="History"
			description="Who got access to your projects, and what their agents can do, over time."
			icon={History}
			labelledById="hub-history-heading"
		>
			{#key historyKey}
				<AccessHistory />
			{/key}
		</SettingsCard>
	</div>
</div>
