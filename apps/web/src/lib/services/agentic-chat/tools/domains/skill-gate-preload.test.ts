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
	resolveFocusedTableSkillPreload,
	isFocusedTableContextPayload,
	renderWorkerPreloadedSkillPromptContent,
	resolveOperationalPlaybookCandidates,
	resolveSkillGatePreload,
	resolveSkillGatePreloadDecision,
	resolveUserLaunchSkillPreload,
	skillToolsAreMounted,
	WORKER_PRELOAD_MAX_CHARS
} from './skill-gate-preload';
import { estimateTokensFromText } from '$lib/services/agentic-chat-v2/context-usage';
import { getSkillById, listAllSkills } from '../skills/registry';
import { loadSkill } from '../skills/skill-load';
import { isSkillHelpPayload } from '../skills/types';
import type { OperationalExampleHint } from './operational-skill-intent';
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

// Explicit fiction ask; domain-sensing.test.ts pins it to fiction_story_craft.
function senseFictionAskTurn() {
	return senseDomains({
		currentUserMessage:
			'Help me plan what happens to this character next in the novel. Give me three options.'
	});
}

/**
 * The operational playbook block exactly as the worker renders it once Jev's
 * commission picks it (apps/worker/src/workers/agentic-chat/provider/
 * turn-rules.ts renderOperationalPlaybook): candidate content, then the
 * hinted worked example, falling back to update. Since 2026-10-17 admission
 * ships candidates and never reads the message (audit Q1).
 */
function renderOperationalPlaybook(
	skillId: string,
	toolNames: readonly string[],
	hint: OperationalExampleHint = 'update'
): string | null {
	const candidate = resolveOperationalPlaybookCandidates({ toolNames }).find(
		(entry) => entry.skillId === skillId
	);
	if (!candidate) return null;
	const example =
		candidate.examples[hint] ??
		candidate.examples.update ??
		candidate.examples.create ??
		candidate.examples.organize ??
		null;
	return example ? `${candidate.content}\n\nWorked example:\n${example}` : candidate.content;
}

function candidateSkillIds(toolNames: readonly string[], excludeSkillIds?: string[]): string[] {
	return resolveOperationalPlaybookCandidates({ toolNames, excludeSkillIds }).map(
		(candidate) => candidate.skillId
	);
}

/**
 * Worker-lane block for any registered skill, rendered exactly as
 * resolveSkillPreload renders a craft preload (same load options, default
 * heading, no example hint). No admission route reaches every skill.
 */
function renderWorkerBlockForSkill(skillId: string): string {
	const payload = loadSkill(skillId, { format: 'short', surface: 'chat_internal' });
	if (!isSkillHelpPayload(payload)) return '';
	return renderWorkerPreloadedSkillPromptContent(payload, [], {
		heading: `Playbook for this turn (${payload.name}):`,
		exampleHint: null
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
			content: renderWorkerBlockForSkill(skill.id)
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
		const block = renderOperationalPlaybook('task_management', PROJECT_WRITE_DOCUMENT_TOOLS);
		expect(block).toContain('Worked example:');
		expect(block).toContain('Update an existing task by its exact id');
		expect(block).not.toContain('not loadable on this surface');
		expect(block).not.toContain('Reference modules');
		expect(block).not.toContain('Linked child skills');
		expect(block).not.toContain('skill_load');
	});

	it('inlines the Judgment block only for an explicit recommended_load_format: full', () => {
		const fiction = resolveSkillGatePreload(senseFictionAskTurn(), {
			allowFollowupSkillLoad: false
		});
		expect(fiction?.skillId).toBe('fiction_story_craft');
		expect(fiction?.reason).toBe('explicit_ask');
		expect(fiction?.promptContent).toContain('Judgment:');
		expect(fiction?.promptContent).toContain('Canon ledger');
		expect(fiction!.promptContent.length).toBeLessThanOrEqual(WORKER_PRELOAD_MAX_CHARS);
		// preserve_markdown alone derives `full`; it must not earn the block.
		expect(
			renderOperationalPlaybook('task_management', PROJECT_WRITE_DOCUMENT_TOOLS)
		).not.toContain('Judgment:');
		// Web lane keeps the short block untouched.
		const webFiction = resolveSkillGatePreload(senseFictionAskTurn());
		expect(webFiction?.skillId).toBe('fiction_story_craft');
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
		// can reach. plan_management joined once plan-layer writes were mounted on
		// both worker surfaces; context_engineering_for_agent_work and
		// project_forecast left (never fired, not a BuildOS user job). The rest
		// stay registered for an explicit ask and the external gateway.
		// 2026-10-04 (Tables tool suite): table_workspace joined; the focused-table
		// route reaches it and its tools are mounted on the project surface.
		expect([...PRODUCTIVITY_PRELOAD_ALLOWLIST]).toEqual([
			'calendar_management',
			'document_workspace',
			'plan_management',
			'project_audit',
			'table_workspace',
			'task_management'
		]);
		for (const unreachable of [
			'context_engineering_for_agent_work',
			'google_calendar',
			'people_context',
			'project_creation',
			'project_forecast',
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

	it('ships allowlisted operational playbooks as worker candidates off the mounted tools', () => {
		const ids = candidateSkillIds(PROJECT_WRITE_DOCUMENT_TOOLS);
		expect(ids).toEqual(['task_management', 'document_workspace']);
		for (const id of ids) expect(isProductivityPreloadSkill(id), id).toBe(true);
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
});

// 2026-09-02 turn executor audit, Finding 4 / Decision 4: the operational
// skills live in no domain, so admission ships them to the worker. Since
// 2026-10-17 (audit Q1) admission ships every playbook the mounted tools can
// honor and the worker picks one from Jev's write commission; the message is
// never read here.
describe('resolveOperationalPlaybookCandidates', () => {
	it('renders the task_management candidate as a bare worker playbook', () => {
		const [candidate] = resolveOperationalPlaybookCandidates({
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		});
		expect(candidate).toMatchObject({ skillId: 'task_management', entityKind: 'task' });
		expect(candidate!.content).toMatch(/^Playbook for task writes this turn:\n/);
		expect(candidate!.content).toContain('update_onto_task');
		expect(candidate!.content).not.toContain('Worked example:');
		expect(candidate!.content).not.toContain('skill_load');
		expect(candidate!.content).not.toContain('update_strategy');
		expect(candidate!.content).toContain('full replacement');
		const block = renderOperationalPlaybook('task_management', PROJECT_WRITE_DOCUMENT_TOOLS)!;
		expect(block).toContain('Worked example:');
		expect(block.length).toBeLessThanOrEqual(WORKER_PRELOAD_MAX_CHARS);
		expect(estimateTokensFromText(block)).toBeLessThanOrEqual(1_500);
		// Reported in the audit remediation receipt.
		process.stdout.write(
			`[preload-size] task_management worker block: ${block.length} chars, ~${estimateTokensFromText(block)} tokens\n`
		);
	});

	it('keeps content plus every worked example within the worker cap', () => {
		for (const profile of ['project', 'global'] as const) {
			for (const candidate of resolveOperationalPlaybookCandidates({
				toolNames: workerSurfaceToolNames(profile)
			})) {
				expect(Object.keys(candidate.examples).length, candidate.skillId).toBeGreaterThan(
					0
				);
				for (const example of Object.values(candidate.examples)) {
					const block = `${candidate.content}\n\nWorked example:\n${example}`;
					expect(block.length, candidate.skillId).toBeLessThanOrEqual(
						WORKER_PRELOAD_MAX_CHARS
					);
				}
			}
		}
	});

	it('ships document_workspace with its organize example where the tree tools are mounted', () => {
		const block = renderOperationalPlaybook(
			'document_workspace',
			PROJECT_WRITE_DOCUMENT_TOOLS,
			'organize'
		);
		expect(block).toContain('move_document_in_tree');
		expect(block).toContain('- Organize unlinked project documents');
	});

	// 2026-10-23: create_onto_document joined global for Workspace saves, but the
	// document playbook walks the project tree with tools global does not mount.
	it('keeps document_workspace off the global surface', () => {
		expect(workerSurfaceToolNames('global')).toContain('create_onto_document');
		expect(candidateSkillIds(workerSurfaceToolNames('global'))).not.toContain(
			'document_workspace'
		);
		expect(candidateSkillIds(workerSurfaceToolNames('project'))).toContain(
			'document_workspace'
		);
	});

	it('ships calendar_management when the calendar write tools are mounted', () => {
		expect(candidateSkillIds(['create_calendar_event', 'update_calendar_event'])).toEqual([
			'calendar_management'
		]);
		expect(
			renderOperationalPlaybook('calendar_management', workerSurfaceToolNames('global'))
		).toContain('create_calendar_event');
	});

	it('ships nothing on a read-only surface', () => {
		expect(
			resolveOperationalPlaybookCandidates({ toolNames: ['get_workspace_overview'] })
		).toEqual([]);
	});

	it('takes no message and no already-loaded dedupe; only the turn rules skill is excluded', () => {
		const params: Parameters<typeof resolveOperationalPlaybookCandidates>[0] = {
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		};
		expect(params).not.toHaveProperty('message');
		expect(params).not.toHaveProperty('alreadyLoadedSkillIds');
		expect(candidateSkillIds(PROJECT_WRITE_DOCUMENT_TOOLS, ['task_management'])).toEqual([
			'document_workspace'
		]);
		const auditSensing = senseDomains({
			currentUserMessage: 'audit this project for blockers and stale work',
			limit: 3
		});
		expect(
			resolveSkillGatePreload(auditSensing, { allowFollowupSkillLoad: false })?.skillId
		).toBe('project_audit');
		expect(
			resolveSkillGatePreload(auditSensing, {
				allowFollowupSkillLoad: false,
				alreadyLoadedSkillIds: ['project_audit']
			})
		).toBeNull();
	});

	it('carries one worked example per hint, update first by default', () => {
		const [tasks, docs] = resolveOperationalPlaybookCandidates({
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		});
		expect(tasks!.examples.update).toContain('- Update an existing task by its exact id');
		expect(tasks!.examples.create).toContain('- Create a task for a real follow-up');
		expect(tasks!.examples.create).not.toContain('- Update an existing task by its exact id');
		expect(docs!.examples.update).toContain('- Update an existing document by its exact id');
		expect(docs!.examples.organize).toContain('- Organize unlinked project documents');
		// The rendered block shows the hinted example only.
		const create = renderOperationalPlaybook(
			'task_management',
			PROJECT_WRITE_DOCUMENT_TOOLS,
			'create'
		);
		expect(create).toContain('- Create a task for a real follow-up');
		expect(create).not.toContain('- Update an existing task by its exact id');
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
	const cases: Array<{ profile: GatewaySurfaceProfileName; skillId: string }> = [
		{ profile: 'project', skillId: 'task_management' },
		{ profile: 'global', skillId: 'task_management' },
		{ profile: 'project', skillId: 'document_workspace' },
		{ profile: 'project', skillId: 'calendar_management' },
		{ profile: 'global', skillId: 'calendar_management' },
		{ profile: 'project', skillId: 'plan_management' },
		{ profile: 'global', skillId: 'plan_management' }
	];

	it.each(cases)('$skillId on $profile, every worked example', ({ profile, skillId }) => {
		const mounted = new Set(workerSurface(profile));
		const candidate = resolveOperationalPlaybookCandidates({ toolNames: [...mounted] }).find(
			(entry) => entry.skillId === skillId
		);
		expect(candidate, skillId).toBeDefined();
		for (const hint of Object.keys(candidate!.examples) as OperationalExampleHint[]) {
			const block = renderOperationalPlaybook(skillId, [...mounted], hint)!;
			const lines = block.split('\n');
			expect(lines.length, `${hint}: ${block}`).toBeLessThanOrEqual(40);
			expect(block).not.toMatch(/\b(?:onto|cal|util)\.[a-z_]+(?:\.[a-z_]+)*/);
			expect(block).not.toContain('declare_turn_contract');
			// The turn-contract shapes render whole inside the character cap
			// (apps/worker/tests/agenticChatSkillContractExamples.test.ts validates them).
			expect(block, hint).toContain('{"outcomes":');
			expect(block).not.toContain('[Playbook truncated');
			const namedTools = [...new Set(block.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [])].filter(
				(token) => registeredToolNames.has(token)
			);
			expect(namedTools.length).toBeGreaterThan(0);
			for (const tool of namedTools) {
				expect(
					mounted.has(tool),
					`${skillId} names ${tool}, not mounted on ${profile}`
				).toBe(true);
			}
		}
	});
});

describe('renderDomainSensingPromptContent with a preload', () => {
	// AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F71: a preload renders as the bare
	// playbook. The Source / Skill-load gate / Next step wrapper is gone.
	it('renders a user-launched preload as the bare playbook', () => {
		const { preload } = resolveUserLaunchSkillPreload({
			skillId: 'task_management',
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		});
		const content = renderDomainSensingPromptContent(null, {
			preloadedSkillPromptContent: preload!.promptContent,
			preloadSource: preload!.source
		});
		expect(content).toBe(preload!.promptContent);
		expect(content).toMatch(/^Playbook the user chose for this chat \(/);
		expect(content).not.toContain('Source:');
		expect(content).not.toContain('Skill-load gate');
		expect(content).not.toContain('Next step');
		expect(content).not.toContain('skill_load');
		expect(content).not.toContain('outcome_card_load');
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

/** The worker's mounted tool names for one launch surface. */
function workerSurfaceToolNames(profile: GatewaySurfaceProfileName): string[] {
	const omitted = new Set<string>(AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1);
	return getGatewayDirectToolNamesForProfile(profile).filter((name) => !omitted.has(name));
}

// 2026-10-04: plan-layer writes have been mounted on both worker surfaces
// since 2026-09-18, but plan_management was off the allowlist, so a
// plan-primary write turn got no playbook.
describe('plan-layer operational playbook', () => {
	it.each(['project', 'global'] as const)(
		'preloads plan_management on the %s surface',
		(profile) => {
			const toolNames = workerSurfaceToolNames(profile);
			expect(candidateSkillIds(toolNames)).toContain('plan_management');
			const block = renderOperationalPlaybook('plan_management', toolNames, 'create')!;
			expect(block).toMatch(/^Playbook for plan writes this turn:\n/);
			expect(block).toContain('create_onto_plan');
			expect(block.length).toBeLessThanOrEqual(WORKER_PRELOAD_MAX_CHARS);
		}
	);
});

describe('mounted-tool admission on the worker', () => {
	it('refuses a playbook whose declared tools the worker cannot run (people_context)', () => {
		const payload = loadSkill('people_context', { format: 'short', surface: 'chat_internal' });
		if (!isSkillHelpPayload(payload)) throw new Error('people_context should load');
		expect(payload.materialized_tools?.length).toBeGreaterThan(0);
		for (const profile of ['global', 'project'] as const) {
			const toolNames = workerSurfaceToolNames(profile);
			expect(skillToolsAreMounted(payload, toolNames), profile).toBe(false);
			expect(
				resolveUserLaunchSkillPreload({ skillId: 'people_context', toolNames }),
				profile
			).toEqual({ preload: null, gate_suppressed_by: 'tools_unmounted' });
		}
	});

	it('treats a skill that declares no tools as advisory', () => {
		expect(skillToolsAreMounted({ materialized_tools: [] }, [])).toBe(true);
		expect(skillToolsAreMounted({}, [])).toBe(true);
		expect(skillToolsAreMounted({ materialized_tools: ['a_tool', 'b_tool'] }, ['b_tool'])).toBe(
			true
		);
	});

	it('applies the same check to a sensed craft preload', () => {
		const sensing = senseDomains({
			currentUserMessage: 'audit this project for blockers and stale work',
			limit: 3
		});
		expect(
			resolveSkillGatePreloadDecision(sensing, {
				allowFollowupSkillLoad: false,
				mountedToolNames: workerSurfaceToolNames('project')
			}).preload?.skillId
		).toBe('project_audit');
		expect(
			resolveSkillGatePreloadDecision(sensing, {
				allowFollowupSkillLoad: false,
				mountedToolNames: ['create_calendar_event']
			})
		).toEqual({ preload: null, gate_suppressed_by: 'tools_unmounted' });
	});
});

// "Try in BuildOS" carries the chosen skill as a structured request field on
// the launch's first turn; the server trusts it only after a registry lookup.
describe('user-launched skill preload', () => {
	const globalTools = workerSurfaceToolNames('global');

	it('preloads a registered craft skill off the allowlist as user_launch', () => {
		const skillId = 'cold_email_engagement_first_outreach';
		expect(isProductivityPreloadSkill(skillId)).toBe(false);
		const { preload } = resolveUserLaunchSkillPreload({ skillId, toolNames: globalTools });
		expect(preload).toMatchObject({ skillId, source: 'user_launch', reason: 'user_launch' });
		expect(preload!.promptContent).toMatch(/^Playbook the user chose for this chat \(/);
		expect(preload!.promptContent).not.toContain('skill_load');
	});

	it.each([
		null,
		undefined,
		'',
		'not_a_registered_skill',
		'onto.task.skill',
		'../task_management'
	])('ignores %j, which the registry does not resolve', (skillId) => {
		expect(resolveUserLaunchSkillPreload({ skillId, toolNames: globalTools })).toEqual({
			preload: null
		});
	});

	// The worker appends the operational playbook Jev's commission picks after
	// the launched skill (provider/turn-rules.ts), so admission ships every
	// candidate except the launched skill itself.
	it('leaves the operational playbook to the worker and never ships the launched skill twice', () => {
		const { preload } = resolveUserLaunchSkillPreload({
			skillId: 'task_management',
			toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
		});
		expect(preload).toMatchObject({
			skillId: 'task_management',
			source: 'user_launch',
			reason: 'user_launch'
		});
		expect(preload!.promptContent).toMatch(/^Playbook the user chose for this chat \(/);
		expect(candidateSkillIds(PROJECT_WRITE_DOCUMENT_TOOLS, [preload!.skillId])).toEqual([
			'document_workspace'
		]);
	});

	it('renders project_creation with its contract shape where the create tool is mounted', () => {
		const { preload } = resolveUserLaunchSkillPreload({
			skillId: 'project_creation',
			toolNames: globalTools
		});
		expect(preload?.promptContent).toContain('{"outcomes":');
		expect(preload?.promptContent).toContain('create_onto_goal');
		expect(preload?.promptContent).not.toContain('[Playbook truncated');
		// The project surface does not mount create_onto_project.
		expect(
			resolveUserLaunchSkillPreload({
				skillId: 'project_creation',
				toolNames: workerSurfaceToolNames('project')
			}).gate_suppressed_by
		).toBe('tools_unmounted');
	});
});

// BuildOS Tables (2026-10-04): a table in focus (structured: the prepared
// context's focus type_key) brings table_workspace; this turn's operational
// write playbook rides along after it. The message text never selects it.
describe('focused table playbook', () => {
	const omitted = new Set<string>(AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1);
	const projectTools = getGatewayDirectToolNamesForProfile('project').filter(
		(name) => !omitted.has(name)
	);
	const registeredToolNames = new Set(Object.keys(getToolRegistry().byToolName));

	it('detects a focused table from the structured context only', () => {
		const focused = (type: string, typeKey: unknown) => ({
			data: { focus_entity_type: type, focus_entity_full: { id: 'x', type_key: typeKey } }
		});
		expect(isFocusedTableContextPayload(focused('document', 'document.table'))).toBe(true);
		expect(isFocusedTableContextPayload(focused('document', 'document.table.crm'))).toBe(true);
		expect(isFocusedTableContextPayload(focused('document', 'document.note'))).toBe(false);
		expect(isFocusedTableContextPayload(focused('task', 'document.table'))).toBe(false);
		expect(isFocusedTableContextPayload({ data: { project: {} } })).toBe(false);
		expect(isFocusedTableContextPayload(null)).toBe(false);
	});

	it('is off unless the focused entity is a table', () => {
		expect(
			resolveFocusedTableSkillPreload({ focusedTable: false, toolNames: projectTools })
		).toBeNull();
	});

	it('renders a whole worker playbook that names only mounted project tools', () => {
		const preload = resolveFocusedTableSkillPreload({
			focusedTable: true,
			toolNames: projectTools
		});
		expect(preload).toMatchObject({
			skillId: 'table_workspace',
			source: 'focused_entity',
			reason: 'productivity_allowlist'
		});
		const block = preload!.promptContent;
		expect(block.startsWith('Playbook for the table in focus:')).toBe(true);
		expect(block).not.toContain('[Playbook truncated');
		expect(block).not.toMatch(/\b(?:onto|cal|util)\.[a-z_]+(?:\.[a-z_]+)*/);
		expect(block).toContain('read_table_rows');
		const namedTools = [...new Set(block.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [])].filter(
			(token) => registeredToolNames.has(token)
		);
		const mounted = new Set(projectTools);
		for (const tool of namedTools) {
			expect(mounted.has(tool), `table_workspace names ${tool}, not mounted`).toBe(true);
		}
		expect(preload!.materializedToolNames).toEqual(
			expect.arrayContaining([
				'get_onto_table_details',
				'read_table_rows',
				'update_onto_table_rows'
			])
		);
	});

	it('is refused when no table tool is mounted', () => {
		expect(
			resolveFocusedTableSkillPreload({
				focusedTable: true,
				toolNames: ['create_onto_project']
			})
		).toBeNull();
	});

	it('stands alone; the task playbook stays a worker candidate', () => {
		const preload = resolveFocusedTableSkillPreload({
			focusedTable: true,
			toolNames: projectTools
		});
		expect(preload?.skillId).toBe('table_workspace');
		expect(preload!.promptContent).not.toContain('Playbook for task writes this turn:');
		expect(candidateSkillIds(projectTools, [preload!.skillId])).toContain('task_management');
	});
});
