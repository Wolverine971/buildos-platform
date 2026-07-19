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

	it('keeps the flow layout compact across disconnected groups', () => {
		expect(getGraphLayoutOptions('cola')).toMatchObject({
			avoidOverlap: true,
			handleDisconnected: true,
			nodeSpacing: 32,
			flow: { axis: 'y', minSeparation: 72 }
		});
	});

	it('falls back to the hierarchical layout for an unknown layout name', () => {
		expect(getGraphLayoutOptions('unknown')).toMatchObject({
			name: 'dagre',
			nodeDimensionsIncludeLabels: true
		});
	});

	it('turns layout animation off for reduced-motion users', () => {
		expect(getGraphLayoutOptions('cose-bilkent', true)).toMatchObject({
			animate: false,
			animationDuration: 0
		});
		expect(getGraphLayoutOptions('dagre', true)).toMatchObject({
			animate: false,
			animationDuration: 0
		});
	});
});
