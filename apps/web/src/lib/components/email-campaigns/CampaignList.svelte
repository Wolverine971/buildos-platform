<!-- apps/web/src/lib/components/email-campaigns/CampaignList.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		ChevronRight,
		Eye,
		Loader2,
		Mail,
		MousePointerClick,
		Plus,
		Reply,
		Send,
		Users
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CampaignStatusPill from './CampaignStatusPill.svelte';
	import { campaignApi, errorMessage, isAbortError } from '$lib/email-campaigns/client';
	import type { CampaignSummary } from '$lib/email-campaigns/types';
	import { formatRelative } from '$lib/email-campaigns/ui-helpers';

	let campaigns = $state<CampaignSummary[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let creating = $state(false);

	const groups = $derived([
		{
			key: 'active',
			title: 'In progress',
			items: campaigns.filter((item) => item.status === 'sending' || item.status === 'paused')
		},
		{
			key: 'draft',
			title: 'Drafts',
			items: campaigns.filter((item) => item.status === 'draft')
		},
		{
			key: 'done',
			title: 'Finished',
			items: campaigns.filter(
				(item) => item.status === 'completed' || item.status === 'canceled'
			)
		}
	]);

	async function load(signal?: AbortSignal) {
		loading = true;
		error = null;
		try {
			const list = await campaignApi.list(signal);
			campaigns = [...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
		} catch (err) {
			if (isAbortError(err)) return;
			error = errorMessage(err, 'Could not load campaigns');
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	onMount(() => {
		const controller = new AbortController();
		void load(controller.signal);
		return () => controller.abort();
	});

	async function createCampaign() {
		creating = true;
		try {
			const campaign = await campaignApi.create();
			await goto(`/admin/emails/campaigns/${campaign.id}`);
		} catch (err) {
			error = errorMessage(err, 'Could not create the campaign');
		} finally {
			creating = false;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<p class="text-sm text-muted-foreground">
			Write once, review everyone's version, send in waves. Every email comes from
			dj@build-os.com.
		</p>
		<Button
			variant="primary"
			size="md"
			icon={Plus}
			loading={creating}
			disabled={creating}
			onclick={createCampaign}
			class="shrink-0"
		>
			New campaign
		</Button>
	</div>

	{#if error}
		<p
			class="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive tx tx-static tx-weak"
			role="alert"
		>
			{error}
		</p>
	{/if}

	{#if loading}
		<div class="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
			<Loader2 class="h-4 w-4 animate-spin" /> Loading campaigns…
		</div>
	{:else if campaigns.length === 0 && !error}
		<div
			class="rounded-xl border-2 border-dashed border-border px-6 py-14 text-center tx tx-bloom tx-weak"
		>
			<Mail class="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
			<p class="text-base font-semibold text-foreground">No campaigns yet</p>
			<p class="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
				Start with a group — people who signed up but never made a project is a good first
				one.
			</p>
			<Button
				variant="primary"
				size="md"
				icon={Plus}
				class="mt-4"
				loading={creating}
				onclick={createCampaign}
			>
				New campaign
			</Button>
		</div>
	{:else}
		{#each groups as group (group.key)}
			{#if group.items.length > 0}
				<section class="space-y-2" aria-labelledby="campaign-group-{group.key}">
					<h2 id="campaign-group-{group.key}" class="micro-label">{group.title}</h2>
					<ul class="space-y-2">
						{#each group.items as campaign (campaign.id)}
							{@const counts = campaign.counts}
							<li>
								<a
									href="/admin/emails/campaigns/{campaign.id}"
									class="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-ink transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable"
								>
									<div class="min-w-0 flex-1 space-y-1.5">
										<div class="flex min-w-0 flex-wrap items-center gap-2">
											<span
												class="truncate text-sm font-semibold text-foreground group-hover:text-accent sm:text-base"
											>
												{campaign.name}
											</span>
											<CampaignStatusPill {campaign} />
										</div>
										<p class="truncate text-xs text-muted-foreground">
											{#if campaign.source.startsWith('import:')}
												Imported drafts — everyone has their own version
											{:else}
												{campaign.subject_template || 'No subject yet'}
											{/if}
										</p>
										<div
											class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
										>
											<span class="inline-flex items-center gap-1">
												<Users class="h-3.5 w-3.5" />
												<span class="stamp"
													>{counts.included || counts.total}</span
												> people
											</span>
											{#if campaign.status !== 'draft'}
												<span class="inline-flex items-center gap-1">
													<Send class="h-3.5 w-3.5" /><span class="stamp"
														>{counts.sent}</span
													> sent
												</span>
												<span class="inline-flex items-center gap-1">
													<Eye class="h-3.5 w-3.5" /><span class="stamp"
														>{counts.opened}</span
													> opened
												</span>
												<span class="inline-flex items-center gap-1">
													<MousePointerClick class="h-3.5 w-3.5" /><span
														class="stamp">{counts.clicked}</span
													> clicked
												</span>
												<span class="inline-flex items-center gap-1">
													<Reply class="h-3.5 w-3.5" /><span class="stamp"
														>{counts.replied}</span
													> replied
												</span>
											{/if}
											<span class="stamp"
												>updated {formatRelative(campaign.updated_at)}</span
											>
										</div>
									</div>
									<ChevronRight
										class="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent"
									/>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
	{/if}
</div>
