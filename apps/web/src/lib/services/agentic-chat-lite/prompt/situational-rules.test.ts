// apps/web/src/lib/services/agentic-chat-lite/prompt/situational-rules.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildMidTurnSituationalNotice,
	hasActiveSituation,
	looksLikeWebResearchTurn,
	renderSituationalRulesContent,
	resolveLitePromptTurnSituation
} from './situational-rules';
import { applyActiveDomainSignalsOverlay, buildLitePromptEnvelope } from './build-lite-prompt';

describe('resolveLitePromptTurnSituation', () => {
	it('flags writes when write tools are mounted, regardless of intent', () => {
		const situation = resolveLitePromptTurnSituation({
			toolNames: ['get_project_overview', 'update_onto_task'],
			turnIntentRequiresWrite: false,
			latestUserMessage: 'just talked to them, it went well'
		});
		expect(situation.writeIntent).toBe(true);
		expect(situation.webResearch).toBe(false);
	});

	it('flags writes from turn intent when no write tool is mounted yet', () => {
		const situation = resolveLitePromptTurnSituation({
			toolNames: ['get_project_overview'],
			turnIntentRequiresWrite: true,
			latestUserMessage: 'mark the intro call done'
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
});

describe('looksLikeWebResearchTurn', () => {
	it('matches explicit web research phrasing', () => {
		expect(looksLikeWebResearchTurn('search the web for framework comparisons')).toBe(true);
		expect(looksLikeWebResearchTurn('what is the latest pricing for Vercel?')).toBe(true);
		expect(looksLikeWebResearchTurn('check competitor pricing pages')).toBe(true);
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
	it('renders the write block with exact-ID and state_key rules', () => {
		const content = renderSituationalRulesContent({ writeIntent: true, webResearch: false });
		expect(content).toContain('This turn can write to project data:');
		expect(content).toContain('exact full IDs');
		expect(content).toContain('state_key');
		expect(content).not.toContain('web_search');
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
