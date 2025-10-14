<!-- apps/web/src/routes/admin/feature-flags/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	import type { FeatureName } from '@buildos/shared-types';

	export let data: PageData;

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

<div class="feature-flags-page">
	<header class="page-header">
		<h1>Feature Flags</h1>
		<p class="subtitle">Enable or disable gated features for individual users.</p>
	</header>

	{#if errorMessage}
		<div class="alert alert-error">
			{errorMessage}
		</div>
	{/if}

	<div class="card">
		<table class="flags-table">
			<thead>
				<tr>
					<th>User</th>
					<th>Email</th>
					<th>Time Play</th>
					<th>Last Updated</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as user}
					{@const timePlayFlag = getFlag(user, 'time_play')}
					<tr>
						<td>
							<div class="user-cell">
								<span class="user-name">{user.name ?? '—'}</span>
								{#if user.id === pendingUserId}
									<span class="badge badge-muted">Updating…</span>
								{/if}
							</div>
						</td>
						<td>{user.email}</td>
						<td>
							{#if timePlayFlag?.enabled}
								<span class="badge badge-success">Enabled</span>
							{:else}
								<span class="badge badge-muted">Disabled</span>
							{/if}
						</td>
						<td>
							{#if timePlayFlag?.updated_at}
								<time datetime={timePlayFlag.updated_at}>
									{new Date(timePlayFlag.updated_at).toLocaleString()}
								</time>
							{:else}
								—
							{/if}
						</td>
						<td class="actions">
							<button
								class="btn-toggle"
								disabled={pendingUserId === user.id}
								on:click={() =>
									toggleFeature(
										user.id,
										'time_play',
										timePlayFlag?.enabled ?? false
									)}
							>
								{timePlayFlag?.enabled ? 'Disable' : 'Enable'}
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.feature-flags-page {
		max-width: 960px;
		margin: 0 auto;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.page-header h1 {
		font-size: 1.75rem;
		margin: 0;
	}

	.subtitle {
		color: var(--text-secondary);
		margin: 0.25rem 0 0 0;
	}

	.alert {
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		font-size: 0.95rem;
	}

	.alert-error {
		background-color: #fee2e2;
		color: #991b1b;
	}

	.card {
		border: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
		border-radius: 0.75rem;
		background: var(--card-bg, #ffffff);
		overflow: hidden;
	}

	.flags-table {
		width: 100%;
		border-collapse: collapse;
	}

	.flags-table th,
	.flags-table td {
		padding: 0.9rem 1rem;
		text-align: left;
		border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.05));
	}

	.flags-table thead {
		background: var(--table-header-bg, rgba(0, 0, 0, 0.02));
	}

	.flags-table tbody tr:last-child td {
		border-bottom: none;
	}

	.user-cell {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.user-name {
		font-weight: 600;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.badge-success {
		background-color: #dcfce7;
		color: #166534;
	}

	.badge-muted {
		background-color: #e5e7eb;
		color: #374151;
	}

	.actions {
		text-align: right;
	}

	.btn-toggle {
		border: none;
		border-radius: 0.5rem;
		padding: 0.4rem 0.9rem;
		font-weight: 600;
		cursor: pointer;
		background-color: #0f172a;
		color: #ffffff;
		transition: opacity 0.2s ease;
	}

	.btn-toggle[disabled] {
		cursor: not-allowed;
		opacity: 0.6;
	}
</style>
