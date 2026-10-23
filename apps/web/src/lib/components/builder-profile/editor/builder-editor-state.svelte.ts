// apps/web/src/lib/components/builder-profile/editor/builder-editor-state.svelte.ts
//
// The state behind "Your page" (Profile > People & agents). One instance per editor;
// the section components read and write it directly. Saves go out per group (header
// fields on blur, links and projects with their Save buttons, toggles at once), and
// every successful save refreshes the live preview. A failed save keeps whatever the
// owner typed and puts the server's message next to the control.

import type {
	BuilderEditorData,
	BuilderPageDraftSuggestion,
	BuilderProfileSettings,
	BuilderProfileStatus,
	BuilderProfileUpdateDraft,
	BuilderProfileView
} from '$lib/builder-profile/types';
import { normalizeLinkUrl } from '$lib/builder-profile/links';
import { callApi } from './editor-api';
import {
	applySuggestedPitch,
	blankLinkRow,
	buildLinksPayload,
	buildProjectsPayload,
	draftProjectIds,
	headerChange,
	headerDraftsFrom,
	isBlankLinkRow,
	linkRowError,
	linkRowsFrom,
	linksKey,
	LIMITS,
	moveItem,
	movePlacedRow,
	normalizeText,
	previewViewFor,
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

export type SavableField = HeaderField | 'avatar_url';
export type ToggleSetting =
	| 'show_build_log'
	| 'build_log_includes_private'
	| 'show_agent_split'
	| 'show_writing'
	| 'show_builds_with'
	| 'show_on_collaborator_pages'
	| 'weekly_drafts';

const EMPTY_SETTINGS: BuilderProfileSettings = {
	headline: null,
	location: null,
	avatar_url: null,
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

export class BuilderPageEditorState {
	/** Called after Publish or Take down succeeds (publishing turns on handle findability). */
	onstatuschange: ((status: BuilderProfileStatus) => void) | null = null;
	// ---- Load ----
	loading = $state(true);
	loadError = $state<string | null>(null);

	// ---- Identity and status ----
	handle = $state<string | null>(null);
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
	/** The field that just saved, for a quiet "Saved". */
	justSaved = $state<SavableField | null>(null);

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
	linksAttempted = $state(false);
	linksJustSaved = $state(false);

	// ---- Projects ----
	rows = $state<EditorProjectRow[]>([]);
	savedRows = $state.raw<EditorProjectRow[]>([]);
	projectsBusy = $state(false);
	projectsError = $state<string | null>(null);
	projectsAttempted = $state(false);
	projectsJustSaved = $state(false);

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
	previewLoading = $state(true);
	previewError = $state<string | null>(null);
	previewAudience = $state<PreviewAudience>('anyone');

	// ---- Derived ----
	linksDirty = $derived(linksKey(this.socials, this.links) !== this.savedLinksKey);
	projectsDirty = $derived(projectsKey(this.rows) !== projectsKey(this.savedRows));
	projectErrors = $derived(projectRowErrors(this.rows));
	previewView = $derived(this.preview ? previewViewFor(this.preview, this.previewAudience) : null);
	pageUrl = $derived(
		this.handle ? `${(this.origin || 'https://build-os.com').replace(/\/$/, '')}/@${this.handle}` : null
	);

	#previewSeq = 0;
	#timers = new Set<ReturnType<typeof setTimeout>>();

	// ---- Loading ----------------------------------------------------------------

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
		this.settings = { ...data.settings };
		this.header = headerDraftsFrom(data.settings);
		this.signInAvatarUrl = data.sign_in_avatar_url;
		const split = linkRowsFrom(data.links);
		this.socials = split.socials;
		this.links = split.links;
		this.savedLinksKey = linksKey(split.socials, split.links);
		const rows = rowsFromProjects(data.projects);
		this.rows = rows;
		this.savedRows = rows.map((row) => ({ ...row, goal_ids: [...row.goal_ids] }));
		this.setDrafts(data.drafts);
	}

	/** After the handle changes above: pick up the new handle and status only. */
	async refreshIdentity(): Promise<void> {
		const editor = await callApi<BuilderEditorData>(BASE, 'GET');
		if (editor.ok && editor.data) {
			this.handle = editor.data.handle;
			this.name = editor.data.name;
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
		this.previewLoading = false;
		if (!result.ok) {
			this.previewError = result.error;
			return;
		}
		this.previewError = null;
		this.preview = result.data?.view ?? null;
		if (result.data?.origin) this.origin = result.data.origin;
	}

	// ---- Publish ----------------------------------------------------------------

	async setPublished(publish: boolean): Promise<void> {
		if (this.publishBusy) return;
		this.publishBusy = true;
		this.publishError = null;
		const result = await callApi<{ status: BuilderProfileStatus }>(
			`${BASE}/publish`,
			'POST',
			{ publish },
			publish ? 'Could not publish your page. Try again.' : 'Could not take your page down. Try again.'
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

	// ---- Header -----------------------------------------------------------------

	async saveField(field: HeaderField): Promise<void> {
		const sent = this.header[field];
		const change = headerChange(sent, this.settings[field]);
		if (change === undefined) {
			this.clearFieldError(field);
			return;
		}
		const ok = await this.patch(field, { [field]: change });
		if (!ok) return;
		this.settings = { ...this.settings, [field]: change };
		// Show the cleaned value unless they kept typing while it saved.
		if (this.header[field] === sent) this.header[field] = change ?? '';
	}

	async setAvatar(url: string | null): Promise<void> {
		const ok = await this.patch('avatar_url', { avatar_url: url });
		if (ok) this.settings = { ...this.settings, avatar_url: url };
	}

	private async patch(field: SavableField, body: Record<string, unknown>): Promise<boolean> {
		this.fieldSaving = field;
		const result = await callApi<{ saved: boolean }>(BASE, 'PATCH', body);
		if (this.fieldSaving === field) this.fieldSaving = null;
		if (!result.ok) {
			this.fieldErrors = { ...this.fieldErrors, [field]: result.error };
			return false;
		}
		this.clearFieldError(field);
		this.flash('field', field);
		void this.refreshPreview();
		return true;
	}

	private clearFieldError(field: SavableField) {
		if (!this.fieldErrors[field]) return;
		const next = { ...this.fieldErrors };
		delete next[field];
		this.fieldErrors = next;
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
			this.suggestionError = result.ok ? 'Could not draft your page. Try again.' : result.error;
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

	async useSuggestedPitch(projectId: string): Promise<void> {
		const pitch = this.suggestion?.pitches.find((p) => p.project_id === projectId)?.pitch;
		if (!pitch) return;
		this.rows = applySuggestedPitch(this.rows, projectId, pitch);
		this.markUsed(`pitch:${projectId}`);
		await this.saveProjectsFromSuggestion();
	}

	async useAllSuggestions(): Promise<void> {
		const suggestion = this.suggestion;
		if (!suggestion) return;
		const patch: Partial<Pick<BuilderProfileSettings, 'headline' | 'bio'>> = {};
		for (const field of ['headline', 'bio'] as const) {
			const text = suggestion[field];
			if (!text) continue;
			this.header[field] = text.slice(0, LIMITS[field]);
			const change = headerChange(this.header[field], this.settings[field]);
			if (change !== undefined) patch[field] = change;
			this.markUsed(field);
		}
		let rows = this.rows;
		for (const { project_id, pitch } of suggestion.pitches) {
			rows = applySuggestedPitch(rows, project_id, pitch);
			this.markUsed(`pitch:${project_id}`);
		}
		this.rows = rows;
		if (Object.keys(patch).length) {
			const target: SavableField = 'headline' in patch ? 'headline' : 'bio';
			const ok = await this.patch(target, patch);
			if (ok) this.settings = { ...this.settings, ...patch };
		}
		if (suggestion.pitches.length) await this.saveProjectsFromSuggestion();
	}

	/** Save after accepting a pitch; a failure shows in the draft panel too, where they clicked. */
	private async saveProjectsFromSuggestion() {
		const ok = await this.saveProjects();
		if (!ok && this.projectsError) {
			this.suggestionError = `The pitch is in place but not saved yet. ${this.projectsError}`;
		}
	}

	private markUsed(key: string) {
		if (!this.usedSuggestions.includes(key)) this.usedSuggestions = [...this.usedSuggestions, key];
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

	moveLink(kind: 'social' | 'link', index: number, delta: -1 | 1): void {
		if (kind === 'social') this.socials = moveItem(this.socials, index, delta);
		else this.links = moveItem(this.links, index, delta);
	}

	async saveLinks(): Promise<boolean> {
		if (this.linksBusy) return false;
		this.linksAttempted = true;
		const invalid = [...this.socials, ...this.links].some((row) => linkRowError(row));
		if (invalid) {
			this.linksError = 'Fix the links marked below, then save.';
			return false;
		}
		this.linksBusy = true;
		this.linksError = null;
		const result = await callApi<unknown>(
			`${BASE}/links`,
			'PUT',
			buildLinksPayload(this.socials, this.links),
			'Could not save your links. Try again.'
		);
		this.linksBusy = false;
		if (!result.ok) {
			this.linksError = result.error;
			return false;
		}
		const tidy = (rows: EditorLinkRow[]) =>
			rows
				.filter((row) => !isBlankLinkRow(row))
				.map((row) => ({ ...row, url: normalizeLinkUrl(row.url) ?? row.url }));
		this.socials = tidy(this.socials);
		this.links = tidy(this.links);
		this.savedLinksKey = linksKey(this.socials, this.links);
		this.linksAttempted = false;
		this.flash('links');
		void this.refreshPreview();
		return true;
	}

	// ---- Projects ---------------------------------------------------------------

	setLevel(projectId: string, level: EditorLevel): void {
		this.rows = setRowLevel(this.rows, projectId, level);
	}

	moveProject(projectId: string, delta: -1 | 1): void {
		this.rows = movePlacedRow(this.rows, projectId, delta);
	}

	/** Edit one row in place (typing in a project's fields). */
	patchRow(projectId: string, patch: Partial<Omit<EditorProjectRow, 'project'>>): void {
		const row = this.rows.find((r) => r.project.project_id === projectId);
		if (row) Object.assign(row, patch);
	}

	toggleGoal(projectId: string, goalId: string): void {
		this.rows = this.rows.map((row) =>
			row.project.project_id === projectId ? { ...row, goal_ids: toggleGoal(row, goalId) } : row
		);
	}

	async saveProjects(): Promise<boolean> {
		if (this.projectsBusy) return false;
		this.projectsAttempted = true;
		if (Object.keys(projectRowErrors(this.rows)).length) {
			this.projectsError = 'Fix the project links marked below, then save.';
			return false;
		}
		this.projectsBusy = true;
		this.projectsError = null;
		const snapshot = this.rows.map((row) => ({ ...row, goal_ids: [...row.goal_ids] }));
		const result = await callApi<{ saved: number }>(
			`${BASE}/projects`,
			'PUT',
			buildProjectsPayload(snapshot),
			'Could not save your projects. Try again.'
		);
		this.projectsBusy = false;
		if (!result.ok) {
			this.projectsError = result.error;
			return false;
		}
		this.savedRows = snapshot;
		this.projectsAttempted = false;
		this.flash('projects');
		void this.refreshPreview();
		return true;
	}

	// ---- Section toggles --------------------------------------------------------

	async setToggle(key: ToggleSetting, value: boolean): Promise<void> {
		if (this.toggleBusy[key]) return;
		const previous = this.settings[key];
		this.settings = { ...this.settings, [key]: value };
		this.toggleBusy = { ...this.toggleBusy, [key]: true };
		if (this.toggleError?.key === key) this.toggleError = null;
		const result = await callApi<{ saved: boolean }>(BASE, 'PATCH', { [key]: value });
		this.toggleBusy = { ...this.toggleBusy, [key]: false };
		if (!result.ok) {
			this.settings = { ...this.settings, [key]: previous };
			this.toggleError = { key, message: result.error };
			return;
		}
		if (key !== 'weekly_drafts') void this.refreshPreview();
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
			this.draftErrors = { ...this.draftErrors, [draftId]: 'Write something first, or skip it.' };
			return false;
		}
		this.draftBusy = { ...this.draftBusy, [draftId]: action };
		const result = await callApi<unknown>(
			`${BASE}/updates`,
			'PATCH',
			action === 'publish' ? { id: draftId, action, body } : { id: draftId, action }
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
			const result = await callApi<{ published: number }>(`${BASE}/updates`, 'PATCH', {
				action: 'publish_all'
			});
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
			const untouched = normalizeText(this.header.now_text) === normalizeText(this.settings.now_text);
			this.settings = { ...this.settings, now_text: body };
			if (untouched) this.header.now_text = body;
			return;
		}
		const pid = draft.project_id;
		const savedRow = this.savedRows.find((r) => r.project.project_id === pid);
		const liveRow = this.rows.find((r) => r.project.project_id === pid);
		const untouched = normalizeText(liveRow?.this_week) === normalizeText(savedRow?.this_week);
		this.savedRows = this.savedRows.map((r) =>
			r.project.project_id === pid ? { ...r, this_week: body } : r
		);
		if (untouched) {
			this.rows = this.rows.map((r) => (r.project.project_id === pid ? { ...r, this_week: body } : r));
		}
	}

	// ---- Misc -------------------------------------------------------------------

	private flash(kind: 'field' | 'links' | 'projects', field?: SavableField) {
		if (kind === 'field' && field) this.justSaved = field;
		if (kind === 'links') this.linksJustSaved = true;
		if (kind === 'projects') this.projectsJustSaved = true;
		const timer = setTimeout(() => {
			this.#timers.delete(timer);
			if (kind === 'field' && this.justSaved === field) this.justSaved = null;
			if (kind === 'links') this.linksJustSaved = false;
			if (kind === 'projects') this.projectsJustSaved = false;
		}, 2400);
		this.#timers.add(timer);
	}

	dispose(): void {
		for (const timer of this.#timers) clearTimeout(timer);
		this.#timers.clear();
	}
}
