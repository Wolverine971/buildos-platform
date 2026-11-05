<!-- apps/web/src/lib/components/landing/home-variants/d/ProjectReel.svelte -->
<!--
	Home D, under the hero: "See where your ___ stands." cycles through people's projects. Each
	beat shows that person's Workspace the way /projects draws it (real tiles and task
	bar, the opened project card), types a messy note into the jot box, then shows what
	sorting it changed: new tasks, a task marked done, a new next step.
	Visitors can pick a project type, which stops the rotation. Pointing at the chips or the
	workspace (or tabbing into them) holds the current project. Rotation also pauses off
	screen and in background tabs, and never starts under reduced motion.
-->
<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import {
		ArrowUpRight,
		Check,
		Circle,
		CircleCheck,
		CircleDot,
		LoaderCircle,
		Mic,
		Minimize2,
		Pause,
		Play,
		Send,
		Sun
	} from '$lib/icons/lucide';
	import type { ProjectListSummary } from '$lib/components/projects/project-list';
	import DesktopTile from '$lib/components/projects/desktop/DesktopTile.svelte';
	import DesktopTaskMix from '$lib/components/projects/desktop/DesktopTaskMix.svelte';
	import {
		PULSE_META,
		type Pulse,
		type TaskBucket,
		type TileLook
	} from '$lib/components/projects/desktop/desktop-signals';
	import { REEL_STORIES, storyAt, type ReelTask } from './project-reel';

	let {
		index = $bindable(0)
	}: {
		/** The story on screen; bind it to follow along (the paste box placeholder does). */
		index?: number;
	} = $props();

	type Phase = 'typing' | 'sorting' | 'sorted';

	const WORD_MS = 80;
	const LEAD_MS = 350;
	const SORT_MS = 900;
	const HOLD_MS = 3400;

	const DAY_MS = 86_400_000;
	const today = Date.now();

	let phase = $state<Phase>('sorted');
	let typedWords = $state(0);
	/** Null until the visitor presses play, pause, or a project; then their choice wins. */
	let chosenAuto = $state<boolean | null>(null);
	/** Rotation runs by default, except under reduced motion. */
	const auto = $derived(chosenAuto ?? !prefersReducedMotion.current);
	let onScreen = $state(false);
	/** A mouse resting on the reel, or keyboard focus inside it, holds the current project. */
	let pointerHold = $state(false);
	let focusHold = $state(false);
	const held = $derived(pointerHold || focusHold);
	let pageShown = $state(true);
	let timers: ReturnType<typeof setTimeout>[] = [];

	const story = $derived(storyAt(index));
	const project = $derived(story.project);
	const words = $derived(story.note.split(' '));
	const sorted = $derived(phase === 'sorted');
	const tasks = $derived(project.tasks.filter((task) => sorted || !task.added));
	const doneCount = $derived(
		project.done + (sorted ? project.tasks.filter((task) => task.completes).length : 0)
	);
	const addedCount = $derived(project.tasks.filter((task) => task.added).length);
	const completedCount = $derived(project.tasks.filter((task) => task.completes).length);
	const openTasks = $derived(tasks.filter((task) => !(sorted && task.completes)));
	const mix = $derived(mixOf(openTasks));

	/** Tile bars are ranked against the person's other projects, as on /projects. */
	const maxOpen = $derived(
		Math.max(openTasks.length, ...story.others.map((other) => openOf(other.mix)))
	);
	const projectLook = $derived(lookOf(project.pulse, mix, project.reason));

	// Advance after a beat has been read, only while the hero is on screen.
	$effect(() => {
		if (phase !== 'sorted' || !auto || held || !onScreen || !pageShown) return;
		const next = (index + 1) % REEL_STORIES.length;
		const timer = setTimeout(() => play(next), HOLD_MS);
		return () => clearTimeout(timer);
	});

	function clearTimers() {
		for (const timer of timers) clearTimeout(timer);
		timers = [];
	}

	/** Shows a story: type its note, sort it, settle. Reduced motion jumps to the end. */
	function play(next: number) {
		clearTimers();
		index = next;
		if (prefersReducedMotion.current) {
			phase = 'sorted';
			return;
		}
		phase = 'typing';
		typedWords = 0;
		const count = storyAt(next).note.split(' ').length;
		for (let word = 1; word <= count; word += 1) {
			timers.push(setTimeout(() => (typedWords = word), LEAD_MS + word * WORD_MS));
		}
		const typedAt = LEAD_MS + count * WORD_MS + 450;
		timers.push(setTimeout(() => (phase = 'sorting'), typedAt));
		timers.push(setTimeout(() => (phase = 'sorted'), typedAt + SORT_MS));
	}

	function pick(next: number) {
		chosenAuto = false;
		play(next);
	}

	function toggleAuto() {
		const next = !auto;
		chosenAuto = next;
		if (next && phase === 'sorted') play((index + 1) % REEL_STORIES.length);
	}

	function watch(node: HTMLElement) {
		const observer = new IntersectionObserver(
			([entry]) => (onScreen = entry?.isIntersecting ?? false),
			{ threshold: 0.3 }
		);
		observer.observe(node);
		const visibility = () => (pageShown = document.visibilityState === 'visible');
		document.addEventListener('visibilitychange', visibility);
		return () => {
			observer.disconnect();
			document.removeEventListener('visibilitychange', visibility);
			clearTimers();
		};
	}

	function bucketOf(task: ReelTask): TaskBucket {
		if (task.due !== undefined && task.due < 0) return 'overdue';
		if (task.state === 'in_progress') return 'in_progress';
		if (task.due !== undefined) return 'scheduled';
		return 'backlog';
	}

	function mixOf(list: ReelTask[]): Record<TaskBucket, number> {
		const counts: Record<TaskBucket, number> = {
			overdue: 0,
			in_progress: 0,
			scheduled: 0,
			backlog: 0
		};
		for (const task of list) counts[bucketOf(task)] += 1;
		return counts;
	}

	function openOf(counts: Record<TaskBucket, number>): number {
		return counts.overdue + counts.in_progress + counts.scheduled + counts.backlog;
	}

	function lookOf(pulse: Pulse, counts: Record<TaskBucket, number>, reason = ''): TileLook {
		const open = openOf(counts);
		return { pulse, reason, docs: 0, tasks: open / Math.max(1, maxOpen), mix: counts, open };
	}

	/** DesktopTile only reads id, name and emoji. */
	function tileProject(name: string, emoji: string[]): ProjectListSummary {
		return { id: name, name, emoji } as unknown as ProjectListSummary;
	}

	function shortDate(days: number): string {
		return new Date(today + days * DAY_MS).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div
	{@attach watch}
	role="group"
	aria-labelledby="d-reel-heading"
	onpointerenter={(event) => {
		if (event.pointerType === 'mouse') pointerHold = true;
	}}
	onpointerleave={() => (pointerHold = false)}
	onfocusin={() => (focusHold = true)}
	onfocusout={(event) => {
		const next = event.relatedTarget;
		if (!(next instanceof Node) || !event.currentTarget.contains(next)) focusHold = false;
	}}
>
	<h2
		id="d-reel-heading"
		class="text-balance text-3xl font-medium leading-[1.1] tracking-[-0.025em] sm:text-5xl"
	>
		<span class="sr-only"
			>See where every project stands: a backyard garden, a novel, a kids' soccer team, a
			semester, a brand redesign, a wedding, a YouTube channel, a client launch.</span
		>
		<span aria-hidden="true" class="block min-h-[2.2em] sm:min-h-[1.1em]">
			See where your
			{#key story.id}<span class="phrase text-accent">{story.phrase}</span>{/key} stands
		</span>
	</h2>

	<div class="segments mt-8 flex max-w-full items-center gap-1 sm:w-fit">
		<button
			type="button"
			class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-label={auto ? 'Pause the examples' : 'Play the examples'}
			onclick={toggleAuto}
		>
			{#if auto}<Pause class="h-4 w-4" />{:else}<Play class="h-4 w-4" />{/if}
		</button>
		<div
			class="chips flex min-w-0 gap-1 overflow-x-auto border-l border-border pl-1"
			role="group"
			aria-label="Example projects"
		>
			{#each REEL_STORIES as item, i (item.id)}
				<button
					type="button"
					aria-pressed={i === index}
					onclick={() => pick(i)}
					class="inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring {i ===
					index
						? 'bg-card text-foreground shadow-ink'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{item.chip}
				</button>
			{/each}
		</div>
	</div>

	<figure class="product-mat mt-6 rounded-[28px] p-3 sm:p-8 lg:p-12">
		<figcaption class="sr-only">
			Example: {story.person}, {story.role}. Their BuildOS Workspace with {project.name} open.
			The note "{story.note}" adds {addedCount} tasks{completedCount
				? `, marks ${completedCount} done,`
				: ''} and sets the next step to "{project.nextStepAfter}".
		</figcaption>

		<div aria-hidden="true" class="relative mx-auto max-w-[1040px]">
			{#if auto && held}
				<span class="held"><Pause class="h-3 w-3" />Paused while you look</span>
			{/if}
			<div
				class="workspace rounded-2xl border border-border bg-background p-3 shadow-ink-strong sm:p-5"
			>
				<!-- Workspace header and jot box, as on /projects. -->
				<div class="flex items-center gap-3">
					<p class="text-xl font-medium text-foreground sm:text-2xl">Workspace</p>
					<span class="pill hidden sm:inline-flex"
						><Sun class="h-3.5 w-3.5" />Today's brief</span
					>
					<!-- Who this is, where the real app shows the account name. -->
					{#key story.id}
						<span class="who ml-auto flex min-w-0 items-center gap-2 text-sm">
							<span class="hidden truncate text-muted-foreground md:inline"
								>{story.role}</span
							>
							<span class="account"
								><span class="avatar">{story.person[0]}</span>{story.person}</span
							>
						</span>
					{/key}
				</div>

				<div class={['jot mt-3', { busy: phase !== 'sorted' }]}>
					<p class="jot-text">
						{#if phase === 'sorted'}
							<span class="text-muted-foreground"
								>Jot anything: a thought, a task, an update…</span
							>
						{:else}
							<span class={{ dim: phase === 'sorting' }}
								>{words.slice(0, typedWords).join(' ')}</span
							>{#if phase === 'typing'}<span class="caret"></span>{/if}
						{/if}
					</p>
					<div class="flex items-center justify-between gap-2">
						<p class="min-w-0 text-xs sm:truncate">
							{#if phase === 'sorting'}
								<span class="inline-flex items-center gap-1.5 text-foreground"
									><LoaderCircle class="h-3.5 w-3.5 animate-spin" />Sorting into {project.name}…</span
								>
							{:else if phase === 'sorted'}
								<span class="result inline-flex items-center gap-1.5"
									><Check class="h-3.5 w-3.5" />Sorted into {project.name}: {addedCount}
									new tasks{#if completedCount}, {completedCount} done{/if}, next
									step updated</span
								>
							{/if}
						</p>
						<span class="flex shrink-0 gap-1.5">
							<span class={['round', { hot: phase === 'typing' }]}
								><Send class="h-3.5 w-3.5" /></span
							>
							<span class="round"><Mic class="h-3.5 w-3.5" /></span>
						</span>
					</div>
				</div>

				<div class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_7.5rem]">
					{#key story.id}
						<!-- The opened project card. -->
						<div class="card">
							<div class="grid gap-3 border-b border-border px-4 py-4 sm:px-5">
								<p class="flex items-center gap-2 text-xs text-muted-foreground">
									<span class="crumb">{story.person}'s workspace</span><span
										>/</span
									><span class="truncate">{project.name}</span>
								</p>
								<div class="flex items-start gap-3">
									<DesktopTile
										project={tileProject(project.name, project.emoji)}
										look={projectLook}
										size="md"
									/>
									<div class="min-w-0 flex-1">
										<p
											class="text-xl font-medium leading-tight text-foreground"
										>
											{project.name}
										</p>
										<p
											class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
										>
											<span class="pulse pulse-{project.pulse}"
												><i class="pulse-dot"></i>{PULSE_META[project.pulse]
													.label}</span
											>
											<span class="hidden sm:inline">{project.reason}</span>
										</p>
									</div>
									<span class="flex shrink-0 gap-2">
										<span class="action w-9 justify-center !px-0"
											><img
												src="/brain-bolt.webp"
												alt=""
												width="24"
												height="24"
												class="h-6 w-6 rounded object-cover"
											/></span
										>
										<span class="action from-sm"
											><ArrowUpRight class="h-4 w-4" />Open project</span
										>
										<span class="action quiet from-lg"
											><Minimize2 class="h-4 w-4" />Collapse</span
										>
									</span>
								</div>
								<div class="grid gap-0.5">
									<span class="text-xs text-muted-foreground">Next step</span>
									<p class="min-h-10 text-sm text-foreground sm:min-h-0">
										{#if sorted}<mark class="changed"
												>{project.nextStepAfter}</mark
											>{:else}{project.nextStep}{/if}
									</p>
								</div>
								<p class="line-clamp-2 max-w-[72ch] text-sm text-muted-foreground">
									{project.description}
								</p>
							</div>

							<div class="tabs">
								<span>Docs<i>{project.docs}</i></span>
								<span class="on">Tasks<i>{openTasks.length}</i></span>
								<span>Goals<i>{project.goals}</i></span>
								<span>Chats</span>
							</div>

							<div class="grid gap-0.5 px-2 pt-3 pb-2">
								<div class="px-2 pb-2"><DesktopTaskMix {mix} /></div>
								<div class="rows">
									{#each tasks as task (task.title)}
										{@const done = sorted && task.completes}
										{@const bucket = bucketOf(task)}
										<div
											class={[
												'row',
												{ fresh: sorted && task.added, finished: done }
											]}
										>
											<span class="glyph bucket-{done ? 'done' : bucket}">
												{#if done}<CircleCheck
														class="h-4 w-4"
													/>{:else if task.state === 'in_progress'}<CircleDot
														class="h-4 w-4"
													/>{:else}<Circle class="h-4 w-4" />{/if}
											</span>
											<span
												class="truncate text-sm {done
													? 'text-muted-foreground line-through'
													: 'text-foreground'}">{task.title}</span
											>
											<span class="tail">
												{#if sorted && task.added}<span class="tag"
														>New</span
													>{/if}
												{#if done}<span class="tag">Done</span>{/if}
												{#if task.due !== undefined && !done}
													<span
														class={[
															'chip',
															{ late: bucket === 'overdue' }
														]}>{shortDate(task.due)}</span
													>
												{/if}
											</span>
										</div>
									{/each}
								</div>
								<p class="px-3 pt-1 text-xs text-muted-foreground">
									› Done {doneCount}
								</p>
							</div>
						</div>
					{/key}

					<!-- The rest of this person's projects, docked as on /projects. -->
					<div class="dock">
						<p class="hidden text-center text-xs text-muted-foreground md:block">
							Projects
						</p>
						{#each story.others as other (other.name)}
							<span class="dock-item">
								<DesktopTile
									project={tileProject(other.name, other.emoji)}
									look={lookOf(other.pulse, other.mix)}
									size="sm"
								/>
								<span class="dock-label">{other.name}</span>
							</span>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</figure>
</div>

<style>
	.product-mat {
		background-color: hsl(var(--accent) / 0.05);
		background-image: radial-gradient(hsl(var(--accent) / 0.12) 0.8px, transparent 1px);
		background-size: 14px 14px;
	}
	.segments {
		border-radius: 12px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.6);
		padding: 4px;
	}
	.chips {
		scrollbar-width: none;
	}
	.held {
		position: absolute;
		top: -10px;
		right: 12px;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border-radius: 99px;
		background: hsl(var(--foreground));
		padding: 3px 10px;
		font-size: 11px;
		font-weight: 600;
		color: hsl(var(--background));
		animation: rise 200ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.phrase {
		display: inline-block;
		animation: phrase-in 420ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes phrase-in {
		from {
			opacity: 0;
			transform: translateY(0.18em);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.pill {
		align-items: center;
		gap: 6px;
		min-height: 2rem;
		border-radius: 8px;
		border: 1px solid hsl(var(--border-strong));
		background: hsl(var(--card));
		padding: 0 10px;
		font-size: 12px;
		font-weight: 500;
		color: hsl(var(--foreground));
	}
	.who {
		animation: rise 360ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.account {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 2.25rem;
		border-radius: 10px;
		border: 1px solid hsl(var(--border-strong));
		background: hsl(var(--card));
		padding: 0 12px 0 4px;
		font-weight: 500;
		color: hsl(var(--foreground));
		white-space: nowrap;
	}
	.avatar {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 8px;
		background: hsl(var(--foreground));
		color: hsl(var(--background));
		font-size: 12px;
		font-weight: 600;
	}
	.jot {
		display: grid;
		gap: 6px;
		border-radius: 10px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.5);
		padding: 12px 12px 10px 14px;
		transition: border-color 200ms ease;
	}
	.jot.busy {
		border-color: hsl(var(--accent) / 0.6);
	}
	.jot-text {
		min-height: 2.6rem;
		font-size: 14px;
		line-height: 1.5;
		color: hsl(var(--foreground));
	}
	.dim {
		opacity: 0.45;
		transition: opacity 300ms ease;
	}
	.caret {
		display: inline-block;
		width: 2px;
		height: 1.05em;
		margin-left: 2px;
		vertical-align: -0.15em;
		background: hsl(var(--accent));
		animation: blink 1s steps(1) infinite;
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
	.result {
		color: hsl(var(--success));
		font-weight: 500;
		animation: rise 360ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.round {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 99px;
		border: 1px solid hsl(var(--border-strong));
		background: hsl(var(--card));
		color: hsl(var(--muted-foreground));
		transition:
			background-color 200ms ease,
			color 200ms ease;
	}
	.round.hot {
		background: hsl(var(--accent));
		border-color: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}
	.card {
		display: flex;
		min-width: 0;
		flex-direction: column;
		border-radius: 16px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		box-shadow: var(--shadow-ink);
		animation: grow 260ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes grow {
		from {
			opacity: 0;
			transform: scale(0.985);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.crumb {
		text-decoration: underline;
		text-decoration-color: hsl(var(--border-strong));
		text-underline-offset: 3px;
	}
	.pulse {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: hsl(var(--foreground));
	}
	.pulse-dot {
		width: 8px;
		height: 8px;
		border-radius: 99px;
		background: hsl(var(--c));
	}
	.pulse-moving {
		--c: var(--desk-moving);
	}
	.pulse-shaping {
		--c: var(--desk-shaping);
	}
	.pulse-quiet {
		--c: var(--desk-quiet);
	}
	.pulse-parked {
		--c: var(--desk-parked);
	}
	.action {
		display: inline-flex;
		min-height: 2.25rem;
		align-items: center;
		gap: 8px;
		border-radius: 8px;
		border: 1px solid hsl(var(--border-strong));
		background: hsl(var(--card));
		padding: 0 12px;
		font-size: 13px;
		font-weight: 500;
		color: hsl(var(--foreground));
		white-space: nowrap;
	}
	/* Scoped .action sets display, so breakpoints live here rather than in utilities. */
	.from-sm,
	.from-lg {
		display: none;
	}
	@media (min-width: 640px) {
		.from-sm {
			display: inline-flex;
		}
	}
	@media (min-width: 1024px) {
		.from-lg {
			display: inline-flex;
		}
	}
	.action.quiet {
		border-color: transparent;
		background: none;
		color: hsl(var(--muted-foreground));
	}
	.changed {
		border-radius: 4px;
		background: hsl(var(--accent) / 0.14);
		box-shadow: 0 0 0 3px hsl(var(--accent) / 0.14);
		color: inherit;
		animation: rise 420ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.tabs {
		display: flex;
		gap: 4px;
		overflow: hidden;
		border-bottom: 1px solid hsl(var(--border));
		padding: 0 12px;
	}
	.tabs span {
		margin-bottom: -1px;
		border-bottom: 2px solid transparent;
		padding: 10px 8px;
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
		color: hsl(var(--muted-foreground));
	}
	.tabs span.on {
		border-bottom-color: hsl(var(--accent));
		color: hsl(var(--foreground));
	}
	.tabs i {
		margin-left: 4px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 12px;
		font-style: normal;
		font-weight: 400;
		color: hsl(var(--muted-foreground));
	}
	/* Room for five rows, so the card never jumps when tasks land. */
	.rows {
		display: grid;
		align-content: start;
		gap: 2px;
		min-height: calc(5 * 42px + 8px);
	}
	.row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		padding: 2px 8px;
		border-radius: 8px;
	}
	.row.fresh {
		background: hsl(var(--accent) / 0.08);
		animation: land 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	.row.fresh + .row.fresh {
		animation-delay: 120ms;
	}
	@keyframes land {
		from {
			opacity: 0;
			transform: translateY(-6px);
			background: hsl(var(--accent) / 0.22);
		}
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(3px);
		}
	}
	.glyph {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		color: hsl(var(--muted-foreground));
	}
	.bucket-overdue {
		color: hsl(var(--desk-overdue));
	}
	.bucket-in_progress,
	.bucket-done {
		color: hsl(var(--desk-in-progress));
	}
	.bucket-scheduled {
		color: hsl(var(--desk-scheduled));
	}
	.tail {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.chip {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: hsl(var(--muted-foreground));
	}
	.chip.late {
		color: hsl(var(--desk-overdue));
	}
	.tag {
		border-radius: 99px;
		background: hsl(var(--accent) / 0.14);
		padding: 1px 8px;
		font-size: 11px;
		font-weight: 600;
		color: hsl(var(--accent));
	}
	.finished .tag {
		background: hsl(var(--success) / 0.14);
		color: hsl(var(--success));
	}
	.dock {
		display: flex;
		gap: 4px;
		overflow: hidden;
		border-radius: 16px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		padding: 10px 8px;
	}
	.dock-item {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 4px 2px;
	}
	.dock-label {
		max-width: 100%;
		font-size: 11px;
		line-height: 14px;
		text-align: center;
		color: hsl(var(--foreground));
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	@media (min-width: 768px) {
		.dock {
			flex-direction: column;
			align-self: start;
			gap: 10px;
		}
		.dock-item {
			flex: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.phrase,
		.held,
		.who,
		.card,
		.result,
		.changed,
		.row.fresh {
			animation: none;
		}
		.caret {
			animation: none;
		}
	}
</style>
