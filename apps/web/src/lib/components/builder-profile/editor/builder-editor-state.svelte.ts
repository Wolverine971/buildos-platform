// apps/web/src/lib/components/builder-profile/editor/builder-editor-state.svelte.ts
//
// The state behind the "Your page" editor (/profile/page). One instance per editor; the
// panels read and write it directly. Everything saves on its own: header fields when
// you leave them, links and projects a moment after you stop changing them, switches
// at once, images after the crop. The card on the canvas shows unsaved edits as you
// type (overlayView); the saved page is re-read after a save to pick up what only the
// server knows (weekly bars, the build log). A failed save keeps what the owner typed
// and puts the server's message next to the control.

import type {
	BuilderEditorData,
	BuilderPageDraftSuggestion,
	BuilderPageSection,
	BuilderProfileSettings,
	BuilderProfileStatus,
	BuilderProfileUpdateDraft,
	BuilderProfileView
} from '$lib/builder-profile/types';
import { callApi } from './editor-api';
import {
	applySuggestedPitch,
	blankLinkRow,
	buildLinksPayload,
	buildProjectsPayload,
	draftProjectIds,
	headerChange,
	headerDraftsFrom,
	linkRowError,
	linkRowsFrom,
	linksKey,
	LIMITS,
	moveItem,
	movePlacedRow,
	normalizeText,
	overlayView,
	projectReplyErrors,
	projectRowErrors,
	projectsKey,
	rowsFromProjects,
	setRowLevel,
	toggleGoal,
	type EditorLevel,
	type EditorLinkRow,
	type EditorProjectRow,
	type HeaderField,
	type PreviewAudience
} from './builder-editor';
import type { CropShape } from './image-crop';

export type SavableField = HeaderField | 'avatar_url' | 'cover_url';
export type ToggleSetting =
	| 'show_build_log'
	| 'build_log_includes_private'
	| 'show_agent_split'
	| 'show_writing'
	| 'show_builds_with'
	| 'show_on_collaborator_pages'
	| 'weekly_drafts';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const EMPTY_SETTINGS: BuilderProfileSettings = {
	headline: null,
	location: null,
	avatar_url: null,
	cover_url: null,
	now_text: null,
	bio: null,
	show_build_log: true,
	build_log_includes_private: false,
	show_agent_split: true,
	show_writing: true,
	show_builds_with: true,
	show_on_collaborator_pages: true,
	weekly_drafts: false
};

const BASE = '/api/profile/builder';
const NOTHING_MOVED = 'Nothing moved this week, so there’s nothing to draft.';
/** How long after the last change links and projects save. */
const AUTOSAVE_MS = 800;
/** Settings the server needs to recount before the card can show them. */
const RELOAD_AFTER: ToggleSetting[] = [
	'show_build_log',
	'build_log_includes_private',
	'show_writing',
	'show_builds_with'
];

export class BuilderPageEditorState {
	/** Called after Publish or Take down succeeds (publishing turns on handle findability). */
	onstatuschange: ((status: BuilderProfileStatus) => void) | null = null;

	// ---- Load ----
	loading = $state(true);
	loadError = $state<string | null>(null);

	// ---- Where the owner is ----
	section = $state<BuilderPageSection>('profile');
	/** The project open in the Projects panel, or null for the list. */
	openProjectId = $state<string | null>(null);

	// ---- Identity and status ----
	handle = $state<string | null>(null);
	/** The saved name (users.name). */
	name = $state<string | null>(null);
	status = $state<BuilderProfileStatus>('draft');
	publishBusy = $state(false);
	publishError = $state<string | null>(null);

	// ---- Header ----
	/** Last values the server confirmed. */
	settings = $state<BuilderProfileSettings>({ ...EMPTY_SETTINGS });
	/** What's in the inputs. */
	header = $state<Record<HeaderField, string>>(headerDraftsFrom(EMPTY_SETTINGS));
	signInAvatarUrl = $state<string | null>(null);
	fieldSaving = $state<SavableField | null>(null);
	fieldErrors = $state<Partial<Record<SavableField, string>>>({});

	// ---- Images ----
	imageBusy = $state<CropShape | null>(null);
	imageError = $state<string | null>(null);

	// ---- Draft my page ----
	suggestion = $state<BuilderPageDraftSuggestion | null>(null);
	suggestionBusy = $state(false);
	suggestionError = $state<string | null>(null);
	/** 'headline' | 'bio' | `pitch:<project_id>` already accepted. */
	usedSuggestions = $state<string[]>([]);

	// ---- Links ----
	socials = $state<EditorLinkRow[]>([]);
	links = $state<EditorLinkRow[]>([]);
	savedLinksKey = $state(linksKey([], []));
	linksBusy = $state(false);
	linksError = $state<string | null>(null);

	// ---- Projects ----
	rows = $state<EditorProjectRow[]>([]);
	savedProjectsKey = $state(projectsKey([]));
	projectsBusy = $state(false);
	projectsError = $state<string | null>(null);

	// ---- Section toggles ----
	toggleBusy = $state<Partial<Record<ToggleSetting, boolean>>>({});
	toggleError = $state<{ key: ToggleSetting; message: string } | null>(null);

	// ---- Weekly update ----
	drafts = $state<BuilderProfileUpdateDraft[]>([]);
	draftBodies = $state<Record<string, string>>({});
	draftBusy = $state<Record<string, 'publish' | 'skip'>>({});
	draftErrors = $state<Record<string, string>>({});
	weeklyBusy = $state<'draft' | 'publish_all' | null>(null);
	weeklyMessage = $state<string | null>(null);
	weeklyError = $state<string | null>(null);

	// ---- Preview ----
	preview = $state.raw<BuilderProfileView | null>(null);
	origin = $state('');
	previewError = $state<string | null>(null);
	previewAudience = $state<PreviewAudience>('anyone');

	// ---- Save status (top bar) ----
	saveState = $state<SaveState>('idle');
	saveMessage = $state<string | null>(null);

	// ---- Derived ----
	linksKeyNow = $derived(linksKey(this.socials, this.links));
	projectsKeyNow = $derived(projectsKey(this.rows));
	linksDirty = $derived(this.linksKeyNow !== this.savedLinksKey);
	projectsDirty = $derived(this.projectsKeyNow !== this.savedProjectsKey);
	linkErrors = $derived(
		Object.fromEntries(
			[...this.socials, ...this.links]
				.map((row) => [row.key, linkRowError(row)] as const)
				.filter(([, error]) => error !== null)
		) as Record<string, string>
	);
	projectErrors = $derived(projectRowErrors(this.rows));
	replyErrors = $derived(projectReplyErrors(this.rows));
	placedRows = $derived(this.rows.filter((row) => row.level !== 'hidden'));
	hiddenRows = $derived(this.rows.filter((row) => row.level === 'hidden'));
	unsaved = $derived(
		this.linksDirty || this.projectsDirty || this.headerDirty() || this.fieldSaving !== null
	);
	liveView = $derived(
		this.preview
			? overlayView(this.preview, {
					header: this.header,
					settings: this.settings,
					socials: this.socials,
					links: this.links,
					rows: this.rows,
					audience: this.previewAudience
				})
			: null
	);
	pageUrl = $derived(
		this.handle
			? `${(this.origin || 'https://build-os.com').replace(/\/$/, '')}/@${this.handle}`
			: null
	);

	#previewSeq = 0;
	#timers = new Set<ReturnType<typeof setTimeout>>();
	#linksTimer: ReturnType<typeof setTimeout> | null = null;
	#projectsTimer: ReturnType<typeof setTimeout> | null = null;
	#savedFlash: ReturnType<typeof setTimeout> | null = null;
	#inFlight = 0;
	#batchError: string | null = null;

	// ---- Loading ----------------------------------------------------------------

	/** Start from what the server rendered with the page (no spinner, no extra calls). */
	hydrate(data: BuilderEditorData, preview: BuilderProfileView | null, origin: string): void {
		this.apply(data);
		this.preview = preview;
		this.origin = origin;
		this.loading = false;
	}

	async load(): Promise<void> {
		this.loading = true;
		this.loadError = null;
		const [editor] = await Promise.all([
			callApi<BuilderEditorData>(BASE, 'GET', undefined, 'Could not load your page.'),
			this.refreshPreview()
		]);
		if (!editor.ok || !editor.data) {
			this.loadError = editor.ok ? 'Could not load your page.' : editor.error;
			this.loading = false;
			return;
		}
		this.apply(editor.data);
		this.loading = false;
	}

	apply(data: BuilderEditorData): void {
		this.handle = data.handle;
		this.name = data.name;
		this.status = data.status;
		this.settings = { ...EMPTY_SETTINGS, ...data.settings };
		this.header = headerDraftsFrom(this.settings, data.name);
		this.signInAvatarUrl = data.sign_in_avatar_url;
		const split = linkRowsFrom(data.links);
		this.socials = split.socials;
		this.links = split.links;
		this.savedLinksKey = linksKey(split.socials, split.links);
		const rows = rowsFromProjects(data.projects);
		this.rows = rows;
		this.savedProjectsKey = projectsKey(rows);
		this.setDrafts(data.drafts);
	}

	/** After the handle changes: pick up the new handle and status only. */
	async refreshIdentity(): Promise<void> {
		const editor = await callApi<BuilderEditorData>(BASE, 'GET');
		if (editor.ok && editor.data) {
			this.handle = editor.data.handle;
			this.status = editor.data.status;
		}
		await this.refreshPreview();
	}

	async refreshPreview(): Promise<void> {
		const seq = ++this.#previewSeq;
		const result = await callApi<{ view: BuilderProfileView | null; origin: string }>(
			`${BASE}/preview`,
			'GET',
			undefined,
			'Could not load the preview.'
		);
		if (seq !== this.#previewSeq) return;
		if (!result.ok) {
			this.previewError = result.error;
			return;
		}
		this.previewError = null;
		this.preview = result.data?.view ?? null;
		if (result.data?.origin) this.origin = result.data.origin;
	}

	// ---- Navigation -------------------------------------------------------------

	open(section: BuilderPageSection, projectId?: string): void {
		this.section = section;
		this.openProjectId = section === 'projects' ? (projectId ?? null) : null;
	}

	// ---- Save status ------------------------------------------------------------

	/**
	 * Wraps every save so the top bar can say Saving… / Saved / Not saved. Saves that
	 * overlap count as one batch: it reads Saved only if none of them failed.
	 */
	private async track<T>(
		work: () => Promise<T>,
		failed: (result: T) => string | null
	): Promise<T> {
		if (this.#inFlight === 0) this.#batchError = null;
		this.#inFlight += 1;
		this.saveState = 'saving';
		this.saveMessage = null;
		const result = await work();
		this.#inFlight -= 1;
		this.#batchError = failed(result) ?? this.#batchError;
		if (this.#inFlight > 0) return result;
		if (this.#batchError) {
			this.saveState = 'error';
			this.saveMessage = this.#batchError;
			return result;
		}
		this.saveState = 'saved';
		if (this.#savedFlash) clearTimeout(this.#savedFlash);
		this.#savedFlash = setTimeout(() => {
			if (this.saveState === 'saved') this.saveState = 'idle';
		}, 2400);
		return result;
	}

	private headerDirty(): boolean {
		return (
			headerChange(this.header.name, this.name) !== undefined ||
			(['headline', 'location', 'bio', 'now_text'] as const).some(
				(field) => headerChange(this.header[field], this.settings[field]) !== undefined
			)
		);
	}

	// ---- Publish ----------------------------------------------------------------

	async setPublished(publish: boolean): Promise<void> {
		if (this.publishBusy) return;
		await this.flush();
		this.publishBusy = true;
		this.publishError = null;
		const result = await callApi<{ status: BuilderProfileStatus }>(
			`${BASE}/publish`,
			'POST',
			{ publish },
			publish
				? 'Could not publish your page. Try again.'
				: 'Could not take your page down. Try again.'
		);
		this.publishBusy = false;
		if (!result.ok) {
			this.publishError = result.error;
			return;
		}
		this.status = result.data?.status ?? (publish ? 'published' : 'draft');
		this.onstatuschange?.(this.status);
		void this.refreshPreview();
	}

	/** Save anything waiting (before publishing or leaving). */
	async flush(): Promise<void> {
		if (this.#linksTimer) clearTimeout(this.#linksTimer);
		if (this.#projectsTimer) clearTimeout(this.#projectsTimer);
		this.#linksTimer = this.#projectsTimer = null;
		const work: Promise<unknown>[] = [];
		if (this.linksDirty) work.push(this.saveLinks());
		if (this.projectsDirty) work.push(this.saveProjects());
		await Promise.all(work);
	}

	// ---- Header -----------------------------------------------------------------

	async saveField(field: HeaderField): Promise<void> {
		const sent = this.header[field];
		const saved = field === 'name' ? this.name : this.settings[field];
		const change = headerChange(sent, saved);
		if (change === undefined) {
			this.clearFieldError(field);
			return;
		}
		if (field === 'name' && !change) {
			this.fieldErrors = { ...this.fieldErrors, name: 'Add your name.' };
			return;
		}
		const ok = await this.patch(field, { [field]: change }, false);
		if (!ok) return;
		if (field === 'name') this.name = change;
		else this.settings = { ...this.settings, [field]: change };
		// Show the cleaned value unless they kept typing while it saved.
		if (this.header[field] === sent) this.header[field] = change ?? '';
	}

	async setAvatar(url: string | null): Promise<void> {
		const ok = await this.patch('avatar_url', { avatar_url: url }, true);
		if (ok) this.settings = { ...this.settings, avatar_url: url };
	}

	private async patch(
		field: SavableField,
		body: Record<string, unknown>,
		reload: boolean
	): Promise<boolean> {
		this.fieldSaving = field;
		const result = await this.track(
			() => callApi<{ saved: boolean }>(BASE, 'PATCH', body),
			(r) => (r.ok ? null : r.error)
		);
		if (this.fieldSaving === field) this.fieldSaving = null;
		if (!result.ok) {
			this.fieldErrors = { ...this.fieldErrors, [field]: result.error };
			return false;
		}
		this.clearFieldError(field);
		if (reload) void this.refreshPreview();
		return true;
	}

	private clearFieldError(field: SavableField) {
		if (!this.fieldErrors[field]) return;
		const next = { ...this.fieldErrors };
		delete next[field];
		this.fieldErrors = next;
	}

	// ---- Photo and cover ----------------------------------------------------------

	async uploadImage(kind: CropShape, blob: Blob): Promise<boolean> {
		if (this.imageBusy) return false;
		this.imageBusy = kind;
		this.imageError = null;
		const form = new FormData();
		form.append('kind', kind);
		form.append('file', blob, `${kind}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`);
		const result = await this.track(
			async () => {
				try {
					const res = await fetch(`${BASE}/image`, {
						method: 'POST',
						body: form,
						credentials: 'same-origin'
					});
					const payload = (await res.json().catch(() => null)) as {
						data?: { url?: string };
						error?: string;
					} | null;
					if (!res.ok || !payload?.data?.url) {
						return {
							ok: false as const,
							error: payload?.error || 'Could not save that image. Try again.'
						};
					}
					return { ok: true as const, url: payload.data.url };
				} catch {
					return {
						ok: false as const,
						error: 'Could not reach BuildOS. Check your connection and try again.'
					};
				}
			},
			(r) => (r.ok ? null : r.error)
		);
		this.imageBusy = null;
		if (!result.ok) {
			this.imageError = result.error;
			return false;
		}
		const column = kind === 'avatar' ? 'avatar_url' : 'cover_url';
		this.settings = { ...this.settings, [column]: result.url };
		return true;
	}

	async removeImage(kind: CropShape): Promise<void> {
		if (this.imageBusy) return;
		this.imageBusy = kind;
		this.imageError = null;
		const result = await this.track(
			() =>
				callApi<{ removed: boolean }>(
					`${BASE}/image?kind=${kind}`,
					'DELETE',
					undefined,
					'Could not remove that image. Try again.'
				),
			(r) => (r.ok ? null : r.error)
		);
		this.imageBusy = null;
		if (!result.ok) {
			this.imageError = result.error;
			return;
		}
		const column = kind === 'avatar' ? 'avatar_url' : 'cover_url';
		this.settings = { ...this.settings, [column]: null };
	}

	// ---- Draft my page ------------------------------------------------------------

	async draftPage(): Promise<void> {
		if (this.suggestionBusy) return;
		const projectIds = draftProjectIds(this.rows);
		this.suggestionBusy = true;
		this.suggestionError = null;
		const result = await callApi<BuilderPageDraftSuggestion>(
			`${BASE}/draft`,
			'POST',
			{ project_ids: projectIds },
			'Could not draft your page. Try again.'
		);
		this.suggestionBusy = false;
		if (!result.ok || !result.data) {
			this.suggestionError = result.ok
				? 'Could not draft your page. Try again.'
				: result.error;
			return;
		}
		this.suggestion = result.data;
		this.usedSuggestions = [];
	}

	dismissSuggestion(): void {
		this.suggestion = null;
		this.suggestionError = null;
		this.usedSuggestions = [];
	}

	async useSuggestedText(field: 'headline' | 'bio'): Promise<void> {
		const text = this.suggestion?.[field];
		if (!text) return;
		this.header[field] = text.slice(0, LIMITS[field]);
		this.markUsed(field);
		await this.saveField(field);
	}

	useSuggestedPitch(projectId: string): void {
		const pitch = this.suggestion?.pitches.find((p) => p.project_id === projectId)?.pitch;
		if (!pitch) return;
		this.rows = applySuggestedPitch(this.rows, projectId, pitch);
		this.markUsed(`pitch:${projectId}`);
	}

	async useAllSuggestions(): Promise<void> {
		const suggestion = this.suggestion;
		if (!suggestion) return;
		for (const field of ['headline', 'bio'] as const) {
			if (suggestion[field]) await this.useSuggestedText(field);
		}
		for (const { project_id } of suggestion.pitches) this.useSuggestedPitch(project_id);
	}

	private markUsed(key: string) {
		if (!this.usedSuggestions.includes(key))
			this.usedSuggestions = [...this.usedSuggestions, key];
	}

	// ---- Links ------------------------------------------------------------------

	addLink(kind: 'social' | 'link'): string | null {
		if (this.socials.length + this.links.length >= LIMITS.links) return null;
		const row = blankLinkRow(kind);
		if (kind === 'social') this.socials = [...this.socials, row];
		else this.links = [...this.links, row];
		return row.key;
	}

	removeLink(kind: 'social' | 'link', key: string): void {
		if (kind === 'social') this.socials = this.socials.filter((r) => r.key !== key);
		else this.links = this.links.filter((r) => r.key !== key);
	}

	moveLink(kind: 'social' | 'link', from: number, to: number): void {
		const list = kind === 'social' ? this.socials : this.links;
		const next = moveItem(list, from, to - from);
		if (kind === 'social') this.socials = next;
		else this.links = next;
	}

	/** Called whenever the links change; saves once typing settles and every row is valid. */
	scheduleLinksSave(): void {
		if (this.#linksTimer) clearTimeout(this.#linksTimer);
		this.#linksTimer = setTimeout(() => {
			this.#linksTimer = null;
			void this.saveLinks();
		}, AUTOSAVE_MS);
	}

	async saveLinks(): Promise<boolean> {
		if (!this.linksDirty || Object.keys(this.linkErrors).length) return false;
		if (this.linksBusy) {
			this.scheduleLinksSave();
			return false;
		}
		const sentKey = this.linksKeyNow;
		this.linksBusy = true;
		this.linksError = null;
		const result = await this.track(
			() =>
				callApi<unknown>(
					`${BASE}/links`,
					'PUT',
					buildLinksPayload(this.socials, this.links),
					'Could not save your links. Try again.'
				),
			(r) => (r.ok ? null : r.error)
		);
		this.linksBusy = false;
		if (!result.ok) {
			this.linksError = result.error;
			return false;
		}
		this.savedLinksKey = sentKey;
		if (this.linksDirty) this.scheduleLinksSave();
		return true;
	}

	// ---- Projects ---------------------------------------------------------------

	setLevel(projectId: string, level: EditorLevel): void {
		this.rows = setRowLevel(this.rows, projectId, level);
	}

	/** Put a hidden project on the page (Listed) and open it. */
	addProject(projectId: string): boolean {
		const before = this.placedRows.length;
		this.setLevel(projectId, 'listed');
		if (this.placedRows.length === before) return false;
		this.open('projects', projectId);
		return true;
	}

	removeProject(projectId: string): void {
		this.setLevel(projectId, 'hidden');
		if (this.openProjectId === projectId) this.openProjectId = null;
	}

	moveProject(projectId: string, delta: -1 | 1): void {
		this.rows = movePlacedRow(this.rows, projectId, delta);
	}

	/** Move a placed project from one spot to another (drag to reorder). */
	movePlaced(from: number, to: number): void {
		const count = this.placedRows.length;
		if (from < 0 || from >= count || to < 0 || to >= count || from === to) return;
		this.rows = moveItem(this.rows, from, to - from);
	}

	/** Edit one row in place (typing in a project's fields). */
	patchRow(projectId: string, patch: Partial<Omit<EditorProjectRow, 'project'>>): void {
		const row = this.rows.find((r) => r.project.project_id === projectId);
		if (row) Object.assign(row, patch);
	}

	toggleGoal(projectId: string, goalId: string): void {
		this.rows = this.rows.map((row) =>
			row.project.project_id === projectId
				? { ...row, goal_ids: toggleGoal(row, goalId) }
				: row
		);
	}

	scheduleProjectsSave(): void {
		if (this.#projectsTimer) clearTimeout(this.#projectsTimer);
		this.#projectsTimer = setTimeout(() => {
			this.#projectsTimer = null;
			void this.saveProjects();
		}, AUTOSAVE_MS);
	}

	async saveProjects(): Promise<boolean> {
		if (
			!this.projectsDirty ||
			Object.keys(this.projectErrors).length ||
			Object.keys(this.replyErrors).length
		)
			return false;
		if (this.projectsBusy) {
			this.scheduleProjectsSave();
			return false;
		}
		const sentKey = this.projectsKeyNow;
		const payload = buildProjectsPayload(this.rows);
		const placedBefore = new Set(
			(this.preview?.projects ?? []).map((card) => `${card.id}:${card.level}`)
		);
		this.projectsBusy = true;
		this.projectsError = null;
		const result = await this.track(
			() =>
				callApi<{ saved: number }>(
					`${BASE}/projects`,
					'PUT',
					payload,
					'Could not save your projects. Try again.'
				),
			(r) => (r.ok ? null : r.error)
		);
		this.projectsBusy = false;
		if (!result.ok) {
			this.projectsError = result.error;
			return false;
		}
		this.savedProjectsKey = sentKey;
		// A project newly shown or made Live needs its bars and counts from the server.
		const needsReload = payload.projects.some(
			(p) => !placedBefore.has(`${p.project_id}:${p.level}`)
		);
		if (needsReload) void this.refreshPreview();
		if (this.projectsDirty) this.scheduleProjectsSave();
		return true;
	}

	// ---- Section toggles --------------------------------------------------------

	async setToggle(key: ToggleSetting, value: boolean): Promise<void> {
		if (this.toggleBusy[key]) return;
		const previous = this.settings[key];
		this.settings = { ...this.settings, [key]: value };
		this.toggleBusy = { ...this.toggleBusy, [key]: true };
		if (this.toggleError?.key === key) this.toggleError = null;
		const result = await this.track(
			() => callApi<{ saved: boolean }>(BASE, 'PATCH', { [key]: value }),
			(r) => (r.ok ? null : r.error)
		);
		this.toggleBusy = { ...this.toggleBusy, [key]: false };
		if (!result.ok) {
			this.settings = { ...this.settings, [key]: previous };
			this.toggleError = { key, message: result.error };
			return;
		}
		if (RELOAD_AFTER.includes(key)) void this.refreshPreview();
	}

	// ---- Weekly update ----------------------------------------------------------

	private setDrafts(drafts: BuilderProfileUpdateDraft[]) {
		this.drafts = drafts.filter((d) => d.status === 'drafted');
		const bodies: Record<string, string> = {};
		for (const d of this.drafts) bodies[d.id] = this.draftBodies[d.id] ?? d.body;
		this.draftBodies = bodies;
		this.draftErrors = {};
	}

	draftLimit(draft: BuilderProfileUpdateDraft): number {
		return draft.project_id ? LIMITS.this_week : LIMITS.now_text;
	}

	async draftThisWeek(): Promise<void> {
		if (this.weeklyBusy) return;
		await this.flush();
		this.weeklyBusy = 'draft';
		this.weeklyMessage = null;
		this.weeklyError = null;
		const result = await callApi<{ created: number }>(
			`${BASE}/updates`,
			'POST',
			{ action: 'draft' },
			'Could not draft this week’s update. Try again.'
		);
		if (!result.ok) {
			this.weeklyBusy = null;
			this.weeklyError = result.error;
			return;
		}
		if (!result.data?.created) {
			this.weeklyBusy = null;
			this.weeklyMessage = NOTHING_MOVED;
			return;
		}
		const editor = await callApi<BuilderEditorData>(BASE, 'GET');
		this.weeklyBusy = null;
		if (editor.ok && editor.data) {
			// New drafts replace the old ones; start each textarea from the new text.
			this.draftBodies = {};
			this.setDrafts(editor.data.drafts);
		} else {
			this.weeklyError = 'Drafted, but could not load the drafts. Refresh to see them.';
		}
	}

	async decideDraft(draftId: string, action: 'publish' | 'skip'): Promise<boolean> {
		const draft = this.drafts.find((d) => d.id === draftId);
		if (!draft || this.draftBusy[draftId]) return false;
		const body = normalizeText(this.draftBodies[draftId] ?? draft.body);
		if (action === 'publish' && !body) {
			this.draftErrors = {
				...this.draftErrors,
				[draftId]: 'Write something first, or skip it.'
			};
			return false;
		}
		this.draftBusy = { ...this.draftBusy, [draftId]: action };
		const result = await this.track(
			() =>
				callApi<unknown>(
					`${BASE}/updates`,
					'PATCH',
					action === 'publish' ? { id: draftId, action, body } : { id: draftId, action }
				),
			(r) => (r.ok ? null : r.error)
		);
		const busy = { ...this.draftBusy };
		delete busy[draftId];
		this.draftBusy = busy;
		if (!result.ok) {
			this.draftErrors = { ...this.draftErrors, [draftId]: result.error };
			return false;
		}
		if (action === 'publish') this.applyPublishedLine(draft, body);
		this.removeDraft(draftId);
		if (action === 'publish') void this.refreshPreview();
		return true;
	}

	/**
	 * Publish every waiting line. Lines the owner edited go one by one with their new
	 * text; the rest go in a single publish_all call as written.
	 */
	async publishAllDrafts(): Promise<void> {
		if (this.weeklyBusy || this.drafts.length === 0) return;
		this.weeklyBusy = 'publish_all';
		this.weeklyError = null;
		this.weeklyMessage = null;
		const edited = this.drafts.filter(
			(d) => normalizeText(this.draftBodies[d.id] ?? d.body) !== normalizeText(d.body)
		);
		for (const draft of edited) {
			const ok = await this.decideDraft(draft.id, 'publish');
			if (!ok) {
				this.weeklyBusy = null;
				this.weeklyError = 'Some lines did not publish. Check the messages below.';
				return;
			}
		}
		const rest = [...this.drafts];
		if (rest.length) {
			const result = await this.track(
				() =>
					callApi<{ published: number }>(`${BASE}/updates`, 'PATCH', {
						action: 'publish_all'
					}),
				(r) => (r.ok ? null : r.error)
			);
			if (!result.ok) {
				this.weeklyBusy = null;
				this.weeklyError = result.error;
				return;
			}
			for (const draft of rest) {
				this.applyPublishedLine(draft, normalizeText(draft.body));
				this.removeDraft(draft.id);
			}
		}
		this.weeklyBusy = null;
		void this.refreshPreview();
	}

	private removeDraft(draftId: string) {
		this.drafts = this.drafts.filter((d) => d.id !== draftId);
		const bodies = { ...this.draftBodies };
		delete bodies[draftId];
		this.draftBodies = bodies;
		const errors = { ...this.draftErrors };
		delete errors[draftId];
		this.draftErrors = errors;
	}

	/** A published line lands on the page; mirror it so the editor shows the same text. */
	private applyPublishedLine(draft: BuilderProfileUpdateDraft, body: string) {
		if (!draft.project_id) {
			const untouched =
				normalizeText(this.header.now_text) === normalizeText(this.settings.now_text);
			this.settings = { ...this.settings, now_text: body };
			if (untouched) this.header.now_text = body;
			return;
		}
		const pid = draft.project_id;
		const row = this.rows.find((r) => r.project.project_id === pid);
		if (!row) return;
		// The server already saved this line; keep the saved snapshot in step so it
		// doesn't count as an unsaved change.
		const wasClean = !this.projectsDirty;
		row.this_week = body;
		if (wasClean) this.savedProjectsKey = projectsKey(this.rows);
	}

	// ---- Misc -------------------------------------------------------------------

	dispose(): void {
		for (const timer of this.#timers) clearTimeout(timer);
		this.#timers.clear();
		if (this.#linksTimer) clearTimeout(this.#linksTimer);
		if (this.#projectsTimer) clearTimeout(this.#projectsTimer);
		if (this.#savedFlash) clearTimeout(this.#savedFlash);
	}
}
