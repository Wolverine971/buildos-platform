<!-- apps/web/src/routes/profile/agent-keys/[callerId]/grant/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		AlertTriangle,
		ArrowLeft,
		CheckCircle2,
		Eye,
		FolderOpen,
		Key,
		Layers,
		Pencil
	} from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	import Button from '$lib/components/ui/Button.svelte';
	import { AGENT_CLIENT_PROFILES } from '$lib/agent-call/agent-client-profiles';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	let grant = $derived(data.grant);
	let caller = $derived(grant.caller);
	let submitting = $state<'grant' | 'all' | null>(null);
	let pickedProjectIds = $state<string[]>([]);

	let connectorName = $derived.by(() => {
		const profile = AGENT_CLIENT_PROFILES.find(
			(candidate) => candidate.provider === caller.provider
		);
		if (profile) return profile.label;
		return caller.provider
			.split(/[-_:]/g)
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	});
	let installationName = $derived.by(() => {
		const metadataName = caller.metadata?.installation_name;
		if (typeof metadataName === 'string' && metadataName.trim()) return metadataName.trim();
		if (caller.is_oauth) return null;
		return caller.caller_key.split(':').at(-1)?.replace(/-/g, ' ') || null;
	});
	let canEdit = $derived(caller.scope_mode === 'read_write');
	let isSelectedMode = $derived(caller.project_scope_mode === 'selected');
	let requestedMissing = $derived(Boolean(data.requestedProjectId) && !grant.project);
	let outcome = $derived(form && 'outcome' in form ? form.outcome : null);
	let errorMessage = $derived(form && 'error' in form ? form.error : null);

	function trackSubmit(kind: 'grant' | 'all') {
		return () => {
			submitting = kind;
			return async ({ update }: { update: () => Promise<void> }) => {
				await update();
				submitting = null;
			};
		};
	}

	function togglePicked(projectId: string) {
		pickedProjectIds = pickedProjectIds.includes(projectId)
			? pickedProjectIds.filter((id) => id !== projectId)
			: [...pickedProjectIds, projectId];
	}
</script>

<svelte:head>
	<title>Share projects with {connectorName} - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet accessLine()}
	<p class="flex items-start gap-2 text-sm text-muted-foreground">
		{#if canEdit}
			<Pencil class="mt-0.5 h-4 w-4 shrink-0" />
			<span>
				{connectorName} will be able to
				<strong class="text-foreground">read and edit</strong> what it's given, within this key's
				write permissions.
			</span>
		{:else}
			<Eye class="mt-0.5 h-4 w-4 shrink-0" />
			<span>
				{connectorName} will be able to <strong class="text-foreground">read</strong> what it's
				given. This key can't make changes.
			</span>
		{/if}
	</p>
{/snippet}

{#snippet allProjectsForm(variant: 'primary' | 'secondary')}
	<form method="POST" action="?/all" use:enhance={trackSubmit('all')}>
		<Button
			type="submit"
			{variant}
			size="md"
			icon={Layers}
			loading={submitting === 'all'}
			disabled={submitting !== null}
			class="w-full sm:w-auto"
		>
			Share all my projects
		</Button>
	</form>
{/snippet}

<div class="min-h-screen overflow-x-hidden bg-background text-foreground">
	<div class="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
		<a
			href="/profile?tab=agent-keys"
			class="mb-5 inline-flex min-h-[44px] items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<ArrowLeft class="h-4 w-4" />
			Agent keys
		</a>

		<div class="mb-6 flex items-center gap-3">
			<div
				class="tx tx-bloom tx-weak flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent shadow-ink"
			>
				<Key class="h-5 w-5 text-accent-foreground" />
			</div>
			<div class="min-w-0">
				<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Connector access
				</p>
				<h1 class="truncate text-xl font-bold text-foreground sm:text-2xl">
					{connectorName}
				</h1>
				{#if installationName}
					<p class="truncate text-sm text-muted-foreground">{installationName}</p>
				{/if}
			</div>
		</div>

		{#if errorMessage}
			<div
				class="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
				role="alert"
			>
				<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
				<span>{errorMessage}</span>
			</div>
		{/if}

		{#if outcome}
			<section
				class="tx tx-grain tx-weak rounded-lg border border-border bg-card p-5 shadow-ink"
				aria-live="polite"
			>
				<div class="flex items-start gap-3">
					<CheckCircle2 class="mt-0.5 h-5 w-5 shrink-0 text-success" />
					<div class="min-w-0">
						<h2 class="text-lg font-semibold text-foreground">
							{#if outcome === 'switched'}
								{connectorName} can now see all your projects
							{:else if grant.project}
								{connectorName} can now work on {grant.project.name}
							{:else}
								Shared {form?.count ?? 0} project{form?.count === 1 ? '' : 's'} with
								{connectorName}
							{/if}
						</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							{#if outcome === 'switched'}
								That includes projects you create later. Shared and restricted
								projects still need their own grant.
							{/if}
							Tell your agent to try again. No reconnect needed.
						</p>
					</div>
				</div>
			</section>
		{:else if grant.project}
			<section
				class="tx tx-frame tx-weak rounded-lg border border-border bg-card p-5 shadow-ink"
			>
				{#if grant.project_already_granted}
					<div class="flex items-start gap-3">
						<CheckCircle2 class="mt-0.5 h-5 w-5 shrink-0 text-success" />
						<div class="min-w-0">
							<h2 class="text-lg font-semibold text-foreground">
								{connectorName} already has access to {grant.project.name}
							</h2>
							<p class="mt-1 text-sm text-muted-foreground">
								If the agent is still blocked, have it reconnect or start a new
								session. Older sessions can keep the project list they started with.
							</p>
						</div>
					</div>
				{:else}
					<h2 class="text-lg font-semibold text-foreground">
						Let {connectorName} work on
						<span class="break-words">{grant.project.name}</span>?
					</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Your agent tried to open this project and was blocked because it isn't
						shared with this key.
					</p>
					{#if grant.project.description}
						<p
							class="mt-3 line-clamp-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
						>
							{grant.project.description}
						</p>
					{/if}
					<div class="mt-4">{@render accessLine()}</div>

					<div class="mt-5 flex flex-col gap-2 sm:flex-row">
						<form method="POST" action="?/grant" use:enhance={trackSubmit('grant')}>
							<input type="hidden" name="project_id" value={grant.project.id} />
							<Button
								type="submit"
								variant="primary"
								size="md"
								icon={FolderOpen}
								loading={submitting === 'grant'}
								disabled={submitting !== null}
								class="w-full sm:w-auto"
							>
								Share just this project
							</Button>
						</form>
						{#if isSelectedMode}
							{@render allProjectsForm('secondary')}
						{/if}
					</div>
					{#if isSelectedMode}
						<p class="mt-3 text-xs text-muted-foreground">
							"All my projects" includes projects you create later, so this won't come
							up again. Shared and restricted projects still need their own grant.
						</p>
					{/if}
				{/if}
			</section>
		{:else}
			{#if requestedMissing}
				<div
					class="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
				>
					<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
					<span
						>The project in this link isn't in your workspace. It may have been deleted,
						or it belongs to someone else.</span
					>
				</div>
			{/if}

			<section
				class="tx tx-frame tx-weak rounded-lg border border-border bg-card p-5 shadow-ink"
			>
				{#if grant.ungranted_projects.length === 0}
					<div class="flex items-start gap-3">
						<CheckCircle2 class="mt-0.5 h-5 w-5 shrink-0 text-success" />
						<div class="min-w-0">
							<h2 class="text-lg font-semibold text-foreground">
								{connectorName} can already see every project in your workspace
							</h2>
							{#if !isSelectedMode}
								<p class="mt-1 text-sm text-muted-foreground">
									New projects you create are included automatically.
								</p>
							{/if}
						</div>
					</div>
				{:else}
					<h2 class="text-lg font-semibold text-foreground">
						{grant.ungranted_projects.length} project{grant.ungranted_projects
							.length === 1
							? ''
							: 's'}
						{connectorName} can't see
					</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Pick the ones it should work on{isSelectedMode
							? ', or share everything, including projects you create later.'
							: '.'}
					</p>
					<div class="mt-4">{@render accessLine()}</div>

					<form
						method="POST"
						action="?/grant"
						use:enhance={trackSubmit('grant')}
						class="mt-4"
					>
						<ul
							class="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2"
						>
							{#each grant.ungranted_projects as project (project.id)}
								<li>
									<label
										class="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md p-2.5 transition-colors hover:bg-muted/60"
									>
										<input
											type="checkbox"
											name="project_id"
											value={project.id}
											checked={pickedProjectIds.includes(project.id)}
											onchange={() => togglePicked(project.id)}
											class="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
										/>
										<span class="min-w-0 flex-1">
											<span
												class="block truncate text-sm font-medium text-foreground"
												>{project.name}</span
											>
											{#if project.description}
												<span
													class="mt-0.5 block truncate text-xs text-muted-foreground"
													>{project.description}</span
												>
											{/if}
										</span>
									</label>
								</li>
							{/each}
						</ul>
						<div class="mt-4 flex flex-col gap-2 sm:flex-row">
							<Button
								type="submit"
								variant="primary"
								size="md"
								icon={FolderOpen}
								loading={submitting === 'grant'}
								disabled={submitting !== null || pickedProjectIds.length === 0}
								class="w-full sm:w-auto"
							>
								Share {pickedProjectIds.length || ''} selected
							</Button>
						</div>
					</form>
					{#if isSelectedMode}
						<div class="mt-2">{@render allProjectsForm('secondary')}</div>
					{/if}
				{/if}
			</section>
		{/if}
	</div>
</div>
