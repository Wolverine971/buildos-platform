<!-- apps/web/src/lib/components/builder-profile/BuilderProfilePage.svelte -->
<!--
	A builder page (build-os.com/@handle): header, Now line, socials, links, the projects
	the owner picked, a year of active days, public pages, and who they build with.
	Visitors can follow the person or a live project and ask to join. Also rendered as the
	live preview in the owner's editor (preview = true: no tracking, no buttons).
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Check, Copy, MapPin, Pencil } from '$lib/icons/lucide';
	import type { BuilderProfileView } from '$lib/builder-profile/types';
	import { detectPlatform, displayUrl, PLATFORM_LABELS } from '$lib/builder-profile/links';
	import { initialsOf, monthYear, shortDate } from '$lib/builder-profile/format';
	import { toastService } from '$lib/stores/toast.store';
	import SocialIcon from './SocialIcon.svelte';
	import ProjectCard from './ProjectCard.svelte';
	import BuildLog from './BuildLog.svelte';

	type AskState = { open: boolean; sending: boolean; message: string | null; done: boolean };

	let {
		view,
		origin,
		preview = false,
		askProjectId = null,
		intent = null
	}: {
		view: BuilderProfileView;
		origin: string;
		preview?: boolean;
		/** Opened from a sign-in redirect: open the ask box for this project. */
		askProjectId?: string | null;
		/** Opened from a sign-in redirect after tapping Follow. */
		intent?: string | null;
	} = $props();

	const handle = $derived(view.profile.handle);
	const displayName = $derived(view.profile.name || `@${view.profile.handle}`);
	const isOwner = $derived(view.viewer.is_owner);
	const canAct = $derived(!preview && !isOwner);
	const pageUrl = $derived(`${origin.replace(/\/$/, '')}/@${handle}`);
	const socials = $derived(view.links.filter((l) => l.kind === 'social'));
	const links = $derived(view.links.filter((l) => l.kind === 'link'));
	const since = $derived(monthYear(view.profile.member_since));
	const hasLive = $derived(view.projects.some((p) => p.level === 'live'));

	let personFollowOverride = $state<boolean | null>(null);
	const personFollowing = $derived(personFollowOverride ?? view.viewer.follows);
	let projectFollowOverrides = $state<Record<string, boolean>>({});
	let followBusy = $state<string | null>(null);
	let asks = $state<Record<string, AskState>>({});
	let copied = $state(false);
	let claimHandle = $state('');
	let followButton = $state<HTMLButtonElement | null>(null);

	const closedAsk: AskState = { open: false, sending: false, message: null, done: false };

	function signInFor(path: string) {
		window.location.href = `/auth/login?redirect=${encodeURIComponent(path)}`;
	}

	function track(kind: 'view' | 'link_tap') {
		if (preview || isOwner || view.status !== 'published') return;
		void fetch(`/api/public/builders/${encodeURIComponent(handle)}/event`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ kind }),
			keepalive: true
		}).catch(() => {});
	}

	async function setFollow(projectId: string | null, on: boolean) {
		if (!canAct) return;
		if (!view.viewer.signed_in) {
			signInFor(projectId ? `/@${handle}?ask=${projectId}` : `/@${handle}?intent=follow`);
			return;
		}
		followBusy = projectId ?? 'person';
		try {
			const res = await fetch(`/api/builders/${encodeURIComponent(handle)}/follow`, {
				method: on ? 'POST' : 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(projectId ? { project_id: projectId } : {})
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				toastService.error(payload?.error || 'Could not update that. Try again.');
				return;
			}
			if (projectId) projectFollowOverrides = { ...projectFollowOverrides, [projectId]: on };
			else personFollowOverride = on;
			toastService.success(
				on
					? `Following. ${view.profile.name ?? `@${handle}`}'s updates will show up in your daily brief.`
					: 'Stopped following.'
			);
		} catch {
			toastService.error('Could not update that. Try again.');
		} finally {
			followBusy = null;
		}
	}

	function openAsk(projectId: string) {
		if (!canAct) return;
		if (!view.viewer.signed_in) {
			signInFor(`/@${handle}?ask=${projectId}`);
			return;
		}
		if (view.viewer.ask_pending) {
			asks = {
				...asks,
				[projectId]: { ...closedAsk, done: true, message: 'Your ask is already waiting for an answer.' }
			};
			return;
		}
		asks = { ...asks, [projectId]: { ...closedAsk, open: true } };
	}

	async function sendAsk(projectId: string, note: string) {
		asks = { ...asks, [projectId]: { open: true, sending: true, message: null, done: false } };
		try {
			const res = await fetch(`/api/builders/${encodeURIComponent(handle)}/ask`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project_id: projectId, note })
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				asks = {
					...asks,
					[projectId]: {
						open: true,
						sending: false,
						done: false,
						message: payload?.error || 'Could not send that. Try again.'
					}
				};
				return;
			}
			asks = {
				...asks,
				[projectId]: {
					open: false,
					sending: false,
					done: true,
					message: payload?.data?.message ?? 'Asked. You’ll hear back in BuildOS.'
				}
			};
		} catch {
			asks = {
				...asks,
				[projectId]: { open: true, sending: false, done: false, message: 'Could not send that. Try again.' }
			};
		}
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(pageUrl);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			toastService.error(`Copy this link: ${pageUrl}`);
		}
	}

	function claim(event: SubmitEvent) {
		event.preventDefault();
		if (preview) return;
		if (view.viewer.signed_in) {
			window.location.href = '/profile?tab=people#your-page';
			return;
		}
		const wanted = claimHandle.trim().replace(/^@+/, '').toLowerCase();
		window.location.href = wanted
			? `/auth/register?handle=${encodeURIComponent(wanted)}`
			: '/auth/register';
	}

	onMount(async () => {
		track('view');
		if (!canAct || !view.viewer.signed_in) return;
		if (askProjectId && view.projects.some((p) => p.id === askProjectId && p.level === 'live')) {
			openAsk(askProjectId);
			await tick();
			document.getElementById(`ask-note-${askProjectId}`)?.focus();
		} else if (intent === 'follow' && !view.viewer.follows) {
			followButton?.focus();
		}
	});
</script>

<div class="mx-auto w-full max-w-xl px-4 pb-16 pt-4 sm:pt-6">
	{#if !preview}
		<header class="mb-5 flex items-center justify-between gap-3">
			<a
				href={view.viewer.signed_in ? '/projects' : '/'}
				class="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<img src="/brain-bolt-80.png" alt="" class="h-6 w-6" width="24" height="24" />
				BuildOS
			</a>
			{#if isOwner}
				<a
					href="/profile?tab=people#your-page"
					class="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-accent hover:bg-accent/10"
					><Pencil class="h-4 w-4" aria-hidden="true" />Edit page</a
				>
			{:else if !view.viewer.signed_in}
				<a
					href="#claim"
					class="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-accent hover:bg-accent/10"
					>Make your own page</a
				>
			{/if}
		</header>
	{/if}

	{#if isOwner && !preview}
		<div class="mb-5 grid gap-2 rounded-lg border border-dashed border-accent bg-accent/5 p-3 text-sm">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="font-semibold text-foreground">
					{view.status === 'published' ? 'Live · only you see this bar' : 'Draft · only you can see this page'}
				</p>
				<button
					type="button"
					onclick={copyLink}
					class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong bg-background px-2.5 text-xs font-semibold text-foreground hover:bg-muted"
				>
					{#if copied}<Check class="h-3.5 w-3.5" aria-hidden="true" />Copied{:else}<Copy
							class="h-3.5 w-3.5"
							aria-hidden="true"
						/>Copy link{/if}
				</button>
			</div>
			{#if view.status === 'published' && view.stats}
				<p class="font-mono text-xs tabular-nums text-muted-foreground">
					{view.stats.views_7d} views this week · {view.stats.views_28d} in 4 weeks · {view.stats
						.link_taps_28d} link taps · {view.stats.follows_28d} follows · {view.stats.asks_28d} asks ·
					{view.stats.followers} followers
				</p>
			{:else}
				<p class="text-muted-foreground">Nothing here is public until you publish it from Your page.</p>
			{/if}
		</div>
	{/if}

	<!-- Header -->
	<section class="grid grid-cols-1 gap-4" aria-labelledby="builder-name">
		<div class="tx tx-frame tx-med h-20 rounded-lg border border-border bg-card" aria-hidden="true"></div>
		<div class="relative z-10 -mt-14 px-1">
			{#if view.profile.avatar_url}
				<img
					src={view.profile.avatar_url}
					alt=""
					width="76"
					height="76"
					referrerpolicy="no-referrer"
					class="h-[76px] w-[76px] rounded-full border-[3px] border-background bg-muted object-cover"
				/>
			{:else}
				<div
					class="grid h-[76px] w-[76px] place-items-center rounded-full border-[3px] border-background bg-foreground text-2xl font-semibold text-background"
					aria-hidden="true"
				>
					{initialsOf(view.profile.name, handle)}
				</div>
			{/if}
		</div>
		<div class="grid gap-1 px-1">
			<h1 id="builder-name" class="text-3xl font-semibold leading-tight tracking-tight text-foreground">
				{displayName}
			</h1>
			<p class="font-mono text-sm text-muted-foreground">@{handle}</p>
		</div>
		{#if view.profile.headline || view.profile.location || since}
			<p class="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm text-muted-foreground">
				{#if view.profile.headline}<span class="font-medium text-foreground">{view.profile.headline}</span>{/if}
				{#if view.profile.location}<span class="inline-flex items-center gap-1"
						><MapPin class="h-3.5 w-3.5" aria-hidden="true" />{view.profile.location}</span
					>{/if}
				{#if since}<span>On BuildOS since {since}</span>{/if}
			</p>
		{/if}
		{#if view.profile.bio}
			<p class="px-1 text-base leading-relaxed text-foreground">{view.profile.bio}</p>
		{/if}
		{#if view.profile.now_text}
			<div class="mx-1 grid gap-0.5 border-l-[3px] border-accent py-1 pl-3">
				<span class="micro-label text-accent"
					>Now{view.profile.now_updated_at ? ` · ${shortDate(view.profile.now_updated_at)}` : ''}</span
				>
				<span class="text-sm text-foreground">{view.profile.now_text}</span>
			</div>
		{/if}
		{#if socials.length}
			<ul class="flex flex-wrap gap-2 px-1" aria-label="Elsewhere">
				{#each socials as social (social.id)}
					{@const platform = detectPlatform(social.url)}
					<li>
						<a
							href={social.url}
							target="_blank"
							rel="noopener noreferrer nofollow ugc me"
							onclick={() => track('link_tap')}
							class="grid h-11 w-11 place-items-center rounded-full border border-border-strong bg-background text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-label={social.label || PLATFORM_LABELS[platform]}
							title={social.label || PLATFORM_LABELS[platform]}
						>
							<SocialIcon {platform} />
						</a>
					</li>
				{/each}
			</ul>
		{/if}
		{#if canAct}
			<div class="flex flex-wrap gap-2 px-1">
				<button
					bind:this={followButton}
					type="button"
					class="tx-button {personFollowing
						? 'tx-button-ink'
						: 'tx-button-accent'} inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold"
					aria-pressed={personFollowing}
					disabled={followBusy === 'person'}
					onclick={() => setFollow(null, !personFollowing)}
				>
					{personFollowing ? 'Following' : `Follow ${view.profile.name?.split(' ')[0] ?? `@${handle}`}`}
				</button>
			</div>
			{#if intent === 'follow' && view.viewer.signed_in && !personFollowing}
				<p class="px-1 text-xs text-muted-foreground">You’re signed in. Tap Follow to finish.</p>
			{/if}
		{/if}
	</section>

	<!-- Links -->
	{#if links.length}
		<section class="mt-8 grid grid-cols-1 gap-2.5" aria-labelledby="builder-links">
			<h2 id="builder-links" class="micro-label">Links</h2>
			{#each links as link (link.id)}
				<a
					href={link.url}
					target="_blank"
					rel="noopener noreferrer nofollow ugc"
					onclick={() => track('link_tap')}
					class="flex min-h-14 items-center gap-3 rounded-lg border border-border-strong bg-background px-4 py-3 shadow-ink transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<span class="grid min-w-0 flex-1">
						<span class="truncate text-[15px] font-semibold text-foreground"
							>{link.label || displayUrl(link.url)}</span
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
				</a>
			{/each}
		</section>
	{/if}

	<!-- Projects -->
	<section class="mt-8 grid grid-cols-1 gap-3" aria-labelledby="builder-projects">
		<div class="flex items-baseline justify-between gap-2">
			<h2 id="builder-projects" class="micro-label">Building</h2>
			{#if view.projects.length}<span class="micro-label">{view.projects.length}</span>{/if}
		</div>
		{#if view.projects.length}
			{#each view.projects as card (card.id)}
				<ProjectCard
					{card}
					agentSplit={view.settings.show_agent_split}
					{canAct}
					following={projectFollowOverrides[card.id] ?? card.viewer_follows ?? false}
					followBusy={followBusy === card.id}
					ask={asks[card.id] ?? closedAsk}
					onfollow={(id, on) => setFollow(id, on)}
					onaskopen={openAsk}
					onasksend={sendAsk}
				/>
			{/each}
		{:else}
			<p class="rounded-md border border-dashed border-border-strong px-3 py-2.5 text-sm text-muted-foreground">
				{isOwner || preview
					? 'No projects on your page yet. Pick some in Your page.'
					: 'Nothing listed here yet.'}
			</p>
		{/if}
	</section>

	<!-- Build log -->
	{#if view.activity}
		<section class="mt-8 grid grid-cols-1 gap-3" aria-labelledby="builder-log">
			<div class="flex items-baseline justify-between gap-2">
				<h2 id="builder-log" class="micro-label">Build log</h2>
				<span class="micro-label">last 12 months</span>
			</div>
			<BuildLog activity={view.activity} projectCount={view.projects.length} ownerView={isOwner} />
		</section>
	{/if}

	<!-- Writing -->
	{#if view.writing.length}
		<section class="mt-8 grid grid-cols-1 gap-1" aria-labelledby="builder-writing">
			<h2 id="builder-writing" class="micro-label mb-1">Writing</h2>
			{#each view.writing as piece (piece.url_path)}
				<a
					href={piece.url_path}
					class="grid gap-0.5 border-b border-border py-3 last:border-b-0 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<span class="text-base font-semibold text-foreground">{piece.title}</span>
					{#if piece.published_at}<span class="font-mono text-xs text-muted-foreground"
							>{shortDate(piece.published_at)}</span
						>{/if}
				</a>
			{/each}
		</section>
	{/if}

	<!-- Builds with -->
	{#if view.settings.show_builds_with && view.builds_with.length}
		<section class="mt-8 grid grid-cols-1 gap-3" aria-labelledby="builder-with">
			<h2 id="builder-with" class="micro-label">Builds with</h2>
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
							<span class="font-medium text-foreground">{person.name ?? `@${person.handle}`}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- Make your own -->
	<section id="claim" class="mt-10 grid gap-3 rounded-lg border border-border bg-card p-4" aria-label="Make your own page">
		<p class="micro-label">Made in BuildOS</p>
		<p class="text-sm text-foreground">
			Turn messy thinking into structured work{hasLive ? ', and let people follow along' : ''}.
		</p>
		{#if view.viewer.signed_in && !preview}
			{#if !isOwner}
				<a
					href="/profile?tab=people#your-page"
					class="tx-button tx-button-accent inline-flex min-h-11 w-fit items-center rounded-md px-4 text-sm font-semibold"
					>Make your own page</a
				>
			{/if}
		{:else}
			<form class="flex flex-wrap gap-2" onsubmit={claim}>
				<label for="claim-handle" class="sr-only">Pick your handle</label>
				<div
					class="flex min-w-[15rem] flex-1 items-stretch overflow-hidden rounded-md border border-border-strong bg-background focus-within:border-accent focus-within:ring-1 focus-within:ring-accent"
				>
					<span class="inline-flex items-center border-r border-border bg-muted/40 px-3 font-mono text-sm text-muted-foreground"
						>build-os.com/@</span
					>
					<input
						id="claim-handle"
						bind:value={claimHandle}
						placeholder="yourname"
						maxlength="24"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						class="min-h-11 min-w-0 flex-1 bg-transparent px-3 font-mono text-base focus:outline-none sm:text-sm"
						disabled={preview}
					/>
				</div>
				<button
					type="submit"
					class="tx-button tx-button-accent inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold"
					disabled={preview}>Claim it</button
				>
			</form>
		{/if}
	</section>
</div>
