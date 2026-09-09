export type OnboardingNotifications = {
	emailEnabled: boolean;
	smsEnabled: boolean;
	smsBriefEnabled: boolean;
	smsRemindersEnabled: boolean;
	phoneVerified: boolean;
};

async function requestPreferences(url: string, body?: Record<string, unknown>, method = 'PUT') {
	const response = await fetch(
		url,
		body
			? {
					method,
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				}
			: { cache: 'no-store' }
	);
	const result = await response.json().catch(() => null);
	if (!response.ok || result?.success !== true) {
		throw new Error(
			typeof result?.error === 'string'
				? result.error
				: 'Could not save this preference. Please try again.'
		);
	}
	return result.data?.preferences ?? result.data?.preference ?? {};
}

export async function loadOnboardingNotifications(): Promise<OnboardingNotifications> {
	const [delivery, sms] = await Promise.all([
		requestPreferences('/api/notification-preferences?daily_brief=true'),
		requestPreferences('/api/sms/preferences')
	]);
	const phoneVerified = sms.phone_verified === true && sms.opted_out !== true;
	const smsBriefEnabled = phoneVerified && delivery.should_sms_daily_brief === true;
	const smsRemindersEnabled =
		phoneVerified &&
		(sms.event_reminders_enabled === true || sms.morning_kickoff_enabled === true);
	return {
		emailEnabled: delivery.should_email_daily_brief === true,
		smsEnabled: smsBriefEnabled || smsRemindersEnabled,
		smsBriefEnabled,
		smsRemindersEnabled,
		phoneVerified
	};
}

/** Returns confirmed per-channel state, including partial success. Retrying is idempotent. */
export async function saveOnboardingNotifications(
	wanted: { email: boolean; sms: boolean },
	previous: OnboardingNotifications
): Promise<{ saved: OnboardingNotifications; errors: string[]; confirmed: boolean }> {
	const saved = { ...previous };
	const errors: string[] = [];
	let briefReady = true;
	if (wanted.email || wanted.sms) {
		try {
			// Delivery requires active generation. Preserve the user's existing schedule.
			const brief = await requestPreferences('/api/brief-preferences');
			if (!brief.is_active) {
				await requestPreferences(
					'/api/brief-preferences',
					{
						frequency: brief.frequency ?? 'daily',
						day_of_week: brief.day_of_week,
						time_of_day: brief.time_of_day ?? '09:00:00',
						timezone: brief.timezone ?? 'UTC',
						is_active: true
					},
					'POST'
				);
			}
		} catch {
			briefReady = false;
			errors.push(
				'Daily briefs could not be activated. Retry to finish setting up delivery.'
			);
		}
	}
	const jobs: Promise<void>[] = [];
	let deliverySave = Promise.resolve();
	if (!wanted.email || briefReady)
		deliverySave = (async () => {
			try {
				const prefs = await requestPreferences('/api/notification-preferences', {
					should_email_daily_brief: wanted.email
				});
				saved.emailEnabled = prefs.should_email_daily_brief === true;
			} catch {
				errors.push('Your email preference was not saved.');
			}
		})();
	jobs.push(deliverySave);
	jobs.push(
		(async () => {
			try {
				const prefs = await requestPreferences('/api/sms/preferences', {
					event_reminders_enabled: wanted.sms,
					morning_kickoff_enabled: wanted.sms
				});
				saved.smsRemindersEnabled =
					saved.phoneVerified &&
					(prefs.event_reminders_enabled === true ||
						prefs.morning_kickoff_enabled === true);
			} catch {
				errors.push('Your text reminder preference was not saved.');
			}
		})()
	);
	// These delivery writes also update shared subscriptions. Serialize them so a
	// stale response cannot overwrite the subscription derived from the final preferences.
	if (!wanted.sms || briefReady)
		jobs.push(
			deliverySave.then(async () => {
				try {
					const prefs = await requestPreferences('/api/notification-preferences', {
						should_sms_daily_brief: wanted.sms
					});
					saved.smsBriefEnabled =
						saved.phoneVerified && prefs.should_sms_daily_brief === true;
				} catch {
					errors.push('Your daily brief text preference was not saved.');
				}
			})
		);
	await Promise.all(jobs);
	saved.smsEnabled = saved.smsBriefEnabled || saved.smsRemindersEnabled;
	if (errors.length) {
		try {
			return { saved: await loadOnboardingNotifications(), errors, confirmed: true };
		} catch {
			errors.push('Saved settings could not be refreshed. Retry before continuing.');
			return { saved, errors, confirmed: false };
		}
	}
	return { saved, errors, confirmed: true };
}
