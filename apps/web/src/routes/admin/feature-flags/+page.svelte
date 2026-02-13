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
	let pendingFeature = $state<FeatureName | null>(null);
	let errorMessage = $state<string | null>(null);

	const featureColumns: Array<{ label: string; feature: FeatureName; description: string }> = [
		{
			label: 'Time Blocks',
			feature: 'time_play',
			description: 'Unlocks the time-blocking beta experience.'
		},
		{
			label: 'Dual-write (Projects)',
			feature: 'migration.dualwrite.projects',
			description: 'Gates ontology dual-write + migration orchestration per org.'
		}
	];

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
		pendingFeature = featureName;
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
			pendingFeature = null;
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
				<thead class="bg-slate-50/80/60">
					<tr
						class="text-left text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground"
					>
						<th class="px-5 py-3">User</th>
						<th class="px-5 py-3">Email</th>
						{#each featureColumns as column}
							<th class="px-5 py-3">{column.label}</th>
						{/each}
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-200/60 dark:divide-slate-800/60">
					{#each data.users as user}
						<tr
							class="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
						>
							<td class="px-5 py-4 align-middle">
								<div class="flex flex-col gap-1.5">
									<span class="text-sm font-semibold text-foreground">
										{user.name ?? 'No name'}
									</span>
									{#if user.id === pendingUserId}
										<Badge size="sm" variant="info" class="w-max">
											Updating...
										</Badge>
									{/if}
								</div>
							</td>
							<td class="px-5 py-4 text-sm text-muted-foreground">
								{user.email}
							</td>
							{#each featureColumns as column}
								{@const flag = getFlag(user, column.feature)}
								<td class="px-5 py-4 align-top">
									<div class="flex flex-col gap-3">
										<div class="flex items-center gap-2">
											{#if flag?.enabled}
												<Badge size="sm" variant="success">Enabled</Badge>
											{:else}
												<Badge
													size="sm"
													variant="info"
													class="bg-slate-100 text-muted-foreground border-border dark:text-muted-foreground"
												>
													Disabled
												</Badge>
											{/if}
										</div>
										<p class="text-xs text-muted-foreground leading-snug">
											{column.description}
										</p>
										<div class="text-xs text-muted-foreground">
											{#if flag?.updated_at}
												<time datetime={flag.updated_at}>
													Last updated {new Date(
														flag.updated_at
													).toLocaleString()}
												</time>
											{:else}
												<span>Not set</span>
											{/if}
										</div>
										<Button
											size="sm"
											variant={flag?.enabled ? 'secondary' : 'primary'}
											loading={pendingUserId === user.id &&
												pendingFeature === column.feature}
											onclick={() =>
												toggleFeature(
													user.id,
													column.feature,
													flag?.enabled ?? false
												)}
										>
											{flag?.enabled ? 'Disable' : 'Enable'}
										</Button>
									</div>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</AdminCard>
</div>
