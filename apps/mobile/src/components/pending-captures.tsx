// apps/mobile/src/components/pending-captures.tsx
import { View } from 'react-native';

import { Button } from '@/components/button';
import { AppText } from '@/components/text';
import { useCaptureQueue } from '@/hooks/use-capture-queue';
import { formatDuration } from '@/lib/capture-audio';
import type { DrainStop, PendingCapture } from '@/lib/capture-queue';
import { useTheme } from '@/providers/theme-provider';
import { radius, spacing } from '@/theme';

/** Why pending captures are waiting, by why the last send attempt stopped. */
const REASON: Record<DrainStop, string> = {
	offline: 'no connection, saved on this phone',
	unauthorized: 'sign in to send',
	server: 'BuildOS unreachable, will retry'
};

function describeCapture(item: PendingCapture): string {
	if (item.kind === 'voice' && !item.text) {
		const ms = item.audio?.duration_ms ?? 0;
		// Recordings recovered after the app closed mid-save have no known length.
		return ms > 0 ? `Voice note · ${formatDuration(ms)}` : 'Voice note';
	}
	return item.text;
}

/**
 * The visible "waiting to send" state. Shows while captures wait for a connection (the bar's
 * status line covers ones that are sending now), and lists the ones that need a person:
 * refused by the server, or a recording with no speech in it.
 */
export function PendingCaptures() {
	const colors = useTheme();
	const { pendingCount, failed, stopped, retryAll, remove } = useCaptureQueue();

	const waiting = pendingCount > 0 && stopped !== null;
	if (!waiting && failed.length === 0) return null;

	return (
		<View
			style={{
				padding: spacing.md,
				gap: spacing.sm,
				borderRadius: radius.md,
				borderWidth: 1,
				borderColor: failed.length ? colors.destructive : colors.warning,
				backgroundColor: colors.card
			}}
		>
			{waiting && stopped ? (
				<AppText>
					{pendingCount === 1
						? '1 capture waiting to send'
						: `${pendingCount} captures waiting to send`}
					<AppText variant="muted"> · {REASON[stopped]}</AppText>
				</AppText>
			) : null}

			{failed.map((item) => (
				<View key={item.id} style={{ gap: spacing.xs }}>
					<AppText numberOfLines={2}>{describeCapture(item)}</AppText>
					<AppText variant="error">{item.last_error ?? 'Could not save'}</AppText>
					<View style={{ flexDirection: 'row', gap: spacing.sm }}>
						<Button
							title="Discard"
							variant="ghost"
							onPress={() => void remove(item.id)}
						/>
					</View>
				</View>
			))}

			<Button
				title={failed.length ? 'Try again' : 'Send now'}
				variant="ghost"
				onPress={() => void retryAll()}
			/>
		</View>
	);
}
