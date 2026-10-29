// apps/mobile/src/components/button.tsx
import { ActivityIndicator, Pressable, type PressableProps, StyleSheet } from 'react-native';

import { AppText } from '@/components/text';
import { useTheme } from '@/providers/theme-provider';
import { radius, spacing } from '@/theme';

type Props = Omit<PressableProps, 'children'> & {
	title: string;
	variant?: 'accent' | 'ghost';
	loading?: boolean;
};

/** A key that presses down: the web's tx-button lip, approximated with a 2px drop. */
export function Button({ title, variant = 'accent', loading, disabled, style, ...props }: Props) {
	const colors = useTheme();
	const accent = variant === 'accent';
	const inactive = Boolean(disabled || loading);
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
			disabled={inactive}
			{...props}
			style={(state) => [
				styles.base,
				{
					backgroundColor: accent ? colors.accent : 'transparent',
					borderColor: accent ? colors.accent : colors.borderStrong,
					opacity: inactive ? 0.6 : 1,
					transform: [{ translateY: state.pressed ? 2 : 0 }]
				},
				typeof style === 'function' ? style(state) : style
			]}
		>
			{loading ? (
				<ActivityIndicator color={accent ? colors.accentForeground : colors.accent} />
			) : (
				<AppText
					variant="heading"
					style={{ color: accent ? colors.accentForeground : colors.foreground }}
				>
					{title}
				</AppText>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	base: {
		minHeight: 48,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		borderRadius: radius.md,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center'
	}
});
