// apps/worker/src/workers/brief/todayWaitingItems.ts
/**
 * Today page: "Waiting on you" / "You're waiting on".
 *
 * Once per morning brief, a cheap model reads the person's open and blocked tasks and
 * project next steps and lists concrete asks: someone (a person, organization or agent)
 * waiting on the person, or the person waiting on someone. Rows land in
 * today_waiting_items keyed by a stable item_key, so tomorrow's pass updates them instead
 * of adding copies. Rows the person resolved or dismissed are never reopened.
 *
 * The model returns short refs (P1, T4) that this module maps back to ids it passed in;
 * anything that doesn't map is dropped. Meaning comes from the model's structured output,
 * never from keyword matching.
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { DEEPSEEK_V4_FLASH_MODEL, XIAOMI_MIMO_V25_MODEL } from '@buildos/smart-llm';
import { SmartLLMService } from '../../lib/services/smart-llm-service.js';
import { buildProjectAccessFilter } from './ontologyBriefDataLoader.js';

export const TODAY_WAITING_MODELS = [DEEPSEEK_V4_FLASH_MODEL, XIAOMI_MIMO_V25_MODEL] as const;
export const TODAY_WAITING_MAX_ITEMS = 12;
const MAX_PROJECTS = 30;
const MAX_TASKS = 60;
const MAX_EXISTING = 40;
const TASK_FETCH_LIMIT = 400;
const RECENT_TASK_DAYS = 30;
const OVERDUE_TASK_DAYS = 30;
const DUE_SOON_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const DIRECTIONS = ['on_you', 'on_them'] as const;
const WHO_KINDS = ['person', 'agent', 'organization'] as const;
type Direction = (typeof DIRECTIONS)[number];
type WhoKind = (typeof WHO_KINDS)[number];

export interface WaitingProjectInput {
	id: string;
	name: string;
	next_step_short: string | null;
	next_step_long: string | null;
	updated_at: string | null;
}

export interface WaitingTaskInput {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	state_key: string;
	due_at: string | null;
	updated_at: string | null;
	created_at: string | null;
}

export interface WaitingExistingItem {
	item_key: string;
	direction: string;
	who: string;
	what: string;
	since: string | null;
}

export interface TodayWaitingInputs {
	userName: string | null;
	projects: WaitingProjectInput[];
	tasks: WaitingTaskInput[];
	existing: WaitingExistingItem[];
}

export interface WaitingLLMItem {
	key?: unknown;
	direction?: unknown;
	who?: unknown;
	who_kind?: unknown;
	what?: unknown;
	project_ref?: unknown;
	task_ref?: unknown;
	since?: unknown;
}

export interface WaitingLLMResponse {
	items?: unknown;
	resolved_keys?: unknown;
}

export interface ValidWaitingItem {
	item_key: string;
	direction: Direction;
	who: string;
	who_kind: WhoKind;
	what: string;
	project_id: string;
	task_id: string | null;
	since: string | null;
}

export interface RefMaps {
	projects: Map<string, WaitingProjectInput>;
	tasks: Map<string, WaitingTaskInput>;
}

type JSONCaller = Pick<SmartLLMService, 'getJSONResponse'>;

export interface RefreshTodayWaitingItemsParams {
	supabase: TypedSupabaseClient;
	userId: string;
	actorId: string;
	timezone: string;
	briefDate: string;
	signal?: AbortSignal;
	/** Tests inject a fake; production builds a SmartLLMService. */
	llm?: JSONCaller;
	now?: Date;
}

export type RefreshTodayWaitingItemsResult =
	| { status: 'skipped'; reason: 'disabled' | 'no_projects' | 'no_inputs' }
	| { status: 'refreshed'; saved: number; resolved: number; dropped: number; kept: number };

export function isTodayWaitingItemsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return (env.TODAY_WAITING_ITEMS ?? '').trim().toLowerCase() !== 'off';
}

// ============================================================================
// Inputs
// ============================================================================

function clip(value: string | null | undefined, max: number): string {
	const text = (value ?? '').replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Blocked tasks first, then the most recently touched; open tasks only. */
export function selectWaitingTasks(tasks: WaitingTaskInput[], now: Date): WaitingTaskInput[] {
	const nowMs = now.getTime();
	const keep = tasks.filter((task) => {
		if (task.state_key === 'blocked') return true;
		if (task.state_key !== 'todo' && task.state_key !== 'in_progress') return false;
		const updated = task.updated_at ? Date.parse(task.updated_at) : NaN;
		if (Number.isFinite(updated) && nowMs - updated <= RECENT_TASK_DAYS * DAY_MS) return true;
		const due = task.due_at ? Date.parse(task.due_at) : NaN;
		return (
			Number.isFinite(due) &&
			due <= nowMs + DUE_SOON_DAYS * DAY_MS &&
			due >= nowMs - OVERDUE_TASK_DAYS * DAY_MS
		);
	});
	const rank = (task: WaitingTaskInput) => (task.state_key === 'blocked' ? 0 : 1);
	return keep
		.sort(
			(a, b) =>
				rank(a) - rank(b) ||
				(Date.parse(b.updated_at ?? '') || 0) - (Date.parse(a.updated_at ?? '') || 0)
		)
		.slice(0, MAX_TASKS);
}

export async function loadTodayWaitingInputs(
	supabase: TypedSupabaseClient,
	userId: string,
	actorId: string,
	now: Date
): Promise<TodayWaitingInputs> {
	const { data: memberRows, error: memberError } = await supabase
		.from('onto_project_members')
		.select('project_id')
		.eq('actor_id', actorId)
		.is('removed_at', null);
	if (memberError) throw new Error(`Failed to load memberships: ${memberError.message}`);

	const { data: projectRows, error: projectError } = await supabase
		.from('onto_projects')
		.select('id, name, next_step_short, next_step_long, updated_at')
		.or(
			buildProjectAccessFilter({
				actorId,
				userId,
				memberProjectIds: (memberRows ?? []).map((row) => row.project_id)
			})
		)
		.in('state_key', ['planning', 'active'])
		.is('deleted_at', null)
		.is('archived_at', null)
		.order('updated_at', { ascending: false })
		.limit(MAX_PROJECTS);
	if (projectError) throw new Error(`Failed to load projects: ${projectError.message}`);
	const projects = (projectRows ?? []) as WaitingProjectInput[];

	let tasks: WaitingTaskInput[] = [];
	if (projects.length > 0) {
		const { data: taskRows, error: taskError } = await supabase
			.from('onto_tasks')
			.select('id, project_id, title, description, state_key, due_at, updated_at, created_at')
			.in(
				'project_id',
				projects.map((project) => project.id)
			)
			.in('state_key', ['todo', 'in_progress', 'blocked'])
			.is('deleted_at', null)
			.is('archived_at', null)
			.order('updated_at', { ascending: false })
			.limit(TASK_FETCH_LIMIT);
		if (taskError) throw new Error(`Failed to load tasks: ${taskError.message}`);
		tasks = selectWaitingTasks((taskRows ?? []) as WaitingTaskInput[], now);
	}

	const { data: existingRows, error: existingError } = await supabase
		.from('today_waiting_items')
		.select('item_key, direction, who, what, since')
		.eq('user_id', userId)
		.eq('status', 'open')
		.order('last_seen_at', { ascending: false })
		.limit(MAX_EXISTING);
	if (existingError) throw new Error(`Failed to load waiting items: ${existingError.message}`);

	const { data: user } = await supabase
		.from('users')
		.select('name')
		.eq('id', userId)
		.maybeSingle();

	return {
		userName: user?.name?.trim() || null,
		projects,
		tasks,
		existing: (existingRows ?? []) as WaitingExistingItem[]
	};
}

// ============================================================================
// Prompt
// ============================================================================

export function buildRefMaps(inputs: TodayWaitingInputs): RefMaps {
	const projects = new Map<string, WaitingProjectInput>();
	inputs.projects.forEach((project, index) => projects.set(`P${index + 1}`, project));
	const projectIds = new Set(inputs.projects.map((project) => project.id));
	const tasks = new Map<string, WaitingTaskInput>();
	inputs.tasks
		.filter((task) => projectIds.has(task.project_id))
		.forEach((task, index) => tasks.set(`T${index + 1}`, task));
	return { projects, tasks };
}

const SYSTEM_PROMPT = `You read one person's work in BuildOS and list who is waiting on whom.

List only concrete, open asks between the person and a NAMED someone:
- direction "on_you": a named person, organization, or agent is waiting on the person (an approval, a reply, a deliverable, an intro, a payment they asked for).
- direction "on_them": the person is waiting on a named person or organization (an answer, an approval, a signature, a payment owed to the person, feedback).

Examples:
- "Get DJ's OK on 10 email drafts" → on_you, who "BuildOS agent", who_kind "agent", what "10 outreach email drafts need your OK".
- "Record DJ intro and finalize first LinkedIn batch for Rod's approval" → on_you, who "Rod", what "Waiting on your intro recording and first LinkedIn batch".
- "Await Logan's acceptance of the $1,000 website offer" → on_them, who "Logan", what "Your $1,000 website offer".
- Blocked task "Get Matt's OK on the Carolina Sportsman story pitch, then send" → on_them, who "Matt", what "OK on the Carolina Sportsman pitch".
- "Confirm the outstanding website balance and collect project payment" in project "Cody Shooting Complex Website" → on_them, who "Cody Shooting Complex", who_kind "organization", what "Website balance still to collect".

Do not list:
- Plain to-dos with nobody else involved ("Write the blog post", "Fix the signup bug").
- Vague groups with no name ("follow up with leads", "people from the meetup").
- The person themselves as "who".

Rules:
- "what" is short (under 120 characters), plain words, written to the person in the second person. Never use the person's name.
- "who" is just the name: "Rod", "Logan", "Acme", "BuildOS agent".
- project_ref is the P-ref of the project the ask belongs to. task_ref is the T-ref of the task it comes from, or null when it comes from a project next step.
- since is the date the ask started (YYYY-MM-DD), from the task's created or updated date or a date in the text; null when unclear.
- key is a short stable slug for the ask, lowercase letters, digits and hyphens (example "rod-intro-linkedin-batch"). When an ask matches one in "Already listed", reuse its key exactly.
- resolved_keys: keys from "Already listed" whose ask is clearly finished now (its task is gone or done, or the next step moved past it). Leave out keys you are unsure about.
- At most ${TODAY_WAITING_MAX_ITEMS} items, most important first. An empty list is fine.

Return JSON only:
{"items":[{"key":"...","direction":"on_you|on_them","who":"...","who_kind":"person|agent|organization","what":"...","project_ref":"P1","task_ref":"T3"|null,"since":"YYYY-MM-DD"|null}],"resolved_keys":["..."]}`;

export function buildTodayWaitingPrompt(
	inputs: TodayWaitingInputs,
	refs: RefMaps,
	context: { briefDate: string; timezone: string }
): { systemPrompt: string; userPrompt: string } {
	const lines: string[] = [];
	lines.push(`Today: ${context.briefDate} (${context.timezone})`);
	lines.push(
		inputs.userName
			? `The person is ${inputs.userName}. Tasks may name them; never write their name in "what".`
			: 'Tasks may name the person; never write their name in "what".'
	);
	lines.push('', '## Projects');
	for (const [ref, project] of refs.projects) {
		const next = clip(project.next_step_long || project.next_step_short, 280);
		lines.push(`${ref} ${clip(project.name, 80)}${next ? ` | next step: ${next}` : ''}`);
	}
	const projectRef = new Map(Array.from(refs.projects, ([ref, project]) => [project.id, ref]));
	lines.push('', '## Open tasks');
	if (refs.tasks.size === 0) lines.push('(none)');
	for (const [ref, task] of refs.tasks) {
		const parts = [
			`${ref} [${projectRef.get(task.project_id) ?? '?'}] ${clip(task.title, 160)}`,
			`state ${task.state_key}`,
			task.due_at ? `due ${task.due_at.slice(0, 10)}` : null,
			task.created_at ? `created ${task.created_at.slice(0, 10)}` : null,
			task.updated_at ? `updated ${task.updated_at.slice(0, 10)}` : null
		].filter(Boolean);
		const description = clip(task.description, 200);
		lines.push(parts.join(' | ') + (description ? ` | ${description}` : ''));
	}
	lines.push('', '## Already listed (reuse these keys for the same ask)');
	if (inputs.existing.length === 0) lines.push('(none)');
	for (const item of inputs.existing) {
		lines.push(
			`${item.item_key} | ${item.direction} | ${clip(item.who, 80)} | ${clip(item.what, 160)}`
		);
	}
	return { systemPrompt: SYSTEM_PROMPT, userPrompt: lines.join('\n') };
}

// ============================================================================
// Validation (structural only)
// ============================================================================

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,159}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function str(value: unknown): string {
	return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** Lowercases and turns separators into hyphens; a format fix, not a reading of meaning. */
export function normalizeItemKey(value: unknown): string | null {
	const key = str(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 160)
		.replace(/-+$/g, '');
	return KEY_PATTERN.test(key) ? key : null;
}

function validSince(value: unknown, today: string): string | null {
	const text = str(value);
	if (!DATE_PATTERN.test(text)) return null;
	const parsed = Date.parse(`${text}T00:00:00Z`);
	if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== text)
		return null;
	return text <= today ? text : null;
}

export function validateWaitingResponse(
	response: WaitingLLMResponse | null | undefined,
	refs: RefMaps,
	existingKeys: Set<string>,
	today: string
): { items: ValidWaitingItem[]; resolvedKeys: string[]; dropped: number } {
	const rawItems = Array.isArray(response?.items) ? (response!.items as WaitingLLMItem[]) : [];
	const items: ValidWaitingItem[] = [];
	const seen = new Set<string>();
	let dropped = 0;

	for (const raw of rawItems) {
		if (items.length >= TODAY_WAITING_MAX_ITEMS) {
			dropped += 1;
			continue;
		}
		if (!raw || typeof raw !== 'object') {
			dropped += 1;
			continue;
		}
		const key = normalizeItemKey(raw.key);
		const direction = DIRECTIONS.find((value) => value === raw.direction);
		const whoKind = WHO_KINDS.find((value) => value === raw.who_kind);
		const who = str(raw.who);
		const what = str(raw.what);
		const task =
			raw.task_ref === null || raw.task_ref === undefined
				? null
				: (refs.tasks.get(str(raw.task_ref)) ?? undefined);
		const project = refs.projects.get(str(raw.project_ref));
		// A task ref that doesn't map makes the whole item suspect.
		const projectId = task ? task.project_id : project?.id;

		if (
			!key ||
			seen.has(key) ||
			!direction ||
			!whoKind ||
			who.length < 1 ||
			who.length > 80 ||
			what.length < 1 ||
			what.length > 240 ||
			task === undefined ||
			!projectId
		) {
			dropped += 1;
			continue;
		}
		seen.add(key);
		items.push({
			item_key: key,
			direction,
			who,
			who_kind: whoKind,
			what,
			project_id: projectId,
			task_id: task?.id ?? null,
			since: validSince(raw.since, today)
		});
	}

	const rawResolved = Array.isArray(response?.resolved_keys) ? response!.resolved_keys : [];
	const resolvedKeys = Array.from(
		new Set(
			(rawResolved as unknown[])
				.map((value) => normalizeItemKey(value))
				.filter(
					(key): key is string =>
						Boolean(key) && existingKeys.has(key!) && !seen.has(key!)
				)
		)
	);

	return { items, resolvedKeys, dropped };
}

// ============================================================================
// Save
// ============================================================================

export async function saveWaitingItems(
	supabase: TypedSupabaseClient,
	userId: string,
	items: ValidWaitingItem[],
	resolvedKeys: string[],
	now: Date
): Promise<{ saved: number; resolved: number; kept: number }> {
	const nowIso = now.toISOString();
	let saved = 0;
	let kept = 0;

	if (items.length > 0) {
		const { data: priorRows, error: priorError } = await supabase
			.from('today_waiting_items')
			.select('item_key, status, since')
			.eq('user_id', userId)
			.in(
				'item_key',
				items.map((item) => item.item_key)
			);
		if (priorError) throw new Error(`Failed to read waiting items: ${priorError.message}`);
		const prior = new Map((priorRows ?? []).map((row) => [row.item_key, row]));

		// Never reopen what the person resolved or dismissed.
		const writable = items.filter((item) => {
			const row = prior.get(item.item_key);
			if (row && row.status !== 'open') {
				kept += 1;
				return false;
			}
			return true;
		});

		if (writable.length > 0) {
			// status is left out on purpose: new rows default to open, and a row dismissed
			// between the read above and this write keeps its status.
			const { error } = await supabase.from('today_waiting_items').upsert(
				writable.map((item) => ({
					user_id: userId,
					item_key: item.item_key,
					direction: item.direction,
					who: item.who,
					who_kind: item.who_kind,
					what: item.what,
					project_id: item.project_id,
					task_id: item.task_id,
					since: prior.get(item.item_key)?.since ?? item.since,
					last_seen_at: nowIso,
					updated_at: nowIso
				})),
				{ onConflict: 'user_id,item_key' }
			);
			if (error) throw new Error(`Failed to save waiting items: ${error.message}`);
			saved = writable.length;
		}
	}

	let resolved = 0;
	if (resolvedKeys.length > 0) {
		const { data, error } = await supabase
			.from('today_waiting_items')
			.update({ status: 'resolved', resolved_at: nowIso, updated_at: nowIso })
			.eq('user_id', userId)
			.eq('status', 'open')
			.in('item_key', resolvedKeys)
			.select('item_key');
		if (error) throw new Error(`Failed to resolve waiting items: ${error.message}`);
		resolved = data?.length ?? 0;
	}

	return { saved, resolved, kept };
}

// ============================================================================
// Entry point
// ============================================================================

export async function refreshTodayWaitingItems(
	params: RefreshTodayWaitingItemsParams
): Promise<RefreshTodayWaitingItemsResult> {
	if (!isTodayWaitingItemsEnabled()) return { status: 'skipped', reason: 'disabled' };
	const now = params.now ?? new Date();
	const { supabase, userId, actorId, timezone, briefDate, signal } = params;

	const inputs = await loadTodayWaitingInputs(supabase, userId, actorId, now);
	if (inputs.projects.length === 0) return { status: 'skipped', reason: 'no_projects' };
	const hasNextSteps = inputs.projects.some((p) => p.next_step_short || p.next_step_long);
	if (inputs.tasks.length === 0 && !hasNextSteps && inputs.existing.length === 0) {
		return { status: 'skipped', reason: 'no_inputs' };
	}

	const refs = buildRefMaps(inputs);
	const { systemPrompt, userPrompt } = buildTodayWaitingPrompt(inputs, refs, {
		briefDate,
		timezone
	});
	const llm =
		params.llm ??
		new SmartLLMService({
			httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
			appName: 'BuildOS Today Waiting Items'
		});

	const response = await llm.getJSONResponse<WaitingLLMResponse>({
		systemPrompt,
		userPrompt,
		userId,
		signal,
		profile: 'custom',
		model: TODAY_WAITING_MODELS[0],
		models: [...TODAY_WAITING_MODELS],
		temperature: 0.2,
		maxTokens: 2_000,
		requirements: { maxCost: 0.01 },
		operationType: 'today_waiting_items',
		validation: { retryOnParseError: true, maxRetries: 1, allowTruncatedJsonRecovery: true },
		metadata: {
			briefDate,
			model_policy: 'today_waiting_model_order',
			primary_model: TODAY_WAITING_MODELS[0],
			project_count: refs.projects.size,
			task_count: refs.tasks.size,
			existing_count: inputs.existing.length
		}
	});

	const { items, resolvedKeys, dropped } = validateWaitingResponse(
		response,
		refs,
		new Set(inputs.existing.map((item) => item.item_key)),
		briefDate
	);
	const result = await saveWaitingItems(supabase, userId, items, resolvedKeys, now);
	return { status: 'refreshed', ...result, dropped };
}
