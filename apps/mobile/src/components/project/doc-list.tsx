// apps/mobile/src/components/project/doc-list.tsx
// The project's docs in the website's tree order, indented by depth, with the START HERE doc
// (what BuildOS remembers about the project) pinned first.
import { StyleSheet, Text, View } from 'react-native';

import { BookOpen, FileText, MicroLabel, Stamp } from '@/components/kit';
import type { DocEntry, DocLike } from '@/lib/doc-order';
import { useInk } from '@/providers/theme-provider';
import { withAlpha } from '@/theme';

import { editedLabel } from './format';
import { Glyph, ListRow } from './rows';

/** Points of indent per tree level, and the deepest level drawn. */
const INDENT = 12;
const MAX_DEPTH = 5;

export type DocListProps = {
	docs: readonly DocEntry<DocLike>[];
	/** The START HERE doc's id, shown first. */
	contextId: string | null;
	onOpen: (documentId: string) => void;
	now: Date;
};

export function DocList({ docs, contextId, onOpen, now }: DocListProps) {
	const { colors } = useInk();

	if (docs.length === 0) {
		return (
			<Text
				maxFontSizeMultiplier={1.4}
				style={[styles.empty, { color: colors.mutedForeground }]}
			>
				No docs yet.
			</Text>
		);
	}

	return (
		<View style={styles.list}>
			{docs.map(({ doc, depth }) => {
				const startHere = doc.id === contextId;
				const title = doc.title?.trim() || 'Untitled';
				const edited = editedLabel(doc.updated_at, now);
				return (
					<ListRow
						key={doc.id}
						indent={Math.min(depth, MAX_DEPTH) * INDENT}
						glyph={
							startHere ? (
								<Glyph
									icon={BookOpen}
									color={colors.accent}
									background={withAlpha(colors.accent, 0.12)}
								/>
							) : (
								<Glyph icon={FileText} />
							)
						}
						title={title}
						meta={
							startHere || edited ? (
								<View style={styles.meta}>
									{startHere ? (
										<MicroLabel tone="accent">Start here</MicroLabel>
									) : null}
									{edited ? <Stamp size={11.5}>{edited}</Stamp> : null}
								</View>
							) : null
						}
						onPress={() => onOpen(doc.id)}
						accessibilityLabel={[title, startHere ? 'start here' : '', edited]
							.filter(Boolean)
							.join(', ')}
						accessibilityHint="Opens the doc"
					/>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	list: { paddingTop: 8 },
	meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	empty: { fontSize: 13, lineHeight: 18, paddingVertical: 16 }
});
