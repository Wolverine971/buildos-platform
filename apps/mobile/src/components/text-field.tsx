// apps/mobile/src/components/text-field.tsx
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { AppText } from '@/components/text';
import { useTheme } from '@/providers/theme-provider';
import { radius, spacing } from '@/theme';

/** A writable surface: the web's tx-grid field, with a strong border for the control edge. */
export function TextField({ label, style, ...props }: TextInputProps & { label: string }) {
	const colors = useTheme();
	return (
		<View style={styles.wrap}>
			<AppText variant="label">{label}</AppText>
			<TextInput
				accessibilityLabel={label}
				placeholderTextColor={colors.mutedForeground}
				{...props}
				style={[
					styles.input,
					{
						color: colors.foreground,
						backgroundColor: colors.card,
						borderColor: colors.borderStrong
					},
					style
				]}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { gap: spacing.xs },
	input: {
		minHeight: 48,
		paddingHorizontal: spacing.md,
		borderWidth: 1,
		borderRadius: radius.md,
		fontSize: 16
	}
});
