// apps/mobile/src/components/chat/proposal-card.tsx
// A proposal card in the chat: the agent wants to nest, combine, file or start something and
// waits for a tap. Mirrors the website's ProposalCard at phone size: title, a few lines, one
// main key and Not now; once answered, the outcome and (for applied) Undo.
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Check, Key, Undo2 } from '@/components/kit';
import {
	proposalLines,
	proposalMainLabel,
	proposalState,
	proposalStateLabel,
	proposalTitle
} from '@/lib/chat/proposals';
import type { CardRow } from '@/lib/chat/session-store';
import { useInk } from '@/providers/theme-provider';
import { radius, typeScale, withAlpha } from '@/theme';

import { useChatActions } from './chat-actions';

/** Re-evaluates the expiry once a minute, so a card left open closes itself on time. */
function useMinute() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

export const ProposalCardRow = memo(function ProposalCardRow({ row }: { row: CardRow }) {
	const ink = useInk();
	const { colors } = ink;
	const actions = useChatActions();
	const now = useMinute();
	const { card } = row;
	const state = proposalState(card, now);
	const title = proposalTitle(card);
	const lines = proposalLines(card);
	const mainLabel = proposalMainLabel(card);
	const locked = row.busy !== null || actions.turnActive;
	const stateLabel = proposalStateLabel(state);
	const canUndo = state === 'applied' && card.kind !== 'project_combine';

	return (
		<View
			accessibilityRole="summary"
			accessibilityLabel={`Proposal: ${title}`}
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
					borderColor:
						state === 'pending' ? withAlpha(colors.accent, 0.55) : colors.border,
					boxShadow: ink.shadows.ink
				}
			]}
		>
			<Text
				maxFontSizeMultiplier={1.3}
				style={[typeScale.microLabel, { color: colors.accent }]}
			>
				Proposal
			</Text>
			<Text
				maxFontSizeMultiplier={1.4}
				style={[typeScale.section, { color: colors.foreground }]}
			>
				{title}
			</Text>
			{lines.map((line, index) => (
				<Text
					key={`${index}:${line}`}
					maxFontSizeMultiplier={1.4}
					style={[typeScale.meta, { color: colors.mutedForeground }]}
				>
					{line}
				</Text>
			))}
			{state === 'pending' ? (
				<>
					<View style={styles.keys}>
						{mainLabel ? (
							<Key
								title={mainLabel}
								size="sm"
								variant="primary"
								disabled={locked}
								loading={row.busy === 'apply'}
								onPress={() => void actions.chooseProposal(card.card_id, 'apply')}
							/>
						) : (
							<Key
								title="Review on the web"
								size="sm"
								variant="outline"
								disabled={row.busy !== null}
								onPress={() =>
									actions.openOnWeb(
										`/projects/${encodeURIComponent(String(card.payload.destination && typeof card.payload.destination === 'object' ? ((card.payload.destination as { id?: string }).id ?? '') : ''))}`
									)
								}
							/>
						)}
						<Key
							title="Not now"
							size="sm"
							variant="ghost"
							disabled={locked}
							loading={row.busy === 'cancel'}
							haptic="selection"
							onPress={() => void actions.chooseProposal(card.card_id, 'cancel')}
						/>
					</View>
					{actions.turnActive ? (
						<Text
							maxFontSizeMultiplier={1.4}
							style={[typeScale.small, { color: colors.mutedForeground }]}
						>
							You can choose when the reply finishes.
						</Text>
					) : null}
				</>
			) : (
				<View style={styles.outcome}>
					{state === 'applied' || state === 'undone' ? (
						<Check size={14} color={colors.mutedForeground} strokeWidth={2.4} />
					) : null}
					<Text
						maxFontSizeMultiplier={1.4}
						style={[
							typeScale.meta,
							styles.outcomeText,
							{ color: colors.mutedForeground }
						]}
					>
						{row.note ?? stateLabel}
					</Text>
					{canUndo ? (
						<Key
							title="Undo"
							icon={Undo2}
							size="xs"
							variant="outline"
							disabled={row.busy !== null}
							loading={row.busy === 'undo'}
							onPress={() => void actions.undoProposal(card.card_id)}
						/>
					) : null}
				</View>
			)}
		</View>
	);
});

const styles = StyleSheet.create({
	card: {
		borderWidth: 1,
		borderRadius: radius.md,
		paddingHorizontal: 14,
		paddingVertical: 12,
		gap: 5
	},
	keys: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
	outcome: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
	outcomeText: { flex: 1 }
});
