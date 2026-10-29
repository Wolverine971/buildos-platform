// apps/mobile/src/components/markdown.tsx
import { useMemo } from 'react';
import { Linking, ScrollView, Text, type TextStyle, View } from 'react-native';

import { type Block, type Inline, parseMarkdown } from '@/lib/markdown';
import { useTheme } from '@/providers/theme-provider';
import { fontFamily, radius, spacing } from '@/theme';

const HEADING: Record<number, TextStyle> = {
	1: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
	2: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
	3: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
	4: { fontSize: 16, lineHeight: 22, fontWeight: '600' }
};

const BODY: TextStyle = { fontSize: 16, lineHeight: 24 };

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
				<BlockView key={index} block={block} />
			))}
		</View>
	);
}

function BlockView({ block }: { block: Block }) {
	const colors = useTheme();
	switch (block.kind) {
		case 'heading':
			return (
				<Text
					selectable
					accessibilityRole="header"
					style={[
						{ color: colors.foreground, marginTop: spacing.xs },
						HEADING[Math.min(block.depth, 4)]
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
				<View style={{ gap: spacing.xs }}>
					{block.items.map((item, index) => (
						<View key={index} style={{ flexDirection: 'row', gap: spacing.sm }}>
							<Text
								style={[
									BODY,
									{
										minWidth: block.ordered ? 22 : 14,
										color:
											item.checked === null
												? colors.mutedForeground
												: colors.accent,
										fontVariant: ['tabular-nums']
									}
								]}
							>
								{item.checked === true
									? '☑'
									: item.checked === false
										? '☐'
										: block.ordered
											? `${block.start + index}.`
											: '•'}
							</Text>
							<View style={{ flex: 1, minWidth: 0, opacity: item.checked ? 0.6 : 1 }}>
								<Blocks blocks={item.blocks} gap={spacing.xs} />
							</View>
						</View>
					))}
				</View>
			);
		case 'quote':
			return (
				<View
					style={{
						borderLeftWidth: 3,
						borderLeftColor: colors.borderStrong,
						paddingLeft: spacing.md
					}}
				>
					<Blocks blocks={block.blocks} gap={spacing.sm} />
				</View>
			);
		case 'code':
			return (
				<ScrollView
					horizontal
					style={{ borderRadius: radius.sm, backgroundColor: colors.muted }}
					contentContainerStyle={{ padding: spacing.md }}
				>
					<Text
						selectable
						style={{
							fontFamily: fontFamily.mono,
							fontSize: 13,
							lineHeight: 19,
							color: colors.foreground
						}}
					>
						{block.text}
					</Text>
				</ScrollView>
			);
		case 'rule':
			return (
				<View
					style={{
						height: 1,
						backgroundColor: colors.border,
						marginVertical: spacing.xs
					}}
				/>
			);
		case 'table':
			return (
				<ScrollView
					horizontal
					style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm }}
				>
					<View>
						{[block.header, ...block.rows].map((row, rowIndex) => (
							<View
								key={rowIndex}
								style={{
									flexDirection: 'row',
									borderTopWidth: rowIndex ? 1 : 0,
									borderTopColor: colors.border,
									backgroundColor: rowIndex ? undefined : colors.card
								}}
							>
								{row.map((cell, cellIndex) => (
									<Text
										key={cellIndex}
										selectable
										style={{
											width: 150,
											padding: spacing.sm,
											fontSize: 14,
											lineHeight: 20,
											color: colors.foreground,
											fontWeight: rowIndex ? '400' : '600'
										}}
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
						return (
							<Text
								key={index}
								style={{
									fontFamily: fontFamily.mono,
									fontSize: 14,
									backgroundColor: colors.muted
								}}
							>
								{node.text}
							</Text>
						);
					case 'strong':
						return (
							<Text key={index} style={{ fontWeight: '700' }}>
								<Spans inline={node.children} />
							</Text>
						);
					case 'em':
						return (
							<Text key={index} style={{ fontStyle: 'italic' }}>
								<Spans inline={node.children} />
							</Text>
						);
					case 'del':
						return (
							<Text key={index} style={{ textDecorationLine: 'line-through' }}>
								<Spans inline={node.children} />
							</Text>
						);
					case 'link':
						return (
							<Text
								key={index}
								accessibilityRole="link"
								onPress={() => openLink(node.href)}
								style={{ color: colors.accent, textDecorationLine: 'underline' }}
							>
								<Spans inline={node.children} />
							</Text>
						);
				}
			})}
		</>
	);
}
