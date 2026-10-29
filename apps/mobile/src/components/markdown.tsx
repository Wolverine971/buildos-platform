// apps/mobile/src/components/markdown.tsx
import { useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, Text, type TextStyle, View } from 'react-native';

import { Check } from '@/components/kit';
import { type Block, type Inline, parseMarkdown } from '@/lib/markdown';
import { useTheme } from '@/providers/theme-provider';
import { fontFamily, radius, spacing, typeScale, withAlpha } from '@/theme';

// The reader's prose: body 15.5/1.55, headings 20 / 17 / 15.5 (the web's 650 is 600 here).
const BODY: TextStyle = typeScale.body;

const HEADING: Record<number, TextStyle> = {
	1: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.3 },
	2: { fontSize: 17, lineHeight: 23, fontWeight: '600', letterSpacing: -0.2 },
	3: { fontSize: 15.5, lineHeight: 22, fontWeight: '600' }
};

const MONO = fontFamily.mono;

function openLink(href: string) {
	if (!/^(https?:|mailto:|tel:)/i.test(href)) return;
	void Linking.openURL(href).catch(() => {});
}

/** A doc or task description, rendered natively with Inkprint type. Text is selectable. */
export function Markdown({
	source,
	compact = false
}: {
	source: string | null | undefined;
	compact?: boolean;
}) {
	const blocks = useMemo(() => parseMarkdown(source), [source]);
	return <Blocks blocks={blocks} gap={compact ? spacing.sm : spacing.md} />;
}

function Blocks({ blocks, gap }: { blocks: Block[]; gap: number }) {
	return (
		<View style={{ gap }}>
			{blocks.map((block, index) => (
				<BlockView key={index} block={block} first={index === 0} />
			))}
		</View>
	);
}

function BlockView({ block, first }: { block: Block; first: boolean }) {
	const colors = useTheme();
	switch (block.kind) {
		case 'heading':
			return (
				<Text
					selectable
					accessibilityRole="header"
					maxFontSizeMultiplier={1.5}
					style={[
						HEADING[Math.min(block.depth, 3)],
						{ color: colors.foreground, marginTop: first ? 0 : spacing.xs }
					]}
				>
					<Spans inline={block.inline} />
				</Text>
			);
		case 'paragraph':
			return (
				<Text selectable style={[BODY, { color: colors.foreground }]}>
					<Spans inline={block.inline} />
				</Text>
			);
		case 'list':
			return (
				<View style={styles.list}>
					{block.items.map((item, index) => (
						<View key={index} style={styles.item}>
							{item.checked === null ? (
								<Text
									style={[
										BODY,
										styles.marker,
										block.ordered ? styles.number : null,
										{ color: colors.mutedForeground }
									]}
								>
									{block.ordered ? `${block.start + index}.` : '•'}
								</Text>
							) : (
								<View
									accessible
									accessibilityRole="checkbox"
									accessibilityState={{ checked: item.checked }}
									style={[
										styles.box,
										item.checked
											? { backgroundColor: colors.accent, borderColor: colors.accent }
											: { borderColor: colors.borderStrong }
									]}
								>
									{item.checked ? (
										<Check size={11} color={colors.accentForeground} strokeWidth={3} />
									) : null}
								</View>
							)}
							<View style={[styles.itemBody, { opacity: item.checked ? 0.6 : 1 }]}>
								<Blocks blocks={item.blocks} gap={spacing.xs} />
							</View>
						</View>
					))}
				</View>
			);
		case 'quote':
			return (
				<View style={[styles.quote, { borderLeftColor: colors.accent }]}>
					<Blocks blocks={block.blocks} gap={spacing.sm} />
				</View>
			);
		case 'code':
			return (
				<ScrollView
					horizontal
					style={[styles.codeBlock, { backgroundColor: colors.muted }]}
					contentContainerStyle={styles.codeContent}
				>
					<Text selectable style={[styles.codeText, { color: colors.foreground }]}>
						{block.text}
					</Text>
				</ScrollView>
			);
		case 'rule':
			return <View style={[styles.rule, { backgroundColor: colors.border }]} />;
		case 'table':
			return (
				<ScrollView horizontal style={[styles.table, { borderColor: colors.border }]}>
					<View>
						{[block.header, ...block.rows].map((row, rowIndex) => (
							<View
								key={rowIndex}
								style={[
									styles.tableRow,
									{
										borderTopWidth: rowIndex ? StyleSheet.hairlineWidth : 0,
										borderTopColor: colors.border,
										backgroundColor: rowIndex ? undefined : colors.card
									}
								]}
							>
								{row.map((cell, cellIndex) => (
									<Text
										key={cellIndex}
										selectable
										style={[
											styles.cell,
											{
												color: colors.foreground,
												fontWeight: rowIndex ? '400' : '600'
											}
										]}
									>
										<Spans inline={cell} />
									</Text>
								))}
							</View>
						))}
					</View>
				</ScrollView>
			);
	}
}

function Spans({ inline }: { inline: Inline[] }) {
	const colors = useTheme();
	return (
		<>
			{inline.map((node, index) => {
				switch (node.kind) {
					case 'text':
						return node.text;
					case 'break':
						return '\n';
					case 'code':
						// Nested text cannot round its background; blocks get the 6pt radius.
						return (
							<Text
								key={index}
								style={[
									styles.inlineCode,
									{ backgroundColor: colors.muted, color: colors.foreground }
								]}
							>
								{node.text}
							</Text>
						);
					case 'strong':
						return (
							<Text key={index} style={styles.strong}>
								<Spans inline={node.children} />
							</Text>
						);
					case 'em':
						return (
							<Text key={index} style={styles.em}>
								<Spans inline={node.children} />
							</Text>
						);
					case 'del':
						return (
							<Text key={index} style={styles.del}>
								<Spans inline={node.children} />
							</Text>
						);
					case 'link':
						return (
							<Text
								key={index}
								accessibilityRole="link"
								onPress={() => openLink(node.href)}
								style={{
									color: colors.accent,
									textDecorationLine: 'underline',
									textDecorationColor: withAlpha(colors.accent, 0.45)
								}}
							>
								<Spans inline={node.children} />
							</Text>
						);
				}
			})}
		</>
	);
}

const styles = StyleSheet.create({
	list: { gap: spacing.xs },
	item: { flexDirection: 'row', gap: spacing.sm },
	marker: { minWidth: 14 },
	number: { minWidth: 22, fontVariant: ['tabular-nums'] },
	// Centered on the first 24pt line.
	box: {
		width: 16,
		height: 16,
		marginTop: 4,
		marginRight: 2,
		borderRadius: 4,
		borderWidth: 1.5,
		alignItems: 'center',
		justifyContent: 'center'
	},
	itemBody: { flex: 1, minWidth: 0 },
	quote: { borderLeftWidth: 2, paddingLeft: spacing.md },
	codeBlock: { borderRadius: radius.xs },
	codeContent: { padding: spacing.md },
	codeText: { fontFamily: MONO, fontSize: 13, lineHeight: 19 },
	rule: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
	table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xs },
	tableRow: { flexDirection: 'row' },
	cell: { width: 150, padding: spacing.sm, fontSize: 14, lineHeight: 20 },
	inlineCode: { fontFamily: MONO, fontSize: 13.5 },
	strong: { fontWeight: '700' },
	em: { fontStyle: 'italic' },
	del: { textDecorationLine: 'line-through' }
});
