// apps/web/src/lib/utils/emailTemplate.ts

export interface EmailTemplateData {
	subject: string;
	content: string;
	trackingPixel?: string;
}

export function generateMinimalEmailHTML(data: EmailTemplateData): string {
	const { subject, content, trackingPixel = '' } = data;

	return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${subject}</title>
	<style>
		/* Reset and base styles */
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			line-height: 1.6;
			color: #374151;
			background-color: #f9fafb;
			margin: 0;
			padding: 20px 0;
		}

		.email-container {
			max-width: 600px;
			margin: 0 auto;
			background-color: #ffffff;
			border-radius: 8px;
			overflow: hidden;
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		}

		/* Simple header */
		.email-header {
			background-color: #111827;
			padding: 24px 32px;
			text-align: center;
		}

		.email-header h1 {
			color: white;
			font-size: 20px;
			font-weight: 600;
			margin: 0;
		}

		/* Content area */
		.email-content {
			padding: 32px;
		}

		.email-content h1 {
			font-size: 24px;
			font-weight: 700;
			color: #111827;
			margin-bottom: 16px;
			line-height: 1.3;
		}

		.email-content h2 {
			font-size: 20px;
			font-weight: 600;
			color: #1f2937;
			margin-top: 24px;
			margin-bottom: 12px;
			line-height: 1.3;
		}

		.email-content h3 {
			font-size: 18px;
			font-weight: 600;
			color: #374151;
			margin-top: 20px;
			margin-bottom: 10px;
			line-height: 1.3;
		}

		.email-content p {
			font-size: 16px;
			margin-bottom: 16px;
			color: #4b5563;
			line-height: 1.6;
		}

		.email-content a {
			color: #3b82f6;
			text-decoration: none;
		}

		.email-content a:hover {
			text-decoration: underline;
		}

		.email-content img {
			max-width: 100%;
			height: auto;
			border-radius: 6px;
			margin: 16px 0;
		}

		.email-content ul, .email-content ol {
			padding-left: 20px;
			margin-bottom: 16px;
		}

		.email-content li {
			margin-bottom: 8px;
			color: #4b5563;
		}

		.email-content blockquote {
			border-left: 3px solid #3b82f6;
			padding-left: 16px;
			margin: 16px 0;
			font-style: italic;
			color: #6b7280;
		}

		.email-content code {
			background-color: #f3f4f6;
			padding: 2px 6px;
			border-radius: 4px;
			font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
			font-size: 14px;
			color: #374151;
		}

		.email-content pre {
			background-color: #f3f4f6;
			padding: 16px;
			border-radius: 6px;
			overflow-x: auto;
			margin: 16px 0;
		}

		.email-content pre code {
			background: none;
			padding: 0;
		}

		.email-content table {
			width: 100%;
			border-collapse: collapse;
			margin: 16px 0;
		}

		.email-content th,
		.email-content td {
			border: 1px solid #e5e7eb;
			padding: 8px 12px;
			text-align: left;
		}

		.email-content th {
			background-color: #f9fafb;
			font-weight: 600;
			color: #374151;
		}

		/* Simple footer */
		.email-footer {
			background-color: #f9fafb;
			padding: 20px 32px;
			text-align: center;
			border-top: 1px solid #e5e7eb;
		}

		.email-footer p {
			font-size: 14px;
			color: #6b7280;
			margin: 0;
			line-height: 1.5;
		}

		.email-footer a {
			color: #3b82f6;
			text-decoration: none;
		}

		.email-footer a:hover {
			text-decoration: underline;
		}

		/* Responsive design */
		@media (max-width: 600px) {
			body {
				padding: 10px 0;
			}

			.email-container {
				margin: 0 10px;
				border-radius: 6px;
			}

			.email-header {
				padding: 20px 24px;
			}

			.email-content {
				padding: 24px 20px;
			}

			.email-footer {
				padding: 16px 20px;
			}

			.email-content h1 {
				font-size: 22px;
			}

			.email-content h2 {
				font-size: 18px;
			}

			.email-content h3 {
				font-size: 16px;
			}
		}
	</style>
</head>
<body>
	<div class="email-container">
		<!-- Header -->
		<div class="email-header">
			<h1 style="display: flex; align-items: center; justify-content: center; gap: 8px;">
			<img src="https://build-os.com/s-brain-bolt.png" alt="BuildOS Logo" width="32" height="32" style="vertical-align: middle; margin-right: 8px;">
			BuildOS</h1>


		</div>

		<!-- Content -->
		<div class="email-content">
			${content}
		</div>

		<!-- Footer -->
		<div class="email-footer">
			<p>
				Sent by BuildOS • <a href="https://build-os.com">build-os.com</a>
			</p>
		</div>
	</div>
	${trackingPixel}
</body>
</html>
	`.trim();
}

// Alternative even more minimal template (no header/footer)
export function generatePlainEmailHTML(data: EmailTemplateData): string {
	const { subject, content, trackingPixel = '' } = data;

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
			color: #374151;
			max-width: 600px;
			margin: 0 auto;
			padding: 20px;
		}

		h1 { font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 16px; }
		h2 { font-size: 20px; font-weight: 600; color: #1f2937; margin: 24px 0 12px; }
		h3 { font-size: 18px; font-weight: 600; color: #374151; margin: 20px 0 10px; }
		p { font-size: 16px; margin-bottom: 16px; line-height: 1.6; }
		a { color: #3b82f6; text-decoration: none; }
		a:hover { text-decoration: underline; }
		img { max-width: 100%; height: auto; border-radius: 6px; margin: 16px 0; }
		ul, ol { padding-left: 20px; margin-bottom: 16px; }
		li { margin-bottom: 8px; }
		blockquote { border-left: 3px solid #3b82f6; padding-left: 16px; margin: 16px 0; font-style: italic; color: #6b7280; }
		code { background-color: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
		pre { background-color: #f3f4f6; padding: 16px; border-radius: 6px; overflow-x: auto; margin: 16px 0; }
	</style>
</head>
<body>
	${content}
	${trackingPixel}
</body>
</html>
	`.trim();
}
