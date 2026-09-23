// packages/shared-agent-ops/src/utils/entity-reference-parser.test.ts
import { describe, expect, it } from 'vitest';
import { resolveEntityReferences } from './entity-reference-parser';

const PROJECT = '445dd429-db93-4878-90a9-b3ab1627a9f2';
const DOC = '1cad2618-3188-43ac-98ff-e715a8a8013d';
const known = new Set([`project:${PROJECT}`, `document:${DOC}`]);
const isKnown = (type: string, id: string) => known.has(`${type}:${id}`);

describe('resolveEntityReferences', () => {
	it('keeps known references and turns invented ones into plain text', () => {
		const { markdown, dropped } = resolveEntityReferences(
			`Use the [[document:${DOC}|Book Contract]] and the [[document:story-blueprint-template|Story Blueprint Template]].`,
			isKnown
		);
		expect(markdown).toBe(
			`Use the [[document:${DOC}|Book Contract]] and the Story Blueprint Template.`
		);
		expect(dropped).toEqual([
			{
				type: 'document',
				id: 'story-blueprint-template',
				displayText: 'Story Blueprint Template'
			}
		]);
	});

	it('checks relative /projects links the same way', () => {
		const other = '00000000-0000-4000-8000-000000000000';
		const { markdown } = resolveEntityReferences(
			[
				`[Contract](/projects/${PROJECT}/documents/${DOC})`,
				`[Ghost](/projects/${PROJECT}/documents/${other})`,
				`[Project](/projects/${PROJECT})`,
				`[Elsewhere](/projects/${other})`
			].join(' '),
			isKnown
		);
		expect(markdown).toBe(
			`[Contract](/projects/${PROJECT}/documents/${DOC}) Ghost [Project](/projects/${PROJECT}) Elsewhere`
		);
	});
});
