// apps/web/scripts/import-beta-reactivation-campaign.mjs
//
// Moves DJ's 83 tailored beta-reactivation drafts (July 2026, never sent) into
// three draft email campaigns that follow the wave plan in
// docs/marketing/campaigns/beta-reactivation/FRAMEWORK.md:
//   Wave 1 — S1 left work behind (tried_product_early, former_high_intent_user)
//   Wave 2 — S2 peeked inside (account_created_no_activation)
//   Wave 3 — S3 never came in (approved_signup_no_account, pending_signup_no_account)
//
// Each person keeps their own draft (subject/body override). Stale time words
// written in July 2026 ("last July", "last summer", "a year ago") are rewritten
// against the person's real signup date. Nothing is sent: campaigns land as
// drafts in /admin/emails for DJ to review.
//
// Usage (dry run prints the plan; --apply writes):
//   node --env-file=apps/web/.env apps/web/scripts/import-beta-reactivation-campaign.mjs
//   node --env-file=apps/web/.env apps/web/scripts/import-beta-reactivation-campaign.mjs --apply

import { createClient } from '@supabase/supabase-js';

const SOURCE = 'import:beta-reactivation-2026-07';
const CATEGORY = 'beta_reactivation';

const WAVES = [
	{
		key: 'wave_1',
		name: 'Beta reactivation · Wave 1 · left work behind',
		segments: ['tried_product_early', 'former_high_intent_user'],
		waveSize: 6
	},
	{
		key: 'wave_2',
		name: 'Beta reactivation · Wave 2 · peeked inside',
		segments: ['account_created_no_activation'],
		waveSize: 11
	},
	{
		key: 'wave_3',
		name: 'Beta reactivation · Wave 3 · never came in',
		segments: ['approved_signup_no_account', 'pending_signup_no_account'],
		waveSize: 20
	}
];

const MONTHS = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december'
];

function requiredEnv(name) {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name}`);
	return value;
}

function normalizedEmail(value) {
	return String(value || '')
		.trim()
		.toLowerCase();
}

function firstName(value) {
	const first = String(value || '')
		.trim()
		.split(/\s+/)[0];
	if (!first) return null;
	return first === first.toLowerCase() ? first.charAt(0).toUpperCase() + first.slice(1) : first;
}

function monthYear(iso) {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The drafts were written in July 2026, so "last <Month>" meant <Month> 2025.
 * Read in October 2026 it points at the wrong year, so name the year outright.
 */
export function fixStaleTimeWords(text, signupIso) {
	const signupYear = signupIso ? new Date(signupIso).getUTCFullYear() : 2025;
	let changes = 0;
	const monthPattern = new RegExp(`\\blast (${MONTHS.join('|')})\\b`, 'gi');
	let out = text.replace(monthPattern, (_match, month) => {
		changes += 1;
		return `back in ${capitalize(month.toLowerCase())} ${signupYear}`;
	});
	out = out.replace(/\blast summer\b/gi, () => {
		changes += 1;
		return `back in the summer of ${signupYear}`;
	});
	out = out.replace(/\b(?<!over )a year ago\b/gi, (match) => {
		changes += 1;
		return match.charAt(0) === 'A' ? 'Over a year ago' : 'over a year ago';
	});
	return { text: out, changes };
}

function compact(value, maximum = 400) {
	if (value == null) return null;
	const normalized = String(value).replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	return normalized.length > maximum ? `${normalized.slice(0, maximum - 1)}…` : normalized;
}

async function main() {
	const apply = process.argv.includes('--apply');
	const supabase = createClient(
		requiredEnv('PUBLIC_SUPABASE_URL'),
		requiredEnv('PRIVATE_SUPABASE_SERVICE_KEY'),
		{ auth: { persistSession: false } }
	);

	const { data: existing, error: existingError } = await supabase
		.from('email_campaigns')
		.select('id, name')
		.eq('source', SOURCE);
	if (existingError) throw existingError;
	if ((existing ?? []).length > 0) {
		console.log(`Already imported (${existing.length} campaigns). Nothing to do.`);
		for (const campaign of existing) console.log(`  ${campaign.name}  ${campaign.id}`);
		return;
	}

	const { data: drafts, error: draftsError } = await supabase
		.from('emails')
		.select(
			'id, subject, content, from_name, created_by, template_data, email_recipients (recipient_email, recipient_name)'
		)
		.eq('category', CATEGORY)
		.eq('status', 'draft');
	if (draftsError) throw draftsError;
	if (!drafts?.length) {
		console.log('No beta_reactivation drafts found.');
		return;
	}

	const signupIds = drafts.map((draft) => draft.template_data?.signup_id).filter(Boolean);
	const [{ data: signups, error: signupsError }, { data: users, error: usersError }] =
		await Promise.all([
			supabase
				.from('beta_signups')
				.select(
					'id, email, full_name, created_at, why_interested, biggest_challenge, productivity_tools, job_title, company_name'
				)
				.in('id', signupIds),
			// ~130 rows: read them all so the address match ignores case.
			supabase
				.from('users')
				.select('id, email, name, created_at, last_visit, onboarding_intent')
		]);
	if (signupsError) throw signupsError;
	if (usersError) throw usersError;

	// Account emails may differ in case from the draft address.
	const usersByEmail = new Map((users ?? []).map((user) => [normalizedEmail(user.email), user]));
	const signupsById = new Map((signups ?? []).map((signup) => [signup.id, signup]));

	const userIds = (users ?? []).map((user) => user.id);
	const projectsByUser = new Map();
	if (userIds.length > 0) {
		const { data: actors, error: actorsError } = await supabase
			.from('onto_actors')
			.select('id, user_id')
			.in('user_id', userIds);
		if (actorsError) throw actorsError;
		const actorToUser = new Map((actors ?? []).map((actor) => [actor.id, actor.user_id]));
		if (actorToUser.size > 0) {
			const { data: projects, error: projectsError } = await supabase
				.from('onto_projects')
				.select('name, created_by, updated_at')
				.in('created_by', [...actorToUser.keys()])
				.eq('kind', 'project')
				.is('deleted_at', null)
				.order('updated_at', { ascending: false });
			if (projectsError) throw projectsError;
			for (const project of projects ?? []) {
				const userId = actorToUser.get(project.created_by);
				if (!userId) continue;
				const list = projectsByUser.get(userId) ?? [];
				list.push(project);
				projectsByUser.set(userId, list);
			}
		}
	}

	const plan = WAVES.map((wave) => ({ ...wave, people: [] }));
	const seen = new Set();
	const unplaced = [];
	let stalePhraseFixes = 0;

	for (const draft of drafts) {
		const recipient = draft.email_recipients?.[0];
		const email = normalizedEmail(recipient?.recipient_email);
		if (!email) {
			unplaced.push({ id: draft.id, reason: 'no recipient' });
			continue;
		}
		if (seen.has(email)) {
			unplaced.push({ id: draft.id, reason: `duplicate address ${email}` });
			continue;
		}
		seen.add(email);

		const importSegment = draft.template_data?.segment ?? null;
		const wave = plan.find((candidate) => candidate.segments.includes(importSegment));
		if (!wave) {
			unplaced.push({ id: draft.id, reason: `unknown segment ${importSegment}` });
			continue;
		}

		const signup = signupsById.get(draft.template_data?.signup_id) ?? null;
		const user = usersByEmail.get(email) ?? null;
		const signupIso = [signup?.created_at, user?.created_at].filter(Boolean).sort()[0] ?? null;

		const subjectFix = fixStaleTimeWords(draft.subject ?? '', signupIso);
		const bodyFix = fixStaleTimeWords(draft.content ?? '', signupIso);
		stalePhraseFixes += subjectFix.changes + bodyFix.changes;

		const projects = user ? (projectsByUser.get(user.id) ?? []) : [];
		const name = recipient?.recipient_name || signup?.full_name || user?.name || null;

		wave.people.push({
			email,
			name,
			first_name: firstName(name),
			user_id: user?.id ?? null,
			beta_signup_id: signup?.id ?? null,
			segment: 'imported',
			context: {
				has_account: Boolean(user),
				signed_up_at: signupIso,
				signup_month: monthYear(signupIso),
				last_visit_at: user?.last_visit ?? null,
				project_count: user ? projects.length : null,
				last_project: projects[0]?.name ?? null,
				why_interested: compact(signup?.why_interested),
				biggest_challenge: compact(signup?.biggest_challenge),
				productivity_tools: signup?.productivity_tools ?? null,
				job_title: compact(signup?.job_title, 120),
				company_name: compact(signup?.company_name, 120),
				onboarding_intent: compact(user?.onboarding_intent),
				import_segment: importSegment,
				import_strategy: compact(draft.template_data?.strategy)
			},
			subject_override: subjectFix.text,
			body_override: bodyFix.text,
			override_source: 'imported',
			source_email_id: draft.id,
			_changes: subjectFix.changes + bodyFix.changes,
			_createdBy: draft.created_by
		});
	}

	console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${drafts.length} drafts`);
	for (const wave of plan) {
		const fixed = wave.people.filter((person) => person._changes > 0).length;
		console.log(
			`  ${wave.name}: ${wave.people.length} people (${fixed} with date wording fixed)`
		);
	}
	console.log(`  stale time phrases rewritten: ${stalePhraseFixes}`);
	if (unplaced.length > 0) {
		console.log(`  not placed: ${unplaced.length}`);
		for (const item of unplaced) console.log(`    ${item.id}: ${item.reason}`);
	}

	const sample = plan.flatMap((wave) => wave.people).find((person) => person._changes > 0);
	if (sample) {
		console.log('\nSample rewritten subject:', sample.subject_override);
		const firstParagraph = sample.body_override.match(/<p>([\s\S]*?)<\/p>/g)?.[1] ?? '';
		console.log('Sample rewritten line:', firstParagraph.replace(/<[^>]+>/g, ''));
	}

	if (!apply) {
		console.log('\nDry run only. Re-run with --apply to create the draft campaigns.');
		return;
	}

	for (const wave of plan) {
		if (wave.people.length === 0) continue;
		const createdBy = wave.people.find((person) => person._createdBy)?._createdBy ?? null;
		const { data: campaign, error: campaignError } = await supabase
			.from('email_campaigns')
			.insert({
				name: wave.name,
				status: 'draft',
				subject_template: '',
				body_template: '',
				from_name: 'DJ',
				audience: {
					segments: [],
					people: wave.people.map((person) => ({
						email: person.email,
						name: person.name,
						user_id: person.user_id,
						beta_signup_id: person.beta_signup_id
					})),
					removed_emails: []
				},
				wave_size: wave.waveSize,
				wave_interval_minutes: 60,
				source: SOURCE,
				metadata: {
					imported_from: 'emails.category=beta_reactivation',
					wave: wave.key,
					import_segments: wave.segments,
					doctrine: 'docs/marketing/campaigns/beta-reactivation/FRAMEWORK.md'
				},
				created_by: createdBy
			})
			.select('id')
			.single();
		if (campaignError) throw campaignError;

		const rows = wave.people.map(({ _changes, _createdBy, ...person }) => ({
			...person,
			campaign_id: campaign.id,
			included: true,
			status: 'draft'
		}));
		const { error: recipientsError } = await supabase
			.from('email_campaign_recipients')
			.insert(rows);
		if (recipientsError) {
			await supabase.from('email_campaigns').delete().eq('id', campaign.id);
			throw recipientsError;
		}

		// Hide the source drafts from the Sent log; they live in the campaign now.
		for (const person of wave.people) {
			const draft = drafts.find((candidate) => candidate.id === person.source_email_id);
			const { error: markError } = await supabase
				.from('emails')
				.update({
					template_data: {
						...(draft?.template_data ?? {}),
						imported_to_campaign_id: campaign.id
					}
				})
				.eq('id', person.source_email_id);
			if (markError) throw markError;
		}

		console.log(`Created ${wave.name}: ${campaign.id} (${rows.length} people)`);
	}
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
