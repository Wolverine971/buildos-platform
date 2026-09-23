// apps/web/src/lib/components/ontology/doc-tree/tree-images.ts
/**
 * Project images in the document tree.
 *
 * An image sits under every visible document it is linked to (onto_asset_links,
 * entity_kind 'document'). An image with no link to a visible document sits on
 * the Images shelf at the top of the tree, so an upload is never invisible.
 */

export type DocTreeImage = {
	id: string;
	caption: string | null;
	alt_text: string | null;
	original_filename: string | null;
	width: number | null;
	height: number | null;
	ocr_status: string | null;
	extraction_summary: string | null;
	created_at: string;
};

export type DocTreeImageLink = {
	asset_id: string;
	document_id: string;
};

export type GroupedTreeImages = {
	/** Images with no link to a document the tree shows. */
	shelf: DocTreeImage[];
	/** Visible document id → images filed under it, newest first. */
	byDocumentId: Map<string, DocTreeImage[]>;
};

export function treeImageTitle(image: DocTreeImage): string {
	return (
		image.caption?.trim() ||
		image.alt_text?.trim() ||
		image.original_filename?.trim() ||
		'Untitled image'
	);
}

export function treeImageThumbnailUrl(imageId: string, width: number): string {
	return `/api/onto/assets/${imageId}/render?width=${width}`;
}

/**
 * Split images between the shelf and the documents they are filed under.
 * Links to documents outside `visibleDocumentIds` (archived, deleted, or not in
 * the tree) are ignored so the image falls back to the shelf instead of vanishing.
 */
export function groupTreeImages(
	images: readonly DocTreeImage[],
	links: readonly DocTreeImageLink[],
	visibleDocumentIds: ReadonlySet<string>
): GroupedTreeImages {
	const documentIdsByImage = new Map<string, string[]>();
	for (const link of links) {
		if (!visibleDocumentIds.has(link.document_id)) continue;
		const documentIds = documentIdsByImage.get(link.asset_id) ?? [];
		if (!documentIds.includes(link.document_id)) documentIds.push(link.document_id);
		documentIdsByImage.set(link.asset_id, documentIds);
	}

	const shelf: DocTreeImage[] = [];
	const byDocumentId = new Map<string, DocTreeImage[]>();
	for (const image of images) {
		const documentIds = documentIdsByImage.get(image.id);
		if (!documentIds || documentIds.length === 0) {
			shelf.push(image);
			continue;
		}
		for (const documentId of documentIds) {
			const filed = byDocumentId.get(documentId) ?? [];
			filed.push(image);
			byDocumentId.set(documentId, filed);
		}
	}

	return { shelf, byDocumentId };
}

/**
 * Image ids in the order the tree shows them — shelf first, then each document's
 * images in tree order — so the viewer's arrows walk the tree top to bottom. An
 * image filed under several documents appears once, at its first spot.
 */
export function treeImageViewerOrder(
	grouped: GroupedTreeImages,
	documentIdsInTreeOrder: readonly string[]
): string[] {
	const ordered: string[] = [];
	const seen = new Set<string>();
	const add = (images: readonly DocTreeImage[] | undefined) => {
		for (const image of images ?? []) {
			if (seen.has(image.id)) continue;
			seen.add(image.id);
			ordered.push(image.id);
		}
	};
	add(grouped.shelf);
	for (const documentId of documentIdsInTreeOrder) {
		add(grouped.byDocumentId.get(documentId));
	}
	return ordered;
}
