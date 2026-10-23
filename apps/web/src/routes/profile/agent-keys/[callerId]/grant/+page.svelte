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
		Pencil,
		RefreshCw,
		Send,
		ShieldOff,
		Users
	} from '$lib/icons/lucide';
	import type { ActionData, PageData } from './$types';
	import Button from '$lib/components/ui/Button.svelte';
	import { AGENT_CLIENT_PROFILES } from '$lib/agent-call/agent-client-profiles';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	type Submitting = 'grant' | 'all' | 'allowWrites' | 'askOwner' | 'sharedProjects';

	let grant = $derived(data.grant);
	let caller = $derived(grant.caller);
	let submitting = $state<Submitting | null>(null);
	let pickedProjectIds = $state<string[]>([]);
	let includeShared = $state(false);

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
	let askStatus = $derived(form && 'askStatus' in form ? form.askStatus : null);
	let errorMessage = $derived(form && 'error' in form ? form.error : null);
	let needsReconnect = $derived(Boolean(form && 'reconnect' in form && form.reconnect));
	let ownerName = $derived(
		grant.project_blocked?.owner_name ??
			grant.write?.owner_name ??
			grant.project?.shared_by ??
			null
	);
	let ownerLabel = $derived(ownerName ?? 'The owner');
	let ownerLower = $derived(ownerName ?? 'the owner');

	function trackSubmit(kind: Submitting) {
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

	const ASK_MESSAGES: Record<string, string> = {
		pending: 'Asked. Nothing changes until they answer; you’ll get a notification.',
		already_allowed: 'They already allow this. Tell your agent to try again.',
		waiting_other: 'You already have a request waiting with them. They’ll answer that first.',
		declined_recently: 'They said not now within the last week. You can ask again after that.',
		rate_limited: 'You have too many requests waiting. Wait for some answers first.'
	};
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

{#snippet askOwnerForm(projectId: string, need: 'agents_read' | 'agents_write')}
	<form method="POST" action="?/askOwner" use:enhance={trackSubmit('askOwner')} class="mt-4">
		<input type="hidden" name="project_id" value={projectId} />
		<input type="hidden" name="need" value={need} />
		<Button
			type="submit"
			variant="primary"
			size="md"
			icon={Send}
			loading={submitting === 'askOwner'}
			disabled={submitting !== null}
			class="w-full sm:w-auto"
		>
			Ask {ownerLower}
		</Button>
	</form>
{/snippet}

<div class="min-h-screen overflow-x-hidden bg-background text-foreground">
	<div class="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
		<a
			href="/profile?tab=people#agents"
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
				<span>
					{errorMessage}
					{#if needsReconnect}
						In {connectorName}, disconnect BuildOS, connect it again, and allow changes
						on the BuildOS screen.
					{/if}
				</span>
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
							{:else if outcome === 'writes_allowed'}
								{connectorName} can now make changes{grant.project
									? ` in ${grant.project.name}`
									: ''}
							{:else if outcome === 'asked'}
								{ASK_MESSAGES[askStatus ?? ''] ?? 'Request sent.'}
							{:else if outcome === 'shared_on'}
								{connectorName} can now open projects people share with you
							{:else if outcome === 'shared_off'}
								Projects shared with you stay out of {connectorName}
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
							{:else if outcome === 'shared_on'}
								Each owner's setting for your agents still applies.
							{/if}
							{#if outcome === 'asked'}
								Your agent can check back and pick up where it left off.
							{:else if outcome !== 'shared_off'}
								Tell your agent to try again. No reconnect needed.
							{/if}
						</p>
					</div>
				</div>
			</section>
		{:else if grant.project && grant.project_blocked}
			<!-- Wall 3: the owner turned this person's agents off. A grant can't help. -->
			<section
				class="tx tx-frame tx-weak rounded-lg border border-border bg-card p-5 shadow-ink"
			>
				<div class="flex items-start gap-3">
					<ShieldOff class="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
					<div class="min-w-0">
						<h2 class="text-lg font-semibold text-foreground">
							{ownerLabel} turned off agents for you in
							<span class="break-words">{grant.project.name}</span>
						</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							Giving it to {connectorName} here wouldn't help. Only {ownerLower} can turn
							your agents back on.
						</p>
						{@render askOwnerForm(
							grant.project.id,
							data.need === 'write' ? 'agents_write' : 'agents_read'
						)}
					</div>
				</div>
			</section>
		{:else if grant.write && data.need === 'write'}
			<!-- Wall 2 (or an owner wall reached from a write link). No project in the link
			     means the whole connection is read-only. -->
			<section
				class="tx tx-frame tx-weak rounded-lg border border-border bg-card p-5 shadow-ink"
			>
				{#if grant.write.status === 'allowed'}
					<div class="flex items-start gap-3">
						<CheckCircle2 class="mt-0.5 h-5 w-5 shrink-0 text-success" />
						<div class="min-w-0">
							<h2 class="text-lg font-semibold text-foreground">
								{connectorName} can already make changes{grant.project
									? ` in ${grant.project.name}`
									: ''}
							</h2>
							<p class="mt-1 text-sm text-muted-foreground">
								Tell your agent to try again. If it's still blocked, start a new
								session.
							</p>
						</div>
					</div>
				{:else if grant.write.status === 'allow_here'}
					<h2 class="text-lg font-semibold text-foreground">
						{#if grant.project}
							Let {connectorName} make changes in
							<span class="break-words">{grant.project.name}</span>?
						{:else}
							Let {connectorName} make changes?
						{/if}
					</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Your agent tried to change something{grant.project ? ' there' : ''}, and
						this connection can only read.
						{#if !canEdit}
							Allowing changes lets it add and edit tasks and documents in the
							projects it can see. It never deletes.
						{/if}
						{#if grant.project?.shared_by}
							In {grant.project.shared_by}'s project it stays in its lane: it adds
							tasks and documents and changes only what you created or are assigned
							to.
						{/if}
					</p>
					<form
						method="POST"
						action="?/allowWrites"
						use:enhance={trackSubmit('allowWrites')}
						class="mt-5"
					>
						{#if grant.project}
							<input type="hidden" name="project_id" value={grant.project.id} />
							<input
								type="hidden"
								name="also_grant"
								value={grant.project_already_granted ? 'false' : 'true'}
							/>
						{/if}
						<Button
							type="submit"
							variant="primary"
							size="md"
							icon={Pencil}
							loading={submitting === 'allowWrites'}
							disabled={submitting !== null}
							class="w-full sm:w-auto"
						>
							Allow changes
						</Button>
					</form>
				{:else if grant.write.status === 'reconnect'}
					<div class="flex items-start gap-3">
						<RefreshCw class="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
						<div class="min-w-0">
							<h2 class="text-lg font-semibold text-foreground">
								Reconnect {connectorName} to allow changes
							</h2>
							<p class="mt-1 text-sm text-muted-foreground">
								You connected it to read only, and that can't be widened from here.
								In
								{connectorName}, disconnect BuildOS, connect it again, and allow
								changes on the BuildOS screen. Then tell your agent to try again.
							</p>
						</div>
					</div>
				{:else if grant.project}
					<div class="flex items-start gap-3">
						<Users class="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
						<div class="min-w-0">
							<h2 class="text-lg font-semibold text-foreground">
								{#if grant.write.owner_reason === 'viewer'}
									You're a viewer in <span class="break-words"
										>{grant.project.name}</span
									>
								{:else}
									{ownerLabel} lets your agents read
									<span class="break-words">{grant.project.name}</span>, not
									change it
								{/if}
							</h2>
							<p class="mt-1 text-sm text-muted-foreground">
								Only {ownerLower} can change that. Your agent can ask them for you, or
								you can ask from here.
							</p>
							{@render askOwnerForm(grant.project.id, 'agents_write')}
						</div>
					</div>
				{/if}
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
						{#if grant.project.shared_by}
							{grant.project.shared_by} shared it with you; their setting for your agents
							still applies.
						{/if}
					</p>
					{#if grant.project.description}
						<p
							class="mt-3 line-clamp-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
						>
							{grant.project.description}
						</p>
					{/if}
					<div class="mt-4">{@render accessLine()}</div>

					<form method="POST" action="?/grant" use:enhance={trackSubmit('grant')}>
						<input type="hidden" name="project_id" value={grant.project.id} />
						{#if grant.project.shared_by && !caller.include_shared_projects}
							<label
								class="mt-4 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md p-2 transition-colors hover:bg-muted/60"
							>
								<input
									type="checkbox"
									name="include_shared"
									bind:checked={includeShared}
									class="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
								/>
								<span class="text-sm text-foreground">
									Also let {connectorName} into projects people share with me later
									<span class="block text-xs text-muted-foreground">
										Each owner's setting for your agents still applies.
									</span>
								</span>
							</label>
						{/if}
						<div class="mt-5 flex flex-col gap-2 sm:flex-row">
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
						</div>
					</form>
					{#if isSelectedMode && !grant.project.shared_by}
						<div class="mt-2">{@render allProjectsForm('secondary')}</div>
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
											{#if project.shared_by}
												<span
													class="mt-0.5 block truncate text-xs text-muted-foreground"
													>Shared by {project.shared_by}</span
												>
											{:else if project.description}
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

		{#if grant.shared_projects.count > 0 || caller.include_shared_projects}
			<section
				class="mt-4 rounded-lg border border-border bg-card p-5 shadow-ink"
				aria-labelledby="shared-projects-heading"
			>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div class="min-w-0">
						<h2
							id="shared-projects-heading"
							class="text-base font-semibold text-foreground"
						>
							Projects people share with you
						</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							{#if caller.include_shared_projects}
								{connectorName} can open them, as far as each owner allows agents.
							{:else}
								Off: you give {connectorName} each one yourself. Turn this on to let
								it into every project shared with you, as far as each owner allows agents.
							{/if}
							{#if grant.shared_projects.owner_blocked > 0}
								{grant.shared_projects.owner_blocked === 1
									? 'One owner turned'
									: `${grant.shared_projects.owner_blocked} owners turned`} agents
								off for you; those stay out.
							{/if}
						</p>
					</div>
					<form
						method="POST"
						action="?/sharedProjects"
						use:enhance={trackSubmit('sharedProjects')}
						class="shrink-0"
					>
						<input
							type="hidden"
							name="enabled"
							value={caller.include_shared_projects ? 'false' : 'true'}
						/>
						<Button
							type="submit"
							variant={caller.include_shared_projects ? 'outline' : 'secondary'}
							size="md"
							loading={submitting === 'sharedProjects'}
							disabled={submitting !== null}
							class="w-full sm:w-auto"
						>
							{caller.include_shared_projects ? 'Turn off' : 'Turn on'}
						</Button>
					</form>
				</div>
			</section>
		{/if}
	</div>
</div>
