// apps/mobile/src/components/icon-button.tsx
import { type SFSymbol, SymbolView } from 'expo-symbols';
import { Pressable, type PressableProps } from 'react-native';

import { AppText } from '@/components/text';
import { useTheme } from '@/providers/theme-provider';

type Props = Omit<PressableProps, 'children' | 'style'> & {
	/** SF Symbol on iOS. */
	symbol: SFSymbol;
	/** Shown where SF Symbols are unavailable (Android, web). */
	fallback: string;
	/** Read by VoiceOver. */
	label: string;
	variant?: 'accent' | 'ghost' | 'danger';
	size?: number;
};

/** A round key for the capture bar: mic, send, stop, cancel. */
export function IconButton({
	symbol,
	fallback,
	label,
	variant = 'accent',
	size = 44,
	disabled,
	...props
}: Props) {
	const colors = useTheme();
	const fill =
		variant === 'accent'
			? colors.accent
			: variant === 'danger'
				? colors.destructive
				: 'transparent';
	const ink = variant === 'ghost' ? colors.foreground : colors.accentForeground;
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: Boolean(disabled) }}
			disabled={disabled}
			hitSlop={6}
			{...props}
			style={({ pressed }) => ({
				width: size,
				height: size,
				borderRadius: size / 2,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: fill,
				borderWidth: 1,
				borderColor: variant === 'ghost' ? colors.borderStrong : fill,
				opacity: disabled ? 0.5 : 1,
				transform: [{ scale: pressed ? 0.94 : 1 }]
			})}
		>
			<SymbolView
				name={symbol}
				size={size * 0.42}
				tintColor={ink}
				weight="semibold"
				fallback={<AppText style={{ color: ink, fontWeight: '700' }}>{fallback}</AppText>}
			/>
		</Pressable>
	);
}
