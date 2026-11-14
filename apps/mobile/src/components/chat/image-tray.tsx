// apps/mobile/src/components/chat/image-tray.tsx
// The picked images over the message box: a thumbnail each, a spinner while it uploads, a
// warning mark when it failed, and an × to take it off. "Images 2/4" says how many fit.
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AlertTriangle, BoltSpinner, playHaptic, X } from '@/components/kit';
import { type DraftImage, MAX_IMAGES } from '@/lib/chat/images';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

const THUMB = 56;

export function ImageTray({
	images,
	onRemove
}: {
	images: DraftImage[];
	onRemove: (id: string) => void;
}) {
	const { colors } = useInk();
	if (images.length === 0) return null;
	const failed = images.find((image) => image.status === 'failed');
	return (
		<View style={styles.wrap}>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.row}
			>
				{images.map((image, index) => (
					<View key={image.id} style={styles.item}>
						<Image
							source={{ uri: image.uri }}
							accessibilityLabel={`Image ${index + 1}${image.status === 'uploading' ? ', uploading' : image.status === 'failed' ? ', failed to upload' : ''}`}
							style={[
								styles.thumb,
								{
									borderColor:
										image.status === 'failed'
											? colors.destructive
											: colors.border
								}
							]}
						/>
						{image.status !== 'ready' ? (
							<View
								pointerEvents="none"
								style={[
									styles.veil,
									{ backgroundColor: withAlpha(colors.background, 0.55) }
								]}
							>
								{image.status === 'uploading' ? (
									<BoltSpinner size={18} label="" />
								) : (
									<AlertTriangle
										size={18}
										strokeWidth={2.4}
										color={colors.destructive}
									/>
								)}
							</View>
						) : null}
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={`Remove image ${index + 1}`}
							hitSlop={10}
							onPress={() => {
								playHaptic('light');
								onRemove(image.id);
							}}
							style={[
								styles.remove,
								{
									backgroundColor: colors.foreground,
									borderColor: colors.background
								}
							]}
						>
							<X size={11} strokeWidth={3} color={colors.background} />
						</Pressable>
					</View>
				))}
			</ScrollView>
			<Text
				maxFontSizeMultiplier={1.4}
				style={[
					typeScale.small,
					{ color: failed ? colors.destructive : colors.mutedForeground }
				]}
			>
				{failed?.error ?? `Images ${images.length}/${MAX_IMAGES}`}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { gap: 4, paddingHorizontal: 4, paddingBottom: 8 },
	row: { gap: 10, paddingTop: 6, paddingRight: 6 },
	item: { width: THUMB, height: THUMB },
	thumb: { width: THUMB, height: THUMB, borderRadius: 10, borderWidth: 1 },
	veil: {
		position: 'absolute',
		top: 0,
		left: 0,
		width: THUMB,
		height: THUMB,
		borderRadius: 10,
		alignItems: 'center',
		justifyContent: 'center'
	},
	remove: {
		position: 'absolute',
		top: -6,
		right: -6,
		width: 20,
		height: 20,
		borderRadius: 10,
		borderWidth: 2,
		alignItems: 'center',
		justifyContent: 'center'
	}
});
