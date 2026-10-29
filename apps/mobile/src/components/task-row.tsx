// apps/mobile/src/components/task-row.tsx
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/text';
import { useTheme } from '@/providers/theme-provider';
import { radius, spacing } from '@/theme';

/**
 * A task in a list. The whole row opens the reader (no separate done circle, as on the
 * website's phone layout); a finished task stays on the list, struck through, until it refreshes.
 */
export function TaskRow({
	title,
	meta,
	done,
	onPress
}: {
	title: string;
	meta?: string | null;
	done?: boolean;
	onPress: () => void;
}) {
	const colors = useTheme();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${title}${done ? ', done' : ''}${meta ? `, ${meta}` : ''}`}
			onPress={onPress}
			style={({ pressed }) => ({
				padding: spacing.md,
				gap: 2,
				borderRadius: radius.md,
				borderWidth: 1,
				borderColor: colors.border,
				backgroundColor: pressed ? colors.muted : colors.card
			})}
		>
			<View style={{ flexDirection: 'row', gap: spacing.sm }}>
				{done ? (
					<AppText style={{ color: colors.success, fontWeight: '700' }}>✓</AppText>
				) : null}
				<AppText
					style={{
						flex: 1,
						textDecorationLine: done ? 'line-through' : 'none',
						color: done ? colors.mutedForeground : colors.foreground
					}}
					numberOfLines={3}
				>
					{title}
				</AppText>
			</View>
			{meta ? <AppText variant="muted">{meta}</AppText> : null}
		</Pressable>
	);
}
