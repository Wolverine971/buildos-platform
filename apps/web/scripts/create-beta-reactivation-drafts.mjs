// apps/web/scripts/create-beta-reactivation-drafts.mjs
import { createClient } from '@supabase/supabase-js';

const CAMPAIGN_KEY = 'beta-reactivation-tailored-2026-07-14';
const CATEGORY = 'beta_reactivation';
const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite';
const FALLBACK_MODELS = ['deepseek/deepseek-v4-flash', 'qwen/qwen3.7-plus'];
const MAX_CONCURRENCY = 4;
const APP_URL = (process.env.PUBLIC_APP_URL || 'https://build-os.com').replace(/\/$/, '');
const ACCOUNT_CTA = `${APP_URL}/welcome-back?utm_source=founder_email&utm_medium=email&utm_campaign=${CAMPAIGN_KEY}`;
const SIGNUP_CTA = `${APP_URL}/auth/register?utm_source=founder_email&utm_medium=email&utm_campaign=${CAMPAIGN_KEY}`;

function parseArgs(argv) {
	const args = new Set(argv);
	const value = (prefix) => {
		const entry = argv.find((argument) => argument.startsWith(`${prefix}=`));
		return entry ? entry.slice(prefix.length + 1) : null;
	};

	return {
		apply: args.has('--apply'),
		force: args.has('--force'),
		previewContent: args.has('--preview-content'),
		limit: Number.parseInt(value('--limit') || '0', 10) || null,
		onlyEmail: value('--only-email')?.trim().toLowerCase() || null,
		onlySignupId: value('--signup-id')?.trim() || null,
		onlyStatus: value('--status')?.trim().toLowerCase() || null,
		concurrency: Math.min(
			Math.max(Number.parseInt(value('--concurrency') || '3', 10) || 3, 1),
			MAX_CONCURRENCY
		)
	};
}

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
	return (
		String(value || '')
			.trim()
			.split(/\s+/)[0] || null
	);
}

function compactText(value, maximum = 500) {
	if (value == null) return null;
	const normalized = String(value)
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!normalized) return null;
	return normalized.length > maximum ? `${normalized.slice(0, maximum - 1)}…` : normalized;
}

function cleanBodyText(value, maximum = 2_500) {
	if (value == null) return null;
	const normalized = String(value)
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.replace(/[ \t]+/g, ' ').trim())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	if (!normalized) return null;
	return normalized.length > maximum ? `${normalized.slice(0, maximum - 1).trim()}…` : normalized;
}

function nonEmpty(values) {
	return values.filter((value) => value != null && value !== '' && value !== false);
}

function unique(values) {
	return [...new Set(nonEmpty(values))];
}

function countsBy(rows, key) {
	const counts = {};
	for (const row of rows) {
		const value = String(row?.[key] || 'unknown');
		counts[value] = (counts[value] || 0) + 1;
	}
	return counts;
}

function normalizeErrorFingerprint(error) {
	return `${error.error_type || 'error'}|${error.endpoint || error.operation_type || 'unknown'}|${String(
		error.error_message || ''
	)
		.toLowerCase()
		.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, '<id>')
		.replace(/\b\d+\b/g, '<n>')
		.replace(/\s+/g, ' ')
		.slice(0, 220)}`;
}

function summarizeErrors(errors) {
	const groups = new Map();
	for (const error of errors) {
		const fingerprint = normalizeErrorFingerprint(error);
		const current = groups.get(fingerprint) || {
			count: 0,
			error_type: error.error_type,
			endpoint: error.endpoint,
			operation_type: error.operation_type,
			message: compactText(error.error_message, 220),
			first_seen_at: error.created_at,
			last_seen_at: error.created_at,
			unresolved_count: 0
		};
		current.count += 1;
		current.last_seen_at = error.created_at;
		if (!error.resolved) current.unresolved_count += 1;
		groups.set(fingerprint, current);
	}

	return [...groups.values()].sort((left, right) => right.count - left.count).slice(0, 8);
}

function summarizeActivity(rows) {
	const counts = countsBy(rows, 'activity_type');
	return Object.entries(counts)
		.sort((left, right) => right[1] - left[1])
		.slice(0, 12)
		.map(([type, count]) => ({ type, count }));
}

async function expectQuery(query, label) {
	const result = await query;
	if (result.error) throw new Error(`${label}: ${result.error.message}`);
	return result.data ?? [];
}

async function loadAccountContext(supabase, user, member) {
	const actor = await expectQuery(
		supabase.from('onto_actors').select('id').eq('user_id', user.id).maybeSingle(),
		'onto actor'
	);
	const actorId = actor?.id || null;

	const queries = [
		expectQuery(
			supabase.from('user_context').select('*').eq('user_id', user.id).maybeSingle(),
			'user context'
		),
		expectQuery(
			supabase
				.from('projects')
				.select(
					'id, name, description, context, executive_summary, status, source, created_at, updated_at'
				)
				.eq('user_id', user.id)
				.order('updated_at', { ascending: false })
				.limit(30),
			'legacy projects'
		),
		expectQuery(
			supabase
				.from('tasks')
				.select(
					'id, project_id, title, description, details, status, priority, source, created_at, updated_at, completed_at'
				)
				.eq('user_id', user.id)
				.is('deleted_at', null)
				.order('updated_at', { ascending: false })
				.limit(200),
			'legacy tasks'
		),
		expectQuery(
			supabase
				.from('notes')
				.select('id, project_id, title, content, category, created_at, updated_at')
				.eq('user_id', user.id)
				.order('updated_at', { ascending: false })
				.limit(20),
			'notes'
		),
		expectQuery(
			supabase
				.from('brain_dumps')
				.select(
					'id, project_id, title, content, ai_summary, ai_insights, status, created_at'
				)
				.eq('user_id', user.id)
				.order('created_at', { ascending: false })
				.limit(30),
			'brain dumps'
		),
		expectQuery(
			supabase
				.from('chat_sessions')
				.select(
					'id, title, auto_title, summary, chat_type, context_type, status, message_count, created_at, last_message_at'
				)
				.eq('user_id', user.id)
				.order('last_message_at', { ascending: false })
				.limit(40),
			'chat sessions'
		),
		expectQuery(
			supabase
				.from('chat_messages')
				.select('id, role, content, error_code, error_message, created_at')
				.eq('user_id', user.id)
				.eq('role', 'user')
				.order('created_at', { ascending: false })
				.limit(40),
			'chat messages'
		),
		expectQuery(
			supabase
				.from('error_logs')
				.select(
					'error_type, error_message, endpoint, operation_type, severity, resolved, created_at'
				)
				.eq('user_id', user.id)
				.order('created_at', { ascending: true })
				.limit(250),
			'error logs'
		),
		expectQuery(
			supabase
				.from('feedback')
				.select('category, feedback_text, rating, status, created_at')
				.eq('user_id', user.id)
				.order('created_at', { ascending: false })
				.limit(20),
			'feedback'
		),
		expectQuery(
			supabase
				.from('beta_feedback')
				.select(
					'feedback_type, feedback_title, feedback_description, feedback_status, feature_area, founder_response, created_at'
				)
				.or(`user_id.eq.${user.id}${member?.id ? `,member_id.eq.${member.id}` : ''}`)
				.order('created_at', { ascending: false })
				.limit(20),
			'beta feedback'
		),
		expectQuery(
			supabase
				.from('user_activity_logs')
				.select('activity_type, activity_data, created_at')
				.eq('user_id', user.id)
				.order('created_at', { ascending: false })
				.limit(300),
			'activity logs'
		),
		expectQuery(
			supabase
				.from('user_behavioral_profiles')
				.select('project_summary, patterns, user_context, confidence, computed_at')
				.eq('user_id', user.id)
				.order('computed_at', { ascending: false })
				.limit(1)
				.maybeSingle(),
			'behavioral profile'
		),
		expectQuery(
			supabase
				.from('email_recipients')
				.select(
					'status, opened_at, open_count, sent_at, emails!inner(subject, category, sent_at, created_at)'
				)
				.eq('recipient_email', normalizedEmail(user.email))
				.order('created_at', { ascending: false })
				.limit(20),
			'email history'
		),
		expectQuery(
			supabase
				.from('calendar_analyses')
				.select(
					'status, projects_created, projects_suggested, tasks_created, user_rating, user_feedback, error_message, created_at'
				)
				.eq('user_id', user.id)
				.order('created_at', { ascending: false })
				.limit(10),
			'calendar analyses'
		)
	];

	if (actorId) {
		queries.push(
			expectQuery(
				supabase
					.from('onto_projects')
					.select('id, name, description, state_key, props, created_at, updated_at')
					.eq('created_by', actorId)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(30),
				'ontology projects'
			),
			expectQuery(
				supabase
					.from('onto_tasks')
					.select(
						'id, project_id, title, description, state_key, priority, created_at, updated_at'
					)
					.eq('created_by', actorId)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(200),
				'ontology tasks'
			)
		);
	} else {
		queries.push(Promise.resolve([]), Promise.resolve([]));
	}

	const [
		userContext,
		legacyProjects,
		legacyTasks,
		notes,
		brainDumps,
		chatSessions,
		chatMessages,
		errors,
		feedback,
		betaFeedback,
		activityLogs,
		behavioralProfile,
		emailHistory,
		calendarAnalyses,
		ontoProjects,
		ontoTasks
	] = await Promise.all(queries);

	return {
		user,
		user_context: userContext || null,
		legacy_projects: legacyProjects,
		legacy_tasks: legacyTasks,
		notes,
		brain_dumps: brainDumps,
		chat_sessions: chatSessions,
		chat_messages: chatMessages,
		errors,
		feedback,
		beta_feedback: betaFeedback,
		activity_logs: activityLogs,
		behavioral_profile: behavioralProfile || null,
		email_history: emailHistory,
		calendar_analyses: calendarAnalyses,
		onto_projects: ontoProjects,
		onto_tasks: ontoTasks
	};
}

function meaningfulProject(projects) {
	const genericNames = /\b(default|first|general|misc|new|personal|test|to-?do|untitled)\b/i;
	return (
		projects
			.filter((project) => project.name)
			.map((project) => {
				const description =
					project.description || project.context || project.executive_summary || '';
				let score = genericNames.test(project.name) ? -5 : 5;
				if (String(description).trim().length > 60) score += 4;
				if (project.name.trim().length > 12) score += 2;
				return { project, score };
			})
			.sort((left, right) => right.score - left.score)[0]?.project || null
	);
}

function deriveSegment(accountContext, signup) {
	if (!accountContext) {
		return signup.signup_status === 'pending'
			? 'pending_signup_no_account'
			: 'approved_signup_no_account';
	}

	const projectCount =
		accountContext.legacy_projects.length + accountContext.onto_projects.length;
	const actionCount =
		projectCount +
		accountContext.legacy_tasks.length +
		accountContext.onto_tasks.length +
		accountContext.brain_dumps.length +
		accountContext.chat_messages.length;
	if (actionCount === 0) return 'account_created_no_activation';
	if (actionCount >= 40 || accountContext.brain_dumps.length >= 10)
		return 'former_high_intent_user';
	return 'tried_product_early';
}

function buildPromptContext(signup, member, accountContext) {
	const allProjects = accountContext
		? [...accountContext.onto_projects, ...accountContext.legacy_projects]
		: [];
	const anchorProject = meaningfulProject(allProjects);
	const segment = deriveSegment(accountContext, signup);
	const hasErrors = Boolean(accountContext?.errors.length);
	const ctaUrl = accountContext ? ACCOUNT_CTA : SIGNUP_CTA;

	const context = {
		person: {
			first_name: firstName(signup.full_name),
			full_name: signup.full_name,
			signed_up_at: signup.created_at,
			signup_status: signup.signup_status,
			company_name: signup.company_name,
			job_title: signup.job_title
		},
		beta_signup_answers: {
			why_interested: compactText(signup.why_interested, 700),
			biggest_challenge: compactText(signup.biggest_challenge, 700),
			productivity_tools: signup.productivity_tools,
			wants_weekly_calls: signup.wants_weekly_calls,
			wants_community_access: signup.wants_community_access,
			referral_source: signup.referral_source
		},
		beta_member: member
			? {
					joined_at: member.joined_at,
					beta_tier: member.beta_tier,
					early_access_features: member.early_access_features,
					total_feedback_submitted: member.total_feedback_submitted,
					total_features_requested: member.total_features_requested,
					last_active_at: member.last_active_at
				}
			: null,
		account: accountContext
			? {
					created_at: accountContext.user.created_at,
					last_visit: accountContext.user.last_visit,
					onboarding_completed_at: accountContext.user.onboarding_completed_at,
					onboarding_intent: accountContext.user.onboarding_intent,
					onboarding_stakes: compactText(accountContext.user.onboarding_stakes, 500),
					usage_archetype: accountContext.user.usage_archetype,
					productivity_challenges: accountContext.user.productivity_challenges,
					user_context: accountContext.user_context
						? {
								projects: compactText(
									accountContext.user_context.input_projects,
									600
								),
								challenges: compactText(
									accountContext.user_context.input_challenges,
									600
								),
								help_focus: compactText(
									accountContext.user_context.input_help_focus,
									600
								),
								goals: compactText(accountContext.user_context.goals_overview, 600),
								blockers: compactText(accountContext.user_context.blockers, 500)
							}
						: null,
					projects: allProjects.slice(0, 12).map((project) => ({
						name: project.name,
						status: project.state_key || project.status,
						description: compactText(
							project.description || project.context || project.executive_summary,
							450
						),
						updated_at: project.updated_at
					})),
					project_count: allProjects.length,
					task_status_counts: {
						legacy: countsBy(accountContext.legacy_tasks, 'status'),
						current: countsBy(accountContext.onto_tasks, 'state_key')
					},
					recent_task_titles: unique(
						[...accountContext.onto_tasks, ...accountContext.legacy_tasks]
							.slice(0, 14)
							.map((task) => compactText(task.title, 140))
					),
					brain_dumps: accountContext.brain_dumps.slice(0, 8).map((dump) => ({
						title: compactText(dump.title, 160),
						summary: compactText(dump.ai_summary || dump.content, 450),
						status: dump.status,
						created_at: dump.created_at
					})),
					recent_user_requests: accountContext.chat_messages
						.slice(0, 12)
						.map((message) => ({
							content: compactText(message.content, 500),
							created_at: message.created_at,
							error_code: message.error_code
						})),
					chat_session_count_sampled: accountContext.chat_sessions.length,
					linked_error_summary: summarizeErrors(accountContext.errors),
					feedback: [...accountContext.feedback, ...accountContext.beta_feedback]
						.slice(0, 10)
						.map((item) => ({
							title: compactText(item.feedback_title || item.category, 160),
							description: compactText(
								item.feedback_description || item.feedback_text,
								500
							),
							status: item.feedback_status || item.status
						})),
					activity_types: summarizeActivity(accountContext.activity_logs),
					calendar_analyses: accountContext.calendar_analyses.slice(0, 5),
					prior_email_subjects: accountContext.email_history
						.slice(0, 10)
						.map((record) => ({
							subject: record.emails?.subject,
							opened: Boolean(record.opened_at),
							status: record.status
						}))
				}
			: null,
		campaign: {
			segment,
			anchor_project: anchorProject?.name || null,
			has_user_linked_errors: hasErrors,
			cta_url: ctaUrl
		}
	};

	return { context, segment, anchorProject, ctaUrl };
}

const SYSTEM_PROMPT = `You are DJ Wayne, the founder of BuildOS, writing one careful reactivation email to an early beta signup.

BuildOS today helps people turn messy voice or text input into a project with durable context, linked tasks and documents. Its in-app agent can understand that context, help plan or audit the project, and propose changes for approval. Optional daily briefs and calendar tools help with follow-through.

Your objective is a genuine five-minute retry, not a product announcement.

Rules:
- Return valid JSON only with keys: subject, body_text, strategy, evidence_used, activation_step.
- body_text must be 90-180 words, plain text, with short paragraphs, exactly one primary CTA URL, and end with DJ.
- Make the opening specific to this person's stated intent or real work. Use at most two personal facts so it feels attentive, not surveillant.
- Start with "Hi [First Name]," when a first name is available.
- If account is null, never imply they tried or used BuildOS. Say they joined the beta list and focus on what interested them.
- If account exists, it is honest to say they tried BuildOS early. If campaign.anchor_project exists, use that project for the retry and do not substitute a generic project or task list.
- If user-linked errors exist, acknowledge the early product was rough or failed to earn a habit. A safe phrasing is: "The version you tried was rough, and it did not give you a clean enough path from a brain dump to usable work." Never quote internal error text, counts, endpoint names, or technical details back to the person.
- Only mention feedback they explicitly submitted. Never invent a bug, diagnosis, title, outcome, or reason they stopped.
- Explain only the one or two product improvements most relevant to their situation.
- Product claims must stay inside the current-product description above. Do not claim that an engine was rebuilt, a specific bug was fixed, processing is now reliable, or performance improved unless the evidence explicitly proves it.
- Describe the current product in present tense ("BuildOS today..."). Never use "we have since...", "we refined...", or comparative reliability/performance language.
- Use one low-friction ask: open the linked page and spend five minutes on one real project. A reply invitation may be secondary.
- Avoid hype, fake urgency, "AI-powered", em dashes, "I noticed you haven't been in lately", "I'm confident", and generic lines such as "I hope you're well".
- Never mention inferred working hours, schedules, location, behavioral-profile labels, or when you observed their activity. Avoid "I noticed", "I know", and "when you last..." framing.
- Do not say you were "looking back" at their work or activity.
- Prefer direct founder language over "I would like/love" and other marketing filler.
- Do not mention pricing unless the context specifically requires it.
- Subject should be 3-9 words, natural, and tied to their use case when possible.
- evidence_used must list only facts actually used in the copy.
- strategy and activation_step are internal review notes, not part of body_text.`;

function reviewGeneratedDraft(draft, promptContext) {
	const problems = [];
	const body = draft.body_text || '';
	const wordCount = body.split(/\s+/).filter(Boolean).length;
	const first = promptContext.person.first_name;
	const urlMatches = body.match(/https:\/\/[^\s]+/g) || [];

	if (wordCount < 80 || wordCount > 200) problems.push(`body is ${wordCount} words`);
	if (first && !body.toLowerCase().startsWith(`hi ${first.toLowerCase()},`)) {
		problems.push('body does not start with the required greeting');
	}
	if (!/\nDJ\s*$/.test(body)) problems.push('body does not end with DJ');
	if (urlMatches.length !== 1 || urlMatches[0] !== promptContext.campaign.cta_url) {
		problems.push('body must contain exactly the provided CTA URL');
	}
	const surveillanceMatches = body.match(
		/\b(i noticed|i know|i remember|i['’]ve been looking|looking back at your|when you last|work(?:ed|ing)? late|haven't been|had not been)\b/gi
	);
	if (surveillanceMatches) {
		problems.push(
			`remove these prohibited surveillance-like phrases entirely: ${unique(surveillanceMatches).join(', ')}`
		);
	}
	if (
		/\b(rebuilt|more reliable|now reliable|faster|smoother|i(?:'m| am) confident|i would (?:like|love)|we (?:have|'ve) since|we (?:have )?refined|refined how|improved how|much more|without the friction|better serves|ensur(?:e|es|ed|ing) your|fixed (?:the|that|your)|specific bug)\b/i.test(
			body
		)
	) {
		problems.push('copy makes an unsupported improvement claim or uses marketing filler');
	}
	if (body.includes('—')) problems.push('copy contains an em dash');
	if (/\bAI-powered\b/i.test(body)) problems.push('copy uses prohibited AI-powered framing');

	return problems;
}

function sanitizeGeneratedDraft(draft) {
	let body = draft.body_text || '';
	body = body
		.replace(/It has been a while since you last (?:explored|used|opened) BuildOS\.\s*/gi, '')
		.replace(/I['’]ve been looking back at [^.]+\.\s*/gi, '')
		.replace(/\bI (?:noticed|remember) you (?:were|had been)\b/gi, 'You were')
		.replace(/\bbecause I know you\b/gi, 'because you')
		.replace(/\bI know you\b/gi, 'You')
		.replace(/\bI know that\b/gi, '')
		.replace(/\bI know the\b/gi, 'The')
		.replace(/\bI know\b\s*/gi, '')
		.replace(/\bI would (?:like|love) for you to\b/gi, 'Try to')
		.replace(/\bI would (?:like|love) to invite you to\b/gi, 'Try to')
		.replace(/,?\s*which I know is\b/gi, ', which is')
		.replace(/\bI know how frustrating that is\b/gi, 'That kind of friction is frustrating')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/ {2,}/g, ' ')
		.trim();

	return { ...draft, body_text: body };
}

async function requestGeneratedDraft(promptContext, correction = '') {
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${requiredEnv('PRIVATE_OPENROUTER_API_KEY')}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': APP_URL,
			'X-Title': 'BuildOS Beta Reactivation Drafts'
		},
		body: JSON.stringify({
			model: DEFAULT_MODEL,
			models: FALLBACK_MODELS,
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{
					role: 'user',
					content: `Write the tailored reactivation draft from this evidence:\n${JSON.stringify(promptContext)}${
						correction ? `\n\nMandatory correction from copy review: ${correction}` : ''
					}`
				}
			],
			response_format: { type: 'json_object' },
			temperature: 0.55,
			max_tokens: 900
		})
	});

	if (!response.ok) {
		const details = compactText(await response.text(), 800);
		throw new Error(`OpenRouter ${response.status}: ${details}`);
	}

	const payload = await response.json();
	const content = payload.choices?.[0]?.message?.content;
	if (typeof content !== 'string') throw new Error('OpenRouter returned no JSON content');

	let draft;
	try {
		draft = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ''));
	} catch (error) {
		throw new Error(`Could not parse generated draft JSON: ${error.message}`);
	}

	const subject = compactText(draft.subject, 90);
	const bodyText = cleanBodyText(draft.body_text, 2_500);
	if (!subject || !bodyText) throw new Error('Generated draft is missing subject or body_text');
	const generatedEvidence = Array.isArray(draft.evidence_used)
		? draft.evidence_used
				.map((value) => compactText(value, 240))
				.filter(Boolean)
				.slice(0, 8)
		: [];
	const fallbackEvidence = nonEmpty([
		promptContext.campaign.anchor_project
			? `Existing project: ${promptContext.campaign.anchor_project}`
			: null,
		promptContext.beta_signup_answers.why_interested
			? `Beta interest: ${compactText(promptContext.beta_signup_answers.why_interested, 180)}`
			: null,
		promptContext.beta_signup_answers.biggest_challenge
			? `Stated challenge: ${compactText(promptContext.beta_signup_answers.biggest_challenge, 180)}`
			: null
	]).slice(0, 3);

	return {
		subject,
		body_text: bodyText,
		strategy: compactText(draft.strategy, 700),
		evidence_used: generatedEvidence.length > 0 ? generatedEvidence : fallbackEvidence,
		activation_step: compactText(draft.activation_step, 500),
		model: payload.model || DEFAULT_MODEL,
		usage: payload.usage || null
	};
}

async function generateDraft(promptContext, previewRejected = false) {
	let correction = '';
	let lastProblems = [];
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		let draft;
		try {
			draft = sanitizeGeneratedDraft(await requestGeneratedDraft(promptContext, correction));
		} catch (error) {
			lastProblems = [`generation error: ${error.message}`];
			correction =
				'Return shorter, complete JSON. Keep body_text under 170 words and make sure every JSON string and brace is closed.';
			continue;
		}
		const problems = reviewGeneratedDraft(draft, promptContext);
		if (problems.length === 0) return draft;
		if (previewRejected) {
			console.log(
				JSON.stringify(
					{ rejected_subject: draft.subject, rejected_body: draft.body_text, problems },
					null,
					2
				)
			);
		}
		lastProblems = problems;
		correction = `Rewrite from scratch. The prior draft failed because: ${problems.join('; ')}.`;
	}

	throw new Error(
		`Generated draft failed copy review after four attempts: ${lastProblems.join('; ')}`
	);
}

function escapeHtml(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function textToHtml(value) {
	return value
		.trim()
		.split(/\n\s*\n/)
		.map((paragraph) => {
			const escaped = escapeHtml(paragraph).replace(/\n/g, '<br>');
			const linked = escaped.replace(
				/(https:\/\/[^\s<]+)/g,
				'<a href="$1" style="color:#d96c1e;text-decoration:underline">Open BuildOS</a>'
			);
			return `<p>${linked}</p>`;
		})
		.join('\n');
}

async function saveDraft(supabase, adminId, signup, accountContext, member, draft, segment) {
	const generatedAt = new Date().toISOString();
	const templateData = {
		campaign_key: CAMPAIGN_KEY,
		source: 'tailored_beta_reactivation',
		signup_id: signup.id,
		user_id: accountContext?.user.id || null,
		beta_member_id: member?.id || null,
		signup_status: signup.signup_status,
		segment,
		strategy: draft.strategy,
		activation_step: draft.activation_step,
		personalization_evidence: draft.evidence_used,
		generation_model: draft.model,
		generation_usage: draft.usage,
		generated_at: generatedAt,
		requires_review: true,
		send_authorized: false
	};

	const emailPayload = {
		subject: draft.subject,
		content: textToHtml(draft.body_text),
		from_email: process.env.PUBLIC_GMAIL_USER || 'dj@build-os.com',
		from_name: 'DJ',
		category: CATEGORY,
		template_data: templateData,
		status: 'draft',
		scheduled_at: null,
		sent_at: null,
		created_by: adminId,
		tracking_enabled: true,
		tracking_id: crypto.randomUUID()
	};

	const email = await expectQuery(
		supabase.from('emails').insert(emailPayload).select('id').single(),
		'create draft'
	);

	try {
		await expectQuery(
			supabase.from('email_recipients').insert({
				email_id: email.id,
				recipient_email: normalizedEmail(signup.email),
				recipient_name: signup.full_name || null,
				recipient_type: 'beta_signup',
				recipient_id: signup.id
			}),
			'create draft recipient'
		);
	} catch (error) {
		await supabase.from('emails').delete().eq('id', email.id);
		throw error;
	}

	return email.id;
}

async function updateDraft(supabase, existing, signup, accountContext, member, draft, segment) {
	const templateData = {
		...(existing.template_data || {}),
		campaign_key: CAMPAIGN_KEY,
		source: 'tailored_beta_reactivation',
		signup_id: signup.id,
		user_id: accountContext?.user.id || null,
		beta_member_id: member?.id || null,
		signup_status: signup.signup_status,
		segment,
		strategy: draft.strategy,
		activation_step: draft.activation_step,
		personalization_evidence: draft.evidence_used,
		generation_model: draft.model,
		generation_usage: draft.usage,
		generated_at: new Date().toISOString(),
		requires_review: true,
		send_authorized: false
	};

	await expectQuery(
		supabase
			.from('emails')
			.update({
				subject: draft.subject,
				content: textToHtml(draft.body_text),
				template_data: templateData,
				status: 'draft',
				scheduled_at: null,
				sent_at: null
			})
			.eq('id', existing.id)
			.eq('status', 'draft'),
		'update draft'
	);

	await expectQuery(
		supabase
			.from('email_recipients')
			.update({
				recipient_email: normalizedEmail(signup.email),
				recipient_name: signup.full_name || null,
				recipient_type: 'beta_signup',
				recipient_id: signup.id
			})
			.eq('email_id', existing.id),
		'update draft recipient'
	);

	return existing.id;
}

async function mapConcurrent(items, concurrency, worker) {
	const results = new Array(items.length);
	let cursor = 0;
	const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await worker(items[index], index);
		}
	});
	await Promise.all(runners);
	return results;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const supabase = createClient(
		requiredEnv('PUBLIC_SUPABASE_URL'),
		requiredEnv('PRIVATE_SUPABASE_SERVICE_KEY'),
		{ auth: { persistSession: false, autoRefreshToken: false } }
	);

	const signups = await expectQuery(
		supabase.from('beta_signups').select('*').order('created_at', { ascending: true }),
		'beta signups'
	);
	const members = await expectQuery(supabase.from('beta_members').select('*'), 'beta members');
	const users = await expectQuery(supabase.from('users').select('*'), 'users');
	const admins = await expectQuery(
		supabase.from('users').select('id, email').eq('is_admin', true),
		'admins'
	);
	const existingDrafts = await expectQuery(
		supabase.from('emails').select('id, status, template_data').eq('category', CATEGORY),
		'existing reactivation drafts'
	);

	const preferredAdminEmail = normalizedEmail(process.env.PUBLIC_GMAIL_USER);
	const admin =
		admins.find((candidate) => normalizedEmail(candidate.email) === preferredAdminEmail) ||
		admins[0];
	if (!admin) throw new Error('No admin user is available to own the drafts');

	const membersByEmail = new Map(
		members.map((member) => [normalizedEmail(member.email), member])
	);
	const usersByEmail = new Map(users.map((user) => [normalizedEmail(user.email), user]));
	const existingBySignupId = new Map(
		existingDrafts
			.filter((email) => email.template_data?.campaign_key === CAMPAIGN_KEY)
			.map((email) => [email.template_data?.signup_id, email])
	);

	let cohort = signups;
	if (options.onlyEmail) {
		cohort = cohort.filter((signup) => normalizedEmail(signup.email) === options.onlyEmail);
	}
	if (options.onlySignupId) {
		cohort = cohort.filter((signup) => signup.id === options.onlySignupId);
	}
	if (options.onlyStatus) {
		cohort = cohort.filter(
			(signup) => String(signup.signup_status || '').toLowerCase() === options.onlyStatus
		);
	}
	if (options.limit) cohort = cohort.slice(0, options.limit);

	console.log(
		JSON.stringify({
			campaign: CAMPAIGN_KEY,
			mode: options.apply ? 'apply' : 'dry-run',
			cohort: cohort.length,
			existing: cohort.filter((signup) => existingBySignupId.has(signup.id)).length,
			concurrency: options.concurrency
		})
	);

	const accountContextByUserId = new Map();
	const accountUsers = unique(
		cohort.map((signup) => usersByEmail.get(normalizedEmail(signup.email))?.id)
	).map((userId) => users.find((user) => user.id === userId));

	await mapConcurrent(accountUsers, options.concurrency, async (user, index) => {
		const member = membersByEmail.get(normalizedEmail(user.email));
		const context = await loadAccountContext(supabase, user, member);
		accountContextByUserId.set(user.id, context);
		console.log(`[context ${index + 1}/${accountUsers.length}] loaded`);
	});

	let created = 0;
	let updated = 0;
	let skipped = 0;
	let failed = 0;
	const failures = [];

	await mapConcurrent(cohort, options.concurrency, async (signup, index) => {
		const existing = existingBySignupId.get(signup.id);
		if (existing && !options.force) {
			skipped += 1;
			console.log(`[${index + 1}/${cohort.length}] skipped existing draft`);
			return;
		}
		if (existing && existing.status !== 'draft') {
			skipped += 1;
			console.log(`[${index + 1}/${cohort.length}] skipped non-draft email`);
			return;
		}

		try {
			const member = membersByEmail.get(normalizedEmail(signup.email));
			const user = usersByEmail.get(normalizedEmail(signup.email));
			const accountContext = user ? accountContextByUserId.get(user.id) : null;
			const { context, segment } = buildPromptContext(signup, member, accountContext);
			const draft = await generateDraft(context, options.previewContent);

			if (options.previewContent) {
				console.log(
					JSON.stringify(
						{ segment, subject: draft.subject, body_text: draft.body_text },
						null,
						2
					)
				);
			}

			if (options.apply) {
				if (existing) {
					await updateDraft(
						supabase,
						existing,
						signup,
						accountContext,
						member,
						draft,
						segment
					);
					updated += 1;
				} else {
					await saveDraft(
						supabase,
						admin.id,
						signup,
						accountContext,
						member,
						draft,
						segment
					);
					created += 1;
				}
			}

			console.log(
				`[${index + 1}/${cohort.length}] ${options.apply ? (existing ? 'updated' : 'created') : 'generated'} ${segment}`
			);
		} catch (error) {
			failed += 1;
			failures.push({ signup_id: signup.id, error: error.message });
			console.error(`[${index + 1}/${cohort.length}] failed: ${error.message}`);
		}
	});

	console.log(
		JSON.stringify(
			{
				campaign: CAMPAIGN_KEY,
				mode: options.apply ? 'apply' : 'dry-run',
				generated: cohort.length - skipped - failed,
				created,
				updated,
				skipped,
				failed,
				failures
			},
			null,
			2
		)
	);

	if (failed > 0) process.exitCode = 1;
}

await main();
