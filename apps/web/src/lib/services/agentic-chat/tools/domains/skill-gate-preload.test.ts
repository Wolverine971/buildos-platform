// apps/web/src/lib/services/agentic-chat/tools/domains/skill-gate-preload.test.ts
import { requireTestValue } from '$lib/test-helpers/require-test-value';
import { describe, expect, it } from 'vitest';
import {
	getSkillGateCandidateSkillIds,
	renderDomainSensingPromptContent,
	senseDomains
} from './domain-sensing';
import {
	isProductivityPreloadSkill,
	PRODUCTIVITY_PRELOAD_ALLOWLIST,
	resolveOperationalSkillPreload,
	resolveSkillGatePreload,
	resolveSkillGatePreloadDecision,
	resolveSkillPreloadById,
	WORKER_PRELOAD_MAX_CHARS
} from './skill-gate-preload';
import { estimateTokensFromText } from '$lib/services/agentic-chat-v2/context-usage';
import { getSkillById, listAllSkills } from '../skills/registry';
import {
	AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1,
	findAgenticChatWorkerUnavailableToolNamesV1
} from '@buildos/agentic-chat-runtime';
import {
	getGatewayDirectToolNamesForProfile,
	getToolRegistry,
	type GatewaySurfaceProfileName
} from '@buildos/agentic-chat-runtime/catalog';

const PROJECT_WRITE_DOCUMENT_TOOLS = [
	'create_onto_task',
	'update_onto_task',
	'create_onto_document',
	'update_onto_document',
	'get_document_tree',
	'move_document_in_tree'
];

function senseColdEmailTurn() {
	return senseDomains({
		currentUserMessage: 'Write a cold email to a newsletter creator about BuildOS.',
		limit: 3
	});
}

describe('resolveSkillGatePreload', () => {
	it.each([
		'Should I build out email capture and a Mailchimp email flow for this pistol shooting client website?',
		'Help me plan the newsletter signup and welcome email for this website.'
	])('does not inject cold outreach into website email capture: %s', (message) => {
		const sensing = senseDomains({ currentUserMessage: message, limit: 3 });
		expect(resolveSkillGatePreload(sensing)?.skillId ?? '').not.toMatch(/^cold_email_/);
		// Exercise the admission guard even if lexical scoring later changes.
		const candidate = senseColdEmailTurn();
		if (!candidate) throw new Error('Expected cold-email candidate');
		expect(resolveSkillGatePreload({ ...candidate, query: message })).toBeNull();
	});

	it('preloads the top gate candidate in short format when the gate is active', () => {
		const sensing = senseColdEmailTurn();
		expect(sensing?.skill_load_required).toBe(true);

		const preload = resolveSkillGatePreload(sensing);

		expect(preload).not.toBeNull();
		expect(preload?.format).toBe('short');
		expect(preload?.source).toBe('domain_sensing');
		expect(preload?.skillId).toBe(getSkillGateCandidateSkillIds(sensing)[0]);
		expect(preload?.payload.markdown).toBeUndefined();
		expect(preload?.promptContent).toContain('Workflow:');
		expect(preload?.promptContent).toContain('do NOT call skill_load');
		expect(preload?.promptContent).toContain(preload!.skillId);
		expect(preload?.promptContent).toContain(
			`skill_load with {"skill":"${preload!.skillId}","format":"full"}`
		);
		expect(preload?.promptContent).not.toContain('skill_load with reference');
	});

	it('renders a preload without follow-up skill calls for worker-only execution', () => {
		const preload = resolveSkillGatePreload(senseColdEmailTurn(), {
			allowFollowupSkillLoad: false
		});

		expect(preload).not.toBeNull();
		expect(preload?.promptContent).toMatch(/^Playbook for this turn \(.+\):\n/);
		expect(preload?.promptContent).not.toContain('skill_load');
		expect(preload?.promptContent).not.toContain('Linked child skills');
		expect(preload?.promptContent).not.toContain('Need more depth?');
		expect(preload?.promptContent).not.toContain('already loaded');
		expect(preload!.promptContent.length).toBeLessThanOrEqual(WORKER_PRELOAD_MAX_CHARS);
	});

	// Lane-aware rendering (lane D P1-3 / P2-1): the worker has no reload path,
	// so its block carries the first worked example, says reference modules and
	// child skills are unavailable, and is capped by characters for every skill.
	it('keeps every worker block under the character cap and engages the cap at least once', () => {
		const rendered = listAllSkills().map((skill) => ({
			id: skill.id,
			content:
				resolveSkillPreloadById(skill.id, { allowFollowupSkillLoad: false })
					?.promptContent ?? ''
		}));
		for (const { id, content } of rendered) {
			expect(content.length, id).toBeGreaterThan(0);
			expect(content.length, id).toBeLessThanOrEqual(WORKER_PRELOAD_MAX_CHARS);
			expect(content, id).not.toContain('skill_load');
		}
		const truncated = rendered.filter(({ content }) =>
			content.endsWith('[Playbook truncated for prompt budget.]')
		);
		expect(truncated.length).toBeGreaterThan(0);
		for (const { content } of truncated) {
			// Cut on a line boundary, never mid-line.
			expect(content).toMatch(/\n\[Playbook truncated for prompt budget\.\]$/);
		}
	});

	// AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F71: the worker block is a plain
	// playbook — no gate wording and no note about references it cannot load.
	it('adds the update-first worked example and no unavailable-references note on the worker lane', () => {
		const preload = resolveSkillPreloadById('task_management', {
			allowFollowupSkillLoad: false
		});
		expect(preload?.promptContent).toContain('Worked example:');
		expect(preload?.promptContent).toContain('Update an existing task by its exact id');
		expect(preload?.promptContent).not.toContain('not loadable on this surface');
		expect(preload?.promptContent).not.toContain('Reference modules');
		expect(preload?.promptContent).not.toContain('Linked child skills');
		expect(preload?.promptContent).not.toContain('skill_load');
	});

	it('inlines the Judgment block only for an explicit recommended_load_format: full', () => {
		const fiction = resolveSkillPreloadById('fiction_story_craft', {
			allowFollowupSkillLoad: false
		});
		expect(fiction?.promptContent).toContain('Judgment:');
		expect(fiction?.promptContent).toContain('Canon ledger');
		expect(fiction!.promptContent.length).toBeLessThanOrEqual(WORKER_PRELOAD_MAX_CHARS);
		// preserve_markdown alone derives `full`; it must not earn the block.
		const tasks = resolveSkillPreloadById('task_management', {
			allowFollowupSkillLoad: false
		});
		expect(tasks?.promptContent).not.toContain('Judgment:');
		// Web lane keeps the short block untouched.
		const webFiction = resolveSkillPreloadById('fiction_story_craft');
		expect(webFiction?.promptContent).not.toContain('Judgment:');
		expect(webFiction?.promptContent).not.toContain('Worked example:');
	});

	it('returns null when sensing did not require a skill load', () => {
		const sensing = senseDomains({
			currentUserMessage: 'Rename the grocery list task to weekend errands.',
			limit: 3
		});
		expect(sensing?.skill_load_required ?? false).toBe(false);

		expect(resolveSkillGatePreload(sensing)).toBeNull();
	});

	it('returns null for a null sensing result', () => {
		expect(resolveSkillGatePreload(null)).toBeNull();
	});

	it('skips the preload when the top candidate is already loaded', () => {
		const sensing = senseColdEmailTurn();
		const topCandidate = getSkillGateCandidateSkillIds(sensing)[0];

		const preload = resolveSkillGatePreload(sensing, {
			alreadyLoadedSkillIds: [requireTestValue(topCandidate).toUpperCase()]
		});

		expect(preload).toBeNull();
	});
});

// Productivity allowlist (founder decision 2026-09-03). Marketing, sales, and
// craft skills left the default runtime: they preload only when the turn is an
// explicit ask. Everything on the allowlist keeps preloading automatically.
describe('productivity preload allowlist', () => {
	it('names only registered skills', () => {
		for (const skillId of PRODUCTIVITY_PRELOAD_ALLOWLIST) {
			expect(getSkillById(skillId)?.id, skillId).toBe(skillId);
		}
		// AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F70: only skills a preload route
		// can reach. The six dropped ids are in no domain, outcome card, or
		// mounted intent kind; they stay registered for skill_search / skill_load.
		expect([...PRODUCTIVITY_PRELOAD_ALLOWLIST]).toEqual([
			'calendar_management',
			'context_engineering_for_agent_work',
			'document_workspace',
			'project_audit',
			'project_forecast',
			'task_management'
		]);
		for (const unreachable of [
			'google_calendar',
			'people_context',
			'plan_management',
			'project_creation',
			'research_capture',
			'task_state_updates'
		]) {
			expect(getSkillById(unreachable)?.id, unreachable).toBe(unreachable);
			expect(isProductivityPreloadSkill(unreachable), unreachable).toBe(false);
		}
		expect(isProductivityPreloadSkill('content_strategy_beyond_blogging')).toBe(false);
		expect(isProductivityPreloadSkill('cold_email_engagement_first_outreach')).toBe(false);
		expect(isProductivityPreloadSkill('TASK_MANAGEMENT')).toBe(true);
	});

	it('preloads an allowlisted skill automatically off domain sensing', () => {
		const sensing = senseDomains({
			currentUserMessage: 'audit this project for blockers and stale work',
			limit: 3
		});
		const decision = resolveSkillGatePreloadDecision(sensing);

		expect(decision.preload?.skillId).toBe('project_audit');
		expect(decision.preload?.reason).toBe('productivity_allowlist');
		expect(decision.gate_suppressed_by).toBeUndefined();
	});

	it('preloads a task-management ask automatically through operational intent', () => {
		const preload = resolveOperationalSkillPreload({
			message: 'add a task to call the roofer back on Tuesday',
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		});

		expect(preload?.skillId).toBe('task_management');
		expect(preload?.reason).toBe('productivity_allowlist');
	});

	it('preloads a marketing skill on an explicit campaign ask', () => {
		const sensing = senseDomains({
			currentUserMessage: 'help me plan a cold email campaign for local homeowners',
			limit: 3
		});
		expect(sensing?.skill_load_required).toBe(true);

		const decision = resolveSkillGatePreloadDecision(sensing);

		expect(decision.preload?.skillId).toBe('cold_email_engagement_first_outreach');
		expect(decision.preload?.reason).toBe('explicit_ask');
		expect(isProductivityPreloadSkill(decision.preload!.skillId)).toBe(false);
		expect(decision.gate_suppressed_by).toBeUndefined();
	});

	it('refuses a marketing-flavored message that never asks for the work', () => {
		// A forwarded reply mentions "cold email" but requests nothing.
		const sensing = senseDomains({
			currentUserMessage:
				"Hi DJ — forwarding the note from the newsletter creator: 'loved the cold email, let's talk next week about a sponsorship.'",
			limit: 3
		});
		const decision = resolveSkillGatePreloadDecision(sensing);

		expect(decision.preload).toBeNull();
		expect(decision.gate_suppressed_by).toBe('not_allowlisted');
	});

	it('refuses a craft candidate the chokepoint sees with the gate still open', () => {
		// Design craft keeps automatic sensing (it is not a marketing domain), so
		// the allowlist itself is what refuses the preload here.
		const sensing = senseDomains({
			currentUserMessage:
				'Here is the landing page the video links to. It feels amateur and I cannot tell why. Give me a UI/UX audit.',
			limit: 3
		});
		expect(sensing?.skill_load_required).toBe(true);
		const topCandidate = getSkillGateCandidateSkillIds(sensing)[0];
		expect(isProductivityPreloadSkill(topCandidate)).toBe(false);

		const decision = resolveSkillGatePreloadDecision(sensing, {
			allowFollowupSkillLoad: false
		});

		// "audit" is a request verb, so this one earns the explicit-ask escape.
		expect(decision.preload?.reason).toBe('explicit_ask');
	});

	it('does not preload for a narrow task edit or a document section replacement', () => {
		const narrowCases = [
			'change the estimate on the Cedar House framing task to 6 hours',
			"Replace the Start Here document's audience section with the first-time buyer copy."
		];
		for (const message of narrowCases) {
			const sensing = senseDomains({ currentUserMessage: message, limit: 3 });
			const decision = resolveSkillGatePreloadDecision(sensing);
			expect(decision.preload, message).toBeNull();
			expect(resolveSkillGatePreload(sensing, { allowFollowupSkillLoad: false })).toBeNull();
		}
	});

	it('keeps the persisted project affinity route open for a craft skill', () => {
		// A project domain profile is a selection the user already made; it is not
		// the automatic sensing this decision restricts.
		const preload = resolveSkillPreloadById('fiction_story_craft');
		expect(preload?.reason).toBe('project_domain_affinity');
	});
});

describe('resolveSkillPreloadById', () => {
	it('preloads a trusted project-affinity skill without lexical sensing', () => {
		const preload = resolveSkillPreloadById('fiction_story_craft');

		expect(preload).not.toBeNull();
		expect(preload?.skillId).toBe('fiction_story_craft');
		expect(preload?.source).toBe('project_domain_affinity');
		expect(preload?.format).toBe('short');
		expect(preload?.payload.markdown).toBeUndefined();
		expect(preload?.promptContent.length).toBeLessThan(9_000);
		expect(preload?.promptContent).toContain('Character–Arc–Scene Sweep');
		expect(preload?.promptContent).toContain('traits, backstory, wants, fears');
		expect(preload?.promptContent).toContain('Causal bridge');
		expect(preload?.promptContent).toContain('No project facts changed');
		expect(preload?.materializedToolNames).toEqual(
			expect.arrayContaining([
				'create_onto_document',
				'get_document_outline',
				'read_document_section',
				'search_project',
				'update_onto_document'
			])
		);
		expect(preload?.payload.write_ops).toEqual(
			expect.arrayContaining(['onto.document.create', 'onto.document.update'])
		);
	});

	it('preloads a complete calendar bundle before the first model pass', () => {
		const preload = resolveSkillPreloadById('calendar_management');

		expect(preload?.materializedToolNames).toEqual([
			'create_calendar_event',
			'delete_calendar_event',
			'get_calendar_event_details',
			'get_project_calendar',
			'list_calendar_events',
			'set_project_calendar',
			'update_calendar_event'
		]);
		expect(preload?.payload.destructive_ops).toContain('cal.event.delete');
	});

	it('skips an affinity preload already present in the history ledger', () => {
		expect(
			resolveSkillPreloadById('fiction_story_craft', {
				alreadyLoadedSkillIds: ['FICTION_STORY_CRAFT']
			})
		).toBeNull();
	});
});

// 2026-09-02 turn executor audit, Finding 4 / Decision 4: the operational
// skills live in no domain, so the worker reaches them through a
// deterministic intent map keyed off the mounted tools.
describe('resolveOperationalSkillPreload', () => {
	it('preloads task_management for a task write on a project write surface', () => {
		const preload = resolveOperationalSkillPreload({
			message: 'mark the intro call done',
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		});

		expect(preload).not.toBeNull();
		expect(preload?.skillId).toBe('task_management');
		expect(preload?.source).toBe('operational_intent');
		expect(preload?.promptContent).toMatch(/^Playbook for task writes this turn:\n/);
		expect(preload?.promptContent).toContain('update_onto_task');
		expect(preload?.promptContent).toContain('Worked example:');
		expect(preload?.promptContent).not.toContain('skill_load');
		expect(preload?.promptContent).not.toContain('update_strategy');
		expect(preload?.promptContent).toContain('full replacement');
		expect(preload!.promptContent.length).toBeLessThanOrEqual(WORKER_PRELOAD_MAX_CHARS);
		expect(estimateTokensFromText(preload!.promptContent)).toBeLessThanOrEqual(1_500);
		// Reported in the audit remediation receipt.
		process.stdout.write(
			`[preload-size] task_management worker block: ${preload!.promptContent.length} chars, ~${estimateTokensFromText(preload!.promptContent)} tokens\n`
		);
	});

	it('preloads document_workspace for organize intent', () => {
		const preload = resolveOperationalSkillPreload({
			message: "This project's documents are a mess, please organize them",
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		});
		expect(preload?.skillId).toBe('document_workspace');
		expect(preload?.promptContent).toContain('move_document_in_tree');
	});

	it('names the craft candidate as an alternate when both fire', () => {
		const preload = resolveOperationalSkillPreload({
			message: 'add a task to draft the cold email sequence for the newsletter creators',
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS,
			craftAlternateSkillIds: ['cold_email_engagement_first_outreach']
		});
		expect(preload?.skillId).toBe('task_management');
		expect(preload?.promptContent).toContain(
			'Alternate skill candidates if this one does not fit: cold_email_engagement_first_outreach.'
		);
	});

	it('stays null for reads and read-only surfaces', () => {
		expect(
			resolveOperationalSkillPreload({
				message: 'what tasks are due this week?',
				toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
			})
		).toBeNull();
		expect(
			resolveOperationalSkillPreload({
				message: 'mark the intro call done',
				toolNames: ['get_workspace_overview']
			})
		).toBeNull();
	});

	// AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F69: an operational playbook is this
	// turn's write rules and takes no already-loaded dedupe; the craft route
	// keeps its one-shot dedupe.
	it('has no already-loaded dedupe, unlike the craft route', () => {
		const params: Parameters<typeof resolveOperationalSkillPreload>[0] = {
			message: 'mark the intro call done',
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		};
		expect(params).not.toHaveProperty('alreadyLoadedSkillIds');
		expect(resolveOperationalSkillPreload(params)?.skillId).toBe('task_management');
		expect(
			resolveSkillPreloadById('project_audit', {
				allowFollowupSkillLoad: false,
				alreadyLoadedSkillIds: ['project_audit']
			})
		).toBeNull();
	});

	it('shows the worked example that matches the turn verb, update by default', () => {
		const update = resolveOperationalSkillPreload({
			message: 'mark the intro call done',
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		});
		expect(update?.promptContent).toContain('- Update an existing task by its exact id');
		expect(update?.promptContent).not.toContain('- Create a task for a real follow-up');

		const create = resolveOperationalSkillPreload({
			message: 'add a task to call the roofer back on Tuesday',
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		});
		expect(create?.promptContent).toContain('- Create a task for a real follow-up');
		expect(create?.promptContent).not.toContain('- Update an existing task by its exact id');

		const organize = resolveOperationalSkillPreload({
			message: "This project's documents are a mess, please organize them",
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		});
		expect(organize?.promptContent).toContain('- Organize unlinked project documents');

		const append = resolveOperationalSkillPreload({
			message: 'append these notes to the research doc',
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		});
		expect(append?.promptContent).toContain('- Update an existing document by its exact id');
	});
});

// AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F71: the rendered worker block (not
// the whole file) must name only tools the worker surface actually mounts,
// must carry no dotted op id a call could be emitted as, and must fit the
// forty-line budget so a weak model reads it whole.
describe('worker playbook crosscheck against the mounted surface', () => {
	const registeredToolNames = new Set(Object.keys(getToolRegistry().byToolName));
	const omitted = new Set<string>(AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1);
	function workerSurface(profile: GatewaySurfaceProfileName): string[] {
		const names = getGatewayDirectToolNamesForProfile(profile).filter(
			(name) => !omitted.has(name)
		);
		expect(findAgenticChatWorkerUnavailableToolNamesV1(names)).toEqual([]);
		return names;
	}
	const cases: Array<{ message: string; profile: GatewaySurfaceProfileName; skillId: string }> = [
		{ message: 'mark the intro call done', profile: 'project', skillId: 'task_management' },
		{
			message: 'add a task to call the roofer back',
			profile: 'project',
			skillId: 'task_management'
		},
		{ message: 'mark the intro call done', profile: 'global', skillId: 'task_management' },
		{
			message: "This project's documents are a mess, please organize them",
			profile: 'project',
			skillId: 'document_workspace'
		},
		{
			message: 'save this as a note in the project',
			profile: 'project',
			skillId: 'document_workspace'
		},
		{
			message: 'append these notes to the research doc',
			profile: 'project',
			skillId: 'document_workspace'
		},
		{
			message: 'Can you schedule a call with Ana tomorrow?',
			profile: 'global',
			skillId: 'calendar_management'
		},
		{
			message: 'move the standup to 3pm',
			profile: 'project',
			skillId: 'calendar_management'
		}
	];

	it.each(cases)('$skillId on $profile for "$message"', ({ message, profile, skillId }) => {
		const mounted = new Set(workerSurface(profile));
		const preload = resolveOperationalSkillPreload({ message, toolNames: [...mounted] });
		expect(preload?.skillId).toBe(skillId);
		const block = preload!.promptContent;
		const lines = block.split('\n');
		expect(lines.length, block).toBeLessThanOrEqual(40);
		expect(block).not.toMatch(/\b(?:onto|cal|util)\.[a-z_]+(?:\.[a-z_]+)*/);
		expect(block).not.toContain('declare_turn_contract');
		const namedTools = [...new Set(block.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [])].filter(
			(token) => registeredToolNames.has(token)
		);
		expect(namedTools.length).toBeGreaterThan(0);
		for (const tool of namedTools) {
			expect(mounted.has(tool), `${skillId} names ${tool}, not mounted on ${profile}`).toBe(
				true
			);
		}
	});
});

describe('renderDomainSensingPromptContent with a preload', () => {
	// AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F71: a preload renders as the bare
	// playbook. The Source / Skill-load gate / Next step wrapper is gone.
	it('renders an operational preload as the bare playbook', () => {
		const preload = resolveOperationalSkillPreload({
			message: 'mark the intro call done',
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		});
		const content = renderDomainSensingPromptContent(null, {
			preloadedSkillPromptContent: preload!.promptContent,
			preloadSource: preload!.source
		});
		expect(content).toBe(preload!.promptContent);
		expect(content).toMatch(/^Playbook for task writes this turn:\n/);
		expect(content).not.toContain('Source:');
		expect(content).not.toContain('Skill-load gate');
		expect(content).not.toContain('Next step');
		expect(content).not.toContain('skill_load');
		expect(content).not.toContain('outcome_card_load');
	});

	it('renders a persisted-affinity preload even when lexical sensing found no domain', () => {
		const preload = resolveSkillPreloadById('fiction_story_craft');
		expect(preload).not.toBeNull();

		const content = renderDomainSensingPromptContent(null, {
			preloadedSkillPromptContent: preload!.promptContent,
			preloadSource: preload!.source
		});

		expect(content).toBe(preload!.promptContent);
		expect(content).not.toContain('Source:');
		expect(content).not.toContain('Skill-load gate');
	});

	it('lets persisted affinity override a weak, ungated lexical signal', () => {
		const weakSensing = senseDomains({
			currentUserMessage: 'Which option feels strongest?'
		});
		expect(weakSensing?.skill_load_required ?? false).toBe(false);
		const preload = resolveSkillPreloadById('fiction_story_craft');

		const content = renderDomainSensingPromptContent(weakSensing, {
			preloadedSkillPromptContent: preload!.promptContent,
			preloadSource: preload!.source
		});

		expect(content).toBe(preload!.promptContent);
		expect(content).not.toContain('Skill-load gate: ACTIVE.');
	});

	it('replaces the active gate directive with the preloaded skill block', () => {
		const sensing = senseColdEmailTurn();
		const preload = resolveSkillGatePreload(sensing);
		expect(preload).not.toBeNull();

		const content = renderDomainSensingPromptContent(sensing, {
			preloadedSkillPromptContent: preload!.promptContent
		});

		expect(content).toBe(preload!.promptContent);
		expect(content).toContain(preload!.skillId);
		expect(content).not.toContain('Skill-load gate: ACTIVE.');
		expect(content).not.toContain('Candidate domains:');
	});

	it('carries no gated next step once a preload is supplied (WP-8)', () => {
		const sensing = senseColdEmailTurn();
		const preload = resolveSkillGatePreload(sensing, { allowFollowupSkillLoad: false });
		expect(preload).not.toBeNull();

		const content = renderDomainSensingPromptContent(sensing, {
			preloadedSkillPromptContent: preload!.promptContent
		});

		// The gated next step demands a skill_load call the preload already
		// made redundant — it must not survive anywhere in the block, and the
		// worker block itself never says skill_load or outcome_card_load.
		expect(content).not.toContain('Skill-load gate is ACTIVE');
		expect(content).not.toContain('Next step:');
		expect(content).not.toContain('skill_load');
		expect(content).not.toContain('outcome_card_load');
	});

	it('keeps the active gate directive when no preload is supplied', () => {
		const sensing = senseColdEmailTurn();

		const content = renderDomainSensingPromptContent(sensing);

		expect(content).toContain('Skill-load gate: ACTIVE.');
		expect(content).toContain('Next step: Skill-load gate is ACTIVE');
		expect(content).not.toContain('SATISFIED BY PRELOAD');
	});
});
