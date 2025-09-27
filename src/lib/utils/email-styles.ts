// src/lib/utils/email-styles.ts

/**
 * Email-safe color system
 * Uses hex colors for maximum email client compatibility
 */
export const emailColors = {
	// Primary colors
	primary: '#2563eb', // primary-600
	primaryLight: '#dbeafe', // primary-100
	primaryDark: '#1e40af', // primary-800

	// Success colors
	success: '#10b981', // emerald-600
	successLight: '#d1fae5', // emerald-100
	successDark: '#065f46', // emerald-800

	// Error colors
	error: '#ef4444', // red-600
	errorLight: '#fee2e2', // red-100
	errorDark: '#991b1b', // red-800

	// Warning colors
	warning: '#f59e0b', // amber-600
	warningLight: '#fef3c7', // amber-100
	warningDark: '#92400e', // amber-800

	// Neutral colors
	background: '#ffffff',
	backgroundAlt: '#f3f4f6', // gray-100
	text: '#111827', // gray-900
	textMuted: '#6b7280', // gray-500
	border: '#e5e7eb', // gray-200

	// Dark mode alternatives (for future use)
	darkBackground: '#1f2937', // gray-800
	darkBackgroundAlt: '#111827', // gray-900
	darkText: '#f9fafb', // gray-50
	darkTextMuted: '#9ca3af', // gray-400
	darkBorder: '#374151' // gray-700
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
