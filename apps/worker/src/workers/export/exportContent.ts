// apps/worker/src/workers/export/exportContent.ts
//
// What goes into "Download my data", and how it is laid out. Every query names its
// columns and filters by the exporting user (the worker's client bypasses RLS).
// Never read here: chat_tool_executions, turn events, prompt snapshots,
// llm_usage_logs, OAuth tokens, connection credentials, calendar or email content.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

export type ExportDb = SupabaseClient<Database>;

export type ExportStage =
	| 'profile'
	| 'projects'
	| 'chats'
	| 'briefs'
	| 'braindumps'
	| 'voice_notes'
	| 'uploads'
	| 'contacts';

export const EXPORT_STAGES: ExportStage[] = [
	'profile',
	'projects',
	'chats',
	'briefs',
	'braindumps',
	'voice_notes',
	'uploads',
	'contacts'
];

/** A failure the export records as its error code: a fixed label, never content. */
export class ExportError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'ExportError';
	}
}

export type AddFile = (
	path: string,
	data: string | Uint8Array,
	options?: { compress?: boolean }
) => Promise<void>;

export type ExportCounts = Record<
	| 'projects'
	| 'documents'
	| 'tasks'
	| 'chats'
	| 'messages'
	| 'briefs'
	| 'braindumps'
	| 'voiceNotes'
	| 'audioFiles'
	| 'uploads'
	| 'contacts'
	| 'missingFiles',
	number
>;

const PAGE_SIZE = 1000;
const ID_CHUNK = 100;

type QueryResult<T> = { data: T[] | null; error: { code?: string } | null };

async function* pages<T>(
	stage: ExportStage,
	query: (from: number, to: number) => PromiseLike<QueryResult<T>>
): AsyncGenerator<T[]> {
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await query(from, from + PAGE_SIZE - 1);
		if (error) throw new ExportError(`load_${stage}_failed`);
		const rows = data ?? [];
		if (rows.length > 0) yield rows;
		if (rows.length < PAGE_SIZE) return;
	}
}

async function all<T>(
	stage: ExportStage,
	query: (from: number, to: number) => PromiseLike<QueryResult<T>>
): Promise<T[]> {
	const rows: T[] = [];
	for await (const page of pages(stage, query)) rows.push(...page);
	return rows;
}

async function one<T>(
	stage: ExportStage,
	query: PromiseLike<{ data: T | null; error: { code?: string } | null }>
): Promise<T | null> {
	const { data, error } = await query;
	if (error) throw new ExportError(`load_${stage}_failed`);
	return data ?? null;
}

function chunks<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		out.push(items.slice(index, index + size));
	}
	return out;
}

/** Filesystem-safe name from a title. Folds to ASCII letters and digits only. */
export function slugify(value: string | null | undefined, fallback = 'untitled'): string {
	const slug = (value ?? '')
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/g, '');
	return slug || fallback;
}

/** Hands out unique paths: a second "notes.md" in the same folder becomes "notes-2.md". */
export class UniquePaths {
	private readonly taken = new Set<string>();

	claim(stem: string, extension: string): string {
		let candidate = `${stem}${extension}`;
		for (let n = 2; this.taken.has(candidate.toLowerCase()); n += 1) {
			candidate = `${stem}-${n}${extension}`;
		}
		this.taken.add(candidate.toLowerCase());
		return candidate;
	}
}

export function toCsv<T extends Record<string, unknown>>(
	rows: T[],
	columns: (keyof T & string)[]
): string {
	const cell = (value: unknown) => {
		if (value === null || value === undefined) return '';
		const text = typeof value === 'string' ? value : JSON.stringify(value);
		return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	};
	return [
		columns.join(','),
		...rows.map((row) => columns.map((column) => cell(row[column])).join(','))
	].join('\r\n');
}

function json(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function day(iso: string | null | undefined): string {
	return (iso ?? '').slice(0, 10) || 'undated';
}

function stamp(iso: string | null | undefined): string {
	return iso ? iso.replace('T', ' ').slice(0, 16) : '';
}

function withHeading(title: string, content: string | null): string {
	const body = (content ?? '').trim();
	return /^#\s/.test(body) ? `${body}\n` : `# ${title}\n\n${body}\n`;
}

const AUDIO_EXTENSIONS: Record<string, string> = {
	'audio/webm': 'webm',
	'audio/ogg': 'ogg',
	'audio/mp4': 'm4a',
	'audio/x-m4a': 'm4a',
	'audio/aac': 'aac',
	'audio/mpeg': 'mp3',
	'audio/wav': 'wav',
	'audio/x-wav': 'wav'
};

function extensionOf(
	path: string | null | undefined,
	contentType: string | null | undefined
): string {
	const base = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
	if (AUDIO_EXTENSIONS[base]) return AUDIO_EXTENSIONS[base];
	const fromPath = /\.([a-z0-9]{1,8})$/i.exec(path ?? '')?.[1];
	if (fromPath) return fromPath.toLowerCase();
	const subtype = /^[a-z]+\/([a-z0-9.+-]{1,20})$/i.exec(base)?.[1];
	return subtype ? subtype.replace(/[^a-z0-9]/gi, '') : 'bin';
}

async function download(db: ExportDb, bucket: string, path: string): Promise<Uint8Array | null> {
	const { data, error } = await db.storage.from(bucket).download(path);
	if (error || !data) return null;
	return new Uint8Array(await data.arrayBuffer());
}

export const README = `# Your BuildOS data

This archive holds what BuildOS keeps for you, as of the export date.

- profile.json — your account, profile, and preferences. No passwords, keys, or tokens.
- projects/<project>/project.md — each project you created.
- projects/<project>/documents/ — its documents as Markdown, in your document tree.
- projects/<project>/tasks.json and tasks.csv — its tasks.
- projects/<project>/goals.json, plans.json, milestones.json, risks.json.
- chats/<date>-<title>.md — your chats: your messages and BuildOS replies.
- briefs/<date>.md — your daily briefs.
- brain-dumps/<date>-<title>.md — your brain dumps, as you wrote them.
- voice-notes/ — each voice note's transcript (.md) and its audio file.
- uploads/ — images and files you uploaded, with uploads.json describing them.
- contacts.json — contacts you saved, if any.

Not included, by design:
- Tool traces, prompt snapshots, and AI usage records. They are short-lived
  diagnostics, deleted automatically.
- Email and calendar content. BuildOS reads those when you ask and does not keep them.
- Passwords, API keys, OAuth tokens, and connection credentials.

Large exports come in parts. Each part is a complete zip; together they hold
everything listed above.
`;

type DocNode = { id?: unknown; children?: unknown };

/** Walks onto_projects.doc_structure; returns each document id with its folder path. */
export function documentTreePaths(docStructure: unknown): Map<string, string[]> {
	const placed = new Map<string, string[]>();
	const root = (docStructure as { root?: unknown } | null)?.root;
	const walk = (nodes: unknown, parents: string[]) => {
		if (!Array.isArray(nodes)) return;
		for (const node of nodes as DocNode[]) {
			if (typeof node?.id !== 'string' || placed.has(node.id)) continue;
			placed.set(node.id, parents);
			walk(node.children, [...parents, node.id]);
		}
	};
	walk(root, []);
	return placed;
}

export async function buildUserDataExport(params: {
	db: ExportDb;
	userId: string;
	addFile: AddFile;
	checkpoint: (stage: ExportStage) => Promise<void>;
}): Promise<ExportCounts> {
	const { db, userId, addFile, checkpoint } = params;
	const counts: ExportCounts = {
		projects: 0,
		documents: 0,
		tasks: 0,
		chats: 0,
		messages: 0,
		briefs: 0,
		braindumps: 0,
		voiceNotes: 0,
		audioFiles: 0,
		uploads: 0,
		contacts: 0,
		missingFiles: 0
	};
	await addFile('README.md', README);

	// Profile ---------------------------------------------------------------
	await checkpoint('profile');
	const [account, context, briefPrefs, notificationPrefs, calendarPrefs, smsPrefs] =
		await Promise.all([
			one(
				'profile',
				db
					.from('users')
					.select(
						'id, email, name, username, bio, timezone, created_at, onboarding_completed_at, usage_archetype, voice_narration_enabled'
					)
					.eq('id', userId)
					.maybeSingle()
			),
			one(
				'profile',
				db
					.from('user_context')
					.select(
						'input_projects, input_work_style, input_challenges, input_help_focus, background, work_style, priorities, goals_overview, focus_areas, habits, tools, workflows, preferred_work_hours, schedule_preferences, communication_style, help_priorities, blockers, collaboration_needs, skill_gaps, productivity_challenges, organization_method, active_projects, updated_at'
					)
					.eq('user_id', userId)
					.maybeSingle()
			),
			all('profile', (from, to) =>
				db
					.from('user_brief_preferences')
					.select('frequency, day_of_week, time_of_day, is_active')
					.eq('user_id', userId)
					.order('created_at')
					.range(from, to)
			),
			all('profile', (from, to) =>
				db
					.from('user_notification_preferences')
					.select(
						'email_enabled, sms_enabled, push_enabled, in_app_enabled, should_email_daily_brief, should_sms_daily_brief, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, batch_enabled, batch_interval_minutes, max_per_day, max_per_hour, priority'
					)
					.eq('user_id', userId)
					.order('created_at')
					.range(from, to)
			),
			all('profile', (from, to) =>
				db
					.from('user_calendar_preferences')
					.select(
						'work_start_time, work_end_time, working_days, default_task_duration_minutes, min_task_duration_minutes, max_task_duration_minutes, exclude_holidays, holiday_country_code, prefer_morning_for_important_tasks'
					)
					.eq('user_id', userId)
					.order('created_at')
					.range(from, to)
			),
			all('profile', (from, to) =>
				db
					.from('user_sms_preferences')
					.select(
						'phone_number, phone_verified, opted_out, morning_kickoff_enabled, morning_kickoff_time, evening_recap_enabled, event_reminders_enabled, event_reminder_lead_time_minutes, urgent_alerts, quiet_hours_start, quiet_hours_end'
					)
					.eq('user_id', userId)
					.order('created_at')
					.range(from, to)
			)
		]);
	await addFile(
		'profile.json',
		json({
			exported_at: new Date().toISOString(),
			account,
			profile: context,
			preferences: {
				daily_brief: briefPrefs,
				notifications: notificationPrefs,
				calendar: calendarPrefs,
				sms: smsPrefs
			}
		})
	);

	const actor = await one<{ id: string }>(
		'projects',
		db.from('onto_actors').select('id').eq('user_id', userId).limit(1).maybeSingle()
	);
	const actorId = actor?.id ?? null;

	// Projects --------------------------------------------------------------
	await checkpoint('projects');
	const projectFolders = new Map<string, string>();
	const projectNames = new Map<string, string>();
	if (actorId) {
		const projectPaths = new UniquePaths();
		const projects = await all('projects', (from, to) =>
			db
				.from('onto_projects')
				.select(
					'id, name, description, state_key, type_key, start_at, end_at, next_step_short, next_step_long, doc_structure, created_at, updated_at'
				)
				.eq('created_by', actorId)
				.is('deleted_at', null)
				.order('created_at')
				.order('id')
				.range(from, to)
		);
		for (const project of projects) {
			await checkpoint('projects');
			const folder = `projects/${projectPaths.claim(slugify(project.name, 'project'), '')}`;
			projectFolders.set(project.id, folder);
			projectNames.set(project.id, project.name);
			counts.projects += 1;

			const facts = [
				`- Status: ${project.state_key}`,
				`- Type: ${project.type_key}`,
				project.start_at ? `- Starts: ${day(project.start_at)}` : null,
				project.end_at ? `- Ends: ${day(project.end_at)}` : null,
				`- Created: ${day(project.created_at)}`,
				`- Updated: ${day(project.updated_at)}`
			].filter(Boolean);
			const nextStep = project.next_step_long ?? project.next_step_short;
			await addFile(
				`${folder}/project.md`,
				[
					`# ${project.name}`,
					'',
					project.description?.trim() ?? '',
					'',
					...facts,
					...(nextStep ? ['', '## Next step', '', nextStep.trim()] : []),
					''
				].join('\n')
			);

			const [documents, tasks, goals, plans, milestones, risks] = await Promise.all([
				all('projects', (from, to) =>
					db
						.from('onto_documents')
						.select(
							'id, title, description, content, state_key, type_key, created_at, updated_at'
						)
						.eq('project_id', project.id)
						.is('deleted_at', null)
						.order('created_at')
						.order('id')
						.range(from, to)
				),
				all('projects', (from, to) =>
					db
						.from('onto_tasks')
						.select(
							'id, title, description, state_key, priority, start_at, due_at, completed_at, type_key, created_at, updated_at'
						)
						.eq('project_id', project.id)
						.is('deleted_at', null)
						.order('created_at')
						.order('id')
						.range(from, to)
				),
				all('projects', (from, to) =>
					db
						.from('onto_goals')
						.select(
							'id, name, goal, description, state_key, target_date, completed_at, created_at, updated_at'
						)
						.eq('project_id', project.id)
						.is('deleted_at', null)
						.order('created_at')
						.order('id')
						.range(from, to)
				),
				all('projects', (from, to) =>
					db
						.from('onto_plans')
						.select('id, name, plan, description, state_key, created_at, updated_at')
						.eq('project_id', project.id)
						.is('deleted_at', null)
						.order('created_at')
						.order('id')
						.range(from, to)
				),
				all('projects', (from, to) =>
					db
						.from('onto_milestones')
						.select(
							'id, title, milestone, description, state_key, due_at, completed_at, created_at, updated_at'
						)
						.eq('project_id', project.id)
						.is('deleted_at', null)
						.order('created_at')
						.order('id')
						.range(from, to)
				),
				all('projects', (from, to) =>
					db
						.from('onto_risks')
						.select(
							'id, title, content, impact, probability, state_key, mitigated_at, created_at, updated_at'
						)
						.eq('project_id', project.id)
						.is('deleted_at', null)
						.order('created_at')
						.order('id')
						.range(from, to)
				)
			]);

			// Documents follow the project's tree: a document with children becomes
			// <name>.md plus a <name>/ folder; documents outside the tree sit at the top.
			const tree = documentTreePaths(project.doc_structure);
			const documentsById = new Map(documents.map((document) => [document.id, document]));
			const stems = new Map<string, string>();
			const docPaths = new UniquePaths();
			const stemOf = (id: string): string => {
				const known = stems.get(id);
				if (known) return known;
				const parents = (tree.get(id) ?? []).filter((parent) => documentsById.has(parent));
				const parentStem =
					parents.length > 0 ? stemOf(parents[parents.length - 1] as string) : null;
				const name = slugify(documentsById.get(id)?.title, 'document');
				const stem = docPaths
					.claim(parentStem ? `${parentStem}/${name}` : name, '.md')
					.replace(/\.md$/, '');
				stems.set(id, stem);
				return stem;
			};
			const ordered = [
				...[...tree.keys()].filter((id) => documentsById.has(id)),
				...documents.map((document) => document.id).filter((id) => !tree.has(id))
			];
			for (const id of ordered) {
				const document = documentsById.get(id);
				if (!document) continue;
				await addFile(
					`${folder}/documents/${stemOf(id)}.md`,
					withHeading(document.title, document.content)
				);
				counts.documents += 1;
			}

			await addFile(`${folder}/tasks.json`, json(tasks));
			await addFile(
				`${folder}/tasks.csv`,
				toCsv(tasks, [
					'id',
					'title',
					'state_key',
					'priority',
					'start_at',
					'due_at',
					'completed_at',
					'created_at',
					'updated_at',
					'description'
				])
			);
			await addFile(`${folder}/goals.json`, json(goals));
			await addFile(`${folder}/plans.json`, json(plans));
			await addFile(`${folder}/milestones.json`, json(milestones));
			await addFile(`${folder}/risks.json`, json(risks));
			counts.tasks += tasks.length;
		}
	}

	// Chats: user and assistant messages only ------------------------------------
	await checkpoint('chats');
	const sessions = new Map<string, { title: string; createdAt: string | null }>();
	for await (const page of pages('chats', (from, to) =>
		db
			.from('chat_sessions')
			.select('id, title, auto_title, created_at')
			.eq('user_id', userId)
			.order('created_at')
			.order('id')
			.range(from, to)
	)) {
		for (const session of page) {
			sessions.set(session.id, {
				title: session.title?.trim() || session.auto_title?.trim() || 'Untitled chat',
				createdAt: session.created_at
			});
		}
	}

	const chatPaths = new UniquePaths();
	type ChatBuffer = {
		sessionId: string;
		lines: string[];
		messages: number;
		firstAt: string | null;
	};
	// Cast so TS doesn't narrow to `null`: flushChat and the loop both reassign it.
	let current = null as ChatBuffer | null;
	const flushChat = async () => {
		if (!current || current.messages === 0) return;
		const session = sessions.get(current.sessionId);
		const title = session?.title ?? 'Untitled chat';
		const date = day(session?.createdAt ?? current.firstAt);
		const path = chatPaths.claim(`chats/${date}-${slugify(title, 'chat')}`, '.md');
		await addFile(
			path,
			[`# ${title}`, '', `Started ${date}.`, '', ...current.lines].join('\n')
		);
		counts.chats += 1;
		counts.messages += current.messages;
	};
	for await (const page of pages('chats', (from, to) =>
		db
			.from('chat_messages')
			.select('id, session_id, role, content, created_at')
			.eq('user_id', userId)
			.in('role', ['user', 'assistant'])
			.order('session_id')
			.order('created_at')
			.order('id')
			.range(from, to)
	)) {
		await checkpoint('chats');
		for (const message of page) {
			if (current?.sessionId !== message.session_id) {
				await flushChat();
				current = {
					sessionId: message.session_id,
					lines: [],
					messages: 0,
					firstAt: message.created_at
				};
			}
			current.lines.push(
				'---',
				'',
				`**${message.role === 'user' ? 'You' : 'BuildOS'}** · ${stamp(message.created_at)}`,
				'',
				message.content.trim(),
				''
			);
			current.messages += 1;
		}
	}
	await flushChat();

	// Daily briefs ----------------------------------------------------------
	await checkpoint('briefs');
	const briefs = await all('briefs', (from, to) =>
		db
			.from('ontology_daily_briefs')
			.select('id, brief_date, executive_summary, llm_analysis, priority_actions, created_at')
			.eq('user_id', userId)
			.order('brief_date')
			.order('id')
			.range(from, to)
	);
	const projectBriefs = new Map<string, Array<{ project_id: string; brief_content: string }>>();
	for (const ids of chunks(
		briefs.map((brief) => brief.id),
		ID_CHUNK
	)) {
		const rows = await all('briefs', (from, to) =>
			db
				.from('ontology_project_briefs')
				.select('id, daily_brief_id, project_id, brief_content')
				.in('daily_brief_id', ids)
				.order('id')
				.range(from, to)
		);
		for (const row of rows) {
			const list = projectBriefs.get(row.daily_brief_id) ?? [];
			list.push(row);
			projectBriefs.set(row.daily_brief_id, list);
		}
	}
	const briefPaths = new UniquePaths();
	for (const brief of briefs) {
		const sections = [
			`# Daily brief — ${brief.brief_date}`,
			'',
			brief.executive_summary.trim(),
			''
		];
		if (brief.priority_actions?.length) {
			sections.push(
				'## Priority actions',
				'',
				...brief.priority_actions.map((action) => `- ${action}`),
				''
			);
		}
		for (const projectBrief of projectBriefs.get(brief.id) ?? []) {
			sections.push(
				`## ${projectNames.get(projectBrief.project_id) ?? 'Project'}`,
				'',
				projectBrief.brief_content.trim(),
				''
			);
		}
		if (brief.llm_analysis?.trim())
			sections.push('## Analysis', '', brief.llm_analysis.trim(), '');
		await addFile(
			briefPaths.claim(`briefs/${day(brief.brief_date)}`, '.md'),
			sections.join('\n')
		);
		counts.briefs += 1;
	}

	// Brain dumps -------------------------------------------------------------
	await checkpoint('braindumps');
	const braindumpPaths = new UniquePaths();
	for await (const page of pages('braindumps', (from, to) =>
		db
			.from('onto_braindumps')
			.select('id, title, content, created_at')
			.eq('user_id', userId)
			.is('deleted_at', null)
			.order('created_at')
			.order('id')
			.range(from, to)
	)) {
		for (const braindump of page) {
			await addFile(
				braindumpPaths.claim(
					`brain-dumps/${day(braindump.created_at)}-${slugify(braindump.title, 'brain-dump')}`,
					'.md'
				),
				[
					`# ${braindump.title?.trim() || 'Brain dump'}`,
					'',
					stamp(braindump.created_at),
					'',
					braindump.content.trim(),
					''
				].join('\n')
			);
			counts.braindumps += 1;
		}
	}

	// Voice notes: transcript + audio, one file at a time ---------------------
	await checkpoint('voice_notes');
	const voicePaths = new UniquePaths();
	for await (const page of pages('voice_notes', (from, to) =>
		db
			.from('voice_notes')
			.select(
				'id, transcript, storage_bucket, storage_path, mime_type, duration_seconds, recorded_at, created_at'
			)
			.eq('user_id', userId)
			.is('deleted_at', null)
			.order('created_at')
			.order('id')
			.range(from, to)
	)) {
		for (const note of page) {
			await checkpoint('voice_notes');
			const when = note.recorded_at ?? note.created_at;
			const stem = voicePaths.claim(`voice-notes/${day(when)}-${note.id.slice(0, 8)}`, '');
			const audioName = `${stem}.${extensionOf(note.storage_path, note.mime_type)}`;
			const audio = await download(db, note.storage_bucket, note.storage_path);
			if (audio) {
				await addFile(audioName, audio, { compress: false });
				counts.audioFiles += 1;
			} else {
				counts.missingFiles += 1;
			}
			await addFile(
				`${stem}.md`,
				[
					`# Voice note — ${stamp(when)}`,
					'',
					audio ? `Audio: ${audioName.split('/').pop()}` : 'Audio: not available',
					note.duration_seconds ? `Length: ${Math.round(note.duration_seconds)} s` : null,
					'',
					note.transcript?.trim() || '(No transcript.)',
					''
				]
					.filter((line) => line !== null)
					.join('\n')
			);
			counts.voiceNotes += 1;
		}
	}

	// Uploads -----------------------------------------------------------------
	await checkpoint('uploads');
	if (actorId) {
		const uploadPaths = new UniquePaths();
		const described: Array<Record<string, unknown>> = [];
		for await (const page of pages('uploads', (from, to) =>
			db
				.from('onto_assets')
				.select(
					'id, project_id, kind, original_filename, content_type, storage_bucket, storage_path, caption, alt_text, extracted_text, created_at'
				)
				.eq('created_by', actorId)
				.is('deleted_at', null)
				.order('created_at')
				.order('id')
				.range(from, to)
		)) {
			for (const asset of page) {
				await checkpoint('uploads');
				const folder = slugify(projectNames.get(asset.project_id), 'project');
				const extension = extensionOf(
					asset.original_filename ?? asset.storage_path,
					asset.content_type
				);
				const baseName = slugify(
					(asset.original_filename ?? '').replace(/\.[a-z0-9]{1,8}$/i, ''),
					asset.id.slice(0, 8)
				);
				const file = uploadPaths.claim(`uploads/${folder}/${baseName}`, `.${extension}`);
				const bytes = await download(db, asset.storage_bucket, asset.storage_path);
				if (bytes) {
					await addFile(file, bytes, { compress: false });
					counts.uploads += 1;
				} else {
					counts.missingFiles += 1;
				}
				described.push({
					file: bytes ? file.replace(/^uploads\//, '') : null,
					project: projectNames.get(asset.project_id) ?? null,
					kind: asset.kind,
					original_filename: asset.original_filename,
					content_type: asset.content_type,
					caption: asset.caption,
					alt_text: asset.alt_text,
					extracted_text: asset.extracted_text,
					created_at: asset.created_at
				});
			}
		}
		if (described.length > 0) await addFile('uploads/uploads.json', json(described));
	}

	// Contacts ----------------------------------------------------------------
	await checkpoint('contacts');
	const contacts = await all('contacts', (from, to) =>
		db
			.from('user_contacts')
			.select(
				'id, display_name, given_name, family_name, nickname, organization, title, relationship_label, notes, created_at, updated_at'
			)
			.eq('user_id', userId)
			.is('deleted_at', null)
			.order('created_at')
			.order('id')
			.range(from, to)
	);
	if (contacts.length > 0) {
		const methods = await all('contacts', (from, to) =>
			db
				.from('user_contact_methods')
				.select('id, contact_id, method_type, label, value_raw, is_primary')
				.eq('user_id', userId)
				.is('deleted_at', null)
				.order('created_at')
				.order('id')
				.range(from, to)
		);
		const methodsByContact = new Map<string, Array<Record<string, unknown>>>();
		for (const method of methods) {
			const list = methodsByContact.get(method.contact_id) ?? [];
			list.push({
				type: method.method_type,
				label: method.label,
				value: method.value_raw,
				primary: method.is_primary
			});
			methodsByContact.set(method.contact_id, list);
		}
		await addFile(
			'contacts.json',
			json(
				contacts.map(({ id, ...contact }) => ({
					...contact,
					methods: methodsByContact.get(id) ?? []
				}))
			)
		);
		counts.contacts = contacts.length;
	}

	return counts;
}
