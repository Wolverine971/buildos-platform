<!-- apps/web/src/lib/components/landing/home-variants/c/BrainDumpDemo.svelte -->
<!--
  The homepage brain-dump demo. A scripted replay (no model calls) in five chapters:
  1. a messy note types in; 2. BuildOS highlights each piece and it flies out of the text to
  the item it becomes on the project; 3. the camera zooms out to the workspace, where that
  project sits beside three others; 4. a voice note about another project comes in; 5. its
  pieces fly to the right projects, one back to the book, and the camera lands on the channel.

  Mechanics: the four project cards live on one "world" layer that a CSS transform moves like
  a camera. Flying chips sit on an unscaled overlay and animate (Web Animations API) from the
  phrase's rect in the dump to its `data-slot` rect on a card. The timeline waits only while
  the demo is playing and on screen; pausing also pauses running animations. With reduced
  motion nothing autoplays and the chapter buttons jump straight to each finished state.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { MediaQuery, SvelteSet } from 'svelte/reactivity';
	import type { Attachment } from 'svelte/attachments';
	import { ArrowDown, Mic, Pause, Play, RotateCcw } from '$lib/icons/lucide';
	import DemoCard from './DemoCard.svelte';
	import {
		CHAPTERS,
		DUMP_ONE,
		DUMP_ONE_MARKS,
		DUMP_TWO,
		DUMP_TWO_MARKS,
		KIND_LABEL,
		KIND_TONE,
		PROJECTS,
		PROJECT_ORDER,
		dumpLength,
		type DemoMark,
		type DemoProjectId,
		type DemoSegment
	} from './dump-demo';

	let { onyourturn }: { onyourturn?: () => void } = $props();

	type Rect = { x: number; y: number; w: number; h: number };
	type Piece = { key: string; start: number; text: string; mark: DemoMark | null };
	type Flyer = { key: number; mark: DemoMark; from: Rect; to: Rect; routed: boolean };
	type Label = { id: DemoProjectId; x: number; y: number; w: number };

	const LEN_ONE = dumpLength(DUMP_ONE);
	const LEN_TWO = dumpLength(DUMP_TWO);
	const ALL_MARKS = [...DUMP_ONE_MARKS, ...DUMP_TWO_MARKS];
	const PROJECT_MARKS = Object.fromEntries(
		PROJECT_ORDER.map((id) => [id, ALL_MARKS.filter((mark) => mark.project === id)])
	) as Record<DemoProjectId, DemoMark[]>;

	function toPieces(segments: DemoSegment[], prefix: string): Piece[] {
		let start = 0;
		return segments.map((segment, index) => {
			const text = typeof segment === 'string' ? segment : segment.text;
			const piece = {
				key: `${prefix}-${index}`,
				start,
				text,
				mark: typeof segment === 'string' ? null : segment
			};
			start += text.length;
			return piece;
		});
	}
	const PIECES_ONE = toPieces(DUMP_ONE, 'one');
	const PIECES_TWO = toPieces(DUMP_TWO, 'two');

	const BAR = 40;
	/** Composer heights: phone strip for each dump, desktop bottom strip for the voice note. */
	const PHONE_COMPOSER_H = { one: 214, two: 132 } as const;
	const WIDE_STRIP_H = 132;
	const CAMERA_MS = 1000;

	const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');
	const wideQuery = new MediaQuery('(min-width: 768px)');
	const wide = $derived(wideQuery.current);

	let stageEl = $state<HTMLElement | null>(null);
	let worldEl = $state<HTMLElement | null>(null);
	let composerEl = $state<HTMLElement | null>(null);
	let stageW = $state(0);
	let stageH = $state(0);

	let chapter = $state(0);
	let progress = $state(0);
	let playing = $state(true);
	let inView = $state(false);
	let started = false;
	let finished = $state(false);
	let composer = $state<'one' | 'two' | 'none'>('one');
	let camera = $state<DemoProjectId | 'all'>('fc');
	let typedOne = $state(0);
	let typedTwo = $state(0);
	let flyers = $state<Flyer[]>([]);
	let labels = $state<Label[]>([]);
	let showLabels = $state(false);
	let snapCamera = $state(true);
	let cameraTransform = $state('translate(0px, 0px) scale(1)');

	const marked = new SvelteSet<string>();
	const taken = new SvelteSet<string>();
	const incoming = new SvelteSet<string>();
	const landed = new SvelteSet<string>();
	const fresh = new SvelteSet<string>();
	const pulsing = new SvelteSet<DemoProjectId>();

	const running = $derived(playing && inView && !reducedMotion.current && !finished);

	// Desktop: the first dump sits left of the project; the voice note is a strip along the
	// bottom so the zoomed-out row of projects keeps the full width. Phone: dumps sit on top.
	const layout = $derived.by(() => {
		const pad = wide ? 16 : 12;
		const top = BAR + pad;
		const which = composer === 'two' ? 'two' : 'one';
		let composerBox: Rect;
		let beside: Rect;
		if (wide && which === 'one') {
			composerBox = { x: pad, y: top, w: Math.round(stageW * 0.36), h: stageH - top - pad };
			beside = {
				x: composerBox.x + composerBox.w + pad,
				y: top,
				w: stageW - composerBox.w - pad * 3,
				h: stageH - top - pad
			};
		} else if (wide) {
			composerBox = {
				x: pad,
				y: stageH - pad - WIDE_STRIP_H,
				w: stageW - pad * 2,
				h: WIDE_STRIP_H
			};
			beside = { x: pad, y: top, w: stageW - pad * 2, h: composerBox.y - top - pad };
		} else {
			composerBox = { x: pad, y: top, w: stageW - pad * 2, h: PHONE_COMPOSER_H[which] };
			beside = {
				x: pad,
				y: top + composerBox.h + pad,
				w: stageW - pad * 2,
				h: stageH - top - composerBox.h - pad * 2
			};
		}
		const full: Rect = { x: pad, y: top, w: stageW - pad * 2, h: stageH - top - pad };
		return {
			composerBox,
			beside,
			full,
			cardW: wide ? 540 : Math.max(280, stageW - pad * 2),
			cardH: wide ? 600 : 500,
			columns: wide ? 4 : 2
		};
	});
	/** Tasks the voice note added, kept marked "New" so the payoff is easy to spot. */
	const badgedTasks = $derived(
		new Set(
			DUMP_TWO_MARKS.filter((mark) => mark.kind === 'task' && landed.has(mark.id)).map(
				(mark) => mark.id
			)
		)
	);

	const taskCounts = $derived(
		Object.fromEntries(
			PROJECT_ORDER.map((id) => [
				id,
				PROJECTS[id].taskTotal +
					PROJECT_MARKS[id].filter((mark) => mark.kind === 'task' && landed.has(mark.id))
						.length
			])
		) as Record<DemoProjectId, number>
	);

	const breadcrumb = $derived.by(() => {
		if (camera === 'all') return 'Workspace · 4 projects';
		if (camera === 'fc') return landed.has('fc-name') ? 'Fading Crown' : 'New project';
		return PROJECTS[camera].name;
	});

	const statusOne = $derived.by(() => {
		const done = DUMP_ONE_MARKS.filter((mark) => landed.has(mark.id)).length;
		if (done === DUMP_ONE_MARKS.length) return `Filed ${done} pieces from one message.`;
		if (done > 0) return `Filing ${done} of ${DUMP_ONE_MARKS.length}…`;
		const found = DUMP_ONE_MARKS.filter((mark) => marked.has(mark.id)).length;
		if (found > 0) return `Found ${found} pieces.`;
		return typedOne < LEN_ONE ? 'Typing…' : 'Sent.';
	});

	const statusTwo = $derived.by(() => {
		const done = DUMP_TWO_MARKS.filter((mark) => landed.has(mark.id)).length;
		if (done === DUMP_TWO_MARKS.length) return 'Filed into 2 projects.';
		if (done > 0) return `Filing ${done} of ${DUMP_TWO_MARKS.length}…`;
		if (DUMP_TWO_MARKS.some((mark) => marked.has(mark.id))) return 'Matched to your projects.';
		return typedTwo < LEN_TWO ? 'Transcribing…' : 'Transcribed.';
	});

	// ─── Timeline ────────────────────────────────────────────────────────────

	class Cancelled extends Error {}
	let gen = 0;

	const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

	/** Waits `ms` of playing time: the clock stops while paused or off screen. */
	async function wait(ms: number, g: number) {
		let left = ms;
		let last = performance.now();
		while (left > 0) {
			await frame();
			if (g !== gen) throw new Cancelled();
			const now = performance.now();
			if (running) left -= now - last;
			last = now;
		}
	}

	async function typeOut(which: 'one' | 'two', ms: number, share: number, g: number) {
		const total = which === 'one' ? LEN_ONE : LEN_TWO;
		let elapsed = 0;
		let last = performance.now();
		let done = 0;
		while (done < total) {
			await frame();
			if (g !== gen) throw new Cancelled();
			const now = performance.now();
			if (running) elapsed += now - last;
			last = now;
			done = Math.min(total, Math.round((total * elapsed) / ms));
			if (which === 'one') typedOne = done;
			else typedTwo = done;
			progress = (done / total) * share;
		}
	}

	function relative(rect: DOMRect): Rect {
		const stage = stageEl!.getBoundingClientRect();
		return {
			x: rect.left - stage.left,
			y: rect.top - stage.top,
			w: rect.width,
			h: rect.height
		};
	}

	function land(mark: DemoMark) {
		incoming.delete(mark.id);
		landed.add(mark.id);
		fresh.add(mark.id);
		const g = gen;
		setTimeout(() => {
			if (g === gen) fresh.delete(mark.id);
		}, 1700);
	}

	/** Lifts the phrase out of the dump and sends it to its spot on a card. */
	async function fly(mark: DemoMark, g: number, routed: boolean) {
		if (mark.kind !== 'update') incoming.add(mark.id);
		await tick();
		if (g !== gen || !stageEl) return;
		const source = composerEl?.querySelector(`[data-mark="${mark.id}"]`)?.getClientRects()[0];
		const target = worldEl
			?.querySelector(`[data-slot="${mark.slot}"]`)
			?.getBoundingClientRect();
		taken.add(mark.id);
		if (!source || !target || reducedMotion.current) {
			land(mark);
			return;
		}
		flyers.push({
			key: performance.now() + Math.random(),
			mark,
			from: relative(source),
			to: relative(target),
			routed
		});
	}

	function flight(flyer: Flyer): Attachment<HTMLElement> {
		return (node) => {
			const dx = flyer.to.x - flyer.from.x;
			const dy = flyer.to.y - flyer.from.y;
			const scale = Math.max(0.35, Math.min(1.15, flyer.to.h / Math.max(flyer.from.h, 1)));
			const lift = Math.min(90, Math.abs(dx) * 0.15 + 30);
			const animation = node.animate(
				[
					{ transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0 },
					{ transform: 'translate(0px, -6px) scale(1.06)', opacity: 1, offset: 0.12 },
					{
						transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(${(1 + scale) / 2})`,
						opacity: 1,
						offset: 0.55
					},
					{
						transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
						opacity: 1,
						offset: 0.88
					},
					{
						transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
						opacity: 0,
						offset: 1
					}
				],
				{ duration: 1050, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' }
			);
			animation.onfinish = () => {
				flyers = flyers.filter((item) => item.key !== flyer.key);
				land(flyer.mark);
			};
			return () => animation.cancel();
		};
	}

	/** Moves the camera, waits for it to settle, then pins the overview labels. */
	async function shoot(
		nextCamera: DemoProjectId | 'all',
		nextComposer: typeof composer,
		g: number
	) {
		showLabels = false;
		camera = nextCamera;
		composer = nextComposer;
		await wait(CAMERA_MS + 80, g);
		if (nextCamera === 'all') {
			placeLabels();
			showLabels = true;
		}
	}

	async function runChapter(index: number, g: number) {
		progress = 0;
		if (index === 0) {
			await wait(500, g);
			await typeOut('one', 4600, 0.9, g);
			await wait(600, g);
		} else if (index === 1) {
			const count = DUMP_ONE_MARKS.length;
			for (const [i, mark] of DUMP_ONE_MARKS.entries()) {
				marked.add(mark.id);
				progress = ((i + 1) / count) * 0.3;
				await wait(140, g);
			}
			await wait(700, g);
			for (const [i, mark] of DUMP_ONE_MARKS.entries()) {
				void fly(mark, g, false);
				progress = 0.3 + ((i + 1) / count) * 0.6;
				await wait(420, g);
			}
			await wait(2600, g);
		} else if (index === 2) {
			await shoot('all', 'none', g);
			progress = 0.5;
			await wait(2600, g);
		} else if (index === 3) {
			await shoot('all', 'two', g);
			progress = 0.2;
			await typeOut('two', 3600, 0.6, g);
			progress = 0.8;
			await wait(400, g);
			for (const mark of DUMP_TWO_MARKS) {
				marked.add(mark.id);
				await wait(320, g);
			}
			await wait(1300, g);
		} else if (index === 4) {
			for (const [i, mark] of DUMP_TWO_MARKS.entries()) {
				pulsing.add(mark.project);
				void fly(mark, g, true);
				progress = ((i + 1) / DUMP_TWO_MARKS.length) * 0.5;
				await wait(650, g);
			}
			await wait(1500, g);
			pulsing.clear();
			await wait(500, g);
			await shoot('channel', 'none', g);
			progress = 0.8;
			await wait(2600, g);
		}
		progress = 1;
	}

	function resetScript() {
		for (const set of [marked, taken, incoming, landed, fresh]) set.clear();
		pulsing.clear();
		flyers = [];
		typedOne = 0;
		typedTwo = 0;
		finished = false;
		showLabels = false;
	}

	/** The finished state of a chapter, applied instantly. */
	function applyEnd(index: number) {
		resetScript();
		typedOne = LEN_ONE;
		composer = 'one';
		camera = 'fc';
		if (index >= 1) {
			for (const mark of DUMP_ONE_MARKS) {
				marked.add(mark.id);
				taken.add(mark.id);
				landed.add(mark.id);
			}
		}
		if (index >= 2) {
			composer = 'none';
			camera = 'all';
		}
		if (index >= 3) {
			composer = 'two';
			typedTwo = LEN_TWO;
			for (const mark of DUMP_TWO_MARKS) marked.add(mark.id);
		}
		if (index >= 4) {
			for (const mark of DUMP_TWO_MARKS) {
				taken.add(mark.id);
				landed.add(mark.id);
			}
			composer = 'none';
			camera = 'channel';
			finished = true;
		}
	}

	function applyStart(index: number) {
		if (index === 0) {
			resetScript();
			composer = 'one';
			camera = 'fc';
		} else {
			applyEnd(index - 1);
		}
	}

	async function settleSnapped() {
		snapCamera = true;
		await tick();
		computeCamera();
		await frame();
		await frame();
		snapCamera = false;
		if (camera === 'all') {
			placeLabels();
			showLabels = true;
		}
	}

	async function playFrom(index: number) {
		const g = ++gen;
		applyStart(index);
		chapter = index;
		progress = 0;
		playing = true;
		await settleSnapped();
		try {
			for (let c = index; c < CHAPTERS.length; c += 1) {
				chapter = c;
				await runChapter(c, g);
			}
			finished = true;
			playing = false;
		} catch (error) {
			if (!(error instanceof Cancelled)) throw error;
		}
	}

	function showChapter(index: number) {
		if (reducedMotion.current) {
			gen += 1;
			applyEnd(index);
			chapter = index;
			progress = 1;
			playing = false;
			void settleSnapped();
		} else {
			void playFrom(index);
		}
	}

	function togglePlay() {
		if (finished) {
			void playFrom(0);
			return;
		}
		playing = !playing;
	}

	// ─── Camera ──────────────────────────────────────────────────────────────

	function computeCamera() {
		if (!worldEl || !stageW || !stageH) return;
		const region = composer === 'none' ? layout.full : layout.beside;
		let target: Rect;
		if (camera === 'all') {
			target = { x: 0, y: 0, w: worldEl.offsetWidth, h: worldEl.offsetHeight };
		} else {
			const card = worldEl.querySelector<HTMLElement>(`[data-project="${camera}"]`);
			if (!card) return;
			target = {
				x: card.offsetLeft,
				y: card.offsetTop,
				w: card.offsetWidth,
				h: card.offsetHeight
			};
		}
		const scale = Math.min(region.w / target.w, region.h / target.h, 1.1);
		const x = region.x + (region.w - target.w * scale) / 2 - target.x * scale;
		const y = region.y + (region.h - target.h * scale) / 2 - target.y * scale;
		cameraTransform = `translate(${x}px, ${y}px) scale(${scale})`;
	}

	function placeLabels() {
		if (!stageEl || !worldEl) return;
		labels = PROJECT_ORDER.flatMap((id) => {
			const card = worldEl?.querySelector(`[data-project="${id}"]`);
			if (!card) return [];
			const rect = relative(card.getBoundingClientRect());
			return [{ id, x: rect.x, y: rect.y, w: rect.w }];
		});
	}

	$effect(() => {
		// Re-aim whenever the shot or the frame changes.
		void camera;
		void composer;
		void layout;
		void tick().then(computeCamera);
	});

	// Pausing also freezes whatever is mid-flight or mid-zoom.
	let pausedAnimations: Animation[] = [];
	$effect(() => {
		if (!stageEl) return;
		if (!running) {
			pausedAnimations = stageEl
				.getAnimations({ subtree: true })
				.filter((animation) => animation.playState === 'running');
			for (const animation of pausedAnimations) animation.pause();
		} else {
			for (const animation of pausedAnimations) animation.play();
			pausedAnimations = [];
		}
	});

	const watchStage: Attachment<HTMLElement> = (node) => {
		const resize = new ResizeObserver(([entry]) => {
			if (!entry) return;
			stageW = entry.contentRect.width;
			stageH = entry.contentRect.height;
			void settleSnapped();
		});
		const view = new IntersectionObserver(
			([entry]) => {
				if (!entry) return;
				inView = entry.isIntersecting;
				if (inView && !started && !reducedMotion.current) {
					started = true;
					void playFrom(0);
				}
			},
			{ threshold: 0.3 }
		);
		resize.observe(node);
		view.observe(node);
		return () => {
			resize.disconnect();
			view.disconnect();
			gen += 1;
		};
	};

	onMount(() => {
		// Without motion, open on the sorted project and let the chapter buttons step through.
		if (reducedMotion.current) {
			started = true;
			showChapter(1);
		}
	});

	function railFill(index: number) {
		if (index < chapter) return 1;
		if (index > chapter) return 0;
		return progress;
	}

	const routedProject = (mark: DemoMark) => PROJECTS[mark.project].short;
</script>

{#snippet dumpText(pieces: Piece[], typed: number, routed: boolean)}
	{#each pieces as piece (piece.key)}
		{@const shown = piece.text.slice(0, Math.max(0, typed - piece.start))}
		{#if shown}
			{#if piece.mark}
				{@const mark = piece.mark}
				<span
					data-mark={mark.id}
					class="rounded-sm transition-[background-color,color,opacity] duration-300 {taken.has(
						mark.id
					)
						? 'text-muted-foreground/60 line-through decoration-1'
						: marked.has(mark.id)
							? `${KIND_TONE[mark.kind]} text-foreground`
							: ''}">{shown}</span
				>{#if routed && marked.has(mark.id) && !taken.has(mark.id)}<span
						class="ml-1 inline-block rounded bg-foreground px-1 align-middle text-2xs font-semibold leading-4 text-background"
						>→ {routedProject(mark)}</span
					>{/if}
			{:else}
				{shown}
			{/if}
		{/if}
	{/each}
{/snippet}

<div class="w-full">
	<!-- Narration -->
	<p
		class="mb-4 min-h-14 text-lg font-medium leading-snug text-foreground sm:min-h-8 sm:text-xl"
		aria-live="polite"
	>
		{CHAPTERS[chapter]?.caption}
	</p>

	<div
		bind:this={stageEl}
		{@attach watchStage}
		class="relative h-[680px] overflow-hidden rounded-xl border border-border bg-background shadow-ink-strong md:h-[640px]"
		aria-hidden="true"
	>
		<!-- World: four projects, moved like a camera -->
		<div
			bind:this={worldEl}
			class={[
				'world absolute top-0 left-0 grid gap-10 p-10',
				{ 'world-snap': snapCamera || reducedMotion.current }
			]}
			style:transform={cameraTransform}
			style:grid-template-columns="repeat({layout.columns}, {layout.cardW}px)"
			style:grid-auto-rows="{layout.cardH}px"
		>
			{#each PROJECT_ORDER as id (id)}
				<div data-project={id} class="h-full">
					<DemoCard
						project={PROJECTS[id]}
						marks={PROJECT_MARKS[id]}
						{incoming}
						{landed}
						{fresh}
						pulse={pulsing.has(id)}
						maxTasks={wide ? 5 : 4}
						compact={!wide}
						badged={badgedTasks}
					/>
				</div>
			{/each}
		</div>

		<!-- Overview labels: crisp names over the zoomed-out cards -->
		{#if showLabels && camera === 'all'}
			{#each labels as label (label.id)}
				<div
					class="label-in absolute z-10 rounded-md border bg-card px-2 py-1 shadow-ink {pulsing.has(
						label.id
					)
						? 'border-accent'
						: 'border-border-strong'}"
					style:left="{label.x + 6}px"
					style:top="{label.y + 6}px"
					style:max-width="{Math.max(label.w - 12, 80)}px"
				>
					<p class="truncate text-xs font-semibold text-foreground sm:text-sm">
						{PROJECTS[label.id].name}
					</p>
					<p class="stamp text-2xs text-muted-foreground">{taskCounts[label.id]} tasks</p>
				</div>
			{/each}
		{/if}

		<!-- Window bar -->
		<div
			class="absolute inset-x-0 top-0 z-20 flex h-10 items-center justify-between gap-3 border-b border-border bg-card px-3"
		>
			<p class="flex min-w-0 items-center gap-1.5 text-xs">
				<span class="h-2 w-2 shrink-0 rounded-full bg-accent"></span>
				<span class="font-semibold text-foreground">BuildOS</span>
				<span class="text-muted-foreground">/</span>
				<span class="truncate text-muted-foreground">{breadcrumb}</span>
			</p>
			<p class="stamp shrink-0 text-2xs text-muted-foreground">
				{chapter >= 3 ? 'Thu 6:12 PM' : 'Mon 7:40 AM'}
			</p>
		</div>

		<!-- Composer: the brain dump -->
		{#if composer !== 'none'}
			<div
				bind:this={composerEl}
				class="composer-in absolute z-10 flex flex-col overflow-hidden rounded-lg border border-border-strong bg-card shadow-ink-strong"
				style:left="{layout.composerBox.x}px"
				style:top="{layout.composerBox.y}px"
				style:width="{layout.composerBox.w}px"
				style:height="{layout.composerBox.h}px"
			>
				<div class="flex items-center justify-between border-b border-border px-3 py-2">
					{#if composer === 'one'}
						<p class="text-xs font-semibold text-foreground">Brain dump</p>
						<p class="text-2xs text-muted-foreground">Typed</p>
					{:else}
						<p class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
							<Mic class="h-3.5 w-3.5 text-accent" /> Voice note
						</p>
						<p class="stamp text-2xs text-muted-foreground">0:21</p>
					{/if}
				</div>
				<p
					class="flex-1 overflow-hidden px-3 py-2 font-notes text-foreground {wide
						? 'text-base leading-relaxed'
						: 'text-2xs leading-snug'}"
				>
					{#if composer === 'one'}
						{@render dumpText(PIECES_ONE, typedOne, false)}{#if typedOne < LEN_ONE}<span
								class="caret"
							></span>{/if}
					{:else}
						{@render dumpText(PIECES_TWO, typedTwo, true)}{#if typedTwo < LEN_TWO}<span
								class="caret"
							></span>{/if}
					{/if}
				</p>
				<p
					class="border-t border-border bg-background/60 px-3 py-2 text-2xs text-muted-foreground"
				>
					{composer === 'one' ? statusOne : statusTwo}
				</p>
			</div>
		{/if}

		<!-- Flying pieces -->
		<div class="pointer-events-none absolute inset-0 z-30">
			{#each flyers as flyer (flyer.key)}
				<div
					class="absolute flex flex-col items-start"
					style:left="{flyer.from.x}px"
					style:top="{flyer.from.y - 20}px"
					style:transform-origin="0 20px"
					{@attach flight(flyer)}
				>
					<span
						class="mb-0.5 h-4 rounded bg-foreground px-1.5 text-2xs font-semibold leading-4 text-background"
					>
						{KIND_LABEL[flyer.mark.kind]}{flyer.routed
							? ` → ${routedProject(flyer.mark)}`
							: ''}
					</span>
					<span
						class="max-w-72 rounded-md border border-border-strong bg-card px-1 py-0.5 font-notes font-medium text-foreground shadow-ink-strong {wide
							? 'text-base'
							: 'text-2xs'}"
					>
						<span class="rounded-sm px-0.5 {KIND_TONE[flyer.mark.kind]}"
							>{flyer.mark.text}</span
						>
					</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- Controls -->
	<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
		<ol class="grid flex-1 grid-cols-5 gap-1.5" aria-label="Demo chapters">
			{#each CHAPTERS as item, i (item.id)}
				<li>
					<button
						type="button"
						onclick={() => showChapter(i)}
						aria-current={i === chapter ? 'step' : undefined}
						class="group flex min-h-11 w-full flex-col justify-between gap-1.5 rounded-md px-1.5 pt-1.5 pb-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<span
							class="text-2xs leading-tight font-semibold sm:text-xs {i === chapter
								? 'text-foreground'
								: 'text-muted-foreground group-hover:text-foreground'}"
						>
							<span class="stamp">{i + 1}</span>
							{item.label}
						</span>
						<span class="block h-1 overflow-hidden rounded-full bg-muted">
							<span
								class="block h-full rounded-full bg-accent"
								style:width="{railFill(i) * 100}%"
							></span>
						</span>
					</button>
				</li>
			{/each}
		</ol>
		<div class="flex shrink-0 items-center gap-2">
			<button
				type="button"
				onclick={togglePlay}
				class="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				{#if finished || reducedMotion.current}
					<RotateCcw class="h-4 w-4" /> Replay
				{:else if playing}
					<Pause class="h-4 w-4" /> Pause
				{:else}
					<Play class="h-4 w-4" /> Play
				{/if}
			</button>
			{#if onyourturn}
				<button
					type="button"
					onclick={onyourturn}
					class="tx-button tx-button-accent inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					Your turn <ArrowDown class="h-4 w-4" />
				</button>
			{/if}
		</div>
	</div>

	<p class="sr-only">
		Demo: a messy note about a novel called Fading Crown is typed in. BuildOS highlights each
		piece and files it on the project as a goal, two milestones, five tasks, two documents, a
		risk, and a next step. Zooming out shows Fading Crown beside three other projects. A later
		voice note about a YouTube channel adds three tasks to the channel project and updates the
		novel's chapter 13 beats document.
	</p>
</div>

<style>
	.world {
		transform-origin: 0 0;
		transition: transform 1000ms cubic-bezier(0.65, 0, 0.35, 1);
		will-change: transform;
	}

	.world-snap {
		transition: none;
	}

	.caret {
		display: inline-block;
		width: 2px;
		height: 1em;
		margin-left: 1px;
		vertical-align: -0.15em;
		background: hsl(var(--accent));
		animation: caret-blink 1s steps(2, start) infinite;
	}

	@keyframes caret-blink {
		to {
			visibility: hidden;
		}
	}

	.composer-in {
		animation: composer-in 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	@keyframes composer-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
	}

	.label-in {
		animation: label-in 260ms ease-out;
	}

	@keyframes label-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.caret,
		.composer-in,
		.label-in {
			animation: none;
		}
	}
</style>
