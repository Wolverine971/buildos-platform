// apps/mobile/src/components/chat/chat-key.tsx
// The Brain Bolt in the top-right of every page, as on the website's phone view: it opens
// chat about whatever is on screen (the Workspace, or this project). A dot on it means an
// agent is still working on something in the background.
import { router } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';

import { NAV_KEY_SIZE, NavKey } from '@/components/kit';
import { useActiveTurnCount } from '@/hooks/use-chat';
import { type ChatTarget, targetLabel, targetParams } from '@/lib/chat/context';
import { useInk } from '@/providers/theme-provider';

const brainBolt = require('../../../assets/brain-bolt.png');

export function ChatKey({ target, from }: { target: ChatTarget; from: string }) {
	const { colors } = useInk();
	const working = useActiveTurnCount();
	const label =
		target.type === 'project' ? `Chat about ${targetLabel(target)}` : 'Chat with BuildOS';
	return (
		<View>
			<NavKey
				glyph={
					<Image
						source={brainBolt}
						style={styles.glyph}
						accessibilityIgnoresInvertColors
					/>
				}
				accessibilityLabel={
					working > 0
						? `${label}. ${working} ${working === 1 ? 'agent' : 'agents'} working in the background`
						: label
				}
				accessibilityHint="Opens chat"
				testID="chat-key"
				onPress={() =>
					router.push({ pathname: '/chat', params: { ...targetParams(target), from } })
				}
			/>
			{working > 0 ? (
				<View
					pointerEvents="none"
					style={[
						styles.dot,
						{ backgroundColor: colors.accent, borderColor: colors.bench }
					]}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	// The brain fills about 60% of its square, so it is drawn larger than a Lucide glyph.
	glyph: { width: NAV_KEY_SIZE - 6, height: NAV_KEY_SIZE - 6, resizeMode: 'contain' },
	dot: {
		position: 'absolute',
		top: -3,
		right: -3,
		width: 11,
		height: 11,
		borderRadius: 6,
		borderWidth: 2
	}
});
