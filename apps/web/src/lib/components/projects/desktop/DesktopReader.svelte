<!-- apps/web/src/lib/components/projects/desktop/DesktopReader.svelte -->
<!--
	The card's reader: one doc, task or goal, read and edited in place. Facts
	(state, priority, dates) change in one click from their chips. The pencil (E)
	makes the title and the body or description editable, autosaved (docs with
	the doc modal's conflict check). "All details" opens the full editor for the
	rest (assignees, repeats, links, comments). Bottom left archives (a goal:
	deletes) with Undo, and the reader moves to the next item. The header carries
	Prev/Next and the depth toggles (list, focus, full page). On phones the same
	actions sit in a thumb bar, and the handle (data-sheet-drag) drags the sheet.
	A task lists the docs made for it, which open here too.
-->
<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		Archive,
		ArrowUpRight,
		Check,
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		ChevronUp,
		Circle,
		CircleCheck,
		CircleDot,
		CircleSlash,
		Edit3,
		Eye,
		FilePlus,
		FileText,
		FolderKanban,
		Maximize2,
		Minimize2,
		PanelLeftClose,
		PanelLeftOpen,
		PanelRightClose,
		PanelRightOpen,
		Pencil,
		RefreshCw,
		Table2 as Table,
		Target,
		Trash2,
		X
	} from '$lib/icons/lucide';
	import { prefersReducedMotion } from 'svelte/motion';
	import { toastService } from '$lib/stores/toast.store';
	import {
		getProseClasses,
		renderDocumentMarkdown,
		renderMarkdown,
		renderTaskMarkdown
	} from '$lib/utils/markdown';
	import { isTableTypeKey } from '@buildos/shared-agent-ops/tables';
	import {
		documentEmbeds,
		type MakeLiveTableClick
	} from '$lib/components/table-surfaces/document-embeds';
	import { tableEmbedInsertion } from '$lib/components/table-surfaces/table-surface-utils';
	import { fetchEntityModalData } from '$lib/components/project/entity-modal-data';
	import TaskEntityPopover from '$lib/components/task-entities/TaskEntityPopover.svelte';
	import TaskKeyDetails from '$lib/components/task-entities/TaskKeyDetails.svelte';
	import TaskMentionText from '$lib/components/task-entities/TaskMentionText.svelte';
	import { entityMentions } from '$lib/components/task-entities/entity-mentions';
	import { TaskEntities } from '$lib/components/task-entities/task-entities.svelte';
	import ReaderChip from './ReaderChip.svelte';
	import {
		DATE_PRESETS,
		DOC_STATES,
		GOAL_PRIORITIES,
		GOAL_STATES,
		TASK_PRIORITIES,
		dayOf,
		optimisticTimestamp,
		optionLabel,
		presetDay,
		removalFor,
		taskPriorityLabel,
		valueForDay
	} from './reader-edit';
	import { removeWithUndo } from './reader-removals.svelte';
	import {
		KIND_WORD,
		TASK_STATES,
		neighbors,
		type ReaderItem,
		type ReaderLayout,
		type SheetDetent
	} from './reader-model';

	type DocData = {
		id: string;
		title: string;
		content: string | null;
		description?: string | null;
		state_key: string;
		type_key?: string | null;
		updated_at: string;
		created_at?: string;
	};
	type TaskData = {
		id: string;
		title: string;
		description: string | null;
		state_key: string;
		priority: number | null;
		due_at: string | null;
		start_at: string | null;
		updated_at: string;
		created_at?: string;
		completed_at?: string | null;
		props?: Record<string, unknown> | null;
		assignees?: { actor_id?: string | null; name?: string | null; email?: string | null }[];
	};
	type GoalData = {
		id: string;
		name: string;
		description: string | null;
		state_key: string;
		target_date: string | null;
		props?: { priority?: string | null; description?: string | null } | null;
		updated_at: string;
		created_at?: string;
	};
	/** A doc made for the task, as listed under it (it opens here). */
	type TaskDocSummary = { id: string; title: string; state_key: string };
	type Loaded = {
		key: string;
		doc?: DocData;
		task?: TaskData;
		goal?: GoalData;
		/** Read with the task, in the same request. */
		taskDocs: TaskDocSummary[];
		revision: string | null;
	};

	let {
		item,
		projectId,
		canWrite,
		order,
		fallbackTitle,
		layout,
		listShown,
		canShowList = true,
		chatOn,
		phone,
		detent = 'peek',
		reloadKey = 0,
		seed = null,
		pageLink = true,
		onClose,
		onStep,
		onOpen,
		onToggleFocus,
		onToggleList,
		onChat,
		onChanged,
		onDetent,
		onTableShown,
		projectName = null,
		onTaskState
	}: {
		item: ReaderItem;
		projectId: string;
		canWrite: boolean;
		/** Ids of this item's kind in the card's order, for Prev/Next. */
		order: readonly string[];
		/** The list's title for the item, shown while it loads. */
		fallbackTitle: string;
		layout: ReaderLayout;
		listShown: boolean;
		/** False where there is no list to bring back (the reader always reads across). */
		canShowList?: boolean;
		chatOn: boolean;
		phone: boolean;
		detent?: SheetDetent;
		/** Bumped when something else (chat, a move) may have changed the item. */
		reloadKey?: number;
		/** The item's first read, already made by the page (its own route). */
		seed?: Record<string, unknown> | null;
		/** False on the item's own page: there is no fuller page to open. */
		pageLink?: boolean;
		onClose: () => void;
		onStep: (id: string) => void;
		/** Open another item here (a doc made for the open task). */
		onOpen?: (item: ReaderItem) => void;
		onToggleFocus: () => void;
		onToggleList: () => void;
		onChat: () => void;
		/** A task or goal changed: the card list and tiles should catch up. */
		onChanged: () => void;
		onDetent?: (detent: SheetDetent) => void;
		/** A table opened: the card gives it the full width (Focus) for this item. */
		onTableShown?: (id: string) => void;
		/** Shown (and linked) in the header where items from many projects are read (Today). */
		projectName?: string | null;
		/** A host that tracks task state itself hears it here instead of through onChanged. */
		onTaskState?: (id: string, state: string, previous: string) => void;
	} = $props();

	const word = $derived(KIND_WORD[item.kind]);
	const key = $derived(`${item.kind}:${item.id}`);
	const near = $derived(neighbors(order, item.id));
	const prose = getProseClasses('sm');

	// ---------- Loading ----------

	function fromPayload(k: string, data: Record<string, any>): Loaded {
		return {
			key: k,
			doc: data.document,
			task: data.task,
			goal: data.goal,
			taskDocs: Array.isArray(data.task_documents) ? data.task_documents : [],
			revision: data.editor_revision ?? null
		};
	}

	let loaded = $state<Loaded | null>(untrack(() => (seed ? fromPayload(key, seed) : null)));
	// The seeded item skips its first read; a reload still reads it fresh.
	let seededKey: string | null = untrack(() => (seed ? key : null));
	let loadError = $state('');
	let reloadTick = $state(0);
	const current = $derived(loaded?.key === key ? loaded : null);

	$effect(() => {
		const k = key;
		const { kind, id } = item;
		void reloadKey;
		void reloadTick;
		if (seededKey === k) {
			seededKey = null;
			return;
		}
		seededKey = null;
		// An open editor keeps its text; it saves against the version it opened.
		if (untrack(() => (editing || titleEditing) && loaded?.key === k)) return;
		const controller = new AbortController();
		loadError = '';
		fetchEntityModalData(kind, id, controller.signal, { withTaskDocuments: true })
			.then(async (response) => {
				const payload = await response.json().catch(() => null);
				if (!response.ok) throw new Error(payload?.error || `Could not load this ${word}.`);
				loaded = fromPayload(k, payload?.data ?? {});
			})
			.catch((cause) => {
				if (controller.signal.aborted) return;
				loadError = cause instanceof Error ? cause.message : `Could not load this ${word}.`;
			});
		return () => controller.abort();
	});

	const title = $derived(
		current?.doc?.title ?? current?.task?.title ?? current?.goal?.name ?? fallbackTitle
	);
	// People, organizations and places in the task's words open a card; key details sit on top.
	const taskEntities = new TaskEntities(() => ({
		taskId: current?.task?.id ?? null,
		title: current?.task?.title ?? '',
		description: current?.task?.description ?? null
	}));

	// ---------- Tables ----------

	// A table is a document whose body is a grid; it never opens the text editor.
	const isTable = $derived(Boolean(current?.doc && isTableTypeKey(current.doc.type_key)));
	type WorkspaceComponent = typeof import('$lib/components/tables/TableWorkspace.svelte').default;
	let Workspace = $state<WorkspaceComponent | null>(null);
	let tableShownKey = '';

	$effect(() => {
		if (!isTable) return;
		const k = key;
		untrack(() => {
			if (tableShownKey === k) return;
			tableShownKey = k;
			if (phone) onDetent?.('full');
			else onTableShown?.(item.id);
		});
		if (!Workspace) {
			void import('$lib/components/tables/TableWorkspace.svelte').then(
				(module) => (Workspace = module.default)
			);
		}
	});

	function askAboutTable() {
		if (!chatOn) onChat();
	}

	// "Make live table" on a markdown table in a doc being read.
	let liftingTable = false;
	async function handleMakeLiveTable(click: MakeLiveTableClick) {
		const doc = current?.doc;
		const k = key;
		if (!doc || !canWrite || liftingTable || editing) return;
		liftingTable = true;
		click.button.disabled = true;
		click.button.textContent = 'Making table…';
		try {
			const { makeLiveTable } = await import(
				'$lib/components/table-surfaces/make-live-table'
			);
			const result = await makeLiveTable({
				projectId,
				documentId: doc.id,
				documentTitle: doc.title,
				content: doc.content ?? '',
				renderedIndex: click.renderedIndex,
				renderedHeaders: click.renderedHeaders
			});
			const payload: Record<string, unknown> = {
				content: result.content,
				expected_updated_at: doc.updated_at
			};
			if (current?.revision) payload.expected_editor_revision = current.revision;
			const response = await fetch(`/api/onto/documents/${doc.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const saved = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(
					response.status === 409
						? 'The table was made, but this doc changed somewhere else, so it still shows the old text. Reload and replace it with the embed.'
						: saved?.error || 'The table was made, but this doc could not be updated.'
				);
			}
			const next = saved?.data?.document as Partial<DocData> | undefined;
			if (loaded?.key === k && loaded.doc) {
				loaded = {
					...loaded,
					doc: { ...loaded.doc, ...next, content: result.content },
					revision: saved?.data?.editor_revision ?? null
				};
			}
			toastService.success('Live table made. It sits under this doc.');
			onChanged();
		} catch (cause) {
			toastService.error(
				cause instanceof Error ? cause.message : 'Could not make the table.'
			);
			click.button.disabled = false;
			click.button.textContent = 'Make live table';
		} finally {
			liftingTable = false;
		}
	}

	// The editor's "Table" button: pick a table and embed it at the cursor.
	let tablePickerOpen = $state(false);
	let editorApi = $state<{ insertAtCursor: (markdown: string) => Promise<void> } | null>(null);
	function insertTableEmbed(table: { id: string }) {
		tablePickerOpen = false;
		void editorApi?.insertAtCursor(tableEmbedInsertion(table.id));
	}

	// ---------- Editing ----------

	// The pencil (E) makes the open item's words editable in place: its title,
	// and a doc's body or a task's or goal's description. Edits autosave; a doc
	// saves against the version it opened (the doc modal's conflict check).
	type SaveState = 'saved' | 'unsaved' | 'saving' | 'conflict' | 'error';
	type PendingSave = {
		kind: ReaderItem['kind'];
		id: string;
		title: string;
		body: string;
		overwrite: boolean;
	};
	const ENDPOINT: Record<ReaderItem['kind'], string> = {
		document: 'documents',
		task: 'tasks',
		goal: 'goals'
	};
	let editing = $state(false);
	let editingKey = '';
	let draft = $state('');
	let titleDraft = $state('');
	// What the server last took, so a save sends only what changed.
	let savedTitle = '';
	let savedBody = '';
	let saveState = $state<SaveState>('saved');
	let serverUpdatedAt: string | null = null;
	let serverRevision: string | null = null;
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingSave: PendingSave | null = null;
	let inFlight = false;
	const SAVE_DEBOUNCE_MS = 1500;

	type EditorComponent = typeof import('$lib/components/ui/RichMarkdownEditor.svelte').default;
	let Editor = $state<EditorComponent | null>(null);

	const canEdit = $derived(canWrite && Boolean(current) && !isTable);

	function goalDescription(goal: GoalData): string {
		return goal.description ?? goal.props?.description ?? '';
	}

	// Two edits, apart: the title (its pencil, in the header) and the body or
	// description (the Edit tab on the text). One session and one save path
	// serve both, so a save sends only what changed.
	let titleEditing = $state(false);
	let titleInput = $state<HTMLInputElement | null>(null);

	/** Open a session on the open item, or join the one already open. */
	function beginSession(): boolean {
		if (editing || titleEditing) return editingKey === key;
		const open = current;
		if (!open || !canWrite || isTable) return false;
		if (open.doc) {
			draft = open.doc.content ?? '';
			titleDraft = open.doc.title ?? '';
			serverUpdatedAt = open.doc.updated_at;
			serverRevision = open.revision ?? null;
		} else if (open.task) {
			draft = open.task.description ?? '';
			titleDraft = open.task.title ?? '';
		} else if (open.goal) {
			draft = goalDescription(open.goal);
			titleDraft = open.goal.name ?? '';
		} else {
			return false;
		}
		savedTitle = titleDraft;
		savedBody = draft;
		saveState = 'saved';
		editingKey = key;
		return true;
	}

	function endSessionIfIdle() {
		if (!editing && !titleEditing) editingKey = '';
	}

	// The editor's code loads when the pointer reaches Edit, so the switch is instant.
	function preloadEditor() {
		if (!Editor) {
			void import('$lib/components/ui/RichMarkdownEditor.svelte').then(
				(module) => (Editor ??= module.default)
			);
		}
	}

	/** The text's Edit tab (or E): the body or description becomes the editor. */
	async function startEdit() {
		if (editing || !beginSession()) return;
		editing = true;
		if (phone) onDetent?.('full');
		Editor ??= (await import('$lib/components/ui/RichMarkdownEditor.svelte')).default;
	}

	function scheduleSave() {
		if (!(editing || titleEditing) || saveState === 'conflict') return;
		saveState = 'unsaved';
		pendingSave = {
			kind: item.kind,
			id: item.id,
			title: titleDraft,
			body: draft,
			overwrite: false
		};
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
	}

	async function flush() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = null;
		if (inFlight) {
			saveTimer = setTimeout(() => void flush(), 400);
			return;
		}
		const next = pendingSave;
		pendingSave = null;
		if (!next) return;
		const isDoc = next.kind === 'document';
		const nextKey = `${next.kind}:${next.id}`;
		// A title can't be emptied here; an empty one keeps the last saved title.
		const title = next.title.trim();
		const titleChanged = Boolean(title) && title !== savedTitle.trim();
		const bodyChanged = next.overwrite || next.body !== savedBody;
		const payload: Record<string, unknown> = {};
		if (titleChanged) payload[next.kind === 'goal' ? 'name' : 'title'] = title;
		if (bodyChanged) payload[isDoc ? 'content' : 'description'] = next.body;
		if (!titleChanged && !bodyChanged) {
			saveState = 'saved';
			return;
		}
		if (isDoc && !next.overwrite && serverUpdatedAt) {
			payload.expected_updated_at = serverUpdatedAt;
			if (serverRevision) payload.expected_editor_revision = serverRevision;
		}
		inFlight = true;
		saveState = 'saving';
		try {
			const response = await fetch(`/api/onto/${ENDPOINT[next.kind]}/${next.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const result = await response.json().catch(() => null);
			if (isDoc && response.status === 409) {
				saveState = 'conflict';
				return;
			}
			if (!response.ok) {
				throw new Error(result?.error || `Could not save this ${KIND_WORD[next.kind]}.`);
			}
			const stillEditing = editingKey === nextKey;
			if (stillEditing) {
				if (titleChanged) savedTitle = title;
				if (bodyChanged) savedBody = next.body;
			}
			if (isDoc && stillEditing) {
				const doc = result?.data?.document as Partial<DocData> | undefined;
				if (doc?.updated_at) serverUpdatedAt = doc.updated_at;
				serverRevision = result?.data?.editor_revision ?? null;
			}
			mergeSaved(nextKey, result?.data, {
				title: titleChanged ? title : undefined,
				body: bodyChanged ? next.body : undefined
			});
			saveState = pendingSave ? 'unsaved' : 'saved';
			// A new title shows in the list too.
			if (titleChanged) onChanged();
		} catch (cause) {
			saveState = 'error';
			toastService.error(
				cause instanceof Error
					? cause.message
					: `Could not save this ${KIND_WORD[next.kind]}.`
			);
		} finally {
			inFlight = false;
		}
	}

	/** Fold a save into what the reader shows (the server's row, then what was sent). */
	function mergeSaved(
		k: string,
		data: Record<string, any> | null | undefined,
		sent: { title?: string; body?: string }
	) {
		if (loaded?.key !== k) return;
		if (loaded.doc) {
			loaded = {
				...loaded,
				doc: {
					...loaded.doc,
					...(data?.document ?? {}),
					...(sent.title !== undefined ? { title: sent.title } : {}),
					...(sent.body !== undefined ? { content: sent.body } : {})
				},
				revision: data?.editor_revision ?? null
			};
		} else if (loaded.task) {
			loaded = {
				...loaded,
				task: {
					...loaded.task,
					...(data?.task ?? {}),
					...(sent.title !== undefined ? { title: sent.title } : {}),
					...(sent.body !== undefined ? { description: sent.body } : {})
				}
			};
		} else if (loaded.goal) {
			loaded = {
				...loaded,
				goal: {
					...loaded.goal,
					...(data?.goal ?? {}),
					...(sent.title !== undefined ? { name: sent.title } : {}),
					...(sent.body !== undefined ? { description: sent.body } : {})
				}
			};
		}
	}

	/** Back to Preview: save, then show the text as it reads. */
	async function finishEdit() {
		await flush();
		if (saveState === 'conflict' || saveState === 'error') return;
		editing = false;
		endSessionIfIdle();
	}

	/** The title's pencil: only the title becomes editable. */
	async function startTitleEdit() {
		if (titleEditing || !beginSession()) return;
		titleEditing = true;
		await tick();
		titleInput?.focus();
		titleInput?.select();
	}

	async function finishTitleEdit() {
		if (!titleEditing) return;
		titleEditing = false;
		await flush();
		endSessionIfIdle();
	}

	function cancelTitleEdit() {
		titleDraft = savedTitle;
		titleEditing = false;
		if (pendingSave) pendingSave = { ...pendingSave, title: savedTitle };
		endSessionIfIdle();
	}

	function keepMine() {
		pendingSave = {
			kind: item.kind,
			id: item.id,
			title: titleDraft,
			body: draft,
			overwrite: true
		};
		saveState = 'unsaved';
		void flush();
	}

	function takeLatest() {
		pendingSave = null;
		editing = false;
		titleEditing = false;
		editingKey = '';
		saveState = 'saved';
		reloadTick += 1;
	}

	function titleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void finishTitleEdit();
		} else if (event.key === 'Escape') {
			// Esc here only cancels the rename; the reader stays open.
			event.preventDefault();
			event.stopPropagation();
			cancelTitleEdit();
		}
	}

	// Moving to another item saves the open edit first.
	$effect(() => {
		const k = key;
		untrack(() => {
			if ((editing || titleEditing) && editingKey && editingKey !== k) {
				void flush();
				editing = false;
				titleEditing = false;
				editingKey = '';
			}
		});
	});

	const SAVE_LABEL: Record<SaveState, string> = {
		saved: 'Saved',
		unsaved: 'Unsaved changes',
		saving: 'Saving…',
		conflict: 'Not saved',
		error: 'Not saved'
	};

	// ---------- Facts: one click, no edit mode ----------

	let taskBusy = $state(false);
	// The full editors stay one click away ("All details") for what the reader
	// doesn't carry: assignees, repeats, tags, links, comments, activity.
	// 'task-doc' starts a doc for the open task.
	let detailEditor = $state<'task' | 'goal' | 'document' | 'task-doc' | null>(null);

	async function openDetails() {
		if (titleEditing) await finishTitleEdit();
		if (editing) await finishEdit();
		if (editing) return;
		detailEditor = item.kind;
	}

	// The docs made for a task (its old Workspace tab) come with the task's read.
	const taskDocList = $derived(current?.taskDocs ?? []);

	type EntitySlot = 'doc' | 'task' | 'goal';
	const SLOT: Record<ReaderItem['kind'], EntitySlot> = {
		document: 'doc',
		task: 'task',
		goal: 'goal'
	};

	/**
	 * Change a few fields now and save them behind the scenes: `shown` is how
	 * the change reads until the server answers with its own values.
	 */
	async function patchFacts(fields: Record<string, unknown>, shown: Record<string, unknown>) {
		const open = current;
		if (!open || !canWrite) return;
		const { kind, id } = item;
		const k = key;
		const slot = SLOT[kind];
		const before = open[slot] as Record<string, unknown> | undefined;
		if (!before) return;
		const keys = Object.keys(shown);
		const apply = (patch: Record<string, unknown>) => {
			if (loaded?.key !== k) return;
			const entity = loaded[slot] as Record<string, unknown> | undefined;
			if (entity) loaded = { ...loaded, [slot]: { ...entity, ...patch } } as Loaded;
		};
		apply(shown);
		try {
			const response = await fetch(`/api/onto/${ENDPOINT[kind]}/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(fields)
			});
			const result = await response.json().catch(() => null);
			if (!response.ok) throw new Error(result?.error || `Could not update this ${word}.`);
			const saved = result?.data?.[kind === 'document' ? 'document' : kind];
			if (saved && typeof saved === 'object') {
				apply(
					Object.fromEntries(
						[...keys, 'updated_at']
							.filter((field) => field in saved)
							.map((field) => [field, saved[field]])
					)
				);
			}
			onChanged();
		} catch (cause) {
			apply(Object.fromEntries(keys.map((field) => [field, before[field]])));
			toastService.error(
				cause instanceof Error ? cause.message : `Could not update this ${word}.`
			);
		}
	}

	function setDate(field: 'start_at' | 'due_at' | 'target_date', value: string | null) {
		void patchFacts(
			{ [field]: value },
			{ [field]: optimisticTimestamp(value, field === 'start_at' ? 'start' : 'end') }
		);
	}

	async function setTaskState(next: string) {
		const task = current?.task;
		if (!task || !canWrite || taskBusy || task.state_key === next) return;
		const previous = task.state_key;
		const k = key;
		const patch = (state_key: string) => {
			if (loaded?.key === k && loaded.task)
				loaded = { ...loaded, task: { ...loaded.task, state_key } };
		};
		taskBusy = true;
		patch(next);
		try {
			const response = await fetch(`/api/onto/tasks/${task.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ state_key: next })
			});
			const result = await response.json().catch(() => null);
			if (!response.ok) throw new Error(result?.error || 'Could not update this task.');
			if (next === 'done') toastService.success('Marked done.');
			if (onTaskState) onTaskState(task.id, next, previous);
			else onChanged();
		} catch (cause) {
			patch(previous);
			toastService.error(
				cause instanceof Error ? cause.message : 'Could not update this task.'
			);
		} finally {
			taskBusy = false;
		}
	}

	function detailsChanged() {
		reloadTick += 1;
		onChanged();
	}

	// ---------- Details panel ----------

	// What the full editors keep in their drawer (assignees, links, comments,
	// activity…) opens beside the item. Open or shut is remembered here.
	const DETAILS_KEY = 'buildos:reader-details-open';
	function readDetailsOpen(): boolean {
		try {
			return localStorage.getItem(DETAILS_KEY) === '1';
		} catch {
			return false;
		}
	}
	let detailsOpen = $state(readDetailsOpen());
	type DetailsComponent = typeof import('./ReaderDetailsPanel.svelte').default;
	let DetailsPanel = $state<DetailsComponent | null>(null);
	$effect(() => {
		if (detailsOpen && !DetailsPanel) {
			void import('./ReaderDetailsPanel.svelte').then(
				(module) => (DetailsPanel = module.default)
			);
		}
	});
	const showDetails = $derived(detailsOpen && Boolean(current) && !isTable);

	function toggleDetails() {
		detailsOpen = !detailsOpen;
		try {
			localStorage.setItem(DETAILS_KEY, detailsOpen ? '1' : '0');
		} catch {
			// Storage can be off (private mode); the panel still opens.
		}
	}

	async function saveAssignees(actorIds: string[]): Promise<boolean> {
		const task = current?.task;
		if (!task || !canWrite) return false;
		const k = key;
		try {
			const response = await fetch(`/api/onto/tasks/${task.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assignee_actor_ids: actorIds })
			});
			const result = await response.json().catch(() => null);
			if (!response.ok) throw new Error(result?.error || 'Could not change the assignees.');
			const saved = result?.data?.task;
			if (saved && loaded?.key === k && loaded.task) {
				loaded = {
					...loaded,
					task: {
						...loaded.task,
						assignees: saved.assignees ?? loaded.task.assignees,
						updated_at: saved.updated_at ?? loaded.task.updated_at
					}
				};
			}
			onChanged();
			return true;
		} catch (cause) {
			toastService.error(
				cause instanceof Error ? cause.message : 'Could not change the assignees.'
			);
			return false;
		}
	}

	// A linked doc, task or goal opens here; a plan opens its editor.
	let linkedPlanId = $state<string | null>(null);
	function openLinked(kind: string, id: string) {
		if (kind === 'task' || kind === 'document' || kind === 'goal') onOpen?.({ kind, id });
		else if (kind === 'plan') linkedPlanId = id;
	}

	// ---------- Archive / delete (bottom left) ----------

	// The item leaves at once and the reader moves to the next one; the change
	// is sent after the Undo window (see reader-removals).
	const removal = $derived(removalFor(item.kind, item.id));
	let leaving = $state(false);
	let arriving = $state(false);
	let mounted = true;
	$effect(() => () => {
		mounted = false;
	});

	function pause(ms: number): Promise<void> {
		return new Promise((done) => setTimeout(done, prefersReducedMotion.current ? 0 : ms));
	}

	async function removeItem() {
		if (!canWrite || !current || leaving) return;
		if (titleEditing) await finishTitleEdit();
		if (editing) await finishEdit();
		if (editing) return;
		const target: ReaderItem = { kind: item.kind, id: item.id };
		const action = removalFor(target.kind, target.id);
		const nextId = near.next ?? near.prev;
		const name = title.trim() || 'Untitled';
		leaving = true;
		removeWithUndo({
			id: target.id,
			message: `${action.done} “${name}”`,
			failMessage: `Could not ${action.label.toLowerCase()} “${name}”. It's back in the list.`,
			request: action.request,
			// Undo brings it back where you were reading.
			onUndo: () => {
				if (mounted) onOpen?.(target);
			},
			onSent: onChanged
		});
		await pause(160);
		leaving = false;
		if (!nextId) {
			onClose();
			return;
		}
		arriving = true;
		onStep(nextId);
		await pause(220);
		arriving = false;
	}

	// ---------- Shared ----------

	// Goals have no page of their own yet; theirs is the project page.
	function fullPageHref(target: ReaderItem): string {
		if (target.kind === 'document')
			return resolve('/projects/[id]/documents/[document_id]', {
				id: projectId,
				document_id: target.id
			});
		if (target.kind === 'task')
			return resolve('/projects/[id]/tasks/[task_id]', { id: projectId, task_id: target.id });
		return resolve('/projects/[id]', { id: projectId });
	}
	const pageHref = $derived(fullPageHref(item));

	function shortDate(value: string | null | undefined): string {
		if (!value) return '';
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? ''
			: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function stateLabel(value: string): string {
		const task = TASK_STATES.find((entry) => entry.key === value);
		if (task) return task.label;
		return value.replace(/_/g, ' ');
	}

	const overdue = $derived(
		Boolean(
			current?.task?.due_at &&
				current.task.state_key !== 'done' &&
				Date.parse(current.task.due_at) < Date.now()
		)
	);

	/** The reader's own keys; the card asks first and stops when one is used. */
	export function handleKey(event: KeyboardEvent): boolean {
		if (event.key === 'Escape' && editing) {
			void finishEdit();
			return true;
		}
		if ((event.key === 'd' || event.key === 'D') && current && !isTable) {
			toggleDetails();
			return true;
		}
		if ((event.key === 'e' || event.key === 'E') && !editing && canEdit) {
			void startEdit();
			return true;
		}
		return false;
	}

	/** Save an open edit (before the card closes the reader). */
	export function settle(): Promise<void> {
		return flush();
	}
</script>

<div class="reader" class:phone>
	{#if phone}
		<div class="grab" data-sheet-drag aria-hidden="true"><span></span></div>
	{/if}
	<header class="head" data-sheet-drag={phone ? '' : undefined}>
		{#if !phone && canShowList}
			<button
				type="button"
				class="ib"
				onclick={onToggleList}
				title="{listShown ? 'Hide' : 'Show'} the list"
				aria-label="{listShown ? 'Hide' : 'Show'} the list"
				aria-pressed={listShown}
			>
				{#if listShown}<PanelLeftClose class="h-4 w-4" />{:else}<PanelLeftOpen
						class="h-4 w-4"
					/>{/if}
			</button>
		{/if}
		<span class="glyph" class:goal={item.kind === 'goal'}>
			{#if isTable}<Table class="h-4 w-4" />{:else if item.kind === 'document'}<FileText
					class="h-4 w-4"
				/>{:else if item.kind === 'goal'}<Target class="h-4 w-4" />{:else}<Circle
					class="h-4 w-4"
				/>{/if}
		</span>
		<div class="min-w-0 flex-1">
			{#if titleEditing}
				<input
					bind:this={titleInput}
					class="title title-input"
					bind:value={titleDraft}
					oninput={scheduleSave}
					onkeydown={titleKeydown}
					onblur={() => void finishTitleEdit()}
					placeholder="{word[0]?.toUpperCase()}{word.slice(1)} title"
					aria-label="{word[0]?.toUpperCase()}{word.slice(1)} title"
					maxlength={500}
				/>
			{:else}
				<div class="title-row">
					<h3 class="title">
						{#if current?.task}<TaskMentionText
								text={title}
								entities={taskEntities}
							/>{:else}{title}{/if}
					</h3>
					{#if canEdit}
						<button
							type="button"
							class="title-pencil"
							onclick={() => void startTitleEdit()}
							aria-label="Rename this {word}"
							title="Rename"
						>
							<Pencil class="h-3.5 w-3.5" />
						</button>
					{/if}
				</div>
			{/if}
			<div class="meta">
				{#if current?.doc}<span>Updated {shortDate(current.doc.updated_at)}</span>{/if}
				{#if current?.task?.due_at}<span class:due-late={overdue}
						>Due {shortDate(current.task.due_at)}</span
					>{/if}
				{#if projectName}
					<a
						href={resolve('/projects/[id]', { id: projectId })}
						class="meta-link project-link"
						onclick={() => void flush()}
						title="Open {projectName}"
					>
						<FolderKanban class="h-3 w-3 shrink-0" aria-hidden="true" />
						<span class="truncate">{projectName}</span>
					</a>
				{/if}
			</div>
		</div>
		{#if phone}
			<button
				type="button"
				class="ib"
				onclick={() => onDetent?.(detent === 'full' ? 'peek' : 'full')}
				aria-label={detent === 'full' ? 'Shrink' : 'Expand'}
			>
				{#if detent === 'full'}<ChevronDown class="h-5 w-5" />{:else}<ChevronUp
						class="h-5 w-5"
					/>{/if}
			</button>
			<button type="button" class="ib" onclick={onClose} aria-label="Close">
				<X class="h-5 w-5" />
			</button>
		{:else}
			<div class="tools">
				<button
					type="button"
					class="ib"
					disabled={!near.prev}
					onclick={() => near.prev && onStep(near.prev)}
					title="Previous (K)"
					aria-label="Previous {word}"
				>
					<ChevronUp class="h-4 w-4" />
				</button>
				{#if near.index >= 0}
					<span class="pos">{near.index + 1} / {near.total}</span>
				{/if}
				<button
					type="button"
					class="ib"
					disabled={!near.next}
					onclick={() => near.next && onStep(near.next)}
					title="Next (J)"
					aria-label="Next {word}"
				>
					<ChevronDown class="h-4 w-4" />
				</button>
				<span class="sep" aria-hidden="true"></span>
				<button
					type="button"
					class="ib"
					onclick={onChat}
					aria-pressed={chatOn}
					title="Chat about this {word}"
					aria-label="Chat about this {word}"
				>
					<img src="/brain-bolt.webp" alt="" class="h-5 w-5 rounded object-cover" />
				</button>
				{#if canShowList}
					<button
						type="button"
						class="ib"
						onclick={onToggleFocus}
						aria-pressed={layout === 'focus' && !listShown}
						title={layout === 'focus' ? 'Back to split (F)' : 'Focus (F)'}
						aria-label={layout === 'focus' ? 'Back to split' : 'Focus'}
					>
						{#if layout === 'focus'}<Minimize2 class="h-4 w-4" />{:else}<Maximize2
								class="h-4 w-4"
							/>{/if}
					</button>
				{/if}
				{#if pageLink}
					<a
						href={pageHref}
						class="ib"
						onclick={() => void flush()}
						data-sveltekit-preload-data="hover"
						title="Open the full page"
						aria-label="Open the full page"
					>
						<ArrowUpRight class="h-4 w-4" />
					</a>
				{/if}
				<button
					type="button"
					class="ib"
					onclick={onClose}
					title="Close (Esc)"
					aria-label="Close"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		{/if}
	</header>

	<div class="main">
		<div
			class="body"
			class:table-body={isTable}
			class:across={!phone && !listShown}
			class:leaving
			class:arriving
			data-autoscroll
		>
			{#if !current}
				{#if loadError}
					<div class="note" role="alert">
						<span>{loadError}</span>
						<button type="button" class="act" onclick={() => (reloadTick += 1)}>
							<RefreshCw class="h-3.5 w-3.5" /> Try again
						</button>
					</div>
				{:else}
					<div class="grid gap-2" aria-busy="true" aria-label="Loading">
						<div
							class="h-6 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none"
						></div>
						{#each [0, 1, 2, 3, 4] as index (index)}
							<div
								class="h-4 animate-pulse rounded bg-muted motion-reduce:animate-none"
							></div>
						{/each}
					</div>
				{/if}
			{:else if current.doc && isTable}
				{#if Workspace}
					<Workspace
						documentId={current.doc.id}
						{projectId}
						layout={phone ? 'sheet' : 'panel'}
						readonly={!canWrite}
						onAsk={askAboutTable}
					/>
				{:else}
					<div
						class="m-4 h-64 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
						aria-busy="true"
						aria-label="Loading table"
					></div>
				{/if}
			{:else if current.doc}
				{@const doc = current.doc}
				<div class="lead">
					<div class="facts">
						<ReaderChip
							label={optionLabel(
								DOC_STATES,
								doc.state_key,
								stateLabel(doc.state_key)
							)}
							title="Doc state"
							editable={canWrite}
							disabled={editing}
						>
							{#snippet picker(close: () => void)}
								{#each DOC_STATES as option (option.value)}
									<button
										type="button"
										class="opt"
										aria-pressed={doc.state_key === option.value}
										onclick={() => {
											close();
											if (doc.state_key !== option.value)
												void patchFacts(
													{ state_key: option.value },
													{ state_key: option.value }
												);
										}}>{option.label}</button
									>
								{/each}
							{/snippet}
						</ReaderChip>
					</div>
					{@render editControl()}
				</div>
				{#snippet docText()}
					{#if doc.content?.trim()}
						{@const bodyHtml = renderDocumentMarkdown(doc.content, { projectId })}
						<div
							class="{prose} text-foreground"
							{@attach documentEmbeds({
								projectId,
								html: bodyHtml,
								onMakeLiveTable: canWrite ? handleMakeLiveTable : undefined,
								onOpenTable: (tableId) => onStep(tableId)
							})}
						>
							{@html bodyHtml}
						</div>
					{:else if canEdit}
						<button type="button" class="add-words" onclick={() => void startEdit()}>
							<Pencil class="h-3.5 w-3.5" /> This doc is empty. Start writing
						</button>
					{:else}
						<p class="muted">This doc is empty.</p>
					{/if}
				{/snippet}
				{@render textFrame(true, docText)}
			{:else if current.task}
				{@const task = current.task}
				<div class="lead">
					<div class="states" role="group" aria-label="Task state">
						{#each TASK_STATES as entry (entry.key)}
							<button
								type="button"
								class="state-{entry.key}"
								aria-pressed={task.state_key === entry.key}
								disabled={!canWrite || taskBusy}
								onclick={() => setTaskState(entry.key)}
							>
								{#if entry.key === 'done'}<CircleCheck
										class="h-3.5 w-3.5"
									/>{:else if entry.key === 'in_progress'}<CircleDot
										class="h-3.5 w-3.5"
									/>{:else if entry.key === 'blocked'}<CircleSlash
										class="h-3.5 w-3.5"
									/>{:else}<Circle class="h-3.5 w-3.5" />{/if}
								{entry.label}
							</button>
						{/each}
					</div>
					{@render editControl()}
				</div>
				<div class="facts">
					{#if canWrite || task.priority != null}
						<ReaderChip
							label={task.priority != null
								? taskPriorityLabel(task.priority)
								: '+ Priority'}
							empty={task.priority == null}
							title="Priority"
							editable={canWrite}
						>
							{#snippet picker(close: () => void)}
								{#each TASK_PRIORITIES as option (option.value)}
									<button
										type="button"
										class="opt"
										aria-pressed={task.priority === option.value}
										onclick={() => {
											close();
											if (task.priority !== option.value)
												void patchFacts(
													{ priority: option.value },
													{ priority: option.value }
												);
										}}
										>{option.label}<span class="opt-note">{option.note}</span
										></button
									>
								{/each}
							{/snippet}
						</ReaderChip>
					{/if}
					{#if canWrite || task.start_at}
						<ReaderChip
							label={task.start_at
								? `Starts ${shortDate(task.start_at)}`
								: '+ Start date'}
							empty={!task.start_at}
							title="Start date"
							editable={canWrite}
						>
							{#snippet picker(close: () => void)}
								{@render datePicker(close, task.start_at, (value) =>
									setDate('start_at', value)
								)}
							{/snippet}
						</ReaderChip>
					{/if}
					{#if canWrite || task.due_at}
						<ReaderChip
							label={task.due_at
								? `Due ${shortDate(task.due_at)}${overdue ? ' · overdue' : ''}`
								: '+ Due date'}
							empty={!task.due_at}
							late={overdue}
							title="Due date"
							editable={canWrite}
						>
							{#snippet picker(close: () => void)}
								{@render datePicker(close, task.due_at, (value) =>
									setDate('due_at', value)
								)}
							{/snippet}
						</ReaderChip>
					{/if}
					<span class="tag">Updated {shortDate(task.updated_at)}</span>
				</div>
				{#if !editing}
					<TaskKeyDetails
						chips={taskEntities.keyChips}
						entities={taskEntities}
						class="-mt-2 mb-4"
					/>
				{/if}
				{#snippet taskText()}
					{#if task.description?.trim()}
						{@const descriptionHtml = renderTaskMarkdown(task.description)}
						<div
							class="{prose} text-foreground"
							{@attach entityMentions({
								html: descriptionHtml,
								targets: taskEntities.targets,
								onOpen: (id, trigger) => taskEntities.openCardFor(id, trigger)
							})}
						>
							{@html descriptionHtml}
						</div>
					{:else if canEdit}
						<button type="button" class="add-words" onclick={() => void startEdit()}>
							<Pencil class="h-3.5 w-3.5" /> Add a description
						</button>
					{:else}
						<p class="muted">No description.</p>
					{/if}
				{/snippet}
				{@render textFrame(false, taskText)}
				<section class="task-docs" aria-label="Docs for this task">
					<div class="task-docs-head">
						<span class="micro">Docs for this task</span>
						{#if taskDocList.length}<span class="count">{taskDocList.length}</span>{/if}
						{#if canWrite}
							<button
								type="button"
								class="act"
								onclick={() => (detailEditor = 'task-doc')}
							>
								<FilePlus class="h-3.5 w-3.5" /> New doc
							</button>
						{/if}
					</div>
					{#if taskDocList.length}
						<ul>
							{#each taskDocList as entry (entry.id)}
								<li>
									<button
										type="button"
										onclick={() => onOpen?.({ kind: 'document', id: entry.id })}
									>
										<FileText class="h-4 w-4 shrink-0 text-muted-foreground" />
										<span class="truncate">{entry.title || 'Untitled'}</span>
										{#if entry.state_key}
											<span class="tag">{stateLabel(entry.state_key)}</span>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="muted">
							None yet. Notes, drafts and research for this task live here.
						</p>
					{/if}
				</section>
			{:else if current.goal}
				{@const goal = current.goal}
				{@const description = goalDescription(goal)}
				{@const goalPriority = goal.props?.priority ?? null}
				<div class="facts lead">
					<ReaderChip
						label={optionLabel(GOAL_STATES, goal.state_key, stateLabel(goal.state_key))}
						title="Goal state"
						editable={canWrite}
					>
						{#snippet picker(close: () => void)}
							{#each GOAL_STATES as option (option.value)}
								<button
									type="button"
									class="opt"
									aria-pressed={goal.state_key === option.value}
									onclick={() => {
										close();
										if (goal.state_key !== option.value)
											void patchFacts(
												{ state_key: option.value },
												{ state_key: option.value }
											);
									}}>{option.label}</button
								>
							{/each}
						{/snippet}
					</ReaderChip>
					{#if canWrite || goalPriority}
						<ReaderChip
							label={goalPriority
								? `${optionLabel(GOAL_PRIORITIES, goalPriority, goalPriority)} priority`
								: '+ Priority'}
							empty={!goalPriority}
							title="Priority"
							editable={canWrite}
						>
							{#snippet picker(close: () => void)}
								{#each GOAL_PRIORITIES as option (option.value)}
									<button
										type="button"
										class="opt"
										aria-pressed={goalPriority === option.value}
										onclick={() => {
											close();
											if (goalPriority !== option.value)
												void patchFacts(
													{ priority: option.value },
													{
														props: {
															...(goal.props ?? {}),
															priority: option.value
														}
													}
												);
										}}>{option.label}</button
									>
								{/each}
							{/snippet}
						</ReaderChip>
					{/if}
					<ReaderChip
						label={goal.target_date
							? `Target ${shortDate(goal.target_date)}`
							: canWrite
								? '+ Target date'
								: 'No target date'}
						empty={!goal.target_date}
						title="Target date"
						editable={canWrite}
					>
						{#snippet picker(close: () => void)}
							{@render datePicker(close, goal.target_date, (value) =>
								setDate('target_date', value)
							)}
						{/snippet}
					</ReaderChip>
					<span class="tag">Updated {shortDate(goal.updated_at)}</span>
					{@render editControl()}
				</div>
				{#snippet goalText()}
					{#if description.trim()}
						<div class="{prose} text-foreground">
							{@html renderMarkdown(description)}
						</div>
					{:else if canEdit}
						<button type="button" class="add-words" onclick={() => void startEdit()}>
							<Pencil class="h-3.5 w-3.5" /> Add a description
						</button>
					{:else}
						<p class="muted">No description.</p>
					{/if}
				{/snippet}
				{@render textFrame(false, goalText)}
			{/if}
		</div>
		{#if showDetails && DetailsPanel && current}
			{@const entity = current.task ?? current.goal ?? current.doc}
			<div class="details-col">
				{#key key}
					<DetailsPanel
						kind={item.kind}
						id={item.id}
						{projectId}
						{canWrite}
						{title}
						props={(current.task?.props ?? null) as Record<string, unknown> | null}
						assignees={current.task?.assignees ?? []}
						createdAt={entity?.created_at ?? null}
						completedAt={current.task?.state_key === 'done'
							? (current.task.completed_at ?? null)
							: null}
						onAssignees={item.kind === 'task' ? saveAssignees : undefined}
						onOpenLinked={openLinked}
						onLinksChanged={detailsChanged}
						onAllDetails={() => void openDetails()}
						onClose={toggleDetails}
					/>
				{/key}
			</div>
		{/if}
	</div>

	{#if !phone}
		<footer class="keys">
			{#if canWrite && current}
				<button
					type="button"
					class="remove"
					disabled={leaving}
					onclick={() => void removeItem()}
					title="{removal.label} this {word}. You can undo it for a few seconds."
				>
					{#if removal.label === 'Delete'}<Trash2 class="h-3.5 w-3.5" />{:else}<Archive
							class="h-3.5 w-3.5"
						/>{/if}
					{removal.label}
				</button>
			{/if}
			<span class="hints">
				<span><kbd>↑</kbd> <kbd>↓</kbd> walk the list</span>
				{#if canShowList}<span><kbd>F</kbd> focus</span>{/if}
				{#if canEdit}<span><kbd>E</kbd> edit</span>{/if}
				{#if current && !isTable}<span><kbd>D</kbd> details</span>{/if}
				<span><kbd>Esc</kbd> back out</span>
			</span>
		</footer>
	{:else}
		<nav class="bar" class:with-remove={canWrite} aria-label="{word} actions">
			<button
				type="button"
				disabled={!near.prev}
				onclick={() => near.prev && onStep(near.prev)}
				aria-label="Previous {word}"
			>
				<ChevronLeft class="h-5 w-5" />
			</button>
			{#if canWrite}
				<button
					type="button"
					class="remove"
					disabled={!current || leaving}
					onclick={() => void removeItem()}
				>
					{#if removal.label === 'Delete'}<Trash2 class="h-5 w-5" />{:else}<Archive
							class="h-5 w-5"
						/>{/if}
					<span>{removal.label}</span>
				</button>
			{/if}
			{#if item.kind === 'task' && canWrite}
				<button
					type="button"
					class="go"
					disabled={!current?.task || taskBusy}
					onclick={() =>
						setTaskState(current?.task?.state_key === 'done' ? 'todo' : 'done')}
				>
					<Check class="h-5 w-5" />
					<span>{current?.task?.state_key === 'done' ? 'Reopen' : 'Mark done'}</span>
				</button>
			{:else if canEdit}
				<button type="button" onclick={() => (editing ? finishEdit() : startEdit())}>
					{#if editing}<Check class="h-5 w-5" />{:else}<Pencil class="h-5 w-5" />{/if}
					<span>{editing ? 'Finish' : 'Edit'}</span>
				</button>
			{:else}
				<span></span>
			{/if}
			<button type="button" onclick={onChat} aria-pressed={chatOn}>
				<img src="/brain-bolt.webp" alt="" class="h-5 w-5 rounded object-cover" />
				<span>Chat</span>
			</button>
			{#if pageLink}
				<a href={pageHref} onclick={() => void flush()}>
					<ArrowUpRight class="h-5 w-5" /><span>Page</span>
				</a>
			{:else}
				<button type="button" onclick={onClose}>
					<X class="h-5 w-5" /><span>Close</span>
				</button>
			{/if}
			<button
				type="button"
				disabled={!near.next}
				onclick={() => near.next && onStep(near.next)}
				aria-label="Next {word}"
			>
				<ChevronRight class="h-5 w-5" />
			</button>
		</nav>
	{/if}
</div>

<!-- Edit sits at the end of the first row of the body, not in the header. -->
{#snippet editControl()}
	{#if current && !isTable}
		<span class="edit-slot">
			<button
				type="button"
				class="act"
				onclick={toggleDetails}
				aria-pressed={detailsOpen}
				aria-label="Details"
				title="Assignees, links, comments and activity (D)"
			>
				{#if detailsOpen}<PanelRightClose class="h-3.5 w-3.5" />{:else}<PanelRightOpen
						class="h-3.5 w-3.5"
					/>{/if}
				{#if !phone}<span>Details</span>{/if}
			</button>
		</span>
	{/if}
{/snippet}

<!--
	The text in a frame with Edit | Preview, Preview first. Preview is the
	reader's own rendering (names stay clickable, embeds live); Edit swaps in
	the editor, whose Preview tab hands back here. The editor's code loads on
	the way to Edit, never with the page.
-->
{#snippet textFrame(isDoc: boolean, preview: Snippet)}
	{#if editing}
		{@render bodyEditor(isDoc)}
	{:else if canEdit}
		<div class="sheet rounded-xl border border-border bg-card shadow-ink tx tx-frame tx-weak">
			<div class="sheet-head border-b border-border bg-muted/30">
				<div
					class="inline-flex rounded-lg bg-muted/60 p-0.5 border border-border/50"
					role="tablist"
					aria-label="Text"
				>
					<button
						type="button"
						role="tab"
						aria-label="Edit"
						aria-selected="false"
						class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground"
						onpointerenter={preloadEditor}
						onfocus={preloadEditor}
						onclick={() => void startEdit()}
					>
						<Edit3 class="w-3.5 h-3.5" /><span>Edit</span>
					</button>
					<button
						type="button"
						role="tab"
						aria-label="Preview"
						aria-selected="true"
						class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-card text-foreground shadow-ink"
					>
						<Eye class="w-3.5 h-3.5" /><span>Preview</span>
					</button>
				</div>
			</div>
			<div class="sheet-body">{@render preview()}</div>
		</div>
	{:else}
		{@render preview()}
	{/if}
{/snippet}

{#snippet bodyEditor(isDoc: boolean)}
	{#if saveState === 'conflict'}
		<div class="note" role="alert">
			<span
				>This doc changed somewhere else since you opened it. Your text is still below.</span
			>
			<span class="flex flex-wrap gap-2">
				<button type="button" class="act" onclick={takeLatest}>Load the latest</button>
				<button type="button" class="act" onclick={keepMine}>Keep mine</button>
			</span>
		</div>
	{/if}
	<div class="editor" class:short={!isDoc}>
		{#if Editor}
			<Editor
				bind:this={editorApi}
				bind:value={draft}
				onDocChange={(next: string) => {
					draft = next;
					scheduleSave();
				}}
				onSave={() => void flush()}
				onPreview={() => void finishEdit()}
				statusLabel={SAVE_LABEL[saveState]}
				onInsertTableRequested={isDoc ? () => (tablePickerOpen = true) : undefined}
				embedProjectId={isDoc ? projectId : null}
				maxLength={50000}
				placeholder={isDoc ? undefined : 'What does done look like? Steps, links, notes…'}
				helpText=""
				fillHeight={isDoc}
			/>
		{:else}
			<div class="h-64 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"></div>
		{/if}
	</div>
{/snippet}

{#snippet datePicker(close: () => void, value: string | null, apply: (next: string | null) => void)}
	{#each DATE_PRESETS as preset (preset.key)}
		{@const day = presetDay(preset.key)}
		<button
			type="button"
			class="opt"
			aria-pressed={dayOf(value) === day}
			onclick={() => {
				close();
				if (dayOf(value) !== day) apply(valueForDay(day, value));
			}}>{preset.label}<span class="opt-note">{shortDate(`${day}T12:00:00`)}</span></button
		>
	{/each}
	<div class="sep" role="separator"></div>
	<form
		class="pick-day"
		onsubmit={(event) => {
			event.preventDefault();
			const day = new FormData(event.currentTarget).get('day');
			if (typeof day !== 'string' || !day) return;
			close();
			if (day !== dayOf(value)) apply(valueForDay(day, value));
		}}
	>
		<input type="date" name="day" value={dayOf(value)} aria-label="Pick a day" />
		<button type="submit" class="set">Set</button>
	</form>
	{#if value}
		<button
			type="button"
			class="opt clear"
			onclick={() => {
				close();
				apply(null);
			}}>Clear</button
		>
	{/if}
{/snippet}

{#if current?.task}
	<TaskEntityPopover entities={taskEntities} taskId={current.task.id} canEdit={canWrite} />
{/if}

{#if tablePickerOpen && editing}
	{#await import('$lib/components/table-surfaces/TableInsertPicker.svelte') then { default: TableInsertPicker }}
		<TableInsertPicker
			{projectId}
			parentId={item.id}
			excludeId={item.id}
			onPick={insertTableEmbed}
			onClose={() => (tablePickerOpen = false)}
		/>
	{/await}
{/if}

{#if (detailEditor === 'document' && current?.doc) || (detailEditor === 'task-doc' && current?.task)}
	{#await import('$lib/components/ontology/DocumentModal.svelte') then { default: DocumentModal }}
		<DocumentModal
			isOpen={true}
			{projectId}
			taskId={detailEditor === 'task-doc' ? (current?.task?.id ?? null) : null}
			documentId={detailEditor === 'document' ? (current?.doc?.id ?? null) : null}
			onClose={() => (detailEditor = null)}
			onSaved={detailsChanged}
			onDeleted={() => {
				detailEditor = null;
				onChanged();
				if (item.kind === 'document') onClose();
			}}
		/>
	{/await}
{:else if detailEditor === 'task' && current?.task}
	{#await import('$lib/components/ontology/TaskEditModal.svelte') then { default: TaskEditModal }}
		<TaskEditModal
			taskId={current.task.id}
			{projectId}
			onClose={() => (detailEditor = null)}
			onUpdated={detailsChanged}
			onDeleted={() => {
				onChanged();
				onClose();
			}}
		/>
	{/await}
{:else if linkedPlanId}
	{#await import('$lib/components/ontology/PlanEditModal.svelte') then { default: PlanEditModal }}
		<PlanEditModal
			planId={linkedPlanId}
			{projectId}
			onClose={() => (linkedPlanId = null)}
			onUpdated={detailsChanged}
			onDeleted={() => {
				linkedPlanId = null;
				detailsChanged();
			}}
		/>
	{/await}
{:else if detailEditor === 'goal' && current?.goal}
	{#await import('$lib/components/ontology/GoalEditModal.svelte') then { default: GoalEditModal }}
		<GoalEditModal
			goalId={current.goal.id}
			{projectId}
			onClose={() => (detailEditor = null)}
			onSaved={detailsChanged}
			onUpdated={detailsChanged}
			onDeleted={() => {
				onChanged();
				onClose();
			}}
		/>
	{/await}
{/if}

<style>
	.reader {
		display: flex;
		height: 100%;
		min-height: 0;
		min-width: 0;
		flex-direction: column;
		background: hsl(var(--background));
	}
	.grab {
		display: grid;
		flex: none;
		place-items: center;
		height: 22px;
		touch-action: none;
		cursor: grab;
	}
	.grab span {
		width: 40px;
		height: 5px;
		border-radius: 3px;
		background: hsl(var(--border-strong));
	}
	.head {
		display: flex;
		flex: none;
		align-items: center;
		gap: 8px;
		min-height: 52px;
		padding: 8px 10px 8px 12px;
		border-bottom: 1px solid hsl(var(--border));
	}
	.phone .head {
		align-items: flex-start;
		padding: 0 8px 10px 16px;
		touch-action: none;
	}
	.title {
		margin: 0;
		overflow: hidden;
		font-size: 15px;
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: -0.01em;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: hsl(var(--foreground));
	}
	.phone .title {
		display: -webkit-box;
		font-size: 16px;
		white-space: normal;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 8px;
		margin-top: 2px;
		font-size: 11.5px;
		color: hsl(var(--muted-foreground));
	}
	.due-late {
		color: hsl(var(--destructive));
	}
	.glyph {
		display: grid;
		flex: none;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 7px;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}
	.glyph.goal {
		color: hsl(var(--accent));
	}
	.tools {
		display: flex;
		flex: none;
		align-items: center;
		gap: 1px;
	}
	.ib {
		display: inline-grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 8px;
		color: hsl(var(--muted-foreground));
	}
	.phone .ib {
		width: 44px;
		height: 44px;
	}
	.ib:hover:not(:disabled) {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
	.ib[aria-pressed='true'] {
		background: hsl(var(--accent) / 0.13);
		color: hsl(var(--accent));
	}
	.ib:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.ib:focus-visible,
	.act:focus-visible,
	.bar > :focus-visible,
	.states button:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.pos {
		min-width: 44px;
		text-align: center;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
	.sep {
		width: 1px;
		height: 20px;
		margin: 0 4px;
		background: hsl(var(--border));
	}
	/* The body, and the Details panel beside it (over it where the reader is narrow). */
	.main {
		position: relative;
		display: flex;
		flex: 1;
		min-height: 0;
		container-type: inline-size;
	}
	.details-col {
		flex: none;
		width: 300px;
		min-height: 0;
		border-left: 1px solid hsl(var(--border));
	}
	@container (max-width: 760px) {
		.details-col {
			position: absolute;
			inset: 0 0 0 auto;
			z-index: 6;
			width: min(320px, 100%);
			box-shadow: -12px 0 32px hsl(0 0% 0% / 0.22);
		}
	}
	@container (max-width: 480px) {
		.details-col {
			width: 100%;
			border-left: 0;
			box-shadow: none;
		}
	}
	.body {
		min-width: 0;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 20px 28px 40px;
		animation: rise 180ms ease-out;
	}
	.phone .body {
		padding: 16px 18px 24px;
	}
	.body > :global(*) {
		max-width: 72ch;
	}
	/* A table owns its scroll (sticky headers need one bounded scroller) and the full width. */
	.body.table-body {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding: 0;
	}
	.body.table-body > :global(*) {
		max-width: none;
		flex: 1;
		min-height: 0;
	}
	/* Archive: the item slides off, the next one rises in. */
	.body.leaving {
		animation: leave 160ms ease-in forwards;
	}
	.body.arriving {
		animation: arrive 200ms ease-out;
	}
	@keyframes leave {
		to {
			opacity: 0;
			transform: translateX(-28px);
		}
	}
	@keyframes arrive {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.editor {
		display: flex;
		min-height: min(60dvh, 34rem);
		flex-direction: column;
	}
	.editor.short {
		min-height: 0;
		margin-bottom: 8px;
	}
	.title-input {
		display: block;
		width: 100%;
		border: 0;
		border-bottom: 1px dashed hsl(var(--border-strong));
		border-radius: 0;
		background: transparent;
		padding: 0 0 1px;
	}
	.phone .title-input {
		display: block;
	}
	.title-input:focus {
		outline: none;
		border-bottom: 1px solid hsl(var(--accent));
	}
	.add-words {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border-radius: 8px;
		padding: 6px 8px;
		margin-left: -8px;
		font-size: 13.5px;
		color: hsl(var(--muted-foreground));
	}
	.add-words:hover {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
	.add-words:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.note {
		display: grid;
		gap: 8px;
		margin-bottom: 12px;
		border: 1px solid hsl(var(--destructive) / 0.45);
		border-radius: 10px;
		padding: 10px 12px;
		font-size: 13px;
		color: hsl(var(--foreground));
	}
	.act {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 30px;
		border-radius: 8px;
		border: 1px solid hsl(var(--border-strong));
		background: hsl(var(--card));
		padding: 0 10px;
		font-size: 12.5px;
		font-weight: 500;
		color: hsl(var(--foreground));
	}
	.act:hover {
		background: hsl(var(--muted));
	}
	.muted {
		font-size: 13.5px;
		color: hsl(var(--muted-foreground));
	}
	/* Reading across the whole width: the text keeps its measure, centered. */
	.body.across > :global(*) {
		margin-inline: auto;
	}
	.meta-link {
		color: hsl(var(--muted-foreground));
		text-decoration: underline;
		text-decoration-color: hsl(var(--border-strong));
		text-underline-offset: 3px;
	}
	.meta-link:hover {
		color: hsl(var(--foreground));
	}
	.project-link {
		display: inline-flex;
		min-width: 0;
		max-width: 100%;
		align-items: center;
		gap: 4px;
	}
	.task-docs {
		display: grid;
		gap: 8px;
		margin-top: 24px;
		border-top: 1px solid hsl(var(--border));
		padding-top: 14px;
	}
	.task-docs-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.task-docs-head .act {
		margin-left: auto;
	}
	.micro {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}
	.count {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
	.task-docs ul {
		display: grid;
		gap: 2px;
	}
	.task-docs li button {
		display: flex;
		width: 100%;
		min-height: 40px;
		align-items: center;
		gap: 10px;
		border-radius: 8px;
		padding: 6px 8px;
		text-align: left;
		font-size: 13.5px;
		color: hsl(var(--foreground));
	}
	.task-docs li button:hover {
		background: hsl(var(--muted));
	}
	.task-docs li button:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}
	.task-docs .tag {
		margin-left: auto;
	}
	/* The body's first row: status (or a goal's or doc's facts) left, Edit far right. */
	.lead {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		margin-bottom: 12px;
	}
	.body > .lead {
		max-width: none;
	}
	.body.across > .lead {
		max-width: 72ch;
	}
	.lead > .states,
	.lead > .facts {
		margin-bottom: 0;
	}
	.facts.lead {
		gap: 6px;
		margin-bottom: 16px;
	}
	.edit-slot {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		margin-left: auto;
	}
	.title-row {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 4px;
	}
	.title-row .title {
		min-width: 0;
	}
	.title-pencil {
		display: inline-grid;
		flex: none;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 6px;
		color: hsl(var(--muted-foreground) / 0.7);
	}
	.phone .title-pencil {
		width: 36px;
		height: 36px;
	}
	.title-pencil:hover {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
	.title-pencil:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.sheet {
		overflow: hidden;
	}
	.sheet-head {
		display: flex;
		align-items: center;
		padding: 6px 8px;
	}
	.sheet-body {
		padding: 16px;
	}
	.states {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 2px;
		margin-bottom: 12px;
		border-radius: 10px;
		background: hsl(var(--muted));
		padding: 2px;
	}
	.states button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-height: 32px;
		border-radius: 8px;
		padding: 0 11px;
		font-size: 12.5px;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}
	.phone .states button {
		min-height: 40px;
	}
	.states button:hover:not(:disabled):not([aria-pressed='true']) {
		color: hsl(var(--foreground));
	}
	.states button:disabled {
		cursor: default;
	}
	/* The current status takes its color, so it reads at a glance in light and dark. */
	.states button {
		--tone: var(--foreground);
	}
	.states .state-in_progress,
	.states .state-done {
		--tone: var(--success);
	}
	.states .state-blocked {
		--tone: var(--destructive);
	}
	.states button[aria-pressed='true'] {
		background: hsl(var(--tone) / 0.16);
		color: hsl(var(--tone));
		font-weight: 700;
		box-shadow: inset 0 0 0 1.5px hsl(var(--tone) / 0.6);
	}
	.states .state-done[aria-pressed='true'] {
		background: hsl(var(--success));
		color: hsl(var(--success-foreground));
		box-shadow: none;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-bottom: 16px;
	}
	.tag {
		border-radius: 6px;
		border: 1px solid hsl(var(--border));
		padding: 2px 6px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
		white-space: nowrap;
		color: hsl(var(--muted-foreground));
	}
	.keys {
		display: flex;
		flex: none;
		align-items: center;
		gap: 4px 14px;
		border-top: 1px solid hsl(var(--border));
		padding: 5px 14px 5px 8px;
		font-size: 11.5px;
		color: hsl(var(--muted-foreground));
	}
	.hints {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 4px 14px;
		margin-left: auto;
	}
	.keys .remove {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 6px;
		min-height: 28px;
		border-radius: 7px;
		padding: 0 8px;
		font-size: 12px;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}
	.keys .remove:hover:not(:disabled) {
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
	}
	.keys .remove:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	kbd {
		border-radius: 4px;
		border: 1px solid hsl(var(--border-strong));
		padding: 0 4px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 10.5px;
		color: hsl(var(--foreground));
	}
	.bar {
		display: grid;
		flex: none;
		grid-template-columns: 52px repeat(3, minmax(0, 1fr)) 52px;
		gap: 4px;
		border-top: 1px solid hsl(var(--border));
		background: hsl(var(--background));
		padding: 6px 8px calc(8px + env(safe-area-inset-bottom, 0px));
	}
	.bar > * {
		display: grid;
		min-height: 52px;
		align-content: center;
		justify-items: center;
		gap: 3px;
		border-radius: 10px;
		font-size: 11px;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}
	.bar > :active:not(:disabled) {
		background: hsl(var(--muted));
	}
	.bar > [aria-pressed='true'] {
		color: hsl(var(--accent));
	}
	.bar.with-remove {
		grid-template-columns: 52px repeat(4, minmax(0, 1fr)) 52px;
	}
	.bar .remove:active:not(:disabled) {
		color: hsl(var(--destructive));
	}
	.bar .go {
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}
	.bar > :disabled {
		opacity: 0.3;
	}
	@media (prefers-reduced-motion: reduce) {
		.body,
		.body.leaving,
		.body.arriving {
			animation: none;
		}
	}
</style>
