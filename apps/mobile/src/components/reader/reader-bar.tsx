// apps/mobile/src/components/reader/reader-bar.tsx
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import type { WalkPosition } from '@/lib/reader-walk';
import { useTheme } from '@/providers/theme-provider';
import { spacing } from '@/theme';

/** The reader's bottom bar: Prev, the one action that matters here, Next. */
export function ReaderBar({
	position,
	onPrev,
	onNext,
	children
}: {
	position: WalkPosition | null;
	onPrev: () => void;
	onNext: () => void;
	children: ReactNode;
}) {
	const colors = useTheme();
	const insets = useSafeAreaInsets();
	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: spacing.md,
				paddingHorizontal: spacing.lg,
				paddingTop: spacing.sm,
				paddingBottom: Math.max(insets.bottom, spacing.sm),
				borderTopWidth: 1,
				borderTopColor: colors.border,
				backgroundColor: colors.bench
			}}
		>
			<IconButton
				symbol="chevron.left"
				fallback="‹"
				label="Previous"
				variant="ghost"
				disabled={!position?.prev}
				onPress={onPrev}
			/>
			<View style={{ flex: 1 }}>{children}</View>
			<IconButton
				symbol="chevron.right"
				fallback="›"
				label="Next"
				variant="ghost"
				disabled={!position?.next}
				onPress={onNext}
			/>
		</View>
	);
}
