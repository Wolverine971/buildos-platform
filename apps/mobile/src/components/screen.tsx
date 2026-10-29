// apps/mobile/src/components/screen.tsx
// The page frame: a header on the bench (the screen's NavBar), then the sheet holding a scroll
// view with the bolt's pull to refresh, and an optional footer docked at the bottom of the sheet.
import { useScrollToTop } from 'expo-router';
import { type ReactNode, type RefObject, useCallback, useRef, useState } from 'react';
import {
	ScrollView,
	type ScrollViewInstance,
	type ScrollViewProps,
	StyleSheet,
	View
} from 'react-native';

import { BoltScrollView, type BoltScrollViewProps, Sheet } from '@/components/kit';
import { useInk } from '@/providers/theme-provider';

/** Content padding and the gap between top-level blocks. */
export const SCREEN_PADDING = 14;

export type ScreenProps = Omit<BoltScrollViewProps, 'containerStyle'> & {
	/** Top of the screen, usually a NavBar. It paints the status-bar area itself. */
	header?: ReactNode;
	/** Docked at the bottom of the sheet over the content (the capture box). It paints itself. */
	footer?: ReactNode;
	/**
	 * @deprecated Pass `refreshing` and `onRefresh` for the bolt. A RefreshControl is still
	 * passed through (plain ScrollView) so older screens compile.
	 */
	refreshControl?: ScrollViewProps['refreshControl'];
};

/**
 * One screen: `header` on top, then the sheet with the scrolling content. Pull to refresh is
 * on when `onRefresh` is given. With a `footer`, content gets bottom padding to clear it (this
 * replaces any paddingBottom you pass). With a header, tapping the current tab scrolls to top.
 */
export function Screen({
	header,
	footer,
	refreshing,
	onRefresh,
	refreshControl,
	boltSize,
	ref,
	children,
	contentContainerStyle,
	scrollIndicatorInsets,
	// Without our header (sign-in, launch) let iOS keep content clear of the status bar.
	contentInsetAdjustmentBehavior = header ? 'never' : 'automatic',
	keyboardShouldPersistTaps = 'handled',
	...scrollProps
}: ScreenProps) {
	const { colors } = useInk();
	const [footerHeight, setFooterHeight] = useState(0);
	const scrollRef = useRef<ScrollViewInstance | null>(null);

	const setScrollRef = useCallback(
		(node: ScrollViewInstance | null) => {
			scrollRef.current = node;
			if (typeof ref === 'function') ref(node);
			else if (ref) ref.current = node;
		},
		[ref]
	);

	const shared: Omit<ScrollViewProps, 'refreshControl'> = {
		...scrollProps,
		keyboardShouldPersistTaps,
		contentInsetAdjustmentBehavior,
		scrollIndicatorInsets: footer
			? { ...scrollIndicatorInsets, bottom: (scrollIndicatorInsets?.bottom ?? 0) + footerHeight }
			: scrollIndicatorInsets,
		contentContainerStyle: [
			styles.content,
			contentContainerStyle,
			footer ? { paddingBottom: SCREEN_PADDING + footerHeight } : null
		],
		children
	};

	const scroll =
		refreshControl && !onRefresh ? (
			<ScrollView {...shared} ref={setScrollRef} refreshControl={refreshControl} />
		) : (
			<BoltScrollView
				{...shared}
				ref={setScrollRef}
				refreshing={refreshing}
				onRefresh={onRefresh}
				boltSize={boltSize}
			/>
		);

	// The footer paints itself (CaptureBar draws its own background and the fade above it).
	const dock = footer ? (
		<View
			onLayout={(event) => setFooterHeight(Math.round(event.nativeEvent.layout.height))}
			style={styles.footer}
		>
			{footer}
		</View>
	) : null;

	return (
		<View style={[styles.root, { backgroundColor: header ? colors.bench : colors.background }]}>
			{header}
			{header ? (
				<Sheet style={styles.body}>
					{scroll}
					{dock}
				</Sheet>
			) : (
				<View style={[styles.body, { backgroundColor: colors.background }]}>
					{scroll}
					{dock}
				</View>
			)}
			{header ? <ScrollToTopOnTabPress target={scrollRef} /> : null}
		</View>
	);
}

/** Re-tapping the focused tab scrolls this screen to the top (needs a navigator, hence header-only). */
function ScrollToTopOnTabPress({ target }: { target: RefObject<ScrollViewInstance | null> }) {
	useScrollToTop(target);
	return null;
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	body: { flex: 1 },
	content: { padding: SCREEN_PADDING, gap: SCREEN_PADDING, flexGrow: 1 },
	footer: { position: 'absolute', left: 0, right: 0, bottom: 0 }
});
