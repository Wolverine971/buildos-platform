interface DailyBriefEmailTemplateOptions {
	subject: string;
	contentHtml: string;
	briefUrl: string;
	managePreferencesUrl: string;
	unsubscribeUrl: string;
	primaryActionLabel: string;
	postalAddressHtml?: string;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/**
 * LLM summaries occasionally leave a final `**` pair open. Closing the pair at
 * the end of that line keeps the email from exposing markdown syntax while
 * leaving fenced code blocks and already-balanced content untouched.
 */
export function normalizeDailyBriefMarkdown(markdown: string): string {
	let insideFence = false;

	return markdown
		.split('\n')
		.map((line) => {
			if (/^\s*(```|~~~)/.test(line)) {
				insideFence = !insideFence;
				return line;
			}

			if (insideFence) {
				return line;
			}

			const strongMarkers = line.match(/(^|[^\\*])\*\*(?!\*)/g)?.length ?? 0;
			return strongMarkers % 2 === 1 ? `${line}**` : line;
		})
		.join('\n');
}

/**
 * A deliberately restrained, table-based shell for broad email-client support.
 * The markdown body remains the product; this template only gives it a stable
 * reading width, hierarchy, and one clear action.
 */
export function buildDailyBriefEmailHtml(options: DailyBriefEmailTemplateOptions): string {
	const subject = escapeHtml(options.subject);
	const briefUrl = escapeHtml(options.briefUrl);
	const managePreferencesUrl = escapeHtml(options.managePreferencesUrl);
	const unsubscribeUrl = escapeHtml(options.unsubscribeUrl);
	const primaryActionLabel = escapeHtml(options.primaryActionLabel);
	const postalAddressHtml = options.postalAddressHtml ?? '';

	return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${subject}</title>
  <style>
    body,
    table,
    td,
    a {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }

    table,
    td {
      mso-table-lspace: 0;
      mso-table-rspace: 0;
    }

    table {
      border-collapse: collapse !important;
    }

    .brief-content > :first-child {
      margin-top: 0 !important;
    }

    .brief-content > :last-child {
      margin-bottom: 0 !important;
    }

    .brief-content h1 {
      color: #1a1a1d;
      font-size: 28px;
      line-height: 1.2;
      letter-spacing: -0.6px;
      margin: 0 0 28px;
    }

    .brief-content h2 {
      border-top: 1px solid #e4dfd5;
      color: #1a1a1d;
      font-size: 18px;
      line-height: 1.35;
      margin: 30px 0 12px;
      padding-top: 24px;
    }

    .brief-content h1 + h2 {
      border-top: 0;
      margin-top: 0;
      padding-top: 0;
    }

    .brief-content h3 {
      color: #2f2e32;
      font-size: 15px;
      line-height: 1.4;
      margin: 22px 0 8px;
    }

    .brief-content p {
      margin: 0 0 14px;
    }

    .brief-content ul,
    .brief-content ol {
      margin: 8px 0 20px;
      padding-left: 22px;
    }

    .brief-content li {
      margin: 6px 0;
      padding-left: 2px;
    }

    .brief-content li > ul,
    .brief-content li > ol {
      color: #6f6e75;
      font-size: 13px;
      margin: 3px 0 10px;
      padding-left: 18px;
    }

    .brief-content a {
      color: #b65316;
      text-decoration: underline;
      text-decoration-color: #e8b18a;
      text-underline-offset: 2px;
      word-break: break-word;
    }

    .brief-content blockquote {
      border-left: 3px solid #d96c1e;
      color: #56555b;
      margin: 18px 0;
      padding: 2px 0 2px 16px;
    }

    .brief-content hr {
      border: 0;
      border-top: 1px solid #e4dfd5;
      margin: 28px 0;
    }

    .brief-content pre,
    .brief-content code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .brief-content pre {
      background: #f3f0ea;
      border: 1px solid #e4dfd5;
      border-radius: 8px;
      overflow-x: auto;
      padding: 14px;
    }

    @media only screen and (max-width: 620px) {
      .email-gutter {
        padding: 12px !important;
      }

      .email-card {
        border-radius: 10px !important;
      }

      .email-header,
      .email-content,
      .email-footer {
        padding-left: 22px !important;
        padding-right: 22px !important;
      }

      .brief-content h1 {
        font-size: 25px !important;
      }

      .footer-link {
        display: block !important;
        margin: 9px 0 !important;
      }

      .footer-separator {
        display: none !important;
      }
    }
  </style>
</head>
<body style="background-color: #f7f4ee; color: #1a1a1d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0;">
  <div style="display: none; font-size: 1px; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">
    Your priorities, schedule, and next actions for today.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f4ee; width: 100%;">
    <tr>
      <td class="email-gutter" align="center" style="padding: 32px 16px 40px;">
        <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fffdf9; border: 1px solid #ded8cc; border-radius: 14px; max-width: 620px; width: 100%;">
          <tr>
            <td class="email-header" style="border-bottom: 1px solid #e4dfd5; padding: 22px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right: 10px; vertical-align: middle;">
                    <div style="background-color: #d96c1e; border-radius: 2px; height: 9px; width: 9px;"></div>
                  </td>
                  <td style="color: #343337; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; line-height: 1; text-transform: uppercase; vertical-align: middle;">
                    BuildOS&nbsp;&nbsp;<span style="color: #8c8b91; font-weight: 600;">Daily Brief</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="email-content brief-content" style="color: #343337; font-size: 15px; line-height: 1.6; padding: 30px 32px 10px; text-align: left;">
              ${options.contentHtml}
            </td>
          </tr>

          <tr>
            <td style="padding: 22px 32px 30px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                <tr>
					<td bgcolor="#b65316" style="border-radius: 8px;">
						<a href="${briefUrl}" style="background-color: #b65316; border: 1px solid #b65316; border-radius: 8px; color: #ffffff; display: inline-block; font-size: 14px; font-weight: 700; line-height: 1; padding: 13px 19px; text-decoration: none;">${primaryActionLabel}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="email-footer" style="background-color: #f3f0ea; border-radius: 0 0 14px 14px; border-top: 1px solid #e4dfd5; color: #77767c; font-size: 12px; line-height: 1.5; padding: 18px 32px 20px; text-align: center;">
              <a class="footer-link" href="${managePreferencesUrl}" style="color: #65646a; text-decoration: none;">Manage preferences</a>
              <span class="footer-separator" style="color: #aaa7a0; margin: 0 8px;">&middot;</span>
              <a class="footer-link" href="${unsubscribeUrl}" style="color: #65646a; text-decoration: none;">Turn off daily briefs</a>
              ${postalAddressHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}
