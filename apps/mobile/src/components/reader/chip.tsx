// apps/mobile/src/components/reader/chip.tsx
import { Pressable, type PressableProps } from 'react-native';

import { AppText } from '@/components/text';
import { useTheme } from '@/providers/theme-provider';
import { spacing } from '@/theme';

type Props = Omit<PressableProps, 'children' | 'style'> & { label: string; selected?: boolean };

/** A small pill for quick picks: task state, due date. */
export function Chip({ label, selected = false, disabled, ...props }: Props) {
	const colors = useTheme();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ selected, disabled: Boolean(disabled) }}
			disabled={disabled}
			hitSlop={4}
			{...props}
			style={({ pressed }) => ({
				minHeight: 34,
				paddingHorizontal: spacing.md,
				borderRadius: 17,
				borderWidth: 1,
				justifyContent: 'center',
				borderColor: selected ? colors.accent : colors.border,
				backgroundColor: selected ? colors.accent : pressed ? colors.muted : colors.card,
				opacity: disabled ? 0.5 : 1
			})}
		>
			<AppText
				style={{
					fontSize: 14,
					fontWeight: '600',
					color: selected ? colors.accentForeground : colors.foreground
				}}
			>
				{label}
			</AppText>
		</Pressable>
	);
}
