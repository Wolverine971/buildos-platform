<!-- apps/web/src/lib/components/admin/chat-users/ChatEntityChanges.svelte -->
<script lang="ts">
	import { ExternalLink } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		entityGroupKeyForAggregate,
		entityGroupKeyForChange,
		entityHref,
		formatDate,
		formatNumber,
		projectHref
	} from './chat-user-ui';
	import type { UserDetail } from './chat-user-types';

	interface Props {
		userDetail: UserDetail;
		selectedEntityGroupKey?: string | null;
		selectedSessionId?: string | null;
		isLoadingSession?: boolean;
		onLoadRedactedSession: (sessionId: string) => void;
	}

	let {
		userDetail,
		selectedEntityGroupKey = $bindable<string | null>(null),
		selectedSessionId = null,
		isLoadingSession = false,
		onLoadRedactedSession
	}: Props = $props();

	function selectedEntityGroup(): UserDetail['entities'][number] | null {
		if (!selectedEntityGroupKey) return null;
		return (
			userDetail.entities.find(
				(entity) => entityGroupKeyForAggregate(entity) === selectedEntityGroupKey
			) ?? null
		);
	}

	function visibleEntityChanges(): UserDetail['entity_changes'] {
		if (!selectedEntityGroupKey) return userDetail.entity_changes.slice(0, 12);
		return userDetail.entity_changes
			.filter((change) => entityGroupKeyForChange(change) === selectedEntityGroupKey)
			.slice(0, 25);
	}
</script>

<section>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h3 class="micro-label font-semibold">Entity Changes</h3>
		{#if selectedEntityGroupKey}
			<Button
				onclick={() => (selectedEntityGroupKey = null)}
				variant="ghost"
				size="sm"
				class="pressable"
			>
				Show Latest
			</Button>
		{/if}
	</div>
	{#if userDetail.entities.length === 0}
		<div class="mt-3 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
			No chat-created project entity changes in this window.
		</div>
	{:else}
		<div class="mt-3 grid gap-2 md:grid-cols-2">
			{#each userDetail.entities.slice(0, 12) as entity (entityGroupKeyForAggregate(entity))}
				{@const href = projectHref(entity.project_id)}
				<div
					class={`rounded-lg border p-3 text-left text-sm transition-colors hover:border-accent/50 hover:bg-muted/40 ${
						selectedEntityGroupKey === entityGroupKeyForAggregate(entity)
							? 'border-accent bg-accent/10'
							: 'border-border bg-card'
					}`}
				>
					<button
						type="button"
						class="w-full text-left"
						onclick={() =>
							(selectedEntityGroupKey = entityGroupKeyForAggregate(entity))}
					>
						<p class="font-semibold text-foreground">
							{entity.entity_type} · {entity.action}
						</p>
						<p class="text-xs text-muted-foreground">
							{entity.project_name ?? (entity.project_id || 'Unknown project')} · {formatNumber(
								entity.count
							)} changes
						</p>
					</button>
					{#if href}
						<a
							{href}
							target="_blank"
							rel="noopener noreferrer"
							class="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-accent hover:underline"
						>
							Open project
							<ExternalLink class="h-3 w-3" />
						</a>
					{/if}
				</div>
			{/each}
		</div>

		<div class="mt-4 rounded-lg border border-border bg-card p-3">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h4 class="text-sm font-semibold text-foreground">
						{#if selectedEntityGroup()}
							{selectedEntityGroup()?.entity_type} · {selectedEntityGroup()?.action}
						{:else}
							Latest entity changes
						{/if}
					</h4>
					<p class="text-xs text-muted-foreground">
						{#if selectedEntityGroup()}
							{selectedEntityGroup()?.project_name ??
								selectedEntityGroup()?.project_id ??
								'Unknown project'} · {formatNumber(selectedEntityGroup()?.count)} changes
						{:else}
							Most recent safe entity refs across this user.
						{/if}
					</p>
				</div>
				<p class="text-xs text-muted-foreground">
					{formatNumber(visibleEntityChanges().length)} shown
				</p>
			</div>
			<div class="mt-3 space-y-2">
				{#each visibleEntityChanges() as change, index (`${change.session_id}:${change.entity_type}:${change.entity_id ?? index}:${change.action}:${change.created_at}`)}
					<div class="rounded-lg border border-border bg-background px-3 py-2 text-sm">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div>
								<p class="font-semibold text-foreground">
									{change.action}
									{change.entity_type}
									{change.entity_title ?? change.entity_id ?? 'unknown entity'}
								</p>
								<p class="text-xs text-muted-foreground">
									{formatDate(change.created_at)} · {change.project_name ??
										change.project_id ??
										'Unknown project'} · {change.source ?? 'unknown source'}
								</p>
							</div>
							<div class="flex flex-wrap items-center gap-3">
								{#if entityHref(change.project_id, change.entity_type, change.entity_id)}
									<a
										href={entityHref(
											change.project_id,
											change.entity_type,
											change.entity_id
										)}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-accent hover:underline"
									>
										Open entity
										<ExternalLink class="h-3 w-3" />
									</a>
								{/if}
								{#if projectHref(change.project_id) && projectHref(change.project_id) !== entityHref(change.project_id, change.entity_type, change.entity_id)}
									<a
										href={projectHref(change.project_id)}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-accent hover:underline"
									>
										Project
										<ExternalLink class="h-3 w-3" />
									</a>
								{/if}
								<button
									type="button"
									class="text-xs font-semibold text-accent hover:underline disabled:cursor-wait disabled:opacity-60"
									disabled={isLoadingSession &&
										selectedSessionId === change.session_id}
									onclick={() => onLoadRedactedSession(change.session_id)}
								>
									Inspect timeline
								</button>
								<a
									class="text-xs font-semibold text-muted-foreground hover:text-accent hover:underline"
									href={`/admin/chat/sessions?chat_session_id=${change.session_id}`}
								>
									Full audit
								</a>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</section>
