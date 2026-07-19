// apps/web/src/lib/components/ontology/graph/lib/graph.layout.test.ts
import { describe, expect, it } from 'vitest';

import { getGraphLayoutOptions } from './graph.layout';

describe('getGraphLayoutOptions', () => {
	it.each(['dagre', 'cola', 'cose-bilkent', 'circle'])(
		'includes labels in %s layout collision dimensions',
		(layoutName) => {
			expect(getGraphLayoutOptions(layoutName)).toMatchObject({
				name: layoutName,
				nodeDimensionsIncludeLabels: true
			});
		}
	);

	it('gives the spring layout supported spacing for connected and isolated nodes', () => {
		expect(getGraphLayoutOptions('cose-bilkent')).toMatchObject({
			idealEdgeLength: 140,
			nodeRepulsion: 8000,
			edgeElasticity: 0.35,
			tilingPaddingVertical: 24,
			tilingPaddingHorizontal: 24
		});
	});

	it('falls back to the hierarchical layout for an unknown layout name', () => {
		expect(getGraphLayoutOptions('unknown')).toMatchObject({
			name: 'dagre',
			nodeDimensionsIncludeLabels: true
		});
	});
});
