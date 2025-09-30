// apps/web/src/lib/utils/email-templates.ts

/**
 * Generate a minimal HTML email template
 */
export function generateMinimalEmailHTML(body: string, subject: string): string {
	// Convert newlines to HTML breaks
	const htmlBody = body.replace(/\n/g, '<br>');

	return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${subject}</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			line-height: 1.6;
			color: #333;
			max-width: 600px;
			margin: 0 auto;
			padding: 20px;
			background-color: #f5f5f5;
		}
		.container {
			background-color: white;
			border-radius: 8px;
			padding: 30px;
			box-shadow: 0 2px 4px rgba(0,0,0,0.1);
		}
		.header {
			border-bottom: 2px solid #3b82f6;
			padding-bottom: 20px;
			margin-bottom: 30px;
		}
		.logo {
			font-size: 24px;
			font-weight: bold;
			color: #3b82f6;
		}
		.content {
			color: #374151;
			font-size: 16px;
		}
		.footer {
			margin-top: 40px;
			padding-top: 20px;
			border-top: 1px solid #e5e7eb;
			font-size: 14px;
			color: #6b7280;
			text-align: center;
		}
		a {
			color: #3b82f6;
			text-decoration: none;
		}
		a:hover {
			text-decoration: underline;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<div class="logo">BuildOS</div>
		</div>
		<div class="content">
			${htmlBody}
		</div>
		<div class="footer">
			<p>© ${new Date().getFullYear()} BuildOS. All rights reserved.</p>
			<p>
				<a href="https://build-os.com">Visit BuildOS</a> | 
				<a href="https://build-os.com/unsubscribe">Unsubscribe</a>
			</p>
		</div>
	</div>
</body>
</html>
	`.trim();
}

/**
 * Generate a rich HTML email template with sections
 */
export function generateRichEmailHTML(options: {
	subject: string;
	preheader?: string;
	sections: Array<{
		title?: string;
		content: string;
		style?: 'default' | 'highlight' | 'warning' | 'success';
	}>;
	ctaButton?: {
		text: string;
		url: string;
	};
	footer?: string;
}): string {
	const sectionColors = {
		default: '#374151',
		highlight: '#3b82f6',
		warning: '#f59e0b',
		success: '#10b981'
	};

	const sectionsHTML = options.sections
		.map((section) => {
			const color = section.style ? sectionColors[section.style] : sectionColors.default;
			return `
				${section.title ? `<h2 style="color: ${color}; font-size: 20px; margin-top: 30px;">${section.title}</h2>` : ''}
				<div style="color: #374151; font-size: 16px; margin-bottom: 20px;">
					${section.content.replace(/\n/g, '<br>')}
				</div>
			`;
		})
		.join('');

	const ctaHTML = options.ctaButton
		? `
			<div style="text-align: center; margin: 40px 0;">
				<a href="${options.ctaButton.url}" 
				   style="display: inline-block; padding: 12px 30px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
					${options.ctaButton.text}
				</a>
			</div>
		`
		: '';

	return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${options.subject}</title>
	<!--[if mso]>
	<noscript>
		<xml>
			<o:OfficeDocumentSettings>
				<o:PixelsPerInch>96</o:PixelsPerInch>
			</o:OfficeDocumentSettings>
		</xml>
	</noscript>
	<![endif]-->
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			line-height: 1.6;
			color: #333;
			margin: 0;
			padding: 0;
			background-color: #f5f5f5;
			-webkit-text-size-adjust: 100%;
			-ms-text-size-adjust: 100%;
		}
		.preheader {
			display: none;
			font-size: 1px;
			color: #f5f5f5;
			line-height: 1px;
			max-height: 0px;
			max-width: 0px;
			opacity: 0;
			overflow: hidden;
		}
		.container {
			max-width: 600px;
			margin: 0 auto;
			padding: 20px;
		}
		.email-body {
			background-color: white;
			border-radius: 8px;
			padding: 40px;
			box-shadow: 0 2px 4px rgba(0,0,0,0.1);
		}
		.header {
			border-bottom: 2px solid #3b82f6;
			padding-bottom: 20px;
			margin-bottom: 30px;
		}
		.logo {
			font-size: 28px;
			font-weight: bold;
			color: #3b82f6;
		}
		.footer {
			margin-top: 40px;
			padding-top: 20px;
			border-top: 1px solid #e5e7eb;
			font-size: 14px;
			color: #6b7280;
			text-align: center;
		}
		a {
			color: #3b82f6;
			text-decoration: none;
		}
		a:hover {
			text-decoration: underline;
		}
		@media only screen and (max-width: 600px) {
			.container {
				padding: 10px;
			}
			.email-body {
				padding: 20px;
			}
		}
	</style>
</head>
<body>
	${options.preheader ? `<div class="preheader">${options.preheader}</div>` : ''}
	
	<div class="container">
		<div class="email-body">
			<div class="header">
				<div class="logo">BuildOS</div>
			</div>
			
			${sectionsHTML}
			${ctaHTML}
			
			<div class="footer">
				${
					options.footer ||
					`
					<p>Best regards,<br>The BuildOS Team</p>
					<p style="margin-top: 30px;">© ${new Date().getFullYear()} BuildOS. All rights reserved.</p>
					<p>
						<a href="https://build-os.com">Visit BuildOS</a> | 
						<a href="https://build-os.com/unsubscribe">Unsubscribe</a>
					</p>
				`
				}
			</div>
		</div>
	</div>
</body>
</html>
	`.trim();
}
