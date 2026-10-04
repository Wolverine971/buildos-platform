<!-- apps/web/src/lib/components/projects/desktop/ProjectDesktop.svelte -->
<!--
	The Projects desktop: every project as a compact tile, folders for projects
	that hold others. Clicking a tile opens its card in place (the rest dock);
	dragging puts projects inside each other and moves docs and tasks between
	projects. Every drop asks first and offers Undo after. The no-drag path
	(Move buttons, right-click, the M key) opens the same rules as a list.
	The open card lives in shallow history, so Back closes it.
-->
<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { pushState, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ChevronRight, Circle, FileText } from '$lib/icons/lucide';
	import { toastService, TOAST_DURATION } from '$lib/stores/toast.store';
	import { setProjectParent } from '$lib/components/project/project-family';
	import { isPrimaryTier, normalizeProjectState } from '$lib/config/project-states';
	import type { ProjectListSummary } from '../project-list';
	import './desktop-colors.css';
	import DesktopTile from './DesktopTile.svelte';
	import DesktopKey from './DesktopKey.svelte';
	import DesktopHoverCard from './DesktopHoverCard.svelte';
	import DesktopDock from './DesktopDock.svelte';
	import DesktopProjectCard, { type CardTab } from './DesktopProjectCard.svelte';
	import DesktopMovePopover, {
		type PickerOption,
		type PopoverView
	} from './DesktopMovePopover.svelte';
	import {
		groupDesktop,
		indexProjects,
		isOnDesktop,
		shortName,
		sortRecent,
		type DesktopSort
	} from './desktop-model';
	import {
		confirmCopy,
		dropVerdict,
		type DesktopItem,
		type DropTarget,
		type DropVerdict
	} from './desktop-rules';
	import {
		applyContentMove,
		createCardCache,
		prepareContentMove,
		undoContentMove,
		type ContentItem,
		type DesktopCard,
		type PreparedMove
	} from './desktop-moves';
	import { createDesktopDrag, readItem } from './useDesktopDrag.svelte';
	import { setDesktopLooks } from './desktop-context';
	import { PULSE_META, buildLooks, shiftTask } from './desktop-signals';

	export type ProjectPatch = { id: string; patch: Partial<ProjectListSummary> };

	let {
		projects,
		visible,
		completed,
		searching,
		onPatch,
		onOpenFull
	}: {
		/** Everything the viewer can see; the rules and folders need the whole family. */
		projects: readonly ProjectListSummary[];
		/** Projects passing the page's search and filters. */
		visible: readonly ProjectListSummary[];
		/** Finished projects, shown in a closed group under the desktop. */
		completed: readonly ProjectListSummary[];
		searching: boolean;
		onPatch: (patches: ProjectPatch[]) => void;
		/** Leaving for the full project page (skeleton data for an instant open). */
		onOpenFull: (project: ProjectListSummary) => void;
	} = $props();

	const HOVER_MS = 320;
	const SPRING_MS = 650;
	const SORT_KEY = 'projects-desktop-sort';
	const SORTS: { value: DesktopSort; label: string }[] = [
		{ value: 'recent', label: 'Recent' },
		{ value: 'activity', label: 'By activity' }
	];

	type Allowed = Extract<NonNullable<DropVerdict>, { ok: true }>;
	type Pending =
		| {
				mode: 'confirm';
				seq: number;
				item: DesktopItem;
				verdict: Allowed;
				anchor: DOMRect | null;
				/** Dock targets sit at the right; the confirm opens beside them, not over them. */
				side: 'below' | 'left';
				itemTitle: string;
				title: string;
				body: string;
				cta: string;
				checking: boolean;
				busy: boolean;
				error: string;
				effects: string[];
				blockers: string[];
				prepared: PreparedMove | null;
				controller: AbortController | null;
		  }
		| {
				mode: 'picker';
				seq: number;
				item: DesktopItem;
				anchor: DOMRect | null;
				title: string;
				options: PickerOption[];
		  };

	const cache = createCardCache();
	const index = $derived(indexProjects(projects));
	// Every tile's color, bars and task mix, computed once and read by tiles
	// anywhere below (desktop, dock, card, Move list).
	const looks = $derived(buildLooks(projects, Date.now()));
	setDesktopLooks((id) => looks.get(id));

	// ---------- Desktop ----------

	let sort = $state<DesktopSort>('recent');
	let completedOpen = $state(false);
	onMount(() => {
		try {
			const saved = localStorage.getItem(SORT_KEY);
			// 'state' is the old name of By activity.
			if (saved === 'recent') sort = saved;
			else if (saved === 'activity' || saved === 'state') sort = 'activity';
		} catch {
			// Storage can be unavailable (private mode); Recent stays.
		}
	});

	function setSort(next: DesktopSort) {
		sort = next;
		try {
			localStorage.setItem(SORT_KEY, next);
		} catch {
			// The choice still holds for this visit.
		}
	}

	const childrenOf = (id: string) => index.children.get(id) ?? [];

	// A folder stays on the desktop when it or anything inside it passes the
	// filters. A search lays matches out flat, sub-projects included.
	const tiles = $derived.by(() => {
		if (searching) return [...visible];
		const shown = new Set(visible.map((project) => project.id));
		return projects.filter(
			(project) =>
				isOnDesktop(project, index) &&
				(shown.has(project.id) ||
					childrenOf(project.id).some((child) => shown.has(child.id)))
		);
	});
	const groups = $derived(
		groupDesktop(tiles, index, sort, (project) => looks.get(project.id)?.pulse ?? null)
	);
	const completedTiles = $derived.by(() => {
		if (searching) return [];
		const placed = new Set(tiles.map((project) => project.id));
		return sortRecent(
			completed.filter((project) => isOnDesktop(project, index) && !placed.has(project.id)),
			index
		);
	});

	function parentOf(project: ProjectListSummary): ProjectListSummary | null {
		return project.parent_project_id
			? (index.byId.get(project.parent_project_id) ?? null)
			: null;
	}

	function tileLabel(project: ProjectListSummary): string {
		const inside = childrenOf(project.id).length;
		const parent = parentOf(project);
		const look = looks.get(project.id);
		return [
			project.name,
			inside ? `holds ${inside} ${inside === 1 ? 'project' : 'projects'}` : '',
			parent ? `inside ${parent.name}` : '',
			look?.pulse ? PULSE_META[look.pulse].label.toLowerCase() : '',
			look?.mix.overdue ? `${look.mix.overdue} overdue` : '',
			look ? `${look.open} open ${look.open === 1 ? 'task' : 'tasks'}` : '',
			`${project.document_count} ${project.document_count === 1 ? 'doc' : 'docs'}`
		]
			.filter(Boolean)
			.join(', ');
	}

	// ---------- Open card (shallow history) ----------

	const openId = $derived(page.state.desktopCard ?? null);
	const openProject = $derived(openId ? (index.byId.get(openId) ?? null) : null);
	const openParent = $derived(openProject ? parentOf(openProject) : null);
	const openInside = $derived(openProject ? childrenOf(openProject.id) : []);
	const canHold = $derived(Boolean(openProject) && !openParent);

	let tabChoice = $state<{ id: string; tab: CardTab } | null>(null);
	const tab = $derived.by<CardTab>(() => {
		if (tabChoice && tabChoice.id === openId && (tabChoice.tab !== 'inside' || canHold))
			return tabChoice.tab;
		return canHold && openInside.length ? 'inside' : 'docs';
	});

	let card = $state.raw<{ id: string; data: DesktopCard | null; error: string } | null>(null);
	let cardVersion = $state(0);
	$effect(() => {
		const id = openId;
		void cardVersion;
		if (!id) return;
		let live = true;
		untrack(() => {
			if (card?.id !== id) card = { id, data: null, error: '' };
		});
		cache.get(id).then(
			(data) => {
				if (live) card = { id, data, error: '' };
			},
			(cause) => {
				if (!live) return;
				const kept = untrack(() => (card?.id === id ? card.data : null));
				card = { id, data: kept, error: errorMessage(cause) };
			}
		);
		return () => {
			live = false;
		};
	});
	const openCardData = $derived(card && card.id === openId ? card : null);

	function refreshCards(...ids: (string | null | undefined)[]) {
		cache.invalidate(...ids.filter((id): id is string => Boolean(id)));
		cardVersion += 1;
	}

	let openedEl = $state<HTMLElement | null>(null);
	let root = $state<HTMLElement | null>(null);
	let restoreFocusTo: string | null = null;

	function openCard(id: string) {
		if (drag.swallowsClick()) return;
		hover = null;
		clearHoverTimer();
		if (id === openId) return;
		pushState('', {
			...page.state,
			desktopCard: id,
			desktopDepth: (page.state.desktopDepth ?? 0) + 1
		});
	}

	function closeCard() {
		if (!openId) return;
		restoreFocusTo = openId;
		manualSprung = new Set();
		const depth = page.state.desktopDepth ?? 0;
		if (depth > 0) history.go(-depth);
		else replaceState('', { ...page.state, desktopCard: undefined, desktopDepth: undefined });
	}

	// Opening lifts the card to the top of the screen so it and the dock fit;
	// closing returns focus to the tile it came from.
	$effect(() => {
		const id = openId;
		void tick().then(() => {
			if (id && openedEl) {
				openedEl.scrollIntoView({ block: 'start' });
				openedEl.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
			} else if (!id && restoreFocusTo) {
				const tile = root?.querySelector<HTMLElement>(`[data-tile-id="${restoreFocusTo}"]`);
				restoreFocusTo = null;
				tile?.focus({ preventScroll: false });
			}
		});
	});

	// ---------- Dock ----------

	const dockItems = $derived.by(() => {
		const top = sortRecent(
			projects.filter((project) => isOnDesktop(project, index) && project.id !== openId),
			index
		);
		const current = (project: ProjectListSummary) =>
			isPrimaryTier(normalizeProjectState(project.state_key));
		return [...top.filter(current), ...top.filter((project) => !current(project))].map(
			(project) => ({ project, inside: childrenOf(project.id) })
		);
	});
	let manualSprung = $state<Set<string>>(new Set());
	let dragSprung = $state<Set<string>>(new Set());
	const sprung = $derived(new Set([...manualSprung, ...dragSprung]));
	let springTimer: ReturnType<typeof setTimeout> | null = null;

	function toggleSpring(id: string) {
		const next = new Set(manualSprung);
		if (next.has(id) || dragSprung.has(id)) {
			next.delete(id);
			if (dragSprung.has(id)) dragSprung = new Set([...dragSprung].filter((x) => x !== id));
		} else next.add(id);
		manualSprung = next;
	}

	function clearSpringTimer() {
		if (springTimer) clearTimeout(springTimer);
		springTimer = null;
	}

	// ---------- Hover card ----------

	let hover = $state.raw<{ id: string; anchor: DOMRect } | null>(null);
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;
	const hoverProject = $derived(hover ? (index.byId.get(hover.id) ?? null) : null);

	function clearHoverTimer() {
		if (hoverTimer) clearTimeout(hoverTimer);
		hoverTimer = null;
	}

	function tileEnter(event: PointerEvent, id: string) {
		if (event.pointerType !== 'mouse' || drag.dragging || pending) return;
		clearHoverTimer();
		const element = event.currentTarget as HTMLElement;
		hoverTimer = setTimeout(() => {
			hoverTimer = null;
			if (drag.dragging || pending || !element.isConnected) return;
			hover = { id, anchor: element.getBoundingClientRect() };
			cache.prefetch(id);
		}, HOVER_MS);
	}

	function tileLeave() {
		clearHoverTimer();
		hover = null;
	}

	// ---------- Drag ----------

	let announcement = $state('');

	const drag = createDesktopDrag({
		verdict: (item, target) => dropVerdict(item, target, index),
		onStart: (item) => {
			hover = null;
			clearHoverTimer();
			announcement = `Picked up ${itemTitle(item)}. Drop it on a project.`;
		},
		onOver: (item, target, element) => {
			clearSpringTimer();
			if (target?.kind === 'project' && item.kind !== 'project') cache.prefetch(target.id);
			const springId = element?.dataset.springId;
			if (!springId || sprung.has(springId)) return;
			springTimer = setTimeout(async () => {
				springTimer = null;
				if (!drag.dragging) return;
				dragSprung = new Set([...dragSprung, springId]);
				await tick();
				drag.retrack();
			}, SPRING_MS);
		},
		onEnd: (dropped) => {
			clearSpringTimer();
			if (!dropped) dragSprung = new Set();
		},
		onDrop: (item, _target, verdict, anchor) =>
			startConfirm(
				item,
				verdict,
				anchor.getBoundingClientRect(),
				anchor.closest('[data-dock]') ? 'left' : 'below'
			),
		onRefused: (reason) => {
			announcement = reason;
			toastService.add({ type: 'info', message: reason, duration: TOAST_DURATION.STANDARD });
		}
	});

	$effect(() => {
		document.body.classList.toggle('desktop-dragging', drag.dragging);
		return () => document.body.classList.remove('desktop-dragging');
	});

	function dropClass(key: string) {
		const over = drag.over;
		if (over?.key !== key) return '';
		return over.ok ? 'drop-ok' : 'drop-no';
	}

	function itemTitle(item: DesktopItem): string {
		if (item.kind === 'project') return index.byId.get(item.id)?.name ?? 'This project';
		const data = card?.id === item.projectId ? card.data : null;
		if (item.kind === 'document')
			return data?.project.documents.find((doc) => doc.id === item.id)?.title || 'this doc';
		return data?.project.tasks.find((task) => task.id === item.id)?.title || 'this task';
	}

	// ---------- Confirm and the "Move to…" list ----------

	let pending = $state.raw<Pending | null>(null);
	let seq = 0;

	const popoverView = $derived.by<PopoverView | null>(() => {
		if (!pending) return null;
		if (pending.mode === 'picker')
			return { mode: 'picker', title: pending.title, options: pending.options };
		return {
			mode: 'confirm',
			title: pending.title,
			body: pending.body,
			cta: pending.cta,
			effects: pending.effects,
			blockers: pending.blockers,
			checking: pending.checking,
			busy: pending.busy,
			error: pending.error
		};
	});

	function closePopover() {
		if (pending?.mode === 'confirm') pending.controller?.abort();
		pending = null;
		dragSprung = new Set();
	}

	function startConfirm(
		item: DesktopItem,
		verdict: Allowed,
		anchor: DOMRect | null,
		side: 'below' | 'left' = 'below'
	) {
		if (pending?.mode === 'confirm') pending.controller?.abort();
		hover = null;
		const title = itemTitle(item);
		const copy = confirmCopy(item, verdict.action, index, {
			title,
			targetId: verdict.targetId
		});
		const controller =
			item.kind !== 'project' && verdict.targetId !== null ? new AbortController() : null;
		const id = ++seq;
		pending = {
			mode: 'confirm',
			seq: id,
			item,
			verdict,
			anchor,
			side,
			itemTitle: title,
			...copy,
			checking: controller !== null,
			busy: false,
			error: '',
			effects: [],
			blockers: [],
			prepared: null,
			controller
		};
		if (controller && item.kind !== 'project' && verdict.targetId)
			void prepare(id, item, verdict.targetId, title, controller);
	}

	async function prepare(
		id: number,
		item: ContentItem,
		targetId: string,
		title: string,
		controller: AbortController
	) {
		try {
			const [source, destination] = await Promise.all([
				cache.get(item.projectId),
				cache.get(targetId)
			]);
			const prepared = await prepareContentMove(
				item,
				source.project,
				destination.project,
				controller.signal
			);
			if (pending?.seq !== id || pending.mode !== 'confirm') return;
			const copy = confirmCopy(item, 'move', index, {
				title,
				targetId,
				nestedCount: prepared.nestedCount
			});
			pending = {
				...pending,
				body: copy.body,
				checking: false,
				prepared,
				effects: prepared.effects,
				blockers: prepared.blockers
			};
		} catch (cause) {
			if (controller.signal.aborted || pending?.seq !== id || pending.mode !== 'confirm')
				return;
			// A stale snapshot is the usual cause; the next try starts fresh.
			cache.invalidate(item.projectId, targetId);
			pending = { ...pending, checking: false, blockers: [errorMessage(cause)] };
		}
	}

	async function confirm() {
		const current = pending;
		if (current?.mode !== 'confirm' || current.busy || current.checking) return;
		if (current.blockers.length) return;
		// Keep the card on the tab in use, even if the move empties it.
		if (openId) tabChoice = { id: openId, tab };
		pending = { ...current, busy: true, error: '' };
		try {
			if (current.item.kind === 'project')
				await applyNest(current.item.id, current.verdict.targetId);
			else if (current.prepared && current.verdict.targetId)
				await applyContent(
					current.item,
					current.prepared,
					current.verdict.targetId,
					current.itemTitle
				);
			if (pending?.seq === current.seq) closePopover();
		} catch (cause) {
			if (pending?.seq === current.seq && pending.mode === 'confirm')
				pending = { ...pending, busy: false, error: errorMessage(cause) };
		}
	}

	function openPicker(item: DesktopItem, anchorElement: HTMLElement | null) {
		hover = null;
		clearHoverTimer();
		const options: PickerOption[] = [];
		const consider = (target: DropTarget, option: Omit<PickerOption, 'reason'>) => {
			const verdict = dropVerdict(item, target, index);
			if (verdict)
				options.push({ ...option, reason: verdict.ok ? undefined : verdict.reason });
		};
		if (item.kind === 'project' && index.byId.get(item.id)?.parent_project_id)
			consider({ kind: 'desktop' }, { key: 'desktop', label: 'Projects (top level)' });
		const top = sortRecent(
			projects.filter((project) => isOnDesktop(project, index)),
			index
		);
		for (const project of top) {
			const inside = childrenOf(project.id);
			consider(
				{ kind: 'project', id: project.id },
				{ key: project.id, label: project.name, project, inside }
			);
			if (item.kind === 'project') continue;
			for (const child of inside)
				consider(
					{ kind: 'project', id: child.id },
					{ key: child.id, label: child.name, project: child, indent: true }
				);
		}
		pending = {
			mode: 'picker',
			seq: ++seq,
			item,
			anchor: anchorElement?.getBoundingClientRect() ?? null,
			title: `Move “${shortName(itemTitle(item), 40)}” to…`,
			options
		};
	}

	function pick(key: string) {
		if (pending?.mode !== 'picker') return;
		const { item, anchor } = pending;
		const target: DropTarget =
			key === 'desktop' ? { kind: 'desktop' } : { kind: 'project', id: key };
		const verdict = dropVerdict(item, target, index);
		if (!verdict?.ok) return;
		const landing = root?.querySelector<HTMLElement>(
			key === 'desktop'
				? '[data-drop-kind="desktop"]'
				: `[data-drop-kind="project"][data-drop-id="${key}"]:not(article)`
		);
		const rect = landing?.getBoundingClientRect();
		const onScreen = rect && rect.bottom > 0 && rect.top < window.innerHeight;
		startConfirm(
			item,
			verdict,
			onScreen ? rect : anchor,
			onScreen && landing?.closest('[data-dock]') ? 'left' : 'below'
		);
	}

	// ---------- Writes ----------

	async function applyNest(id: string, targetId: string | null) {
		const project = index.byId.get(id);
		if (!project) return;
		const previous = project.parent_project_id ?? null;
		const name = shortName(project.name);
		const targetName = targetId ? shortName(index.byId.get(targetId)?.name ?? '') : '';
		await setProjectParent(id, targetId);
		onPatch([{ id, patch: { parent_project_id: targetId } }]);
		cache.invalidate(id);
		const message = targetId
			? `${name} is now inside ${targetName}.`
			: `${name} is back at the top level of Projects.`;
		announcement = message;
		const toastId: string = toastService.add({
			type: 'success',
			message,
			duration: TOAST_DURATION.LONG,
			action: {
				label: 'Undo',
				onClick: () => {
					toastService.remove(toastId);
					void undoNest(id, previous);
				}
			}
		});
	}

	async function undoNest(id: string, previous: string | null) {
		try {
			await setProjectParent(id, previous);
			onPatch([{ id, patch: { parent_project_id: previous } }]);
			cache.invalidate(id);
			toastService.success('Undone.');
		} catch (cause) {
			toastService.error(errorMessage(cause));
		}
	}

	type TaskFacts = { state_key: string; start_at: string | null; due_at: string | null };

	function shiftCounts(
		item: ContentItem,
		from: string,
		to: string,
		count: number,
		task?: TaskFacts
	) {
		const field = item.kind === 'document' ? 'document_count' : 'task_count';
		const patch = (id: string, delta: number): ProjectPatch[] => {
			const project = index.byId.get(id);
			if (!project) return [];
			const value = Math.max(0, project[field] + delta);
			return [
				{
					id,
					patch:
						field === 'document_count'
							? { document_count: value }
							: { task_count: value }
				}
			];
		};
		const patches = [...patch(from, -count), ...patch(to, count)];
		// A task also moves between the projects' T bars.
		if (task) {
			const now = Date.now();
			for (const entry of patches) {
				const signals = index.byId.get(entry.id)?.signals;
				const shifted = shiftTask(signals, task, entry.id === from ? -1 : 1, now);
				if (shifted) entry.patch = { ...entry.patch, signals: shifted };
			}
		}
		onPatch(patches);
	}

	function cardTask(item: ContentItem): TaskFacts | undefined {
		if (item.kind !== 'task') return undefined;
		const data = card?.id === item.projectId ? card.data : null;
		return data?.project.tasks.find((task) => task.id === item.id);
	}

	async function applyContent(
		item: ContentItem,
		prepared: PreparedMove,
		targetId: string,
		title: string
	) {
		const task = cardTask(item);
		const receipt = await applyContentMove(prepared);
		const count = item.kind === 'document' ? 1 + prepared.nestedCount : 1;
		shiftCounts(item, item.projectId, targetId, count, task);
		refreshCards(item.projectId, targetId);
		const message = `Moved “${shortName(title, 48)}” to ${shortName(index.byId.get(targetId)?.name ?? '')}.`;
		announcement = message;
		const toastId: string = toastService.add({
			type: 'success',
			message,
			duration: TOAST_DURATION.LONG,
			action: {
				label: 'Undo',
				onClick: () => {
					toastService.remove(toastId);
					void undoContent(receipt.batch_id, item, targetId, count, task);
				}
			}
		});
	}

	async function undoContent(
		batchId: string,
		item: ContentItem,
		targetId: string,
		count: number,
		task?: TaskFacts
	) {
		try {
			const result = await undoContentMove(batchId);
			if (result === 'nothing') {
				toastService.add({
					type: 'info',
					message: 'Nothing to undo: it changed since the move.'
				});
				return;
			}
			shiftCounts(item, targetId, item.projectId, count, task);
			refreshCards(item.projectId, targetId);
			toastService.success('Moved back.');
		} catch (cause) {
			toastService.error(errorMessage(cause));
		}
	}

	function errorMessage(cause: unknown): string {
		return cause instanceof Error && cause.message
			? cause.message
			: 'Something went wrong. Please try again.';
	}

	// ---------- Pointer, clicks and keys ----------

	function tileClick(event: MouseEvent, project: ProjectListSummary) {
		// Modified clicks keep the link's own behavior (new tab, new window).
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
			return;
		event.preventDefault();
		openCard(project.id);
	}

	function tileMenu(event: MouseEvent, project: ProjectListSummary) {
		if (drag.dragging || drag.touchPressed) return;
		event.preventDefault();
		openPicker({ kind: 'project', id: project.id }, event.currentTarget as HTMLElement);
	}

	function isTyping(event: KeyboardEvent): boolean {
		// Keys sent to the window itself have no element target.
		const target = event.target;
		return (
			target instanceof Element &&
			Boolean(
				target.closest(
					'input, textarea, select, [contenteditable="true"], [role="textbox"]'
				)
			)
		);
	}

	function keydown(event: KeyboardEvent) {
		if (event.defaultPrevented || pending) return;
		if (event.key === 'Escape') {
			if (drag.dragging) {
				event.preventDefault();
				drag.cancel();
			} else if (hover) {
				hover = null;
			} else if (openId && !isTyping(event) && !document.querySelector('[role="dialog"]')) {
				event.preventDefault();
				closeCard();
			}
			return;
		}
		if (event.key !== 'm' && event.key !== 'M') return;
		if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event)) return;
		const element = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(
			'[data-drag-kind]'
		);
		const item = element && root?.contains(element) ? readItem(element) : null;
		if (!item || !element) return;
		event.preventDefault();
		openPicker(item, element);
	}

	function swallowDropClick(event: MouseEvent) {
		if (drag.swallowsClick()) {
			event.preventDefault();
			event.stopPropagation();
		}
	}
</script>

<svelte:window
	onkeydown={keydown}
	onscroll={() => {
		if (hover) hover = null;
	}}
/>

<div
	bind:this={root}
	class="desktop"
	role="presentation"
	onpointerdown={drag.pointerdown}
	onclickcapture={swallowDropClick}
>
	{#if openProject}
		<div class="opened" bind:this={openedEl}>
			{#key openProject.id}
				<DesktopProjectCard
					project={openProject}
					parent={openParent}
					inside={openInside}
					{canHold}
					updatedAt={index.activity(openProject)}
					data={openCardData?.data ?? null}
					error={openCardData?.error ?? ''}
					{tab}
					over={drag.over}
					lifted={drag.lifted}
					canTakeOut={Boolean(
						openParent &&
							dropVerdict(
								{ kind: 'project', id: openProject.id },
								{ kind: 'desktop' },
								index
							)?.ok
					)}
					onTab={(next) => (tabChoice = { id: openProject.id, tab: next })}
					onCollapse={closeCard}
					onOpenProject={openCard}
					onOpenFull={() => onOpenFull(openProject)}
					onTakeOut={(anchor) => {
						const verdict = dropVerdict(
							{ kind: 'project', id: openProject.id },
							{ kind: 'desktop' },
							index
						);
						if (verdict?.ok)
							startConfirm(
								{ kind: 'project', id: openProject.id },
								verdict,
								anchor.getBoundingClientRect()
							);
					}}
					onMove={openPicker}
					onRetry={() => refreshCards(openProject.id)}
				/>
			{/key}
			<DesktopDock
				items={dockItems}
				openId={openProject.id}
				{sprung}
				over={drag.over}
				lifted={drag.lifted}
				onOpen={openCard}
				onDesktop={closeCard}
				onToggleSpring={toggleSpring}
			/>
		</div>
	{:else}
		{#if searching}
			<p class="text-xs text-muted-foreground">
				{tiles.length}
				{tiles.length === 1 ? 'match' : 'matches'} across all states
			</p>
		{/if}
		<div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
			<DesktopKey />
			<div
				class="inline-flex rounded-md bg-muted p-0.5 text-xs font-semibold"
				role="group"
				aria-label="Arrange projects"
			>
				{#each SORTS as { value, label } (value)}
					<button
						type="button"
						class="min-h-9 rounded-md px-3 pressable [@media(pointer:fine)]:min-h-7 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset {sort ===
						value
							? 'bg-card text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'}"
						aria-pressed={sort === value}
						onclick={() => setSort(value)}
					>
						{label}
					</button>
				{/each}
			</div>
		</div>

		{#each groups as group (group.key)}
			<section class="grid gap-2" aria-label={sort === 'activity' ? group.label : 'Projects'}>
				{#if sort === 'activity'}
					<h2 class="micro-label text-muted-foreground">
						{group.label.toUpperCase()} · {group.projects.length}
					</h2>
				{/if}
				<div class="grid-tiles">
					{#each group.projects as project (project.id)}
						{@render tile(project)}
					{/each}
				</div>
			</section>
		{/each}

		{#if completedTiles.length}
			<section class="grid gap-2">
				<button
					type="button"
					class="flex min-h-9 items-center gap-1.5 self-start rounded-md px-1 text-left micro-label text-muted-foreground hover:text-foreground"
					aria-expanded={completedOpen}
					onclick={() => (completedOpen = !completedOpen)}
				>
					<ChevronRight
						class="h-3.5 w-3.5 transition-transform motion-reduce:transition-none {completedOpen
							? 'rotate-90'
							: ''}"
					/>
					COMPLETED · {completedTiles.length}
				</button>
				{#if completedOpen}
					<div class="grid-tiles">
						{#each completedTiles as project (project.id)}
							{@render tile(project)}
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	{/if}
</div>

{#snippet tile(project: ProjectListSummary)}
	{@const inside = childrenOf(project.id)}
	{@const parent = searching ? parentOf(project) : null}
	<a
		href={resolve('/projects/[id]', { id: project.id })}
		class="tile-link {dropClass(`project:${project.id}`)}"
		class:lifted={drag.lifted === `project:${project.id}`}
		draggable="false"
		data-tile-id={project.id}
		data-drag-kind="project"
		data-drag-id={project.id}
		data-drop-kind="project"
		data-drop-id={project.id}
		aria-label={tileLabel(project)}
		onclick={(event) => tileClick(event, project)}
		oncontextmenu={(event) => tileMenu(event, project)}
		onpointerenter={(event) => tileEnter(event, project.id)}
		onpointerleave={tileLeave}
	>
		<DesktopTile {project} {inside} />
		<span class="label">{project.name}</span>
		{#if inside.length}
			<span class="sub">{inside.length} inside</span>
		{:else if parent}
			<span class="where">in {shortName(parent.name, 24)}</span>
		{/if}
	</a>
{/snippet}

{#if hoverProject && hover && !openProject}
	<DesktopHoverCard
		project={hoverProject}
		inside={childrenOf(hoverProject.id)}
		parentName={parentOf(hoverProject)?.name ?? null}
		updatedAt={index.activity(hoverProject)}
		look={looks.get(hoverProject.id)}
		anchor={hover.anchor}
	/>
{/if}

{#if drag.ghost}
	{@const ghost = drag.ghost}
	{@const ghostProject =
		ghost.item.kind === 'project' ? index.byId.get(ghost.item.id) : undefined}
	<div
		class="ghost"
		style:transform="translate({ghost.x + 14}px, {ghost.y + 12}px)"
		aria-hidden="true"
	>
		<div class="flex items-center gap-2.5">
			{#if ghostProject}
				<DesktopTile
					project={ghostProject}
					inside={childrenOf(ghostProject.id)}
					size="xs"
				/>
			{:else}
				<span class="glyph">
					{#if ghost.item.kind === 'document'}<FileText class="h-4 w-4" />{:else}<Circle
							class="h-4 w-4"
						/>{/if}
				</span>
			{/if}
			<span class="truncate text-sm font-semibold text-foreground">
				{itemTitle(ghost.item)}
			</span>
		</div>
		{#if ghost.reason}
			<p class="text-xs text-destructive">{ghost.reason}</p>
		{/if}
	</div>
{/if}

{#if popoverView && pending}
	{#key pending.mode === 'picker' ? `picker:${pending.seq}` : `confirm:${pending.seq}`}
		<DesktopMovePopover
			view={popoverView}
			anchor={pending.anchor}
			side={pending.mode === 'confirm' ? pending.side : 'below'}
			onConfirm={() => void confirm()}
			onCancel={closePopover}
			onPick={pick}
		/>
	{/key}
{/if}

<p class="sr-only" aria-live="polite">{announcement}</p>

<style>
	.desktop {
		display: grid;
		gap: 22px;
	}
	.grid-tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
		gap: 6px 4px;
	}
	@media (max-width: 639px) {
		.grid-tiles {
			grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
			gap: 4px 2px;
		}
	}
	.tile-link {
		display: flex;
		min-width: 0;
		flex-direction: column;
		align-items: center;
		gap: 7px;
		padding: 10px 4px 8px;
		border-radius: 12px;
		border: 1px solid transparent;
		color: hsl(var(--foreground));
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
		touch-action: pan-y;
		transition:
			background-color 120ms ease,
			opacity 120ms ease;
	}
	.tile-link:hover {
		background: hsl(var(--accent) / 0.08);
	}
	.tile-link:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.label {
		max-width: 100%;
		font-size: 12.5px;
		line-height: 1.25;
		text-align: center;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.sub {
		margin-top: -3px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: hsl(var(--accent));
	}
	.where {
		margin-top: -3px;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
	.drop-ok :global(.tile) {
		outline: 2px solid hsl(var(--accent));
		outline-offset: 3px;
		transform: scale(1.07);
	}
	.drop-ok {
		background: hsl(var(--accent) / 0.08);
	}
	.drop-no {
		opacity: 0.45;
	}
	.lifted {
		opacity: 0.35;
	}
	.opened {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 96px;
		align-items: start;
		gap: 14px;
		scroll-margin-top: 0.75rem;
	}
	@media (max-width: 767px) {
		.opened {
			grid-template-columns: minmax(0, 1fr);
			padding-bottom: 120px;
		}
	}
	.ghost {
		position: fixed;
		left: 0;
		top: 0;
		z-index: 80;
		display: grid;
		gap: 4px;
		max-width: 280px;
		padding: 6px 12px 6px 6px;
		border-radius: 11px;
		border: 1px solid hsl(var(--border-strong));
		background: hsl(var(--card));
		box-shadow: var(--shadow-ink-strong);
		pointer-events: none;
	}
	.glyph {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		flex: none;
		border-radius: 7px;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}
	:global(body.desktop-dragging),
	:global(body.desktop-dragging *) {
		cursor: grabbing !important;
		-webkit-user-select: none !important;
		user-select: none !important;
	}
	/* Toasts sit over the dock (top-right on wide screens, bottom on phones);
	   mid-drag they fade and let the pointer reach the drop target beneath. */
	:global(body.desktop-dragging [data-toast-region]) {
		opacity: 0.2;
		transition: opacity 120ms ease;
	}
	:global(body.desktop-dragging [data-toast-region] *) {
		pointer-events: none !important;
	}
	@media (prefers-reduced-motion: reduce) {
		.tile-link {
			transition: none;
		}
		.drop-ok :global(.tile) {
			transform: none;
		}
	}
</style>
