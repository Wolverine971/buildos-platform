<!-- apps/web/src/routes/admin/emails/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Mail } from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import CampaignList from '$lib/components/email-campaigns/CampaignList.svelte';
	import SentLog from '$lib/components/email-campaigns/SentLog.svelte';

	type Tab = 'campaigns' | 'sent';

	const activeTab = $derived<Tab>(
		$page.url.searchParams.get('tab') === 'sent' ? 'sent' : 'campaigns'
	);

	function selectTab(tab: Tab) {
		const url = new URL($page.url);
		if (tab === 'campaigns') url.searchParams.delete('tab');
		else url.searchParams.set('tab', tab);
		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	const TABS: { id: Tab; label: string }[] = [
		{ id: 'campaigns', label: 'Campaigns' },
		{ id: 'sent', label: 'Sent log' }
	];
</script>

<svelte:head>
	<title>Email | BuildOS Admin</title>
	<meta name="description" content="Write, review and send BuildOS email campaigns." />
</svelte:head>

<div class="min-w-0 space-y-5">
	<AdminPageHeader
		title="Email"
		description="Campaigns to the people who signed up, and a log of everything sent."
		icon={Mail}
	/>

	<div class="border-b border-border" role="tablist" aria-label="Email views">
		<div class="-mb-px flex gap-5">
			{#each TABS as tab (tab.id)}
				<button
					type="button"
					role="tab"
					id="email-tab-{tab.id}"
					aria-selected={activeTab === tab.id}
					aria-controls="email-panel-{tab.id}"
					onclick={() => selectTab(tab.id)}
					class="min-h-10 border-b-2 pb-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {activeTab ===
					tab.id
						? 'border-accent text-accent'
						: 'border-transparent text-muted-foreground hover:text-foreground'}"
				>
					{tab.label}
				</button>
			{/each}
		</div>
	</div>

	<div id="email-panel-{activeTab}" role="tabpanel" aria-labelledby="email-tab-{activeTab}">
		{#if activeTab === 'campaigns'}
			<CampaignList />
		{:else}
			<SentLog />
		{/if}
	</div>
</div>
