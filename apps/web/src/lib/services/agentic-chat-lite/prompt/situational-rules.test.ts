// apps/web/src/lib/services/agentic-chat-lite/prompt/situational-rules.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildMidTurnSituationalNotice,
	CLARIFICATION_RULE_LINE,
	hasActiveSituation,
	looksLikeWebResearchTurn,
	renderSituationalRulesContent,
	resolveLitePromptTurnSituation,
	WORKER_WRITE_TURN_RULE_LINES,
	WRITE_TURN_RULE_LINES
} from './situational-rules';
import { applyActiveDomainSignalsOverlay, buildLitePromptEnvelope } from './build-lite-prompt';

describe('resolveLitePromptTurnSituation', () => {
	// 2026-09-02 turn executor audit, Finding 9: every project turn mounts
	// write tools, so tool presence rendered the write rules on pure questions.
	it('does not flag writes from mounted write tools alone', () => {
		const situation = resolveLitePromptTurnSituation({
			toolNames: ['get_project_overview', 'update_onto_task'],
			turnIntentRequiresWrite: false,
			latestUserMessage: 'just talked to them, it went well'
		});
		expect(situation.writeIntent).toBe(false);
		expect(situation.webResearch).toBe(false);
		expect(hasActiveSituation(situation)).toBe(false);
	});

	it('flags writes from a mutation verb in the message', () => {
		for (const message of [
			'mark the intro call done',
			'add a task to follow up with Sarah on Friday',
			'reorganize the docs under Research',
			'save this as a note in the project',
			'rename the grocery list task to weekend errands'
		]) {
			const situation = resolveLitePromptTurnSituation({
				toolNames: ['get_project_overview'],
				turnIntentRequiresWrite: false,
				latestUserMessage: message
			});
			expect(situation.writeIntent, message).toBe(true);
		}
	});

	it('keeps status questions that merely mention entities on the read path', () => {
		for (const message of [
			'what tasks are due this week?',
			'update me on where the docs stand',
			'what changed in the plan since Monday?',
			'where are we at with this book? Do we have a theme or a synopsis'
		]) {
			const situation = resolveLitePromptTurnSituation({
				toolNames: ['get_project_overview', 'update_onto_task', 'update_onto_document'],
				turnIntentRequiresWrite: false,
				latestUserMessage: message
			});
			expect(situation.writeIntent, message).toBe(false);
		}
	});

	it('flags writes from turn intent when no write tool is mounted yet', () => {
		const situation = resolveLitePromptTurnSituation({
			toolNames: ['get_project_overview'],
			turnIntentRequiresWrite: true,
			latestUserMessage: 'ok go ahead'
		});
		expect(situation.writeIntent).toBe(true);
	});

	it('flags writes on an implicit living-reference capture turn', () => {
		const situation = resolveLitePromptTurnSituation({
			toolNames: ['get_document_outline', 'update_onto_document'],
			latestUserMessage: 'Mara stops trusting Ilyan after she finds the ledger.',
			livingWorkspace: true,
			livingWorkspaceCapture: true
		});
		expect(situation.writeIntent).toBe(true);
	});

	it('flags web research when web tools are mounted', () => {
		const situation = resolveLitePromptTurnSituation({
			toolNames: ['web_search', 'web_visit'],
			turnIntentRequiresWrite: false,
			latestUserMessage: 'anything'
		});
		expect(situation.webResearch).toBe(true);
	});

	it('stays inactive for a pure read turn', () => {
		const situation = resolveLitePromptTurnSituation({
			toolNames: ['get_project_overview', 'list_onto_tasks'],
			turnIntentRequiresWrite: false,
			latestUserMessage: 'what is the status of this project?'
		});
		expect(hasActiveSituation(situation)).toBe(false);
		expect(renderSituationalRulesContent(situation)).toBeNull();
	});

	it('carries the worker-bound flag through', () => {
		expect(
			resolveLitePromptTurnSituation({ toolNames: [], workerBound: true }).workerBound
		).toBe(true);
		expect(resolveLitePromptTurnSituation({ toolNames: [] }).workerBound).toBe(false);
	});
});

describe('looksLikeWebResearchTurn', () => {
	it('matches explicit web research phrasing', () => {
		expect(looksLikeWebResearchTurn('search the web for framework comparisons')).toBe(true);
		expect(looksLikeWebResearchTurn('what is the latest pricing for Vercel?')).toBe(true);
		expect(looksLikeWebResearchTurn('check competitor pricing pages')).toBe(true);
		expect(
			looksLikeWebResearchTurn(
				'i think we need to figure out the research on what other people are charging'
			)
		).toBe(true);
		expect(
			looksLikeWebResearchTurn(
				'Look into what other scheduling tools for small service businesses charge — ' +
					'I want a sense of the pricing landscape before we put a paid tier together.'
			)
		).toBe(true);
	});

	it('does not match workspace research phrasing', () => {
		expect(looksLikeWebResearchTurn('research this project and summarize open tasks')).toBe(
			false
		);
		expect(looksLikeWebResearchTurn('update my resume task')).toBe(false);
		expect(looksLikeWebResearchTurn('')).toBe(false);
	});
});

describe('renderSituationalRulesContent', () => {
	it('renders the web write block with exact-ID, state_key, and skill-pointer rules', () => {
		const content = renderSituationalRulesContent({ writeIntent: true, webResearch: false });
		expect(content).toContain('This turn can write to project data:');
		expect(content).toContain('exact full IDs');
		expect(content).toContain('state_key');
		expect(content).toContain('See the task_management skill');
		expect(content).not.toContain('declare_turn_contract');
		expect(content).not.toContain('web_search');
	});

	// Audit F-A3 / F-A9: the worker withholds direct writes that select an
	// existing entity, and it cannot call skill_load, so the worker-bound
	// block teaches the contract route and drops the skill pointer.
	it('renders the worker write block with the contract-first route and no skill pointers', () => {
		const content = renderSituationalRulesContent({
			writeIntent: true,
			webResearch: false,
			workerBound: true
		});
		expect(content).toContain('This turn can write to project data:');
		expect(content).toContain('call declare_turn_contract first');
		expect(content).toContain('focused entity');
		expect(content).toContain('given by the user');
		expect(content).toContain('only entity of its kind');
		expect(content).toContain('exact full IDs');
		expect(content).toContain('state_key');
		expect(content).not.toContain('task_management skill');
		expect(content).not.toContain('document_workspace skill');
		expect(content).not.toContain('search the workspace when project scope is unknown');
	});

	// Audit C5: four clarification phrasings collapsed to one sentence.
	it('states the clarification rule exactly once, in one phrasing, on both lanes', () => {
		for (const workerBound of [false, true]) {
			const content = renderSituationalRulesContent({
				writeIntent: true,
				webResearch: false,
				livingWorkspace: true,
				livingWorkspaceCapture: true,
				workerBound
			});
			const clarificationMentions = (content ?? '')
				.split('\n')
				.filter((line) => /clarif/i.test(line));
			expect(clarificationMentions).toEqual([CLARIFICATION_RULE_LINE]);
			expect(content).not.toContain('one concise clarification');
			expect(content).not.toContain('one concise question');
			expect(content).not.toContain('Stop for clarification');
		}
		expect(WRITE_TURN_RULE_LINES).toContain(CLARIFICATION_RULE_LINE);
		expect(WORKER_WRITE_TURN_RULE_LINES).toContain(CLARIFICATION_RULE_LINE);
	});

	it('renders the research block with the persistence rule', () => {
		const content = renderSituationalRulesContent({ writeIntent: false, webResearch: true });
		expect(content).toContain('This turn involves web research:');
		expect(content).toContain('Research you do not write down is lost');
		expect(content).toContain('Sources section');
		expect(content).not.toContain('state_key');
	});

	it('renders both blocks together', () => {
		const content = renderSituationalRulesContent({ writeIntent: true, webResearch: true });
		expect(content).toContain('This turn can write to project data:');
		expect(content).toContain('This turn involves web research:');
	});

	it('requires the review-only delegate handoff instead of a prose proposal', () => {
		const situation = resolveLitePromptTurnSituation({
			toolNames: ['get_document_tree', 'delegate_task'],
			latestUserMessage: 'Stage one coherent change set for review.',
			reviewDelegation: true
		});
		const content = renderSituationalRulesContent(situation);

		expect(situation.reviewDelegation).toBe(true);
		expect(content).toContain('This turn requires a review-staged Agent Run:');
		expect(content).toContain('then call delegate_task once');
		expect(content).toContain('proposal document is not a staged change set');
		expect(content).toContain('does not approve or apply');
		expect(hasActiveSituation(situation)).toBe(true);
	});

	it('renders the living-reference agreement without turning brainstorming into canon', () => {
		const content = renderSituationalRulesContent({
			writeIntent: true,
			webResearch: false,
			livingWorkspace: true,
			domainProfile: 'fiction_story',
			domainAffinity: 'writing.fiction'
		});
		expect(content).toContain('active living-reference agreement');
		expect(content).toContain('Domain affinity: writing.fiction (fiction_story)');
		expect(content).toContain('updates to the project reference');
		expect(content).toContain('assistant-generated options are proposals, not durable facts');
		expect(content).toContain('add hierarchy only when document density makes grouping useful');
		expect(content).not.toContain('This is an implicit capture turn');
	});

	it('requires a durable write on a living-reference capture turn', () => {
		const situation = resolveLitePromptTurnSituation({
			toolNames: ['get_document_outline', 'update_onto_document'],
			turnIntentRequiresWrite: false,
			latestUserMessage: 'Mara stops trusting Ilyan after she finds the ledger.',
			livingWorkspace: true,
			livingWorkspaceCapture: true,
			domainProfile: 'fiction_story',
			domainAffinity: 'writing.fiction'
		});
		const content = renderSituationalRulesContent(situation);

		expect(situation.livingWorkspaceCapture).toBe(true);
		expect(content).toContain('This is an implicit capture turn');
		expect(content).toContain('perform the smallest relevant durable document write');
		expect(content).toContain('Do not merely acknowledge or promise an update');
	});
});

describe('buildMidTurnSituationalNotice', () => {
	it('attaches write rules when write tools materialize mid-turn', () => {
		const notice = buildMidTurnSituationalNotice(['update_onto_task']);
		expect(notice).toContain('Write rules now apply:');
		expect(notice).toContain('exact full IDs');
	});

	it('attaches research rules when web tools materialize mid-turn', () => {
		const notice = buildMidTurnSituationalNotice(['web_search']);
		expect(notice).toContain('Web research rules now apply:');
		expect(notice).toContain('Research you do not write down is lost');
	});

	it('returns null for read-only materializations', () => {
		expect(buildMidTurnSituationalNotice(['get_document_outline'])).toBeNull();
	});
});

describe('situational_rules section wiring', () => {
	it('renders the section via the overlay on a write turn', () => {
		const envelope = buildLitePromptEnvelope({
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			data: { tasks: [] }
		});
		const overlaid = applyActiveDomainSignalsOverlay(envelope, {
			currentUserMessage: 'mark the intro call task done',
			domainSensingResult: null,
			turnSituation: { writeIntent: true, webResearch: false }
		});

		const section = overlaid.sections.find((item) => item.id === 'situational_rules');
		expect(section).toBeDefined();
		expect(section?.content).toContain('This turn can write to project data:');
		expect(overlaid.systemPrompt).toContain('## Rules for This Turn');
		// Re-applying with no situation strips the stale section.
		const stripped = applyActiveDomainSignalsOverlay(overlaid, {
			currentUserMessage: 'thanks!',
			domainSensingResult: null,
			turnSituation: { writeIntent: false, webResearch: false }
		});
		expect(stripped.sections.some((item) => item.id === 'situational_rules')).toBe(false);
	});

	it('renders the worker rules when the situation is worker-bound', () => {
		const envelope = buildLitePromptEnvelope({
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			data: { tasks: [] },
			scaffold: { dynamicSkillTools: false }
		});
		const overlaid = applyActiveDomainSignalsOverlay(envelope, {
			currentUserMessage: 'mark the intro call task done',
			domainSensingResult: null,
			turnSituation: { writeIntent: true, webResearch: false, workerBound: true },
			scaffold: { dynamicSkillTools: false }
		});
		const section = overlaid.sections.find((item) => item.id === 'situational_rules');
		expect(section?.content).toContain('call declare_turn_contract first');
		expect(section?.content).not.toContain('task_management skill');
	});

	it('is suppressed by the no-situational-rules scaffold flag', () => {
		const envelope = buildLitePromptEnvelope({
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			data: { tasks: [] },
			turnSituation: { writeIntent: true, webResearch: true },
			scaffold: { situationalRules: false }
		});
		expect(envelope.sections.some((item) => item.id === 'situational_rules')).toBe(false);
	});

	it('renders in the seed build when the input carries a live situation', () => {
		const envelope = buildLitePromptEnvelope({
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			data: { tasks: [] },
			turnSituation: { writeIntent: false, webResearch: true }
		});
		const section = envelope.sections.find((item) => item.id === 'situational_rules');
		expect(section?.content).toContain('This turn involves web research:');
	});

	it('never renders for project_create', () => {
		const envelope = buildLitePromptEnvelope({
			contextType: 'project_create',
			entityId: null,
			projectId: null,
			data: null,
			turnSituation: { writeIntent: true, webResearch: true }
		});
		expect(envelope.sections.some((item) => item.id === 'situational_rules')).toBe(false);
	});
});
