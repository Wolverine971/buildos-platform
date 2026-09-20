// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-A-measure-acting-prompt.mjs
import { read, sliceBlock, sliceString, evalArr, est } from './lane-A-extract.mjs';
import fs from 'node:fs';
const src = read('apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts');
const VIS = sliceString(src, 'const VISIBLE_ASSISTANT_CONTENT_CONTRACT =');
const DATE_SCOPE = sliceString(src, 'const DATE_ARGUMENT_SCOPE_RULE =');
const OVERVIEW = evalArr(sliceBlock(src, 'const OVERVIEW_GUIDANCE_LITE = ')).join('\n');
const PROJ_ANALYSIS = evalArr(
	sliceBlock(src, 'const PROJECT_ANALYSIS_SKILL_GUIDANCE_LITE = ')
).join('\n');
const PC_COMPOUND = evalArr(sliceBlock(src, 'const PROJECT_CREATE_COMPOUND_WORKFLOW_LITE = ')).join(
	'\n'
);
const PC_SHELL = evalArr(
	sliceBlock(src, 'const PROJECT_CREATE_REVIEWED_SHELL_WORKFLOW_LITE = ')
).join('\n');
// worker scaffold
const scaffold = {
	staticSkillCatalog: true,
	skillRoutingCoaching: true,
	dynamicSkillTools: false,
	retiredModelCoaching: true,
	domainSensing: true,
	situationalRules: true
};
const toolsSummary = { discoveryTools: [] };
function fn(name) {
	return src.slice(src.indexOf('function ' + name));
}
const identity = evalArr(sliceBlock(fn('buildIdentityMissionSection'), 'content: [')).join('\n');
const strategy = evalArr(sliceBlock(fn('buildOperatingStrategySection'), 'content: ['), {
	scaffold,
	toolsSummary,
	formatInlineToolNames: (n) => n.join(', ')
}).join('\n');
const finalContract = evalArr(sliceBlock(fn('buildFinalResponseContractSection'), 'content: ['), {
	scaffold
}).join('\n');
const capabilities = evalArr(sliceBlock(fn('buildCapabilitiesSkillsToolsSection'), 'content: ['), {
	scaffold,
	rootSkillTable: 'No root skills are registered.'
}).join('\n');
const safety = evalArr(sliceBlock(fn('buildSafetyDataRulesSection'), 'const lines: string[] = ['), {
	scaffold
}).join('\n');
const safetyMember =
	'- Member-role routing: assign work to members whose role_name / role_description matches the responsibility. Ask once if multiple members overlap.';
const pcStrategy = evalArr(sliceBlock(fn('buildProjectCreateStrategySection'), 'content: ['), {
	scaffold,
	projectCreateWorkflow: 'reviewed_shell'
}).join('\n');
const pcSafety = evalArr(sliceBlock(fn('buildProjectCreateSafetySection'), 'content: ['), {
	scaffold,
	projectCreateWorkflow: 'reviewed_shell'
}).join('\n');
const sec = (title, content) => `## ${title}\n\n${content}`;
const header = `# BuildOS Agentic Chat\n\n${VIS}`;
const staticPrefix = [
	header,
	sec('Identity and Mission', identity),
	sec('Capabilities, Skills, and Tools', capabilities),
	sec('Operating Strategy', strategy),
	sec('Final Response Contract', finalContract),
	sec('Safety and Data Rules', safety)
].join('\n\n');
const pcStaticPrefix = [
	header,
	sec('Identity and Mission', identity),
	sec('Operating Strategy', pcStrategy),
	sec('Safety and Data Rules', pcSafety)
].join('\n\n');
// default (web/test) scaffold for comparison
const dscaffold = { ...scaffold, dynamicSkillTools: true };
const dstrategy = evalArr(sliceBlock(fn('buildOperatingStrategySection'), 'content: ['), {
	scaffold: dscaffold,
	toolsSummary: { discoveryTools: ['skill_search', 'domain_search'] },
	formatInlineToolNames: (n) => '`' + n.join('` and `') + '`'
}).join('\n');
const dsafety = evalArr(
	sliceBlock(fn('buildSafetyDataRulesSection'), 'const lines: string[] = ['),
	{ scaffold: dscaffold }
).join('\n');
const rows = [
	['Header + visible-content contract', header],
	['Identity and Mission', identity],
	['Capabilities, Skills, and Tools (worker)', capabilities],
	['Operating Strategy (worker)', strategy],
	['Operating Strategy (default scaffold, for comparison)', dstrategy],
	['Final Response Contract', finalContract],
	['Safety and Data Rules (worker, no member bullet)', safety],
	['Safety and Data Rules (default scaffold)', dsafety],
	['STATIC PREFIX global/project (worker)', staticPrefix],
	['project_create: Operating Strategy (reviewed_shell)', pcStrategy],
	['project_create: Safety (reviewed_shell)', pcSafety],
	['project_create STATIC PREFIX (worker)', pcStaticPrefix],
	['Focus workflow: OVERVIEW_GUIDANCE_LITE (global, renders)', OVERVIEW],
	[
		'Focus workflow: PROJECT_ANALYSIS_SKILL_GUIDANCE_LITE (project, DOES NOT render on worker)',
		PROJ_ANALYSIS
	],
	['Focus workflow: PROJECT_CREATE_REVIEWED_SHELL_WORKFLOW_LITE', PC_SHELL],
	['Focus workflow: PROJECT_CREATE_COMPOUND_WORKFLOW_LITE (dead in prod)', PC_COMPOUND],
	['DATE_ARGUMENT_SCOPE_RULE', DATE_SCOPE]
];
for (const [name, s] of rows)
	console.log(String(s.length).padStart(6), String(est(s)).padStart(5) + 't', name);
fs.writeFileSync('./static-prefix-worker.txt', staticPrefix);
fs.writeFileSync('./static-prefix-project-create-worker.txt', pcStaticPrefix);
fs.writeFileSync('./strategy-worker.txt', strategy);
console.log(
	'\n--- bullet counts: identity',
	identity.split('\n- ').length - 1,
	'strategy',
	strategy.split('\n- ').length,
	'final',
	finalContract.split('\n- ').length + (finalContract.startsWith('- ') ? 1 : 0) - 1,
	'safety',
	safety.split('\n').filter((l) => l.startsWith('- ')).length
);
