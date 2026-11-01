// apps/mobile/src/components/chat/reader-chat-key.tsx
// The Brain Bolt in the reader's head: chat about this task or doc. It opens the project's
// chat focused on the item, the way the website's reader does, so the agent starts from it.
import { router } from 'expo-router';
import { Image, StyleSheet } from 'react-native';

import { type Icon, Key } from '@/components/kit';
import { useProject } from '@/hooks/use-entities';
import { type ChatFocus, targetParams } from '@/lib/chat/context';

const brainBolt = require('../../../assets/brain-bolt.png');

/** Drawn where a Lucide glyph would go; the Key's color does not apply to the image. */
const BrainBoltGlyph = (({ size = 16 }: { size?: number }) => (
	<Image
		source={brainBolt}
		style={[styles.glyph, { width: size * 1.6, height: size * 1.6 }]}
		accessibilityIgnoresInvertColors
	/>
)) as unknown as Icon;

export function ReaderChatKey({ projectId, focus }: { projectId: string; focus: ChatFocus }) {
	const project = useProject(projectId);
	const projectName = project.data?.project.name ?? 'Project';
	const what = focus.kind === 'document' ? 'doc' : 'task';
	return (
		<Key
			icon={BrainBoltGlyph}
			accessibilityLabel={`Chat about this ${what}`}
			accessibilityHint={`Opens chat about ${projectName}, starting from this ${what}`}
			size="sm"
			variant="outline"
			radius={10}
			onPress={() =>
				router.push({
					pathname: '/chat',
					params: {
						...targetParams({ type: 'project', projectId, projectName, focus }),
						from: focus.name.trim() || projectName
					}
				})
			}
		/>
	);
}

const styles = StyleSheet.create({
	glyph: { resizeMode: 'contain' }
});
