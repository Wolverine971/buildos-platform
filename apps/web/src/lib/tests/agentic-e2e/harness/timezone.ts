// apps/web/src/lib/tests/agentic-e2e/harness/timezone.ts
//
// The single zone the harness user is provisioned in AND the zone every
// date-bearing assertion resolves "today"/"friday" in. The prompt clock reads
// `users.timezone`, so seeding the user with this constant and asserting in it
// keeps the model and the scenario on the same calendar day regardless of the
// wall-clock hour the paid run happens to start at.
export const HARNESS_TIMEZONE = 'America/New_York';
