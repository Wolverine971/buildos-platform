// apps/mobile/src/components/text.tsx
import { Text, type TextProps } from 'react-native';

import { useTheme } from '@/providers/theme-provider';
import { fontFamily } from '@/theme';

type Variant = 'title' | 'heading' | 'body' | 'muted' | 'label' | 'error';

const sizes: Record<Variant, { fontSize: number; lineHeight: number; fontWeight?: '600' | '700' }> =
	{
		title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
		heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
		body: { fontSize: 16, lineHeight: 22 },
		muted: { fontSize: 14, lineHeight: 20 },
		label: { fontSize: 11, lineHeight: 14 },
		error: { fontSize: 14, lineHeight: 20 }
	};

/** Inkprint text: `label` is the web's stamped micro-label (mono, uppercase, tracked). */
export function AppText({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
	const colors = useTheme();
	const color =
		variant === 'muted' || variant === 'label'
			? colors.mutedForeground
			: variant === 'error'
				? colors.destructive
				: colors.foreground;
	const label =
		variant === 'label'
			? {
					fontFamily: fontFamily.mono,
					textTransform: 'uppercase' as const,
					letterSpacing: 1.3
				}
			: null;
	return <Text {...props} style={[{ color }, sizes[variant], label, style]} />;
}
