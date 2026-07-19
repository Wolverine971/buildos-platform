// apps/web/src/lib/components/ontology/graph/lib/graph.layout.ts
import type cytoscape from 'cytoscape';

export type GraphLayoutName = 'dagre' | 'cola' | 'cose-bilkent' | 'circle';

const FIT_PADDING = 50;

/**
 * Keep the layout engine's collision model aligned with what users actually see.
 *
 * Most ontology nodes are intentionally small stamps with wider, multi-line labels.
 * Including labels in node dimensions prevents those labels from collapsing into one
 * another even when the node shapes themselves do not overlap.
 */
export function getGraphLayoutOptions(layoutName: string): cytoscape.LayoutOptions {
	const defaultLayout = {
		name: 'dagre',
		rankDir: 'TB',
		nodeSep: 48,
		edgeSep: 24,
		rankSep: 104,
		nodeDimensionsIncludeLabels: true,
		padding: FIT_PADDING,
		animate: true,
		animationDuration: 400
	} as cytoscape.LayoutOptions;

	const layouts: Record<GraphLayoutName, cytoscape.LayoutOptions> = {
		dagre: defaultLayout,
		cola: {
			name: 'cola',
			animate: true,
			fit: true,
			padding: FIT_PADDING,
			nodeDimensionsIncludeLabels: true,
			avoidOverlap: true,
			handleDisconnected: true,
			nodeSpacing: 32,
			flow: { axis: 'y', minSeparation: 72 }
		} as cytoscape.LayoutOptions,
		'cose-bilkent': {
			name: 'cose-bilkent',
			quality: 'default',
			nodeDimensionsIncludeLabels: true,
			fit: true,
			padding: FIT_PADDING,
			randomize: true,
			animate: 'end',
			animationDuration: 450,
			idealEdgeLength: 140,
			edgeElasticity: 0.35,
			nodeRepulsion: 8000,
			gravity: 0.2,
			tile: true,
			tilingPaddingVertical: 24,
			tilingPaddingHorizontal: 24
		} as cytoscape.LayoutOptions,
		circle: {
			name: 'circle',
			nodeDimensionsIncludeLabels: true,
			padding: FIT_PADDING,
			animate: true
		} as cytoscape.LayoutOptions
	};

	return layouts[layoutName as GraphLayoutName] ?? defaultLayout;
}
