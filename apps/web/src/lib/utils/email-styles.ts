// apps/web/src/lib/utils/email-styles.ts

/**
 * Email-safe color system - Inkprint Design System
 * Uses hex colors for maximum email client compatibility
 *
 * Based on BuildOS Inkprint Design System:
 * - Paper studio light mode with warm off-white backgrounds
 * - Warm orange-amber accent color (brand color)
 * - Warm gray text for readability
 */
export const emailColors = {
	// Primary/Accent colors (warm orange-amber from Inkprint)
	primary: '#D96C1E', // accent - warm orange-amber hsl(24, 80%, 55%)
	primaryLight: '#FDF4ED', // accent light background
	primaryDark: '#B85A19', // accent darker shade

	// Success colors
	success: '#059669', // emerald-600
	successLight: '#ECFDF5', // emerald-50
	successDark: '#047857', // emerald-700

	// Error colors
	error: '#DC2626', // red-600
	errorLight: '#FEF2F2', // red-50
	errorDark: '#B91C1C', // red-700

	// Warning colors (using accent-adjacent amber)
	warning: '#D97706', // amber-600
	warningLight: '#FFFBEB', // amber-50
	warningDark: '#B45309', // amber-700

	// Neutral colors (warm off-white from Inkprint "paper studio")
	background: '#FAF9F7', // warm off-white - hsl(40, 20%, 98%)
	backgroundAlt: '#F5F4F0', // slightly warmer card bg - hsl(40, 15%, 96%)
	text: '#1A1A1D', // deep ink black - hsl(240, 10%, 10%)
	textMuted: '#6F6E75', // warm gray - hsl(240, 5%, 45%)
	border: '#DCD9D1', // warm border - hsl(40, 10%, 85%)

	// Dark mode alternatives (Inkprint "ink room")
	darkBackground: '#101014', // near-black - hsl(240, 10%, 6%)
	darkBackgroundAlt: '#1A1A1E', // slightly lighter - hsl(240, 10%, 10%)
	darkText: '#EDEBE6', // warm off-white - hsl(40, 10%, 92%)
	darkTextMuted: '#8C8B91', // warm muted - hsl(40, 5%, 55%)
	darkBorder: '#2D2D32' // dark border - hsl(240, 10%, 18%)
};

/**
 * Email-safe styles using inline CSS
 * These are reusable style objects for common email elements
 */
export const emailStyles = {
	container: {
		backgroundColor: emailColors.backgroundAlt,
		padding: '40px 20px',
		fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
	},

	card: {
		backgroundColor: emailColors.background,
		borderRadius: '8px',
		padding: '32px',
		maxWidth: '600px',
		margin: '0 auto',
		boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
	},

	heading: {
		color: emailColors.text,
		fontSize: '24px',
		fontWeight: 'bold',
		marginBottom: '16px',
		lineHeight: '1.4'
	},

	subheading: {
		color: emailColors.text,
		fontSize: '18px',
		fontWeight: '600',
		marginBottom: '12px',
		lineHeight: '1.4'
	},

	paragraph: {
		color: emailColors.textMuted,
		fontSize: '16px',
		lineHeight: '1.6',
		marginBottom: '16px'
	},

	button: {
		primary: {
			backgroundColor: emailColors.primary,
			color: emailColors.background,
			padding: '12px 24px',
			borderRadius: '6px',
			textDecoration: 'none',
			display: 'inline-block',
			fontWeight: '600',
			fontSize: '16px'
		},
		success: {
			backgroundColor: emailColors.success,
			color: emailColors.background,
			padding: '12px 24px',
			borderRadius: '6px',
			textDecoration: 'none',
			display: 'inline-block',
			fontWeight: '600',
			fontSize: '16px'
		}
	},

	alert: {
		info: {
			backgroundColor: emailColors.primaryLight,
			border: `1px solid ${emailColors.primary}`,
			borderRadius: '6px',
			padding: '16px',
			marginBottom: '16px'
		},
		success: {
			backgroundColor: emailColors.successLight,
			border: `1px solid ${emailColors.success}`,
			borderRadius: '6px',
			padding: '16px',
			marginBottom: '16px'
		},
		error: {
			backgroundColor: emailColors.errorLight,
			border: `1px solid ${emailColors.error}`,
			borderRadius: '6px',
			padding: '16px',
			marginBottom: '16px'
		},
		warning: {
			backgroundColor: emailColors.warningLight,
			border: `1px solid ${emailColors.warning}`,
			borderRadius: '6px',
			padding: '16px',
			marginBottom: '16px'
		}
	},

	divider: {
		borderTop: `1px solid ${emailColors.border}`,
		margin: '24px 0'
	},

	footer: {
		color: emailColors.textMuted,
		fontSize: '14px',
		textAlign: 'center' as const,
		marginTop: '32px',
		paddingTop: '24px',
		borderTop: `1px solid ${emailColors.border}`
	},

	link: {
		color: emailColors.primary,
		textDecoration: 'underline'
	}
};

/**
 * Convert style object to inline CSS string for email templates
 */
export function styleToString(style: Record<string, any>): string {
	return Object.entries(style)
		.map(([key, value]) => {
			// Convert camelCase to kebab-case
			const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
			return `${cssKey}: ${value}`;
		})
		.join('; ');
}

/**
 * Generate a complete email HTML template with consistent styling
 */
export function createEmailTemplate(content: {
	title?: string;
	heading: string;
	body: string;
	buttonText?: string;
	buttonUrl?: string;
	footer?: string;
}): string {
	return `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${content.title || 'BuildOS'}</title>
</head>
<body style="${styleToString(emailStyles.container)}">
	<div style="${styleToString(emailStyles.card)}">
		<h1 style="${styleToString(emailStyles.heading)}">${content.heading}</h1>
		${content.body}
		${
			content.buttonText && content.buttonUrl
				? `
		<div style="text-align: center; margin: 32px 0;">
			<a href="${content.buttonUrl}" style="${styleToString(emailStyles.button.primary)}">
				${content.buttonText}
			</a>
		</div>
		`
				: ''
		}
		${
			content.footer
				? `
		<div style="${styleToString(emailStyles.footer)}">
			${content.footer}
		</div>
		`
				: ''
		}
	</div>
</body>
</html>
	`;
}
