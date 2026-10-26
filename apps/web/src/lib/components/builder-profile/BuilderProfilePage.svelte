<!-- apps/web/src/lib/components/builder-profile/BuilderProfilePage.svelte -->
<!--
	A builder page (build-os.com/@handle) as one card on the bench: cover and photo, who
	they are, socials, links, a year of active days, the projects they picked, writing,
	and who they build with. Visitors can follow the person or a live project and ask to
	join. The card lays out by its own width (container queries), so the same card works
	on a phone, on a desktop, and inside the editor.

	preview: rendered by the editor (no tracking; buttons show but don't act).
	editing: the editor's canvas. Each part of the card is clickable and opens its panel.
-->
<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';
	import { ArrowUpRight, MapPin, Pencil, Plus } from '$lib/icons/lucide';
	import type {
		BuilderPageEditing,
		BuilderPageSection,
		BuilderProfileView
	} from '$lib/builder-profile/types';
	import { detectPlatform, displayUrl, PLATFORM_LABELS } from '$lib/builder-profile/links';
	import { projectPaths } from '$lib/builder-profile/project-pages';
	import { initialsOf, monthYear, shortDate } from '$lib/builder-profile/format';
	import SocialIcon from './SocialIcon.svelte';
	import SiteIcon from './SiteIcon.svelte';
	import ProjectCard from './ProjectCard.svelte';
	import BuildLog from './BuildLog.svelte';
	import ClaimFooter from './ClaimFooter.svelte';
	import BuilderPageShell from './BuilderPageShell.svelte';
	import { BuilderVisitor } from './builder-visitor.svelte';

	let {
		view,
		origin,
		preview = false,
		editing = null,
		askProjectId = null,
		intent = null,
		followProjectId = null
	}: {
		view: BuilderProfileView;
		origin: string;
		preview?: boolean;
		editing?: BuilderPageEditing | null;
		/** Opened from a sign-in redirect: open the ask box for this project. */
		askProjectId?: string | null;
		/** Opened from a sign-in redirect after tapping Follow. */
		intent?: string | null;
		/** With intent=follow: the project whose Follow was tapped (none = the person). */
		followProjectId?: string | null;
	} = $props();

	const inEditor = $derived(preview || !!editing);
	const handle = $derived(view.profile.handle);
	const displayName = $derived(view.profile.name || `@${view.profile.handle}`);
	const firstName = $derived(view.profile.name?.split(' ')[0] ?? `@${handle}`);
	const isOwner = $derived(view.viewer.is_owner);
	const canAct = $derived(!inEditor && !isOwner);
	const pageUrl = $derived(`${origin.replace(/\/$/, '')}/@${handle}`);
	const socials = $derived(view.links.filter((l) => l.kind === 'social'));
	const links = $derived(view.links.filter((l) => l.kind === 'link'));
	const since = $derived(monthYear(view.profile.member_since));
	const hasLive = $derived(view.projects.some((p) => p.level === 'live'));
	const showWriting = $derived(view.settings.show_writing && view.writing.length > 0);
	const showWith = $derived(view.settings.show_builds_with && view.builds_with.length > 0);
	// Live projects open their own page; none in the editor, where a click edits.
	const paths = $derived(
		inEditor ? new Map<string, string>() : projectPaths(handle, view.projects)
	);

	const visitor = new BuilderVisitor(() => ({
		handle,
		displayName,
		signedIn: view.viewer.signed_in,
		canAct,
		countable: !inEditor && !isOwner && view.status === 'published',
		askPending: view.viewer.ask_pending,
		returnPath: `/@${handle}`
	}));
	const personFollowing = $derived(visitor.personFollowing(view.viewer.follows));
	const followTarget = $derived(
		followProjectId && view.projects.some((p) => p.id === followProjectId && p.level === 'live')
			? followProjectId
			: null
	);
	const followPending = $derived(
		canAct &&
			intent === 'follow' &&
			view.viewer.signed_in &&
			(followTarget
				? !visitor.projectFollowing(
						followTarget,
						view.projects.find((p) => p.id === followTarget)?.viewer_follows
					)
				: !personFollowing)
	);
	let followButton = $state<HTMLButtonElement | null>(null);

	const ownerStats = $derived(
		view.status === 'published' && view.stats
			? `${view.stats.views_7d} views this week · ${view.stats.views_28d} in 4 weeks · ${view.stats.link_taps_28d} taps · ${view.stats.followers} followers · ${view.stats.asks_28d} asks`
			: null
	);

	function editKey(event: KeyboardEvent, section: BuilderPageSection, projectId?: string) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		editing?.onedit(section, projectId);
	}

	onMount(async () => {
		visitor.track('view');
		if (!canAct || !view.viewer.signed_in) return;
		if (
			askProjectId &&
			view.projects.some((p) => p.id === askProjectId && p.level === 'live')
		) {
			visitor.openAsk(askProjectId);
			await tick();
			document.getElementById(`ask-note-${askProjectId}`)?.focus();
		} else if (followPending) {
			if (followTarget) document.getElementById(`follow-${followTarget}`)?.focus();
			else followButton?.focus();
		}
	});
</script>

<!-- In the editor, each part of the card is one click target that opens its panel. -->
{#snippet editable(
	section: BuilderPageSection,
	label: string,
	content: Snippet,
	projectId?: string,
	inset = false
)}
	{#if editing}
		{@const active =
			editing.active === section &&
			(projectId
				? editing.activeProjectId === projectId
				: section !== 'projects' || !editing.activeProjectId)}
		{@const outlined = active && (section !== 'projects' || !!projectId)}
		<div
			role="button"
			tabindex="0"
			aria-label={label}
			aria-pressed={active}
			class="bp-edit"
			data-active={outlined ? 'true' : undefined}
			data-inset={inset ? 'true' : undefined}
			onclick={() => editing?.onedit(section, projectId)}
			onkeydown={(event) => editKey(event, section, projectId)}
		>
			<div inert>{@render content()}</div>
			<span class="bp-edit-chip" aria-hidden="true"
				><Pencil class="h-3 w-3" />{active ? 'Editing' : 'Edit'}</span
			>
		</div>
	{:else}
		{@render content()}
	{/if}
{/snippet}

{#snippet placeholder(text: string)}
	<span
		class="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border-strong px-2.5 py-1.5 text-sm text-muted-foreground"
		><Plus class="h-3.5 w-3.5" aria-hidden="true" />{text}</span
	>
{/snippet}

{#snippet sectionHead(id: string, title: string, aside: string)}
	<div class="mb-3.5 flex items-baseline justify-between gap-3">
		<h2 {id} class="micro-label text-foreground">{title}</h2>
		{#if aside}<span class="micro-label">{aside}</span>{/if}
	</div>
{/snippet}

{#snippet headerBody()}
	<div class="bp-cover relative overflow-hidden bg-muted" aria-hidden="true">
		{#if view.profile.cover_url}
			<img
				src={view.profile.cover_url}
				alt=""
				class="h-full w-full object-cover"
				referrerpolicy="no-referrer"
			/>
		{:else}
			<div class="bp-cover-blank tx tx-frame tx-med absolute inset-0"></div>
		{/if}
	</div>
	<div class="px-5 sm:px-8">
		<div class="flex items-end justify-between gap-3">
			<div class="relative z-10 -mt-12 shrink-0">
				{#if view.profile.avatar_url}
					<img
						src={view.profile.avatar_url}
						alt=""
						width="96"
						height="96"
						referrerpolicy="no-referrer"
						class="h-24 w-24 rounded-full bg-muted object-cover ring-4 ring-background"
					/>
				{:else}
					<div
						class="grid h-24 w-24 place-items-center rounded-full bg-foreground text-2xl font-semibold text-background ring-4 ring-background"
						aria-hidden="true"
					>
						{initialsOf(view.profile.name, handle)}
					</div>
				{/if}
			</div>
			<div class="flex flex-wrap justify-end gap-2 pt-3">
				{#if canAct}
					<button
						bind:this={followButton}
						type="button"
						class="tx-button {personFollowing
							? 'tx-button-ink'
							: 'tx-button-accent'} inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold"
						aria-pressed={personFollowing}
						disabled={visitor.followBusy === 'person'}
						onclick={() => visitor.setFollow(null, !personFollowing)}
					>
						{personFollowing ? 'Following' : `Follow ${firstName}`}
					</button>
				{:else if isOwner && !inEditor}
					<a
						href="/profile/page"
						class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border-strong bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted"
						><Pencil class="h-4 w-4" aria-hidden="true" />Edit page</a
					>
				{:else if inEditor}
					<span
						class="tx-button tx-button-accent inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold"
						aria-hidden="true">Follow {firstName}</span
					>
				{/if}
			</div>
		</div>
		<div class="mt-3 grid gap-1">
			<h1
				id="builder-name"
				class="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl"
			>
				{displayName}
			</h1>
			<p class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
				<span class="font-mono">@{handle}</span>
				{#if view.profile.location}
					<span aria-hidden="true">·</span>
					<span class="inline-flex items-center gap-1"
						><MapPin class="h-3.5 w-3.5" aria-hidden="true" />{view.profile
							.location}</span
					>
				{/if}
				{#if since}
					<span aria-hidden="true">·</span>
					<span>On BuildOS since {since}</span>
				{/if}
			</p>
		</div>
		{#if view.profile.headline}
			<p class="mt-3 text-base font-semibold text-foreground">{view.profile.headline}</p>
		{:else if editing}
			<p class="mt-3">{@render placeholder('Add a headline')}</p>
		{/if}
		{#if view.profile.bio}
			<p class="mt-2 text-base leading-relaxed text-foreground/90">{view.profile.bio}</p>
		{:else if editing}
			<p class="mt-2">{@render placeholder('Add a short bio')}</p>
		{/if}
	</div>
{/snippet}

{#snippet socialsBody()}
	{#if socials.length}
		<ul class="flex flex-wrap gap-2" aria-label="Elsewhere">
			{#each socials as social (social.id)}
				{@const platform = detectPlatform(social.url)}
				<li>
					<a
						href={social.url}
						target="_blank"
						rel="noopener noreferrer nofollow ugc me"
						onclick={() => visitor.track('link_tap')}
						class="grid h-11 w-11 place-items-center rounded-full border border-border-strong bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
						aria-label={social.label || PLATFORM_LABELS[platform]}
						title={social.label || PLATFORM_LABELS[platform]}
					>
						<SocialIcon {platform} />
					</a>
				</li>
			{/each}
		</ul>
	{:else if editing}
		{@render placeholder('Add your socials')}
	{/if}
{/snippet}

{#snippet nowBody()}
	{#if view.profile.now_text}
		<div class="flex gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
			<span class="relative mt-1.5 flex h-2 w-2 shrink-0" aria-hidden="true">
				<span
					class="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 motion-safe:animate-ping"
				></span>
				<span class="relative inline-flex h-2 w-2 rounded-full bg-accent"></span>
			</span>
			<div class="min-w-0 flex-1">
				<p class="micro-label text-accent">
					Now{view.profile.now_updated_at
						? ` · ${shortDate(view.profile.now_updated_at)}`
						: ''}
				</p>
				<p class="mt-1 text-sm leading-snug text-foreground">{view.profile.now_text}</p>
			</div>
		</div>
	{:else if editing}
		{@render placeholder('What are you on right now?')}
	{/if}
{/snippet}

{#snippet linksBody()}
	{@render sectionHead('builder-links', 'Links', links.length ? String(links.length) : '')}
	{#if links.length}
		<div class="bp-links grid gap-2.5">
			{#each links as link (link.id)}
				{@const title = link.label || displayUrl(link.url)}
				<a
					href={link.url}
					target="_blank"
					rel="noopener noreferrer nofollow ugc"
					onclick={() => visitor.track('link_tap')}
					class="group/link flex min-h-[3.75rem] items-center gap-3 rounded-xl border border-border-strong bg-card px-3.5 py-3 shadow-ink transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
				>
					<SiteIcon url={link.url} label={title} />
					<span class="grid min-w-0 flex-1">
						<span class="truncate text-base font-semibold text-foreground">{title}</span
						>
						<span class="truncate text-xs text-muted-foreground"
							>{link.note || displayUrl(link.url)}</span
						>
					</span>
					{#if link.audience === 'collaborators'}
						<span
							class="shrink-0 rounded-full border border-info/60 px-2 py-0.5 font-mono text-2xs text-info"
							>people I work with</span
						>
					{/if}
					<ArrowUpRight
						class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover/link:-translate-y-px group-hover/link:translate-x-px motion-reduce:transition-none"
						aria-hidden="true"
					/>
				</a>
			{/each}
		</div>
	{:else}
		{@render placeholder('Add links people can tap')}
	{/if}
{/snippet}

{#snippet logBody()}
	{#if view.activity}
		{@render sectionHead('builder-log', 'Build log', 'last 12 months')}
		<BuildLog
			activity={view.activity}
			projectCount={view.projects.length}
			ownerView={isOwner || inEditor}
			who={firstName}
		/>
	{/if}
{/snippet}

{#snippet projectsHead()}
	{@render sectionHead(
		'builder-projects',
		'Building',
		view.projects.length ? String(view.projects.length) : ''
	)}
	{#if !view.projects.length}
		{#if editing}
			{@render placeholder('Pick projects to show')}
		{:else}
			<p
				class="rounded-xl border border-dashed border-border-strong px-3.5 py-3 text-sm text-muted-foreground"
			>
				{isOwner || preview ? 'No projects on your page yet.' : 'Nothing listed here yet.'}
			</p>
		{/if}
	{/if}
{/snippet}

{#snippet writingBody()}
	{@render sectionHead('builder-writing', 'Writing', String(view.writing.length))}
	<div class="grid">
		{#each view.writing as piece (piece.url_path)}
			<a
				href={piece.url_path}
				class="group/w flex items-baseline justify-between gap-3 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<span
					class="min-w-0 text-base font-semibold text-foreground group-hover/w:text-accent"
					>{piece.title}</span
				>
				{#if piece.published_at}<span class="stamp shrink-0 text-xs text-muted-foreground"
						>{shortDate(piece.published_at)}</span
					>{/if}
			</a>
		{/each}
	</div>
{/snippet}

{#snippet withBody()}
	{@render sectionHead('builder-with', 'Builds with', String(view.builds_with.length))}
	<ul class="flex flex-wrap gap-2">
		{#each view.builds_with as person (person.handle)}
			<li>
				<a
					href="/@{person.handle}"
					class="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm hover:bg-muted"
				>
					{#if person.avatar_url}
						<img
							src={person.avatar_url}
							alt=""
							referrerpolicy="no-referrer"
							class="h-8 w-8 rounded-full object-cover"
						/>
					{:else}
						<span
							class="grid h-8 w-8 place-items-center rounded-full bg-foreground text-xs font-semibold text-background"
							aria-hidden="true">{initialsOf(person.name, person.handle)}</span
						>
					{/if}
					<span class="font-medium text-foreground"
						>{person.name ?? `@${person.handle}`}</span
					>
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet card()}
	<article
		class="bp-card overflow-hidden rounded-2xl bg-background"
		aria-labelledby="builder-name"
	>
		<div class="pb-5">
			{@render editable('profile', 'Edit photo, name and bio', headerBody, undefined, true)}
		</div>
		{#if socials.length || editing}
			<div class="px-5 pb-5 sm:px-8">
				{@render editable('links', 'Edit socials', socialsBody)}
			</div>
		{/if}
		{#if view.profile.now_text || editing}
			<div class="px-5 pb-6 sm:px-8">
				{@render editable('profile', 'Edit your Now line', nowBody)}
			</div>
		{/if}

		{#if links.length || editing}
			<section class="bp-section" aria-labelledby="builder-links">
				{@render editable('links', 'Edit links', linksBody)}
			</section>
		{/if}

		{#if view.activity}
			<section class="bp-section" aria-labelledby="builder-log">
				{@render editable('settings', 'Edit build log settings', logBody)}
			</section>
		{/if}

		<section class="bp-section" aria-labelledby="builder-projects">
			<!-- With the Projects list open, the whole area is outlined; with one project open, just its card. -->
			<div
				class="bp-zone"
				data-active={editing?.active === 'projects' && !editing.activeProjectId
					? 'true'
					: undefined}
			>
				{@render editable('projects', 'Edit projects', projectsHead)}
				{#if view.projects.length}
					<div class="bp-projects grid gap-3">
						{#each view.projects as item (item.id)}
							{#snippet projectBody()}
								<ProjectCard
									card={item}
									href={paths.get(item.id) ?? null}
									agentSplit={view.settings.show_agent_split}
									{canAct}
									showActions={inEditor}
									following={visitor.projectFollowing(
										item.id,
										item.viewer_follows
									)}
									followBusy={visitor.followBusy === item.id}
									ask={visitor.ask(item.id)}
									onfollow={(id, on) => visitor.setFollow(id, on)}
									onaskopen={(id) => visitor.openAsk(id)}
									onasksend={(id, note) => visitor.sendAsk(id, note)}
									ontap={() => visitor.track('link_tap')}
								/>
							{/snippet}
							<div class={item.level === 'live' ? 'bp-span-all' : ''}>
								{@render editable(
									'projects',
									`Edit ${item.name}`,
									projectBody,
									item.id
								)}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>

		{#if showWriting}
			<section class="bp-section" aria-labelledby="builder-writing">
				{@render editable('settings', 'Edit writing settings', writingBody)}
			</section>
		{/if}

		{#if showWith}
			<section class="bp-section" aria-labelledby="builder-with">
				{@render editable('settings', 'Edit builds with settings', withBody)}
			</section>
		{/if}

		<ClaimFooter signedIn={view.viewer.signed_in} {isOwner} {inEditor} followNote={hasLive} />
	</article>
{/snippet}

{#if inEditor}
	{@render card()}
{:else}
	<BuilderPageShell
		signedIn={view.viewer.signed_in}
		owner={isOwner
			? {
					status: view.status,
					copyUrl: pageUrl,
					editHref: '/profile/page',
					statsLine: ownerStats
				}
			: null}
	>
		{@render card()}
		{#if followPending}
			<p class="mt-3 text-center text-xs text-muted-foreground">
				You’re signed in. Tap Follow to finish.
			</p>
		{/if}
	</BuilderPageShell>
{/if}

<style>
	/* The card is its own layout context: a wide card gets the wide layout, wherever it sits. */
	.bp-card {
		container-type: inline-size;
		box-shadow: var(--sheet-edge);
	}

	.bp-cover {
		height: 7.5rem;
	}

	.bp-cover-blank {
		background:
			radial-gradient(120% 140% at 0% 0%, hsl(var(--accent) / 0.22), transparent 55%),
			radial-gradient(90% 120% at 100% 100%, hsl(var(--foreground) / 0.08), transparent 60%),
			hsl(var(--muted));
	}

	.bp-section {
		border-top: 1px solid hsl(var(--border));
		padding: 1.25rem 1.25rem 1.5rem;
	}

	@container (min-width: 36rem) {
		.bp-cover {
			height: 10rem;
		}
		.bp-section {
			padding: 1.5rem 2rem 1.75rem;
		}
		.bp-links,
		.bp-projects {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.bp-projects > .bp-span-all {
			grid-column: 1 / -1;
		}
	}

	/* Editor canvas: every part of the card is a click target. */
	.bp-edit {
		position: relative;
		cursor: pointer;
		border-radius: 0.875rem;
		outline: 2px dashed transparent;
		outline-offset: 5px;
		transition: outline-color 120ms ease;
	}
	.bp-edit:hover {
		outline-color: hsl(var(--accent) / 0.45);
	}
	.bp-edit:focus-visible {
		outline: 2px solid hsl(var(--ring));
	}
	.bp-edit[data-active='true'] {
		outline: 2px solid hsl(var(--accent));
	}
	.bp-zone {
		border-radius: 0.875rem;
		outline: 2px solid transparent;
		outline-offset: 8px;
	}
	.bp-zone[data-active='true'] {
		outline-color: hsl(var(--accent));
	}
	/* The header touches the card's edge, so its outline and tag go inside. */
	.bp-edit[data-inset='true'] {
		border-radius: 1rem 1rem 0 0;
		outline-offset: -2px;
	}
	.bp-edit[data-inset='true'] .bp-edit-chip {
		top: 0.625rem;
	}
	.bp-edit-chip {
		position: absolute;
		top: -0.95rem;
		right: 0.75rem;
		z-index: 20;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		border-radius: 999px;
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
		padding: 0.125rem 0.5rem;
		font-size: 0.6875rem;
		font-weight: 600;
		opacity: 0;
		transform: translateY(-2px);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
		pointer-events: none;
	}
	.bp-edit:hover .bp-edit-chip,
	.bp-edit:focus-visible .bp-edit-chip,
	.bp-edit[data-active='true'] .bp-edit-chip {
		opacity: 1;
		transform: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.bp-edit,
		.bp-edit-chip {
			transition: none;
		}
	}
</style>
