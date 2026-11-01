// apps/mobile/src/components/chat/pending-change-strip.tsx
// "Didn't finish from earlier": a write that failed left a commission on the session. The
// strip sits on the composer, like the website's; Finish it sends the canned message that
// runs a normal turn, Dismiss clears this exact commission (never a newer one).
import { StyleSheet, Text, View } from 'react-native';

import type { ChatPendingChange } from '@buildos/api-client';

import { CircleAlert, Key } from '@/components/kit';
import { useInk } from '@/providers/theme-provider';
import { radius, typeScale, withAlpha } from '@/theme';

export function PendingChangeStrip({
	view,
	busy,
	disabled,
	onFinish,
	onDismiss
}: {
	view: ChatPendingChange;
	busy: 'finish' | 'dismiss' | null;
	/** A reply is running: both choices wait for it. */
	disabled: boolean;
	onFinish: () => void;
	onDismiss: () => void;
}) {
	const { colors } = useInk();
	return (
		<View
			accessibilityRole="summary"
			accessibilityLabel="Changes that didn't finish"
			style={[
				styles.strip,
				{
					backgroundColor: withAlpha(colors.warning, 0.1),
					borderColor: withAlpha(colors.warning, 0.5)
				}
			]}
		>
			<View style={styles.head}>
				<CircleAlert size={15} color={colors.foreground} strokeWidth={2.2} />
				<Text
					maxFontSizeMultiplier={1.4}
					style={[typeScale.section, { color: colors.foreground }]}
				>
					Didn't finish from earlier
				</Text>
			</View>
			{view.items.map((item, index) => (
				<Text
					key={`${index}:${item}`}
					maxFontSizeMultiplier={1.4}
					style={[typeScale.meta, { color: colors.foreground }]}
				>
					{'· '}
					{item}
				</Text>
			))}
			<View style={styles.keys}>
				<Key
					title="Finish it"
					size="xs"
					variant="primary"
					disabled={disabled || busy !== null}
					loading={busy === 'finish'}
					onPress={onFinish}
				/>
				<Key
					title="Dismiss"
					size="xs"
					variant="ghost"
					disabled={disabled || busy !== null}
					loading={busy === 'dismiss'}
					haptic="selection"
					onPress={onDismiss}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	strip: {
		borderWidth: 1,
		borderRadius: radius.md,
		paddingHorizontal: 12,
		paddingVertical: 10,
		gap: 4,
		marginHorizontal: 2,
		marginBottom: 2
	},
	head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
	keys: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }
});
