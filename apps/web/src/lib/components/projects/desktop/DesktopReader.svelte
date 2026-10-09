<!-- apps/web/src/lib/components/projects/desktop/DesktopReader.svelte -->
<!--
	The card's reader: one doc, task or goal, read in place. Docs edit in place
	(autosaved, with the doc modal's conflict check); a task changes state in one
	tap; task and goal details open their usual editors. The header carries
	Prev/Next and the depth toggles (list, focus, full page). On phones the same
	actions sit in a thumb bar, and the handle (data-sheet-drag) drags the sheet.
	A doc's "All details" opens the full doc editor (archive, add child, comments,
	links); a task lists the docs made for it, which open here too.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import {
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
		FilePlus,
		FileText,
		FolderKanban,
		Maximize2,
		Minimize2,
		PanelLeftClose,
		PanelLeftOpen,
		Pencil,
		RefreshCw,
		Table2 as Table,
		Target,
		X
	} from '$lib/icons/lucide';
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
	};
	type GoalData = {
		id: string;
		name: string;
		description: string | null;
		state_key: string;
		target_date: string | null;
		props?: { priority?: string | null; description?: string | null } | null;
		updated_at: string;
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
		if (untrack(() => editing && loaded?.key === k)) return;
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
	const stateKey = $derived(
		current?.doc?.state_key ?? current?.task?.state_key ?? current?.goal?.state_key ?? ''
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

	// ---------- Doc editing ----------

	type SaveState = 'saved' | 'unsaved' | 'saving' | 'conflict' | 'error';
	let editing = $state(false);
	let editingKey = '';
	let draft = $state('');
	let saveState = $state<SaveState>('saved');
	let serverUpdatedAt: string | null = null;
	let serverRevision: string | null = null;
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingSave: { docId: string; content: string; overwrite: boolean } | null = null;
	let inFlight = false;
	const SAVE_DEBOUNCE_MS = 1500;

	type EditorComponent = typeof import('$lib/components/ui/RichMarkdownEditor.svelte').default;
	let Editor = $state<EditorComponent | null>(null);

	async function startEdit() {
		const doc = current?.doc;
		if (!doc || !canWrite || editing) return;
		draft = doc.content ?? '';
		serverUpdatedAt = doc.updated_at;
		serverRevision = current?.revision ?? null;
		saveState = 'saved';
		editing = true;
		editingKey = key;
		if (phone) onDetent?.('full');
		Editor ??= (await import('$lib/components/ui/RichMarkdownEditor.svelte')).default;
	}

	function scheduleSave() {
		if (!editing) return;
		saveState = saveState === 'conflict' ? 'conflict' : 'unsaved';
		if (saveState === 'conflict') return;
		pendingSave = { docId: item.id, content: draft, overwrite: false };
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
		inFlight = true;
		saveState = 'saving';
		try {
			const payload: Record<string, unknown> = { content: next.content };
			if (!next.overwrite && serverUpdatedAt) {
				payload.expected_updated_at = serverUpdatedAt;
				if (serverRevision) payload.expected_editor_revision = serverRevision;
			}
			const response = await fetch(`/api/onto/documents/${next.docId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const result = await response.json().catch(() => null);
			if (response.status === 409) {
				saveState = 'conflict';
				return;
			}
			if (!response.ok) throw new Error(result?.error || 'Could not save this doc.');
			const doc = result?.data?.document as Partial<DocData> | undefined;
			if (doc?.updated_at) serverUpdatedAt = doc.updated_at;
			serverRevision = result?.data?.editor_revision ?? null;
			if (loaded?.key === `document:${next.docId}` && loaded.doc) {
				loaded = {
					...loaded,
					doc: { ...loaded.doc, ...doc, content: next.content },
					revision: serverRevision
				};
			}
			saveState = pendingSave ? 'unsaved' : 'saved';
		} catch (cause) {
			saveState = 'error';
			toastService.error(cause instanceof Error ? cause.message : 'Could not save this doc.');
		} finally {
			inFlight = false;
		}
	}

	async function finishEdit() {
		await flush();
		if (saveState === 'conflict' || saveState === 'error') return;
		editing = false;
		editingKey = '';
	}

	function keepMine() {
		pendingSave = { docId: item.id, content: draft, overwrite: true };
		saveState = 'unsaved';
		void flush();
	}

	function takeLatest() {
		pendingSave = null;
		editing = false;
		editingKey = '';
		saveState = 'saved';
		reloadTick += 1;
	}

	// Moving to another item saves the open edit first.
	$effect(() => {
		const k = key;
		untrack(() => {
			if (editing && editingKey && editingKey !== k) {
				void flush();
				editing = false;
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

	// ---------- Tasks and goals ----------

	let taskBusy = $state(false);
	// 'document' opens the open doc's full editor; 'task-doc' starts a doc for the open task.
	let detailEditor = $state<'task' | 'goal' | 'document' | 'task-doc' | null>(null);

	async function openDocDetails() {
		if (editing) await finishEdit();
		if (editing) return;
		detailEditor = 'document';
	}

	// The docs made for a task (its old Workspace tab) come with the task's read.
	const taskDocList = $derived(current?.taskDocs ?? []);

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
		if (
			(event.key === 'e' || event.key === 'E') &&
			!editing &&
			item.kind === 'document' &&
			canWrite &&
			current?.doc &&
			!isTable
		) {
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
			<h3 class="title">
				{#if current?.task}<TaskMentionText
						text={title}
						entities={taskEntities}
					/>{:else}{title}{/if}
			</h3>
			<div class="meta">
				{#if stateKey}<span class="state state-{stateKey}">{stateLabel(stateKey)}</span
					>{/if}
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
				{#if editing}<span class="save save-{saveState}">{SAVE_LABEL[saveState]}</span>{/if}
				{#if item.kind === 'document' && current?.doc}
					<button
						type="button"
						class="meta-link"
						onclick={() => void openDocDetails()}
						title="Archive, add a nested doc, comments, links and Document Interact"
					>
						All details
					</button>
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
				{#if item.kind === 'document' && canWrite && !isTable}
					<button
						type="button"
						class="ib"
						onclick={() => (editing ? finishEdit() : startEdit())}
						aria-pressed={editing}
						disabled={!current?.doc}
						title={editing ? 'Finish editing (Esc)' : 'Edit (E)'}
						aria-label={editing ? 'Finish editing' : 'Edit'}
					>
						<Pencil class="h-4 w-4" />
					</button>
				{:else if item.kind === 'task' && canWrite}
					<button
						type="button"
						class="ib"
						onclick={() =>
							setTaskState(current?.task?.state_key === 'done' ? 'todo' : 'done')}
						aria-pressed={current?.task?.state_key === 'done'}
						disabled={!current?.task || taskBusy}
						title={current?.task?.state_key === 'done' ? 'Reopen' : 'Mark done'}
						aria-label={current?.task?.state_key === 'done' ? 'Reopen' : 'Mark done'}
					>
						<Check class="h-4 w-4" />
					</button>
				{/if}
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

	<div
		class="body"
		class:table-body={isTable}
		class:across={!phone && !listShown}
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
			{#if editing}
				{#if saveState === 'conflict'}
					<div class="note" role="alert">
						<span
							>This doc changed somewhere else since you opened it. Your text is still
							below.</span
						>
						<span class="flex flex-wrap gap-2">
							<button type="button" class="act" onclick={takeLatest}
								>Load the latest</button
							>
							<button type="button" class="act" onclick={keepMine}>Keep mine</button>
						</span>
					</div>
				{/if}
				<div class="editor">
					{#if Editor}
						<Editor
							bind:this={editorApi}
							bind:value={draft}
							onDocChange={(next: string) => {
								draft = next;
								scheduleSave();
							}}
							onSave={() => void flush()}
							onInsertTableRequested={() => (tablePickerOpen = true)}
							embedProjectId={projectId}
							maxLength={50000}
							helpText=""
							fillHeight={true}
						/>
					{:else}
						<div
							class="h-64 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
						></div>
					{/if}
				</div>
			{:else if current.doc.content?.trim()}
				{@const bodyHtml = renderDocumentMarkdown(current.doc.content, { projectId })}
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
			{:else}
				<p class="muted">
					This doc is empty.{canWrite ? ' Edit it to start writing.' : ''}
				</p>
			{/if}
		{:else if current.task}
			{@const task = current.task}
			{#if canWrite}
				<div class="states" role="group" aria-label="Task state">
					{#each TASK_STATES as entry (entry.key)}
						<button
							type="button"
							aria-pressed={task.state_key === entry.key}
							disabled={taskBusy}
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
			{/if}
			<div class="facts">
				{#if task.priority != null}<span class="tag">Priority {task.priority}</span>{/if}
				{#if task.start_at}<span class="tag">Starts {shortDate(task.start_at)}</span>{/if}
				{#if task.due_at}
					<span class="tag" class:late={overdue}
						>Due {shortDate(task.due_at)}{overdue ? ' · overdue' : ''}</span
					>
				{/if}
				<span class="tag">Updated {shortDate(task.updated_at)}</span>
				{#if canWrite}
					<button type="button" class="act" onclick={() => (detailEditor = 'task')}>
						<Pencil class="h-3.5 w-3.5" /> Edit details
					</button>
				{/if}
			</div>
			<TaskKeyDetails chips={taskEntities.keyChips} entities={taskEntities} class="-mt-2 mb-4" />
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
			{:else}
				<p class="muted">No description.</p>
			{/if}
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
			{@const description = goal.description ?? goal.props?.description ?? ''}
			<div class="facts">
				{#if goal.props?.priority}<span class="tag">{goal.props.priority} priority</span
					>{/if}
				<span class="tag"
					>{goal.target_date
						? `Target ${shortDate(goal.target_date)}`
						: 'No target date'}</span
				>
				<span class="tag">Updated {shortDate(goal.updated_at)}</span>
				{#if canWrite}
					<button type="button" class="act" onclick={() => (detailEditor = 'goal')}>
						<Pencil class="h-3.5 w-3.5" /> Edit goal
					</button>
				{/if}
			</div>
			{#if description.trim()}
				<div class="{prose} text-foreground">{@html renderMarkdown(description)}</div>
			{:else}
				<p class="muted">No description.</p>
			{/if}
		{/if}
	</div>

	{#if !phone}
		<footer class="keys">
			<span><kbd>↑</kbd> <kbd>↓</kbd> walk the list</span>
			{#if canShowList}<span><kbd>F</kbd> focus</span>{/if}
			{#if item.kind === 'document' && canWrite && !isTable}<span><kbd>E</kbd> edit</span
				>{/if}
			<span><kbd>Esc</kbd> back out</span>
		</footer>
	{:else}
		<nav class="bar" aria-label="{word} actions">
			<button
				type="button"
				disabled={!near.prev}
				onclick={() => near.prev && onStep(near.prev)}
				aria-label="Previous {word}"
			>
				<ChevronLeft class="h-5 w-5" />
			</button>
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
			{:else if item.kind === 'document' && canWrite && !isTable}
				<button
					type="button"
					disabled={!current?.doc}
					onclick={() => (editing ? finishEdit() : startEdit())}
				>
					{#if editing}<Check class="h-5 w-5" />{:else}<Pencil class="h-5 w-5" />{/if}
					<span>{editing ? 'Finish' : 'Edit'}</span>
				</button>
			{:else if item.kind === 'goal' && canWrite}
				<button
					type="button"
					disabled={!current?.goal}
					onclick={() => (detailEditor = 'goal')}
				>
					<Pencil class="h-5 w-5" /><span>Edit</span>
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
	.state {
		border-radius: 5px;
		background: hsl(var(--muted));
		padding: 1px 6px;
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: hsl(var(--foreground));
	}
	.state-ready,
	.state-published,
	.state-done,
	.state-in_progress {
		color: hsl(var(--success));
	}
	.state-draft,
	.state-in_review {
		color: hsl(var(--warning));
	}
	.state-blocked {
		color: hsl(var(--destructive));
	}
	.due-late,
	.tag.late {
		color: hsl(var(--destructive));
	}
	.save-conflict,
	.save-error {
		color: hsl(var(--destructive));
		font-weight: 600;
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
	.body {
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
	.states button[aria-pressed='true'] {
		background: hsl(var(--card));
		color: hsl(var(--foreground));
		box-shadow: 0 1px 2px hsl(0 0% 0% / 0.15);
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
		flex-wrap: wrap;
		gap: 4px 14px;
		border-top: 1px solid hsl(var(--border));
		padding: 7px 14px;
		font-size: 11.5px;
		color: hsl(var(--muted-foreground));
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
	.bar .go {
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}
	.bar > :disabled {
		opacity: 0.3;
	}
	@media (prefers-reduced-motion: reduce) {
		.body {
			animation: none;
		}
	}
</style>
