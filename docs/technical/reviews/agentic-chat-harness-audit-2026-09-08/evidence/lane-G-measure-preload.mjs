// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-G-measure-preload.mjs
// worker rendering + domain-sensing.ts preload wrapper, to MEASURE rendered sizes
// without loading the app. Mirrors:
//   apps/web/src/lib/services/agentic-chat/tools/skills/markdown-skill.ts
//   apps/web/src/lib/services/agentic-chat/tools/domains/skill-gate-preload.ts (renderWorkerPreloadedSkillPromptContent)
//   apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.ts (renderDomainSensingPromptContent preload branch)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/Users/djwayne/buildos-platform/apps/web/package.json');
const { parse: parseYaml } = require('yaml');

const ROOT =
	'/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/skills/definitions';

function extractFrontmatter(markdown) {
	const trimmed = markdown.trim();
	const match = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
	if (!match) throw new Error('no frontmatter');
	return { frontmatter: parseYaml(match[1]), body: trimmed.slice(match[0].length).trim() };
}
function collectSections(body) {
	const sections = {};
	let cur = null;
	for (const line of body.split(/\r?\n/)) {
		const m = line.match(/^##\s+(.+?)\s*$/);
		if (m) {
			cur = m[1].trim().toLowerCase();
			sections[cur] = [];
			continue;
		}
		if (cur) sections[cur].push(line);
	}
	return sections;
}
function parseListItems(lines, marker) {
	const items = [];
	let current = null;
	const flush = () => {
		if (!current) return;
		const v = current.trim();
		if (v) items.push(v);
		current = null;
	};
	for (const line of lines) {
		const m = line.match(marker);
		if (m) {
			flush();
			current = m[1].trim();
			continue;
		}
		if (!current) continue;
		if (line.trim().length === 0) {
			flush();
			continue;
		}
		if (/^\s{2,}\S/.test(line)) {
			current = `${current} ${line.trim()}`;
			continue;
		}
		flush();
	}
	flush();
	return items;
}
const parseBulletList = (l) => parseListItems(l, /^\s*[-*]\s+(.*)$/);
const parseOrderedList = (l) => parseListItems(l, /^\s*\d+[.)]\s+(.*)$/);
function pickSection(sections, headings) {
	for (const h of headings) {
		const l = sections[h];
		if (l && l.length) return l;
	}
	return [];
}
function parseWorkflowSections(sections) {
	const direct = parseOrderedList(pickSection(sections, ['workflow', 'procedure']));
	if (direct.length) return direct;
	return Object.entries(sections).flatMap(([h, lines]) =>
		!h.startsWith('workflow') && !h.endsWith('workflow') && h !== 'procedure'
			? []
			: parseOrderedList(lines)
	);
}
function parseExamples(lines) {
	const examples = [];
	let current = null;
	let step = null;
	const flushStep = () => {
		if (!current || !step) return;
		const v = step.trim();
		if (v) current.next_steps.push(v);
		step = null;
	};
	const flushEx = () => {
		flushStep();
		if (!current) return;
		examples.push(current);
		current = null;
	};
	for (const line of lines) {
		const t = line.match(/^###\s+(.+?)\s*$/);
		if (t) {
			flushEx();
			current = { description: t[1].trim(), next_steps: [] };
			continue;
		}
		if (!current) continue;
		const im = line.match(/^\s*[-*]\s+(.*)$/);
		if (im) {
			flushStep();
			step = im[1].trim();
			continue;
		}
		if (!step) continue;
		if (line.trim().length === 0) {
			flushStep();
			continue;
		}
		if (/^\s{2,}\S/.test(line)) {
			step = `${step} ${line.trim()}`;
			continue;
		}
		flushStep();
	}
	flushEx();
	return examples;
}
function defineSkill(id, markdown) {
	const { frontmatter, body } = extractFrontmatter(markdown);
	const sections = collectSections(body);
	return {
		id,
		name: frontmatter.name,
		summary: frontmatter.description,
		recommendedLoadFormat: frontmatter.recommended_load_format,
		preserveMarkdown: frontmatter.preserve_markdown === true,
		childSkills: frontmatter.child_skills ?? [],
		referenceModules: frontmatter.reference_modules ?? [],
		relatedOps: parseBulletList(sections['related tools'] ?? []).map((i) =>
			(i.match(/^`([^`]+)`$/)?.[1] ?? i).trim()
		),
		whenToUse: parseBulletList(pickSection(sections, ['when to use', 'activation'])),
		workflow: parseWorkflowSections(sections),
		guardrails: parseBulletList(pickSection(sections, ['guardrails', 'policy'])),
		examples: parseExamples(sections['examples'] ?? []),
		notes: parseBulletList(pickSection(sections, ['notes', 'provenance'])),
		outputContract: pickSection(sections, ['output', 'output contract', 'contract'])
			.join('\n')
			.trim(),
		sourceMarkdown: body,
		bodyLineCount: body.split(/\r?\n/).length,
		rawChars: markdown.length
	};
}

const PRELOAD_LIST_LIMIT = 6,
	PRELOAD_WHEN_TO_USE_LIMIT = 3,
	WORKER_PRELOAD_MAX_CHARS = 6000;
const WORKER_PRELOAD_EXAMPLE_MAX_LINES = 60,
	WORKER_PRELOAD_JUDGMENT_MAX_CHARS = 1800;
const MARKER = '[Playbook truncated for prompt budget.]';
function pushCoreBlocks(lines, s) {
	if (s.whenToUse.length)
		lines.push(
			'',
			'When to use:',
			...s.whenToUse.slice(0, PRELOAD_WHEN_TO_USE_LIMIT).map((i) => `- ${i}`)
		);
	const wf = s.workflow.map((step, i) => `${i + 1}) ${step}`);
	if (wf.length) lines.push('', 'Workflow:', ...wf.map((st) => `- ${st}`));
	if (s.guardrails.length)
		lines.push(
			'',
			'Guardrails:',
			...s.guardrails.slice(0, PRELOAD_LIST_LIMIT).map((i) => `- ${i}`)
		);
	if (s.outputContract) lines.push('', `Output contract: ${s.outputContract}`);
}
function judgment(s) {
	if (s.recommendedLoadFormat !== 'full') return null;
	const body = `\n${s.sourceMarkdown}`
		.split(/\n## /)
		.find((b) => /^Judgment\s*(?:\n|$)/.test(b))
		?.replace(/^Judgment\s*/, '')
		.trim();
	if (!body) return null;
	return body.length > WORKER_PRELOAD_JUDGMENT_MAX_CHARS
		? `${body.slice(0, WORKER_PRELOAD_JUDGMENT_MAX_CHARS).trimEnd()}\n${MARKER}`
		: body;
}
function cap(content, max) {
	if (content.length <= max) return { content, truncated: false };
	const budget = max - MARKER.length - 1;
	const head = content.slice(0, budget);
	const lb = head.lastIndexOf('\n');
	const cut = lb > budget * 0.6 ? head.slice(0, lb) : head;
	return { content: `${cut.trimEnd()}\n${MARKER}`, truncated: true };
}
function renderWorker(s, alternates = []) {
	const lines = [
		`Preloaded skill: ${s.id} (${s.name}) — already loaded at short format. Apply its workflow directly to this turn's work.`
	];
	const j = judgment(s);
	if (j) lines.push('', 'Judgment:', j);
	pushCoreBlocks(lines, s);
	const ex = s.examples[0];
	if (ex)
		lines.push(
			'',
			'Worked example:',
			...[`- ${ex.description}`, ...ex.next_steps.map((st) => `  - ${st}`)]
				.filter((l) => l.trim())
				.slice(0, WORKER_PRELOAD_EXAMPLE_MAX_LINES)
		);
	if (s.referenceModules.length || s.childSkills.length)
		lines.push(
			'',
			'Reference modules and child skills are not loadable on this surface; apply this playbook as written and state platform-specific claims as unverified.'
		);
	if (alternates.length)
		lines.push(
			'',
			`Alternate skill candidates if this one does not fit: ${alternates.join(', ')}.`
		);
	return cap(lines.join('\n'), WORKER_PRELOAD_MAX_CHARS);
}
const PRELOADED_NEXT_STEP =
	'Skill-load gate already satisfied: apply the preloaded skill workflow above directly. Do not call skill_load for the preloaded skill again, and do not call outcome_card_load for the cards listed here — they are routing metadata the preload already covers.';
function wrap(content, source) {
	return [
		`Source: ${source}.`,
		'',
		'Skill-load gate: SATISFIED BY PRELOAD.',
		'',
		content,
		'',
		`Next step: ${PRELOADED_NEXT_STEP}`
	].join('\n');
}
const est = (t) => Math.ceil(t.length / 4);

const ids = process.argv.slice(2);
const out = {};
for (const id of ids) {
	const md = readFileSync(`${ROOT}/${id}/SKILL.md`, 'utf8');
	const s = defineSkill(id, md);
	const { content, truncated } = renderWorker(s);
	const wrapped = wrap(content, 'operational_intent');
	out[id] = {
		raw_md_chars: s.rawChars,
		body_lines: s.bodyLineCount,
		when_to_use: s.whenToUse.length,
		workflow_steps: s.workflow.length,
		guardrails: s.guardrails.length,
		examples: s.examples.length,
		contract_chars: s.outputContract.length,
		related_ops: s.relatedOps.length,
		has_judgment: Boolean(judgment(s)),
		worker_block_chars: content.length,
		worker_block_tokens_est: est(content),
		truncated,
		with_wrapper_chars: wrapped.length,
		with_wrapper_tokens_est: est(wrapped),
		lines_in_block: content.split('\n').length
	};
	if (process.env.DUMP) {
		console.log(`\n===== ${id} =====\n${wrapped}\n`);
	}
}
console.table(out);
