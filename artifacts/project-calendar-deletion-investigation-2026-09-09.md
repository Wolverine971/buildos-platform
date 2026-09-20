<!-- artifacts/project-calendar-deletion-investigation-2026-09-09.md -->

# Project calendar deletion investigation

## Live cleanup completed

The connected Google account `djwayne3@gmail.com` is also linked to the BuildOS account `255735ad-a34b-4ca9-942c-397ed8cc1435` (`djwayne35@gmail.com`). No cleanup was performed for unrelated accounts.

| Event                                 | Project                                                        | Result                                                                                                                                                                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Due: Submit chapter 1 to beta readers | The Last Ember, project `5cac588f-44b9-4b30-9e47-4ce7e7c724a7` | Deleted Google event `24lvu4hrh8b3qchup6uopr00dk`. Its description identified the project and task; both are absent from production. Follow-up search of that calendar from September 2026 through January 2030 returned no events.                                     |
| Due: QA — Confirm permit requirements | [QA 2026-09-03] Cedar House Renovation                         | Existing production sync worker deleted the Google event. Cleanup job `ae0d72cd-072a-4a65-af68-5873a3ce4ccc` completed; mapping cancelled.                                                                                                                              |
| Due: QA — Order kitchen cabinets      | [QA 2026-09-03] Cedar House Renovation                         | Existing production sync worker deleted the Google event. Cleanup job `854c17b3-da5e-468a-bc6f-9a03050a5316` completed; mapping cancelled.                                                                                                                              |
| Due: QA — Order kitchen cabinets      | [QA RETEST a1771c1] Cedar House Renovation                     | Google returned HTTP 410, confirming prior deletion. Production incorrectly treated that as failure. Reconciled this event/mapping to cancelled and its pending cleanup job `f73ca747-8602-4e82-93ab-a9102f264092` to completed, guarded by the specific 410 error log. |

The final production query confirmed all three queued cleanup jobs completed and all three retained event mappings are cancelled. Total: three provider events removed and one already-removed event reconciled.

The user did not supply the deleted project's name during this investigation. These are confirmed orphaned events found through stored mappings and event descriptions; this is not a claim that every historical Google calendar has been exhaustively audited. Other Last Ember calendars had no events in the September 2026–September 2027 search window. An older writing block without a project identifier was left alone.

## Causes

- `soft_delete_onto_project` marked local events deleted without queuing Google deletions.
- `delete_onto_project` removed event mappings before removing the project, destroying the provider identity needed to clean up later.
- Google HTTP 410 was not accepted as successful idempotent deletion.
- Calendar event deletion passed `sendUpdates: none`, suppressing attendee cancellation updates.
- A stale upsert could be skipped before recognizing an event's deletion; a provider creation could finish after the deletion snapshot.

## Implemented fix (not deployed)

Migration `20260909034006_project_calendar_delete_cleanup.sql` adds project deletion triggers that enqueue durable provider deletion identities in the same transaction. Queue failure aborts deletion. Targets include all member mappings regardless of projection mode or disabled synchronization, source-qualified standalone mappings, legacy task tracking, and props-only external identities. Equivalent legacy tracking is deduplicated. Whole calendars are not deleted.

The hard-delete RPC now marks the project deleted before removing children, including already-soft-deleted projects. A second trigger captures late provider mappings and locks the parent project while resolving its deletion state.

The webhook and shared service accept validated `deletionSnapshot` metadata. Cleanup uses the stored account/calendar/event identity even if project rows and mappings have disappeared. Restored projects are skipped. Provider and credential failures remain retryable, and HTTP 404/410 are idempotent success. Cancellation requests use Google's `sendUpdates: all`. Stale upserts for deleted events perform deletion, and failed legacy mapping inserts compensate their provider creation.

## Validation

- 33 shared calendar service tests passed.
- 22 web webhook/calendar writer/shim tests passed.
- 9 shared metadata validation tests passed.
- Shared types build passed; shared-agent-ops TypeScript check passed after rebuilding shared types.
- Disposable Postgres regression tests passed for soft deletion, hard deletion, direct deletion, already-deleted projects, multiple users, disabled sync, legacy deduplication, retained provider identity, late mappings, transaction rollback, queue failure, and trigger function permissions.
- Production security advisors retrieved; production DDL was not changed. New privileged functions are trigger-only, have a fixed search path, and revoke direct execution from public/anonymous/authenticated roles.

## Deployment order

1. Deploy the web application with the rebuilt shared packages and snapshot-aware webhook.
2. Apply `20260909034006_project_calendar_delete_cleanup.sql`.
3. Verify a project deletion's `sync_calendar` jobs complete and the mapped Google events are absent.

The existing worker forwards the metadata unchanged, so no worker protocol change is required. Do not apply the migration before deploying the webhook: the old webhook ignores deletion snapshots and cannot clean up hard-deleted mappings.

Provider contract references: [Google event deletion](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete), [Google Calendar error handling](https://developers.google.com/workspace/calendar/api/guides/errors).
