// apps/mobile/src/components/screen.tsx
import type { PropsWithChildren } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

import { useTheme } from '@/providers/theme-provider';
import { spacing } from '@/theme';

/** The sheet: a page lying on the bench, with safe-area aware insets handled by the Stack. */
export function Screen({
	children,
	contentContainerStyle,
	...props
}: PropsWithChildren<ScrollViewProps>) {
	const colors = useTheme();
	return (
		<ScrollView
			contentInsetAdjustmentBehavior="automatic"
			keyboardShouldPersistTaps="handled"
			style={{ backgroundColor: colors.background }}
			contentContainerStyle={[
				{ padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
				contentContainerStyle
			]}
			{...props}
		>
			{children}
		</ScrollView>
	);
}
