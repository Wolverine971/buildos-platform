// worker-queue/tests/test-email.ts
import { config } from 'dotenv';
import { createGmailTransporter, formatSender, getGmailConfig } from '../src/lib/services/gmail-transporter';

// Load environment variables
config();

async function testEmailConfiguration() {
	console.log('🧪 Testing Gmail configuration...\n');
	
	const gmailConfig = getGmailConfig();
	
	if (!gmailConfig) {
		console.error('❌ Gmail configuration not found!');
		console.log('\nMake sure you have set the following environment variables:');
		console.log('  - GMAIL_USER: Your Gmail address');
		console.log('  - GMAIL_APP_PASSWORD: Your app-specific password');
		console.log('  - GMAIL_ALIAS (optional): Your sender alias (e.g., noreply@build-os.com)');
		console.log('  - EMAIL_FROM_NAME (optional): Display name for sender\n');
		process.exit(1);
	}
	
	console.log('✅ Gmail configuration found:');
	console.log(`  - Gmail Account: ${gmailConfig.email}`);
	console.log(`  - Has Password: ${gmailConfig.password ? 'Yes' : 'No'}`);
	console.log(`  - Sender Alias: ${gmailConfig.alias || '(not set - will use Gmail account)'}`);
	console.log(`  - Display Name: ${gmailConfig.displayName || 'BuildOS'}`);
	console.log(`  - From Field: ${formatSender(gmailConfig)}\n`);
	
	// Test sending an email
	const testRecipient = process.argv[2];
	
	if (!testRecipient) {
		console.log('📧 To send a test email, run:');
		console.log('   pnpm tsx tests/test-email.ts your-email@example.com\n');
		return;
	}
	
	console.log(`📬 Sending test email to: ${testRecipient}`);
	
	try {
		const transporter = createGmailTransporter(gmailConfig);
		
		const info = await transporter.sendMail({
			from: formatSender(gmailConfig),
			to: testRecipient,
			subject: 'Test Email from BuildOS Daily Brief Worker',
			html: `
				<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
					<h2 style="color: #1e40af;">🎉 Test Email Successful!</h2>
					<p>This is a test email from your BuildOS Daily Brief Worker.</p>
					<p><strong>Configuration Details:</strong></p>
					<ul>
						<li>Sent from: ${formatSender(gmailConfig)}</li>
						<li>Gmail account: ${gmailConfig.email}</li>
						<li>Using alias: ${gmailConfig.alias ? 'Yes - ' + gmailConfig.alias : 'No'}</li>
						<li>Timestamp: ${new Date().toISOString()}</li>
					</ul>
					<hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
					<p style="color: #6b7280; font-size: 14px;">
						If you received this email, your Gmail configuration is working correctly!
					</p>
					<p style="color: #6b7280; font-size: 14px;">
						<strong>Note about aliases:</strong> If you want to send from an alias like 
						noreply@build-os.com, you must first verify it in Gmail Settings > Accounts > 
						"Send mail as". The alias must be a real email address you control.
					</p>
				</div>
			`,
			text: `Test email from BuildOS Daily Brief Worker. Configuration is working!`
		});
		
		console.log(`\n✅ Email sent successfully!`);
		console.log(`  Message ID: ${info.messageId}`);
		console.log(`  Accepted: ${info.accepted.join(', ')}`);
		
		if (info.rejected && info.rejected.length > 0) {
			console.log(`  ⚠️ Rejected: ${info.rejected.join(', ')}`);
		}
		
	} catch (error) {
		console.error('\n❌ Failed to send test email:', error);
		
		if (error instanceof Error) {
			if (error.message.includes('Invalid login')) {
				console.log('\n🔧 Troubleshooting tips:');
				console.log('  1. Make sure you\'re using an App Password, not your regular Gmail password');
				console.log('  2. Generate an App Password at: https://myaccount.google.com/apppasswords');
				console.log('  3. Ensure 2-factor authentication is enabled on your Gmail account');
			} else if (error.message.includes('Invalid sender')) {
				console.log('\n🔧 Troubleshooting tips:');
				console.log('  1. If using an alias, make sure it\'s verified in Gmail');
				console.log('  2. Go to Gmail Settings > Accounts > "Send mail as" to add/verify aliases');
				console.log('  3. The alias must be a real email address that you control');
			}
		}
		
		process.exit(1);
	}
}

// Run the test
testEmailConfiguration().catch(console.error);