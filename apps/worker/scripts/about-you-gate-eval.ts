// apps/worker/scripts/about-you-gate-eval.ts
//
// About you gate eval (tasker/146). DJ's complaint: agents bring up what they know
// about him when it doesn't help. The gate decides per message which About you
// sections reach the chat model; this measures it on hand-labeled messages in DJ's
// style against a note with planted, mostly-irrelevant sections.
//
//   leak  = a section loaded for a message that doesn't need it
//   miss  = a needed section left out
//
// Free by default: `--dry` prints the requests and labels only. A live run makes one
// small Jev call per scenario (about $0.0002 each, ~$0.005 for the set) and needs
// DJ's OK (AGENTS.md "Paid tests require explicit approval").
//
//   pnpm --filter @buildos/worker exec tsx scripts/about-you-gate-eval.ts --dry
//   pnpm --filter @buildos/worker exec tsx scripts/about-you-gate-eval.ts --live
import { JevClient } from '@buildos/smart-llm';
import {
	ABOUT_YOU_GATE_POLICY,
	buildAboutYouGateRequest,
	gateAboutYouSections
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	gatedAboutYouSections,
	parseAboutYouDocument
} from '@buildos/shared-agent-ops/ontology/about-you';

/** A note like the one the writer would keep for DJ, plus planted irrelevant sections. */
const NOTE = `# About you

## How you like answers

- Outcome first, in product terms; make the technical calls _(Oct 2026)_

## Schedule and constraints

- Works late into the night _(Oct 2026)_
- New baby at home; keep plans realistic _(Oct 2026)_

## What you're focused on

- Interviewing for forward-deployed engineer roles _(Oct 2026)_
- Growing BuildOS users while running client work _(Oct 2026)_

## Where you are

- Glen Burnie, MD (Baltimore/DC area) _(Oct 2026)_

## Background

- Former Marine scout sniper _(Oct 2026)_
- Pastor's kid _(Oct 2026)_
`;

type Scenario = { message: string; needs: string[]; real: boolean };

// Hand labels: which sections would change a good answer. Most need none.
const SCENARIOS: Scenario[] = [
	{ message: 'Okay, so where am I at with things?', needs: [], real: true },
	{ message: 'Okay, so what all is overdue over here?', needs: [], real: true },
	{
		message: 'What all do I have tomorrow? What is going on tomorrow, Monday?',
		needs: [],
		real: true
	},
	{
		message:
			'I have two projects that have to do with Cadre. I need to merge those projects and put them under Wayne Strategies.',
		needs: [],
		real: true
	},
	{ message: 'Can you put ZZ Nest Child inside ZZ Nest Parent?', needs: [], real: true },
	{
		message: 'What project has a spreadsheet for reaching out to CPAs for taxes?',
		needs: [],
		real: true
	},
	{
		message: 'I need to call back about the gun action I dropped off. Remind me tomorrow.',
		needs: ['Schedule and constraints'],
		real: true
	},
	{
		message: 'Who runs the Redline Training Company? Who am I supposed to work with?',
		needs: [],
		real: true
	},
	{
		message: 'Okay, I want to keep going on my book project. What do we have to do today?',
		needs: ['Schedule and constraints'],
		real: true
	},
	{
		message: 'Did I get any emails relevant to 9takes in the last few days?',
		needs: [],
		real: true
	},
	{
		message: 'What should I focus on this week?',
		needs: ['Schedule and constraints', "What you're focused on"],
		real: false
	},
	{
		message: 'Plan my week around the BuildOS launch.',
		needs: ['Schedule and constraints'],
		real: false
	},
	{
		message: 'Find me a plumber who can look at the water heater this week.',
		needs: ['Where you are', 'Schedule and constraints'],
		real: false
	},
	{
		message: 'Should I take on another client project right now?',
		needs: ['Schedule and constraints', "What you're focused on"],
		real: false
	},
	{
		message: 'Draft a cold email to a CPA firm about BuildOS.',
		needs: [],
		real: false
	},
	{
		message: 'Help me prep for my forward-deployed engineer interview on Thursday.',
		needs: ["What you're focused on"],
		real: false
	},
	{ message: 'Rename the Fading Crown doc to Chapter 3 draft.', needs: [], real: false },
	{
		message: 'Write my founder story for the BuildOS about page.',
		needs: ['Background'],
		real: false
	},
	{ message: 'thanks', needs: [], real: false },
	{
		message: 'Find a coworking space near me for Tuesday mornings.',
		needs: ['Where you are', 'Schedule and constraints'],
		real: false
	}
];

async function main() {
	const live = process.argv.includes('--live');
	const sections = parseAboutYouDocument(NOTE);
	const gated = gatedAboutYouSections(sections);
	console.log(
		`About you gate eval: ${SCENARIOS.length} scenarios, ${gated.length} gated sections, threshold ${ABOUT_YOU_GATE_POLICY.threshold}, ${live ? 'LIVE (paid)' : 'dry'}`
	);
	if (!live) {
		const sample = buildAboutYouGateRequest({
			sections: gated,
			message: SCENARIOS[0]!.message
		});
		console.log(JSON.stringify(sample, null, 2));
		for (const scenario of SCENARIOS)
			console.log(
				`- ${scenario.real ? 'real' : 'example'} | needs [${scenario.needs.join(', ')}] | ${scenario.message}`
			);
		return;
	}
	const apiKey = process.env.PRIVATE_OPENROUTER_API_KEY;
	if (!apiKey) throw new Error('--live needs PRIVATE_OPENROUTER_API_KEY');
	const decider = new JevClient({
		apiKey,
		timeoutMs: 3_000,
		maxRequestBytes: 96_000,
		retryOnce: false,
		hedgeAfterMs: 700,
		title: 'BuildOS About you gate eval'
	});
	let leaks = 0;
	let misses = 0;
	let needed = 0;
	let cost = 0;
	let unavailable = 0;
	let turnsWithLeak = 0;
	for (const scenario of SCENARIOS) {
		const result = await gateAboutYouSections({
			decider,
			sections,
			message: scenario.message
		});
		cost += result.costUsd ?? 0;
		if (result.status !== 'ok') unavailable += 1;
		const loaded = result.selected.map((section) => section.heading);
		const leaked = loaded.filter((heading) => !scenario.needs.includes(heading));
		const missed = scenario.needs.filter((heading) => !loaded.includes(heading));
		leaks += leaked.length;
		if (leaked.length > 0) turnsWithLeak += 1;
		misses += missed.length;
		needed += scenario.needs.length;
		const scores = result.scores.map((score) => `${score.heading}=${score.p ?? '?'}`).join(' ');
		console.log(
			`${leaked.length || missed.length ? '✗' : '✓'} ${scenario.message}\n    loaded [${loaded.join(', ')}] leaked [${leaked.join(', ')}] missed [${missed.join(', ')}]\n    ${scores}`
		);
	}
	console.log(
		`\nturns with a leak: ${turnsWithLeak}/${SCENARIOS.length} (${leaks} section loads) · misses: ${misses}/${needed} needed · unavailable: ${unavailable} · cost $${cost.toFixed(4)}`
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
