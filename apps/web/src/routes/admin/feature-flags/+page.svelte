<!-- apps/web/src/routes/admin/feature-flags/+page.svelte -->
<script lang="ts">
	import { GitBranch } from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { PageData } from './$types';
	import type { FeatureName } from '@buildos/shared-types';

	let { data }: { data: PageData } = $props();

	let pendingUserId = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	function getFlag(user: PageData['users'][number], feature: FeatureName) {
		return user.feature_flags?.find((flag) => flag.feature_name === feature) ?? null;
	}

	async function toggleFeature(
		userId: string,
		featureName: FeatureName,
		currentlyEnabled: boolean
	) {
		const formData = new FormData();
		formData.set('user_id', userId);
		formData.set('feature_name', featureName);
		formData.set('enable', String(!currentlyEnabled));

		pendingUserId = userId;
		errorMessage = null;

		try {
			const response = await fetch('?/toggle', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				let message = 'Failed to update feature flag';
				try {
					const body = await response.json();
					message = body?.error ?? message;
				} catch {
					// ignore parsing errors
				}
				errorMessage = message;
				return;
			}

			// Refresh page data after successful toggle
			window.location.reload();
		} catch (error) {
			console.error('[FeatureFlags] Toggle request failed:', error);
			errorMessage = 'Unexpected error while updating feature flag';
		} finally {
			pendingUserId = null;
		}
	}
</script>

<svelte:head>
	<title>Feature Flags - BuildOS Admin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<AdminPageHeader
		title="Feature Flags"
		description="Enable or disable gated features for individual users."
		icon={GitBranch}
		backHref="/admin"
		backLabel="Dashboard"
	/>

	{#if errorMessage}
		<AdminCard
			tone="danger"
			padding="sm"
			class="text-sm font-medium text-rose-900 dark:text-rose-100"
		>
			{errorMessage}
		</AdminCard>
	{/if}

	<AdminCard padding="none" class="overflow-hidden">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-slate-200/70 text-sm dark:divide-slate-800/70">
				<thead class="bg-slate-50/80 dark:bg-slate-900/60">
					<tr
						class="text-left text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400"
					>
						<th class="px-5 py-3">User</th>
						<th class="px-5 py-3">Email</th>
						<th class="px-5 py-3">Time Blocks</th>
						<th class="px-5 py-3">Last Updated</th>
						<th class="px-5 py-3 text-right">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-200/60 dark:divide-slate-800/60">
					{#each data.users as user}
						{@const timePlayFlag = getFlag(user, 'time_play')}
						<tr
							class="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
						>
							<td class="px-5 py-4 align-middle">
								<div class="flex flex-col gap-1.5">
									<span
										class="text-sm font-semibold text-slate-900 dark:text-slate-100"
									>
										{user.name ?? 'No name'}
									</span>
									{#if user.id === pendingUserId}
										<Badge size="sm" variant="info" class="w-max">
											Updating...
										</Badge>
									{/if}
								</div>
							</td>
							<td class="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
								{user.email}
							</td>
							<td class="px-5 py-4">
								{#if timePlayFlag?.enabled}
									<Badge size="sm" variant="success">Enabled</Badge>
								{:else}
									<Badge
										size="sm"
										variant="info"
										class="bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
									>
										Disabled
									</Badge>
								{/if}
							</td>
							<td class="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
								{#if timePlayFlag?.updated_at}
									<time datetime={timePlayFlag.updated_at}>
										{new Date(timePlayFlag.updated_at).toLocaleString()}
									</time>
								{:else}
									<span class="text-slate-400 dark:text-slate-500">Not set</span>
								{/if}
							</td>
							<td class="px-5 py-4 text-right">
								<Button
									size="sm"
									variant={timePlayFlag?.enabled ? 'secondary' : 'primary'}
									loading={pendingUserId === user.id}
									onclick={() =>
										toggleFeature(
											user.id,
											'time_play',
											timePlayFlag?.enabled ?? false
										)}
								>
									{timePlayFlag?.enabled ? 'Disable' : 'Enable'}
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</AdminCard>
</div>
