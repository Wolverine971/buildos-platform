// apps/web/scripts/seed-demo-account.ts
//
// Provisions the marketing demo account and seeds the "Fading Crown" novel
// project used for homepage screenshots (docs/marketing — value-prop triptychs).
// Idempotent: re-running with --reset deletes the demo user's Fading Crown
// project(s) and recreates a fresh, lived-in state with dates relative to now,
// so screenshots can be re-captured any time without looking stale.
//
//   pnpm exec tsx scripts/seed-demo-account.ts            # create if missing
//   pnpm exec tsx scripts/seed-demo-account.ts --reset    # delete + recreate
//
// Env (apps/web/.env): DEMO_USER_EMAIL, DEMO_USER_PASSWORD (required),
// PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY.
//
// Guardrails: only ever deletes onto_projects rows that are BOTH named
// 'Fading Crown%' AND created_by the demo user's actor.

import { createCustomClient } from '@buildos/supabase-client';
import { ensureActorId } from '@buildos/shared-agent-ops';
import { instantiateProject } from '@buildos/shared-agent-ops/ontology/instantiation.service';
import type { ProjectSpec } from '@buildos/shared-agent-ops/ontology/onto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.PRIVATE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || 'demo-author@build-os.com';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD;
const DEMO_NAME = 'Riley Hartwell';
const PROJECT_NAME = 'Fading Crown';
const RESET = process.argv.includes('--reset');

if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error('Missing PUBLIC_SUPABASE_URL or PRIVATE_SUPABASE_SERVICE_KEY');
	process.exit(1);
}
if (!DEMO_PASSWORD) {
	console.error('Missing DEMO_USER_PASSWORD (set it in apps/web/.env)');
	process.exit(1);
}

const admin = createCustomClient(SUPABASE_URL, SERVICE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false }
});

/** ISO timestamp `days` from now, clamped to a given local hour when provided. */
function fromNow(days: number, hour?: number): string {
	const d = new Date();
	d.setDate(d.getDate() + days);
	if (hour !== undefined) d.setHours(hour, 0, 0, 0);
	return d.toISOString();
}

/** Next occurrence of a weekday (0=Sun..6=Sat) at a local hour, at least 2 days out. */
function nextWeekday(weekday: number, hour: number): string {
	const d = new Date();
	let delta = (weekday - d.getDay() + 7) % 7;
	if (delta < 2) delta += 7;
	d.setDate(d.getDate() + delta);
	d.setHours(hour, 0, 0, 0);
	return d.toISOString();
}

function spec(): ProjectSpec {
	return {
		project: {
			name: PROJECT_NAME,
			type_key: 'project.creative.book',
			state_key: 'active',
			description:
				'Fantasy novel — Queen Isolde is losing her magic as the wards that protect her kingdom fail. Working toward a complete first draft for beta readers.'
		},
		context_document: {
			title: 'Fading Crown — project context',
			body_markdown: `# Fading Crown

## Premise
Queen Isolde's magic is fading — and the crown, not the queen, was the focus all along. Her estranged sister Maya carries the mirror-gift that could stabilize the wards, if the two can stand in the same room long enough to try.

## Where this is right now
Act I is locked. Act II revision pass is underway — the magic-system v2 rules landed, and Ch. 12's opening was rewritten to put the ward-failure on the page instead of in summary. Current thread: Maya's motivation through the middle chapters.

## Decisions
- **Magic has a ledger.** Every ward-hour is paid in memory. No exceptions, including the queen.
- **Act III hinges on the sister.** Isolde's motive is protecting Maya, not the throne.
- **Beta readers after Ch. 14** — three-chapter sampler goes to the critique group first.

## Open questions
- Does Maya learn the ledger rule before or after the northern wards fall?
- Keep the prologue, or fold it into Ch. 2?`
		},
		entities: [
			// ── goal / milestones / plan ──────────────────────────────
			{
				temp_id: 'goal-draft',
				kind: 'goal',
				name: 'Complete first draft',
				description: 'All 28 chapters drafted and a beta packet out the door.',
				target_date: fromNow(56),
				measurement_criteria: '28/28 chapters drafted; sampler + beta packet sent.',
				priority: 'high'
			},
			{
				temp_id: 'ms-act1',
				kind: 'milestone',
				title: 'Act I locked',
				due_at: fromNow(-21),
				description: 'Chapters 1–8 stable; no more structural edits.'
			},
			{
				temp_id: 'ms-beta',
				kind: 'milestone',
				title: 'Full draft to beta readers',
				due_at: fromNow(42),
				description: 'Complete draft plus reader questions packet.'
			},
			{
				temp_id: 'plan-act2',
				kind: 'plan',
				name: 'Revision pass — Act II',
				description:
					'Tighten pacing through chapters 9–16 and reconcile the magic-rule changes from v2.',
				start_date: fromNow(-14),
				end_date: fromNow(21)
			},
			// ── tasks (spread across kanban states) ───────────────────
			{
				temp_id: 't-outline',
				kind: 'task',
				title: 'Outline Act I beats',
				state_key: 'done',
				description: 'Beat sheet for chapters 1–8.'
			},
			{
				temp_id: 't-magic',
				kind: 'task',
				title: 'Magic system v2 — write the hard rules',
				state_key: 'done',
				description: 'The ledger, the wards, the crown-as-focus. See the rules doc.'
			},
			{
				temp_id: 't-ch12',
				kind: 'task',
				title: 'Rewrite Ch. 12 opening',
				state_key: 'done',
				description: 'Open on the ward failing instead of the council recap.'
			},
			{
				temp_id: 't-maya',
				kind: 'task',
				title: "Reconcile Maya's motivation in Act II",
				state_key: 'in_progress',
				priority: 2,
				description:
					'Her act-3 turn should hinge on the sister confrontation in Ch. 16 — thread the setup back through chapters 9–14.'
			},
			{
				temp_id: 't-writing-block',
				kind: 'task',
				title: 'Writing block — draft Ch. 13',
				state_key: 'todo',
				priority: 2,
				start_at: nextWeekday(2, 14),
				due_at: nextWeekday(2, 16),
				description: 'Two focused hours. Beats doc is ready — start at the ferry scene.'
			},
			{
				temp_id: 't-beta-pass',
				kind: 'task',
				title: 'Beta-reader pass — chapters 1–14',
				state_key: 'todo',
				priority: 2,
				due_at: fromNow(10),
				description: 'Assemble the packet: chapters, reader questions, content notes.'
			},
			{
				temp_id: 't-sampler',
				kind: 'task',
				title: 'Send three-chapter sampler to critique group',
				state_key: 'todo',
				priority: 1,
				due_at: fromNow(-3),
				description: 'Chapters 1–3 plus the one-page synopsis.'
			},
			{
				temp_id: 't-cover',
				kind: 'task',
				title: 'Commission cover concept art',
				state_key: 'blocked',
				description: 'Waiting on artist availability — follow up Friday.'
			},
			{
				temp_id: 't-query',
				kind: 'task',
				title: 'Draft query letter',
				state_key: 'todo',
				description: 'One page. Lead with the ledger hook.'
			},
			{
				temp_id: 't-agents',
				kind: 'task',
				title: 'Research fantasy-friendly literary agents',
				state_key: 'todo',
				description: 'Shortlist ten; note recent sales in adult fantasy.'
			},
			{
				temp_id: 't-wards',
				kind: 'task',
				title: 'Map the northern wards',
				state_key: 'todo',
				description: 'Geography of the failures — which fall first and why.'
			},
			// ── documents ─────────────────────────────────────────────
			{
				temp_id: 'd-magic',
				kind: 'document',
				title: 'Magic system rules — v2',
				body_markdown: `# Magic system rules — v2

## The ledger
Every ward-hour is paid in **memory**. Small wards take small things — a smell, a name. The great wards take years. Nothing is exempt, including the crown.

## The crown is the focus
Isolde was never the source. The crown accumulates the ledger's payments and spends them as wardlight. A fading queen means a **full crown** — that's the twist the Act I scenes have to stop contradicting.

## The mirror-gift
Maya doesn't cast. She **reflects** — any working done in her presence pays double or not at all. This is why the court exiled her, and why she's the only one who can stabilize the failure.

## What breaks when the queen fades
1. Border wards fail north-first (cold ground holds less charge).
2. The ledger keeps collecting — from whoever is nearest.
3. The crown starts choosing its own payments. That's Act III.`
			},
			{
				temp_id: 'd-maya',
				kind: 'document',
				title: 'Maya — character arc',
				body_markdown: `# Maya — character arc

**Want:** to stay exiled. Exile is the only place her gift can't hurt anyone.
**Need:** to learn the ledger never stopped collecting from her — distance was never protection.

## Act beats
- **Act I:** refuses the summons twice. Comes for the funeral, not the crown.
- **Act II:** the northern wards fall while she's in the room — and hold, for one night. She can't leave after that. *(Current problem: her staying reads as plot necessity, not choice. Thread the sister debt from Ch. 9 forward.)*
- **Act III:** offers the crown her whole ledger. Isolde refuses to let her pay it.`
			},
			{
				temp_id: 'd-isolde',
				kind: 'document',
				title: 'Queen Isolde — motive',
				body_markdown: `# Queen Isolde — motive

The throne is cover. Everything she's done since the coronation — including the exile — was to keep the crown from ever choosing **Maya** as a payment source.

She would rather the kingdom fall than the ledger touch her sister. Act III asks whether that's love or another kind of theft.`
			},
			{
				temp_id: 'd-chapters',
				kind: 'document',
				title: 'Chapter notes',
				body_markdown:
					'# Chapter notes\n\nWorking notes per chapter for the Act II revision pass.'
			},
			{
				temp_id: 'd-ch12',
				kind: 'document',
				title: 'Ch. 12 — opening rewrite notes',
				body_markdown: `# Ch. 12 — opening rewrite

Old opening: council recap (summary, no pressure). New opening: the granary ward fails **mid-sentence** during the tithe count. Wardlight behaves like weather now — that's the promise of the chapter.

Keep: the steward's joke. It lands harder when the lights go out under it.`
			},
			{
				temp_id: 'd-ch13',
				kind: 'document',
				title: 'Ch. 13 — beats',
				body_markdown: `# Ch. 13 — beats

1. Ferry crossing — Maya and the ledger-blind boy.
2. First on-page double-payment (her gift, witnessed).
3. Isolde's letter arrives *opened*. Someone at court is reading ahead.
4. Close on the northern beacon going dark.`
			},
			{
				temp_id: 'd-beta',
				kind: 'document',
				title: 'Beta reader shortlist',
				body_markdown: `# Beta reader shortlist

| Reader | Angle | Status |
|---|---|---|
| Jordan P. | epic fantasy pacing | confirmed |
| Sasha K. | character voice | confirmed |
| Critique group | first three chapters | sampler pending |
| Elena R. | magic-system logic | asked, waiting |

Reader questions packet drafts with the beta pass task.`
			},
			// ── risk ──────────────────────────────────────────────────
			{
				temp_id: 'r-continuity',
				kind: 'risk',
				title: 'Magic-rule changes contradict early Act I scenes',
				impact: 'medium',
				probability: 0.4,
				content:
					'V2 hard rules (the ledger, crown-as-focus) invalidate two Act I set pieces. Needs a continuity pass before the sampler goes out.'
			}
		],
		relationships: [
			{
				from: { temp_id: 'd-chapters', kind: 'document' },
				to: { temp_id: 'd-ch12', kind: 'document' },
				intent: 'containment'
			},
			{
				from: { temp_id: 'd-chapters', kind: 'document' },
				to: { temp_id: 'd-ch13', kind: 'document' },
				intent: 'containment'
			},
			{
				from: { temp_id: 'plan-act2', kind: 'plan' },
				to: { temp_id: 't-maya', kind: 'task' },
				intent: 'containment'
			},
			{
				from: { temp_id: 'plan-act2', kind: 'plan' },
				to: { temp_id: 't-writing-block', kind: 'task' },
				intent: 'containment'
			}
		]
	};
}

async function ensureDemoUser(): Promise<string> {
	const { data, error } = await admin.auth.admin.createUser({
		email: DEMO_EMAIL,
		password: DEMO_PASSWORD!,
		email_confirm: true
	});
	if (!error) return data.user.id;

	const message = (error.message || '').toLowerCase();
	const exists =
		message.includes('already') || error.status === 422 || error.code === 'email_exists';
	if (!exists) throw new Error(`createUser failed: ${error.message}`);

	// Look the user up by email (paged list — demo instance is small).
	const { data: list, error: listError } = await admin.auth.admin.listUsers({
		page: 1,
		perPage: 200
	});
	if (listError) throw new Error(`listUsers failed: ${listError.message}`);
	const user = list.users.find((u) => u.email === DEMO_EMAIL);
	if (!user) throw new Error(`user ${DEMO_EMAIL} exists but was not found via listUsers`);
	return user.id;
}

async function main() {
	console.log(`Demo account: ${DEMO_EMAIL}`);
	const userId = await ensureDemoUser();

	const { error: upsertError } = await admin
		.from('users')
		.upsert({ id: userId, email: DEMO_EMAIL, name: DEMO_NAME }, { onConflict: 'id' });
	if (upsertError) throw new Error(`users upsert failed: ${upsertError.message}`);

	const actorId = await ensureActorId(admin, userId);
	console.log(`user=${userId} actor=${actorId}`);

	const { data: existing, error: findError } = await admin
		.from('onto_projects')
		.select('id, name')
		.eq('created_by', actorId)
		.like('name', `${PROJECT_NAME}%`);
	if (findError) throw new Error(`project lookup failed: ${findError.message}`);

	if (existing && existing.length > 0) {
		if (!RESET) {
			console.log(
				`Project already seeded (${existing.map((p) => p.id).join(', ')}). Use --reset to recreate.`
			);
			return;
		}
		for (const project of existing) {
			const { error: deleteError } = await admin
				.from('onto_projects')
				.delete()
				.eq('id', project.id)
				.eq('created_by', actorId);
			if (deleteError) throw new Error(`delete failed: ${deleteError.message}`);
			console.log(`Deleted old demo project ${project.id}`);
		}
	}

	const { project_id } = await instantiateProject(admin, spec(), userId, {
		activityLog: { changeSource: 'api' }
	});
	console.log(`Seeded "${PROJECT_NAME}" → project ${project_id}`);
	console.log(`Open: http://localhost:5173/projects/${project_id}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
