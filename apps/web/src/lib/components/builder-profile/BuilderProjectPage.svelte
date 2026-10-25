<!-- apps/web/src/lib/components/builder-profile/BuilderProjectPage.svelte -->
<!--
	A project's own page (build-os.com/@handle/<project>): one card on the bench, like the
	builder page it comes from. Who builds it and what it is, then what it's looking for
	("I'm interested" goes where the owner chose), goals and the next milestone, the
	updates the owner published, a year of activity on this project, its public docs,
	who builds it (with Ask to join), and the owner's other projects.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { ArrowLeft, ArrowRight, ArrowUpRight, Users } from '$lib/icons/lucide';
	import type { BuilderProjectPageView } from '$lib/builder-profile/types';
	import { displayUrl } from '$lib/builder-profile/links';
	import { isEmailReply, projectPaths } from '$lib/builder-profile/project-pages';
	import { activeLabel, initialsOf, shortDate, stageLabel } from '$lib/builder-profile/format';
	import BuildLog from './BuildLog.svelte';
	import ActivityBars from './ActivityBars.svelte';
	import SiteIcon from './SiteIcon.svelte';
	import ClaimFooter from './ClaimFooter.svelte';
	import BuilderPageShell from './BuilderPageShell.svelte';
	import { BuilderVisitor } from './builder-visitor.svelte';

	let {
		data,
		origin,
		askProjectId = null,
		intent = null,
		followProjectId = null
	}: {
		data: BuilderProjectPageView;
		origin: string;
		/** Opened from a sign-in redirect: open the ask box. */
		askProjectId?: string | null;
		/** Opened from a sign-in redirect after tapping Follow. */
		intent?: string | null;
		followProjectId?: string | null;
	} = $props();

	const page = $derived(data.page);
	const project = $derived(data.project);
	const handle = $derived(page.profile.handle);
	const ownerName = $derived(page.profile.name || `@${handle}`);
	const firstName = $derived(page.profile.name?.split(' ')[0] ?? `@${handle}`);
	const isOwner = $derived(page.viewer.is_owner);
	const canAct = $derived(!isOwner);
	const paths = $derived(projectPaths(handle, page.projects));
	const path = $derived(paths.get(project.id) ?? `/@${handle}/${project.id}`);
	const projectUrl = $derived(`${origin.replace(/\/$/, '')}${path}`);
	const glyphs = $derived((project.glyphs ?? []).join(''));
	const others = $derived(page.projects.filter((p) => p.id !== project.id));
	const agentSplit = $derived(page.settings.show_agent_split);
	const hasWeeks = $derived((project.weekly ?? []).some(([c]) => c > 0));
	const otherMembers = $derived(
		Math.max(0, (project.member_count ?? 1) - 1 - data.built_by.length)
	);

	// Published lines, newest first; the card's current line leads if it isn't one of them.
	const timeline = $derived.by(() => {
		const list = [...data.updates];
		const current = project.this_week?.trim();
		if (current && !list.some((u) => u.body.trim() === current)) {
			list.unshift({ body: current, week_of: '', at: project.this_week_at ?? '' });
		}
		return list;
	});

	const visitor = new BuilderVisitor(() => ({
		handle,
		displayName: ownerName,
		signedIn: page.viewer.signed_in,
		canAct,
		countable: !isOwner && page.status === 'published',
		askPending: page.viewer.ask_pending,
		returnPath: path
	}));
	const following = $derived(visitor.projectFollowing(project.id, project.viewer_follows));
	const ask = $derived(visitor.ask(project.id));
	const followPending = $derived(
		canAct &&
			intent === 'follow' &&
			followProjectId === project.id &&
			page.viewer.signed_in &&
			!following
	);
	let note = $state('');

	onMount(async () => {
		visitor.track('view');
		if (!canAct || !page.viewer.signed_in) return;
		if (askProjectId === project.id && !project.viewer_is_member) {
			visitor.openAsk(project.id);
			await tick();
			document.getElementById(`ask-note-${project.id}`)?.focus();
		} else if (followPending) {
			document.getElementById(`follow-${project.id}`)?.focus();
		}
	});

	const quietButton =
		'inline-flex min-h-11 items-center gap-2 rounded-full border border-border-strong bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60';
	const accentButton =
		'tx-button tx-button-accent inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold';
</script>

{#snippet sectionHead(id: string, title: string, aside: string)}
	<div class="mb-3.5 flex items-baseline justify-between gap-3">
		<h2 {id} class="micro-label text-foreground">{title}</h2>
		{#if aside}<span class="micro-label">{aside}</span>{/if}
	</div>
{/snippet}

{#snippet avatar(url: string | undefined, name: string | undefined, who: string, size: string)}
	{#if url}
		<img
			src={url}
			alt=""
			referrerpolicy="no-referrer"
			class="{size} shrink-0 rounded-full bg-muted object-cover"
		/>
	{:else}
		<span
			class="{size} grid shrink-0 place-items-center rounded-full bg-foreground text-xs font-semibold text-background"
			aria-hidden="true">{initialsOf(name, who)}</span
		>
	{/if}
{/snippet}

<BuilderPageShell
	signedIn={page.viewer.signed_in}
	owner={isOwner
		? {
				status: page.status,
				copyUrl: projectUrl,
				editHref: `/profile/page?section=projects&project=${project.id}`,
				editLabel: 'Edit project'
			}
		: null}
>
	<article
		class="pp-card overflow-hidden rounded-2xl bg-background"
		aria-labelledby="project-name"
	>
		<div class="flex items-center gap-3 border-b border-border px-5 py-2.5 sm:px-8">
			<a
				href="/@{handle}"
				class="-ml-1.5 inline-flex min-h-10 min-w-0 items-center gap-2 rounded-md px-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<ArrowLeft class="h-4 w-4 shrink-0" aria-hidden="true" />
				{@render avatar(page.profile.avatar_url, page.profile.name, handle, 'h-6 w-6')}
				<span class="truncate">{ownerName}</span>
			</a>
		</div>

		<header class="px-5 pb-6 pt-6 sm:px-8">
			<div class="flex items-start gap-4">
				<span
					class="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-muted text-2xl leading-none tracking-[-0.15em]"
					aria-hidden="true">{glyphs || project.name.slice(0, 1).toUpperCase()}</span
				>
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
						<h1
							id="project-name"
							class="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-[1.75rem]"
						>
							{project.name}
						</h1>
						<span
							class="rounded-full border border-success/60 px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-success"
							>{stageLabel(project)}</span
						>
					</div>
					<p
						class="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground"
					>
						<span
							>by <a
								href="/@{handle}"
								class="font-medium text-foreground underline-offset-2 hover:underline"
								>{ownerName}</a
							></span
						>
						<span aria-hidden="true">·</span>
						<span>{activeLabel(project.last_active_at)}</span>
						{#if project.audience === 'collaborators'}
							<span aria-hidden="true">·</span>
							<span class="text-info">people {firstName} works with</span>
						{/if}
					</p>
				</div>
			</div>

			{#if project.pitch}
				<p class="mt-4 text-[17px] leading-relaxed text-foreground">{project.pitch}</p>
			{/if}

			<div class="mt-5 flex flex-wrap items-center gap-2">
				{#if canAct && !project.viewer_is_member}
					<button
						id="follow-{project.id}"
						type="button"
						class="tx-button {following
							? 'tx-button-ink'
							: 'tx-button-accent'} inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold"
						aria-pressed={following}
						disabled={visitor.followBusy === project.id}
						onclick={() => visitor.setFollow(project.id, !following)}
					>
						{following ? 'Following' : `Follow ${project.name}`}
					</button>
				{/if}
				{#if project.link_url}
					<a
						href={project.link_url}
						target="_blank"
						rel="noopener noreferrer nofollow ugc"
						onclick={() => visitor.track('link_tap')}
						class={quietButton}
					>
						<SiteIcon url={project.link_url} label={project.name} size="sm" />
						<span class="max-w-[14rem] truncate">{displayUrl(project.link_url)}</span>
						<ArrowUpRight class="h-4 w-4 shrink-0" aria-hidden="true" />
					</a>
				{/if}
				{#if project.viewer_is_member}
					<a
						href="/projects/{project.id}"
						class="text-sm font-semibold text-success underline-offset-2 hover:underline"
						>You’re in this project · Open it</a
					>
				{/if}
			</div>
			{#if followPending}
				<p class="mt-2 text-xs text-muted-foreground">
					You’re signed in. Tap Follow to finish.
				</p>
			{/if}
		</header>

		{#if project.looking_for}
			<section class="pp-section" aria-labelledby="project-looking">
				{@render sectionHead('project-looking', 'Looking for', '')}
				<div
					class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl bg-accent/10 px-4 py-3.5"
				>
					<p class="min-w-0 flex-1 basis-56 text-[15px] leading-snug text-foreground">
						{project.looking_for}
					</p>
					{#if project.reply_url}
						<a
							href={project.reply_url}
							target={isEmailReply(project.reply_url) ? undefined : '_blank'}
							rel="noopener noreferrer nofollow ugc"
							onclick={() => visitor.track('link_tap')}
							class="{accentButton} shrink-0 gap-1.5"
							>I’m interested<ArrowUpRight class="h-4 w-4" aria-hidden="true" /></a
						>
					{/if}
				</div>
			</section>
		{/if}

		{#if project.goals?.length || project.next_milestone}
			<section class="pp-section" aria-labelledby="project-goals">
				{@render sectionHead('project-goals', 'Where it’s headed', '')}
				<div class="pp-two grid gap-4">
					{#if project.goals?.length}
						<div>
							<p class="micro-label mb-2">Goals</p>
							<ul class="grid gap-2 text-[15px] text-foreground">
								{#each project.goals as goal (goal)}
									<li class="flex gap-2.5">
										<span
											class="mt-[7px] h-2 w-2 shrink-0 rounded-full border-2 border-accent"
											aria-hidden="true"
										></span>
										<span>{goal}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
					{#if project.next_milestone}
						<div>
							<p class="micro-label mb-2">Next milestone</p>
							<div class="rounded-xl border border-border bg-card px-3.5 py-3">
								<p class="text-[15px] font-semibold text-foreground">
									{project.next_milestone.title}
								</p>
								<p class="stamp mt-0.5 text-xs text-muted-foreground">
									Due {shortDate(project.next_milestone.due_at)}
								</p>
							</div>
						</div>
					{/if}
				</div>
			</section>
		{/if}

		{#if timeline.length}
			<section class="pp-section" aria-labelledby="project-updates">
				{@render sectionHead('project-updates', 'Updates', String(timeline.length))}
				<ol class="grid">
					{#each timeline as update, i (`${update.at}-${i}`)}
						<li
							class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0"
						>
							<span class="stamp pt-0.5 text-xs text-muted-foreground"
								>{update.at ? shortDate(update.at) : ''}</span
							>
							<p class="text-[15px] leading-snug text-foreground">{update.body}</p>
						</li>
					{/each}
				</ol>
			</section>
		{/if}

		{#if data.activity}
			<section class="pp-section" aria-labelledby="project-log">
				{@render sectionHead('project-log', 'Build log', 'last 12 months')}
				<BuildLog
					activity={data.activity}
					projectCount={1}
					ownerView={isOwner}
					who={firstName}
					scopeLabel="Counting work on {project.name} only."
				/>
			</section>
		{:else if hasWeeks && project.weekly}
			<section class="pp-section" aria-labelledby="project-log">
				{@render sectionHead('project-log', 'Last 12 weeks', '')}
				<ActivityBars weeks={project.weekly} {agentSplit} />
			</section>
		{/if}

		{#if data.writing.length}
			<section class="pp-section" aria-labelledby="project-writing">
				{@render sectionHead('project-writing', 'Writing', String(data.writing.length))}
				<div class="grid">
					{#each data.writing as piece (piece.url_path)}
						<a
							href={piece.url_path}
							class="group/w flex items-baseline justify-between gap-3 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<span
								class="min-w-0 text-[15px] font-semibold text-foreground group-hover/w:text-accent"
								>{piece.title}</span
							>
							{#if piece.published_at}<span
									class="stamp shrink-0 text-xs text-muted-foreground"
									>{shortDate(piece.published_at)}</span
								>{/if}
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<section class="pp-section" aria-labelledby="project-people">
			{@render sectionHead('project-people', 'Built by', '')}
			<ul class="flex flex-wrap gap-2">
				<li>
					<a
						href="/@{handle}"
						class="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm hover:bg-muted"
					>
						{@render avatar(
							page.profile.avatar_url,
							page.profile.name,
							handle,
							'h-8 w-8'
						)}
						<span class="font-medium text-foreground">{ownerName}</span>
					</a>
				</li>
				{#each data.built_by as person (person.handle)}
					<li>
						<a
							href="/@{person.handle}"
							class="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm hover:bg-muted"
						>
							{@render avatar(
								person.avatar_url,
								person.name,
								person.handle,
								'h-8 w-8'
							)}
							<span class="font-medium text-foreground"
								>{person.name ?? `@${person.handle}`}</span
							>
						</a>
					</li>
				{/each}
				{#if otherMembers > 0}
					<li
						class="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-muted-foreground"
					>
						<Users class="h-4 w-4" aria-hidden="true" />+{otherMembers}
						{otherMembers === 1 ? 'other' : 'others'}
					</li>
				{/if}
			</ul>

			{#if canAct && !project.viewer_is_member}
				<div class="mt-4 rounded-xl border border-dashed border-border-strong px-4 py-3.5">
					{#if ask.done}
						<p class="text-sm text-foreground" role="status">{ask.message}</p>
					{:else if ask.open}
						<form
							class="grid gap-2"
							onsubmit={(event) => {
								event.preventDefault();
								visitor.sendAsk(project.id, note);
							}}
						>
							<label
								for="ask-note-{project.id}"
								class="text-sm font-medium text-foreground"
								>Ask {firstName} to join {project.name}</label
							>
							<textarea
								id="ask-note-{project.id}"
								bind:value={note}
								rows="2"
								maxlength="400"
								placeholder="What you'd like to help with (optional)"
								class="w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
							></textarea>
							{#if ask.message}
								<p class="text-xs text-destructive" role="alert">{ask.message}</p>
							{/if}
							<div>
								<button
									type="submit"
									class="tx-button tx-button-accent inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold"
									disabled={ask.sending}
									>{ask.sending ? 'Sending…' : 'Send ask'}</button
								>
							</div>
						</form>
					{:else}
						<div class="flex flex-wrap items-center justify-between gap-3">
							<p class="text-sm text-muted-foreground">
								Want to build this with {firstName}?
							</p>
							<button
								type="button"
								class="inline-flex min-h-10 items-center rounded-full border border-border-strong bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted"
								onclick={() => visitor.openAsk(project.id)}>Ask to join</button
							>
						</div>
					{/if}
				</div>
			{/if}
		</section>

		{#if others.length}
			<section class="pp-section" aria-labelledby="project-more">
				{@render sectionHead('project-more', `More from ${firstName}`, '')}
				<ul class="grid gap-2">
					{#each others as other (other.id)}
						{@const otherPath = paths.get(other.id)}
						{@const otherHref = otherPath ?? other.link_url ?? null}
						{@const otherExternal = !otherPath && !!other.link_url}
						<li>
							{#if otherHref}
								<a
									href={otherHref}
									target={otherExternal ? '_blank' : undefined}
									rel={otherExternal
										? 'noopener noreferrer nofollow ugc'
										: undefined}
									onclick={() => otherExternal && visitor.track('link_tap')}
									class="group/o flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 hover:border-border-strong hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									{@render otherRow(other)}
									{#if otherExternal}
										<ArrowUpRight
											class="h-4 w-4 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
									{:else}
										<ArrowRight
											class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover/o:translate-x-0.5 motion-reduce:transition-none"
											aria-hidden="true"
										/>
									{/if}
								</a>
							{:else}
								<div
									class="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5"
								>
									{@render otherRow(other)}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<ClaimFooter signedIn={page.viewer.signed_in} {isOwner} followNote />
	</article>
</BuilderPageShell>

{#snippet otherRow(other: BuilderProjectPageView['project'])}
	<span
		class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-base leading-none tracking-[-0.15em]"
		aria-hidden="true"
		>{(other.glyphs ?? []).join('') || other.name.slice(0, 1).toUpperCase()}</span
	>
	<span class="grid min-w-0 flex-1">
		<span class="truncate text-[15px] font-semibold text-foreground">{other.name}</span>
		{#if other.pitch}<span class="truncate text-xs text-muted-foreground">{other.pitch}</span
			>{/if}
	</span>
	<span
		class="shrink-0 rounded-full border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide {other.level ===
		'live'
			? 'border-success/60 text-success'
			: 'border-border-strong text-muted-foreground'}">{stageLabel(other)}</span
	>
{/snippet}

<style>
	.pp-card {
		container-type: inline-size;
		box-shadow: var(--sheet-edge);
	}
	.pp-section {
		border-top: 1px solid hsl(var(--border));
		padding: 1.25rem 1.25rem 1.5rem;
	}
	@container (min-width: 36rem) {
		.pp-section {
			padding: 1.5rem 2rem 1.75rem;
		}
		.pp-two {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
