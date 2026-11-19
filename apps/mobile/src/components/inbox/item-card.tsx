// apps/mobile/src/components/inbox/item-card.tsx
// Every inbox kind that isn't a cleanup list: a review item, a calendar suggestion, an agent's
// proposed change set, a project brief or audit, a Gmail reconnect. The phone answers the
// simple ones in place (Approve change / Dismiss / Snooze); a change set or a brief needs
// reading, so it opens "Talk it through" instead of approving blind.
import type { InboxItem } from '@buildos/api-client';
import { StyleSheet, Text, View } from 'react-native';

import { AlarmClock, Check, Key, MessageCircle, MicroLabel, X } from '@/components/kit';
import type { InboxController } from '@/hooks/use-inbox';
import { CARD_ACTION_LABEL, cardActions, cardBody, SOURCE_LABEL } from '@/lib/inbox/model';
import { useInk } from '@/providers/theme-provider';
import { typeScale } from '@/theme';

import { Card, NoteLine, TextKey } from './parts';

export function ItemCard({
	item,
	inbox,
	onReconnect
}: {
	item: InboxItem;
	inbox: InboxController;
	/** Gmail reconnect runs on the website (a browser sign-in). */
	onReconnect: () => void;
}) {
	const { colors } = useInk();
	const actions = cardActions(item);
	const body = cardBody(item);
	const stale = item.freshness_state === 'possibly_stale';

	return (
		<Card>
			<View style={styles.head}>
				<MicroLabel>{SOURCE_LABEL[item.source_type] ?? 'Inbox item'}</MicroLabel>
				{stale ? (
					<MicroLabel style={{ color: colors.warning }}>May be outdated</MicroLabel>
				) : null}
			</View>
			<Text maxFontSizeMultiplier={1.6} style={[styles.title, { color: colors.foreground }]}>
				{item.title || 'Review item'}
			</Text>
			{body ? (
				<Text
					maxFontSizeMultiplier={1.6}
					style={[typeScale.meta, { color: colors.mutedForeground }]}
				>
					{body}
				</Text>
			) : null}
			<NoteLine note={inbox.notes[item.id]} />
			{!item.can_decide && item.source_type !== 'integration_attention' ? (
				<Text style={[typeScale.small, { color: colors.mutedForeground }]}>
					{item.decision_disabled_reason ?? 'View only'}
				</Text>
			) : null}
			{actions.length ? (
				<View style={styles.keys}>
					{actions.includes('approve') ? (
						<Key
							title={CARD_ACTION_LABEL.approve}
							icon={Check}
							variant="primary"
							size="sm"
							haptic="success"
							onPress={() => inbox.decideCard(item, 'approve')}
						/>
					) : null}
					{actions.includes('reconnect') ? (
						<Key
							title="Reconnect on the web"
							variant="primary"
							size="sm"
							onPress={onReconnect}
						/>
					) : null}
					{actions.includes('talk') ? (
						<Key
							title={CARD_ACTION_LABEL.talk}
							icon={MessageCircle}
							variant={actions.includes('approve') ? 'outline' : 'primary'}
							size="sm"
							loading={inbox.openingChat}
							onPress={() => void inbox.talk(item)}
						/>
					) : null}
					{actions.includes('dismiss') ? (
						<Key
							title={CARD_ACTION_LABEL.dismiss}
							icon={X}
							variant="ghost"
							size="sm"
							onPress={() => inbox.decideCard(item, 'dismiss')}
						/>
					) : null}
					{actions.includes('snooze') ? (
						<TextKey
							label="Snooze"
							icon={AlarmClock}
							tone="muted"
							accessibilityLabel={`Snooze until tomorrow: ${item.title}`}
							onPress={() => inbox.decideCard(item, 'snooze')}
						/>
					) : null}
				</View>
			) : null}
		</Card>
	);
}

const styles = StyleSheet.create({
	head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	title: { fontSize: 15.5, lineHeight: 21, fontWeight: '600' },
	keys: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }
});
