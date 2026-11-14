-- artifacts/fading-crown-cleanup-2026-11-04-applied.sql
BEGIN;
UPDATE onto_projects SET description = $fc$Fantasy novel. Queen Isolde is losing her magic as the wards that protect her kingdom fail. Working toward a complete first draft for beta readers.$fc$ WHERE id = 'e81e7114-b6f7-4013-8052-13c792b6fdc5' AND name IS NOT DISTINCT FROM $fc$Fading Crown$fc$ AND description IS NOT DISTINCT FROM $fc$Fantasy novel — Queen Isolde is losing her magic as the wards that protect her kingdom fail. Working toward a complete first draft for beta readers.$fc$;
UPDATE onto_tasks SET title = $fc$Magic system v2: write the hard rules$fc$ WHERE id = 'e1662f6d-91d4-4f78-8faf-6a31fa277245' AND title IS NOT DISTINCT FROM $fc$Magic system v2 — write the hard rules$fc$ AND description IS NOT DISTINCT FROM $fc$The ledger, the wards, the crown-as-focus. See the rules doc.$fc$;
UPDATE onto_tasks SET description = $fc$Her act-3 turn should hinge on the sister confrontation in Ch. 16. Thread the setup back through chapters 9–14.$fc$ WHERE id = '944c1a7e-a450-46f6-868b-946df096adf3' AND title IS NOT DISTINCT FROM $fc$Reconcile Maya's motivation in Act II$fc$ AND description IS NOT DISTINCT FROM $fc$Her act-3 turn should hinge on the sister confrontation in Ch. 16 — thread the setup back through chapters 9–14.$fc$;
UPDATE onto_tasks SET description = $fc$Geography of the failures: which fall first, and why.$fc$ WHERE id = 'b0e5f8d2-d995-4c46-816e-8cee6ad5ae5e' AND title IS NOT DISTINCT FROM $fc$Map the northern wards$fc$ AND description IS NOT DISTINCT FROM $fc$Geography of the failures — which fall first and why.$fc$;
UPDATE onto_tasks SET description = $fc$Waiting on artist availability. Follow up Friday.$fc$ WHERE id = 'f088cded-d12b-4b05-ba04-7e7dd0db04b6' AND title IS NOT DISTINCT FROM $fc$Commission cover concept art$fc$ AND description IS NOT DISTINCT FROM $fc$Waiting on artist availability — follow up Friday.$fc$;
UPDATE onto_tasks SET title = $fc$Beta-reader pass: chapters 1–14$fc$ WHERE id = '2b06255a-2b92-4756-9124-e70ac29e5d51' AND title IS NOT DISTINCT FROM $fc$Beta-reader pass — chapters 1–14$fc$ AND description IS NOT DISTINCT FROM $fc$Assemble the packet: chapters, reader questions, content notes.$fc$;
UPDATE onto_tasks SET title = $fc$Writing block: draft Ch. 13$fc$, description = $fc$Two focused hours. Beats doc is ready. Start at the ferry scene.$fc$ WHERE id = 'e615cc17-23bb-49ad-a476-50e49d52bd83' AND title IS NOT DISTINCT FROM $fc$Writing block — draft Ch. 13$fc$ AND description IS NOT DISTINCT FROM $fc$Two focused hours. Beats doc is ready — start at the ferry scene.$fc$;
UPDATE onto_events SET title = $fc$Due: Beta-reader pass (chapters 1–14)$fc$ WHERE id = 'd6dae8c9-09a8-4b3b-b8c5-9ef18729a456' AND title IS NOT DISTINCT FROM $fc$Due: Beta-reader pass — chapters 1–14$fc$ AND description IS NOT DISTINCT FROM NULL;
UPDATE onto_events SET title = $fc$Writing block: draft Ch. 13$fc$ WHERE id = '0c1576bb-e7f1-42f6-94aa-814fa91e582a' AND title IS NOT DISTINCT FROM $fc$Writing block — draft Ch. 13$fc$ AND description IS NOT DISTINCT FROM NULL;
UPDATE onto_plans SET name = $fc$Revision pass: Act II$fc$ WHERE id = '7e172fdd-87a4-4607-a2dc-bd28cf362d39' AND name IS NOT DISTINCT FROM $fc$Revision pass — Act II$fc$ AND description IS NOT DISTINCT FROM $fc$Tighten pacing through chapters 9–16 and reconcile the magic-rule changes from v2.$fc$;
UPDATE onto_documents SET title = $fc$Magic system rules v2$fc$, content = $fc$# Magic system rules v2

## The ledger
Every ward-hour is paid in **memory**. Small wards take small things: a smell, a name. The great wards take years. Nothing is exempt, including the crown.

## The crown is the focus
Isolde was never the source. The crown accumulates the ledger's payments and spends them as wardlight. A fading queen means a **full crown**. That's the twist the Act I scenes have to stop contradicting.

## The mirror-gift
Maya doesn't cast. She **reflects**: any working done in her presence pays double or not at all. This is why the court exiled her, and why she's the only one who can stabilize the failure.

## What breaks when the queen fades
1. Border wards fail north-first (cold ground holds less charge).
2. The ledger keeps collecting, from whoever is nearest.
3. The crown starts choosing its own payments. That's Act III.$fc$ WHERE id = '575b8187-9fe8-4ea4-84e8-8085377e9ed0' AND title IS NOT DISTINCT FROM $fc$Magic system rules — v2$fc$ AND content IS NOT DISTINCT FROM $fc$# Magic system rules — v2

## The ledger
Every ward-hour is paid in **memory**. Small wards take small things — a smell, a name. The great wards take years. Nothing is exempt, including the crown.

## The crown is the focus
Isolde was never the source. The crown accumulates the ledger's payments and spends them as wardlight. A fading queen means a **full crown** — that's the twist the Act I scenes have to stop contradicting.

## The mirror-gift
Maya doesn't cast. She **reflects** — any working done in her presence pays double or not at all. This is why the court exiled her, and why she's the only one who can stabilize the failure.

## What breaks when the queen fades
1. Border wards fail north-first (cold ground holds less charge).
2. The ledger keeps collecting — from whoever is nearest.
3. The crown starts choosing its own payments. That's Act III.$fc$;
UPDATE onto_documents SET title = $fc$Ch. 13 beats$fc$, content = $fc$# Ch. 13 beats

1. Ferry crossing: Maya and the ledger-blind boy.
2. First on-page double-payment (her gift, witnessed).
3. Isolde's letter arrives *opened*. Someone at court is reading ahead.
4. Close on the northern beacon going dark.$fc$ WHERE id = '8b7543a0-b21b-44ac-823e-c16ce5135e87' AND title IS NOT DISTINCT FROM $fc$Ch. 13 — beats$fc$ AND content IS NOT DISTINCT FROM $fc$# Ch. 13 — beats

1. Ferry crossing — Maya and the ledger-blind boy.
2. First on-page double-payment (her gift, witnessed).
3. Isolde's letter arrives *opened*. Someone at court is reading ahead.
4. Close on the northern beacon going dark.$fc$;
UPDATE onto_documents SET title = $fc$Maya's character arc$fc$, content = $fc$# Maya's character arc

**Want:** to stay exiled. Exile is the only place her gift can't hurt anyone.
**Need:** to learn the ledger never stopped collecting from her. Distance was never protection.

## Act beats
- **Act I:** refuses the summons twice. Comes for the funeral, not the crown.
- **Act II:** the northern wards fall while she's in the room, and hold for one night. She can't leave after that. *(Current problem: her staying reads as plot necessity, not choice. Thread the sister debt from Ch. 9 forward.)*
- **Act III:** offers the crown her whole ledger. Isolde refuses to let her pay it.$fc$ WHERE id = '2d002918-9299-4dd8-9ff2-c1efa546180b' AND title IS NOT DISTINCT FROM $fc$Maya — character arc$fc$ AND content IS NOT DISTINCT FROM $fc$# Maya — character arc

**Want:** to stay exiled. Exile is the only place her gift can't hurt anyone.
**Need:** to learn the ledger never stopped collecting from her — distance was never protection.

## Act beats
- **Act I:** refuses the summons twice. Comes for the funeral, not the crown.
- **Act II:** the northern wards fall while she's in the room — and hold, for one night. She can't leave after that. *(Current problem: her staying reads as plot necessity, not choice. Thread the sister debt from Ch. 9 forward.)*
- **Act III:** offers the crown her whole ledger. Isolde refuses to let her pay it.$fc$;
UPDATE onto_documents SET title = $fc$Ch. 12 opening rewrite notes$fc$, content = $fc$# Ch. 12 opening rewrite

Old opening: council recap (summary, no pressure). New opening: the granary ward fails **mid-sentence** during the tithe count. Wardlight behaves like weather now. That's the promise of the chapter.

Keep: the steward's joke. It lands harder when the lights go out under it.$fc$ WHERE id = 'bf82a4d6-88ec-4489-82df-bceddd1cb42e' AND title IS NOT DISTINCT FROM $fc$Ch. 12 — opening rewrite notes$fc$ AND content IS NOT DISTINCT FROM $fc$# Ch. 12 — opening rewrite

Old opening: council recap (summary, no pressure). New opening: the granary ward fails **mid-sentence** during the tithe count. Wardlight behaves like weather now — that's the promise of the chapter.

Keep: the steward's joke. It lands harder when the lights go out under it.$fc$;
UPDATE onto_documents SET title = $fc$Queen Isolde's motive$fc$, content = $fc$# Queen Isolde's motive

The throne is cover. Everything she's done since the coronation, including the exile, was to keep the crown from ever choosing **Maya** as a payment source.

She would rather the kingdom fall than the ledger touch her sister. Act III asks whether that's love or another kind of theft.$fc$ WHERE id = 'd34a7384-4221-4869-92cb-e7f4ebb51d30' AND title IS NOT DISTINCT FROM $fc$Queen Isolde — motive$fc$ AND content IS NOT DISTINCT FROM $fc$# Queen Isolde — motive

The throne is cover. Everything she's done since the coronation — including the exile — was to keep the crown from ever choosing **Maya** as a payment source.

She would rather the kingdom fall than the ledger touch her sister. Act III asks whether that's love or another kind of theft.$fc$;
UPDATE onto_documents SET title = $fc$Fading Crown project context$fc$, content = $fc$# Fading Crown

<!-- managed:status v=1 -->
**State:** active
**Now:** 8 open tasks · 1 overdue · next milestone Full draft to beta readers (2026-09-18)
**Next step:** Complete Chapter 13 draft during your Thursday writing block.
_Last refreshed 2026-08-08T21:41:05.147Z from project snapshot._
<!-- /managed:status -->

## Premise
Queen Isolde's magic is fading, and the crown, not the queen, was the focus all along. Her estranged sister Maya carries the mirror-gift that could stabilize the wards, if the two can stand in the same room long enough to try.

## Where this is right now
Act I is locked. Act II revision pass is underway. The magic-system v2 rules landed, and Ch. 12's opening was rewritten to put the ward-failure on the page instead of in summary. Current thread: Maya's motivation through the middle chapters.

## Decisions
- **Magic has a ledger.** Every ward-hour is paid in memory. No exceptions, including the queen.
- **Act III hinges on the sister.** Isolde's motive is protecting Maya, not the throne.
- **Beta readers after Ch. 14.** The three-chapter sampler goes to the critique group first.

## Open questions
- Does Maya learn the ledger rule before or after the northern wards fall?
- Keep the prologue, or fold it into Ch. 2?

<!-- managed:map v=1 -->
## Where the detail lives
- Magic system rules v2 [id: 575b8187-9fe8-4ea4-84e8-8085377e9ed0]
- Maya's character arc [id: 2d002918-9299-4dd8-9ff2-c1efa546180b]
- Queen Isolde's motive [id: d34a7384-4221-4869-92cb-e7f4ebb51d30]
- Chapter notes [id: c040e375-5da3-451d-9bd8-14e5d5862cee]
- Ch. 12 opening rewrite notes [id: bf82a4d6-88ec-4489-82df-bceddd1cb42e]
- Ch. 13 beats [id: 8b7543a0-b21b-44ac-823e-c16ce5135e87]
- Beta reader shortlist [id: ed68610e-b3d7-4056-bd03-5d4c3679a641]
_(Auto-generated from the project knowledge map. Use get_document_outline, then read_document_section to drill in.)_
<!-- /managed:map -->$fc$ WHERE id = '79cb7aad-09a3-4455-8dc4-1a011d804835' AND title IS NOT DISTINCT FROM $fc$Fading Crown — project context$fc$ AND content IS NOT DISTINCT FROM $fc$# Fading Crown

<!-- managed:status v=1 -->
**State:** active
**Now:** 8 open tasks · 1 overdue · next milestone Full draft to beta readers (2026-09-18)
**Next step:** Complete Chapter 13 draft during your Thursday writing block.
_Last refreshed 2026-08-08T21:41:05.147Z from project snapshot._
<!-- /managed:status -->

## Premise
Queen Isolde's magic is fading — and the crown, not the queen, was the focus all along. Her estranged sister Maya carries the mirror-gift that could stabilize the wards, if the two can stand in the same room long enough to try.

## Where this is right now
Act I is locked. Act II revision pass is underway — the magic-system v2 rules landed, and Ch. 12's opening was rewritten to put the ward-failure on the page instead of in summary. Current thread: Maya's motivation through the middle chapters.

## Decisions
- **Magic has a ledger.** Every ward-hour is paid in memory. No exceptions, including the queen.
- **Act III hinges on the sister.** Isolde's motive is protecting Maya, not the throne.
- **Beta readers after Ch. 14** — three-chapter sampler goes to the critique group first.

## Open questions
- Does Maya learn the ledger rule before or after the northern wards fall?
- Keep the prologue, or fold it into Ch. 2?

<!-- managed:map v=1 -->
## Where the detail lives
- Magic system rules — v2 [id: 575b8187-9fe8-4ea4-84e8-8085377e9ed0]
- Maya — character arc [id: 2d002918-9299-4dd8-9ff2-c1efa546180b]
- Queen Isolde — motive [id: d34a7384-4221-4869-92cb-e7f4ebb51d30]
- Chapter notes [id: c040e375-5da3-451d-9bd8-14e5d5862cee]
- Ch. 12 — opening rewrite notes [id: bf82a4d6-88ec-4489-82df-bceddd1cb42e]
- Ch. 13 — beats [id: 8b7543a0-b21b-44ac-823e-c16ce5135e87]
- Beta reader shortlist [id: ed68610e-b3d7-4056-bd03-5d4c3679a641]
_(Auto-generated from the project knowledge map. Use get_document_outline, then read_document_section to drill in.)_
<!-- /managed:map -->$fc$;
UPDATE onto_project_logs SET after_data = $fc${"description": "Fantasy novel. Queen Isolde is losing her magic as the wards that protect her kingdom fail. Working toward a complete first draft for beta readers.", "name": "Fading Crown", "state_key": "active", "type_key": "project.creative.book"}$fc$::jsonb WHERE id = '4175fb59-2cd5-4ff9-95b7-d7df8225334f';
UPDATE onto_project_logs SET after_data = $fc${"description": "Tighten pacing through chapters 9–16 and reconcile the magic-rule changes from v2.", "name": "Revision pass: Act II", "state_key": "draft", "type_key": "plan.default"}$fc$::jsonb WHERE id = 'eddec043-ff33-49c7-a6d0-2e46179290d5';
UPDATE onto_project_logs SET after_data = $fc${"description": "The ledger, the wards, the crown-as-focus. See the rules doc.", "state_key": "done", "title": "Magic system v2: write the hard rules", "type_key": "task.default"}$fc$::jsonb WHERE id = '88b2be14-2094-4db9-bfde-9cf22bce4567';
UPDATE onto_project_logs SET after_data = $fc${"description": "Two focused hours. Beats doc is ready. Start at the ferry scene.", "state_key": "todo", "title": "Writing block: draft Ch. 13", "type_key": "task.default"}$fc$::jsonb WHERE id = 'd15b03b4-1700-4a8e-a5fc-a3f4dd021cb5';
UPDATE onto_project_logs SET after_data = $fc${"description": "Her act-3 turn should hinge on the sister confrontation in Ch. 16. Thread the setup back through chapters 9–14.", "state_key": "in_progress", "title": "Reconcile Maya's motivation in Act II", "type_key": "task.default"}$fc$::jsonb WHERE id = 'b62ec4fb-8173-4516-9468-301d3be68664';
UPDATE onto_project_logs SET after_data = $fc${"description": "Assemble the packet: chapters, reader questions, content notes.", "state_key": "todo", "title": "Beta-reader pass: chapters 1–14", "type_key": "task.default"}$fc$::jsonb WHERE id = 'e4a8773d-cb1b-4514-a73f-34f84aaec6f9';
UPDATE onto_project_logs SET after_data = $fc${"description": "Geography of the failures: which fall first, and why.", "state_key": "todo", "title": "Map the northern wards", "type_key": "task.default"}$fc$::jsonb WHERE id = '9049c82f-3099-4919-bd95-1bc26aa624f2';
UPDATE onto_project_logs SET after_data = $fc${"description": "Waiting on artist availability. Follow up Friday.", "state_key": "blocked", "title": "Commission cover concept art", "type_key": "task.default"}$fc$::jsonb WHERE id = '171e44a5-f564-44c8-8ac4-04d2bdb0406a';
UPDATE onto_project_logs SET after_data = $fc${"state_key": "draft", "title": "Fading Crown project context", "type_key": "document.context.project"}$fc$::jsonb WHERE id = '8f34ebc9-4106-4964-b5f6-9bcd2db7c5d1';
UPDATE onto_project_logs SET after_data = $fc${"description": null, "state_key": "draft", "title": "Magic system rules v2", "type_key": "document.default"}$fc$::jsonb WHERE id = '5caa86eb-4cba-4d94-8fb5-33feb36bf6bc';
UPDATE onto_project_logs SET after_data = $fc${"description": null, "state_key": "draft", "title": "Maya's character arc", "type_key": "document.default"}$fc$::jsonb WHERE id = '384e14e7-6861-4d20-a197-9677e0f5c161';
UPDATE onto_project_logs SET after_data = $fc${"description": null, "state_key": "draft", "title": "Queen Isolde's motive", "type_key": "document.default"}$fc$::jsonb WHERE id = '486cb9c6-f3d1-48ef-a497-0acdfc0d8d46';
UPDATE onto_project_logs SET after_data = $fc${"description": null, "state_key": "draft", "title": "Ch. 12 opening rewrite notes", "type_key": "document.default"}$fc$::jsonb WHERE id = '7263b310-09b2-4b73-8259-5b8662d27169';
UPDATE onto_project_logs SET after_data = $fc${"description": null, "state_key": "draft", "title": "Ch. 13 beats", "type_key": "document.default"}$fc$::jsonb WHERE id = '9e073c4f-2965-433d-a74c-200089fd8bbd';
UPDATE onto_project_logs SET after_data = $fc${"end_at": "2026-08-24T16:37:30.071+00:00", "owner_entity_id": "2b06255a-2b92-4756-9124-e70ac29e5d51", "owner_entity_type": "task", "project_id": "e81e7114-b6f7-4013-8052-13c792b6fdc5", "start_at": "2026-08-24T16:07:30.071+00:00", "state_key": "scheduled", "title": "Due: Beta-reader pass (chapters 1–14)", "type_key": "event.task_work"}$fc$::jsonb WHERE id = '8a211e0f-e4cf-4ba5-852c-67941b8fb015';
UPDATE onto_project_logs SET after_data = $fc${"due_at": "2026-08-24T16:37:30.071+00:00", "props": {"description": "Assemble the packet: chapters, reader questions, content notes."}, "start_at": null, "state_key": "todo", "title": "Beta-reader pass: chapters 1–14"}$fc$::jsonb, before_data = $fc${"due_at": "2026-08-17T16:37:30.071+00:00", "props": {"description": "Assemble the packet: chapters, reader questions, content notes."}, "start_at": null, "state_key": "todo", "title": "Beta-reader pass: chapters 1–14"}$fc$::jsonb WHERE id = '0eb73fc1-dbc1-49cf-8c2a-6909ee4612cb';
UPDATE onto_project_logs SET after_data = $fc${"end_at": "2026-08-13T16:00:00+00:00", "owner_entity_id": "e615cc17-23bb-49ad-a476-50e49d52bd83", "owner_entity_type": "task", "project_id": "e81e7114-b6f7-4013-8052-13c792b6fdc5", "start_at": "2026-08-13T14:00:00+00:00", "state_key": "scheduled", "title": "Writing block: draft Ch. 13", "type_key": "event.task_work"}$fc$::jsonb WHERE id = '2bf0086c-19fe-4c53-9737-9dd1d6c2eab7';
UPDATE onto_project_logs SET after_data = $fc${"due_at": "2026-08-13T16:00:00+00:00", "props": {"description": "Two focused hours. Beats doc is ready. Start at the ferry scene."}, "start_at": "2026-08-13T14:00:00+00:00", "state_key": "todo", "title": "Writing block: draft Ch. 13"}$fc$::jsonb, before_data = $fc${"due_at": "2026-08-11T20:00:00+00:00", "props": {"description": "Two focused hours. Beats doc is ready. Start at the ferry scene."}, "start_at": "2026-08-11T18:00:00+00:00", "state_key": "todo", "title": "Writing block: draft Ch. 13"}$fc$::jsonb WHERE id = '44c1d4a0-5187-42b6-bf93-070dc458fb8f';
UPDATE onto_tasks SET due_at = due_at + interval '91 days', start_at = start_at + interval '91 days' WHERE project_id = 'e81e7114-b6f7-4013-8052-13c792b6fdc5' AND deleted_at IS NULL AND (due_at IS NOT NULL OR start_at IS NOT NULL);
UPDATE onto_tasks SET due_at = '2026-11-06 16:37:30+00' WHERE id = 'e3a15a49-4f0f-49a0-93a4-a0dcd6a25a0c';
UPDATE onto_events SET start_at = start_at + interval '91 days', end_at = end_at + interval '91 days' WHERE project_id = 'e81e7114-b6f7-4013-8052-13c792b6fdc5' AND deleted_at IS NULL;
UPDATE onto_milestones SET due_at = due_at + interval '91 days' WHERE project_id = 'e81e7114-b6f7-4013-8052-13c792b6fdc5' AND deleted_at IS NULL AND due_at IS NOT NULL;
UPDATE onto_milestones SET due_at = '2026-11-07 16:37:30+00' WHERE id = '58656f20-77ae-424d-a74d-03e7dbdb926e';
UPDATE onto_goals SET target_date = target_date + interval '91 days' WHERE project_id = 'e81e7114-b6f7-4013-8052-13c792b6fdc5' AND deleted_at IS NULL AND target_date IS NOT NULL;
UPDATE onto_project_logs SET created_at = created_at + ((now() - interval '12 minutes') - (SELECT max(created_at) FROM onto_project_logs WHERE project_id = 'e81e7114-b6f7-4013-8052-13c792b6fdc5')) WHERE project_id = 'e81e7114-b6f7-4013-8052-13c792b6fdc5';
SELECT 'dashes_left' AS check,
 (SELECT count(*) FROM onto_tasks WHERE project_id='e81e7114-b6f7-4013-8052-13c792b6fdc5' AND deleted_at IS NULL AND (title||coalesce(description,'')) LIKE '%—%')
 + (SELECT count(*) FROM onto_events WHERE project_id='e81e7114-b6f7-4013-8052-13c792b6fdc5' AND deleted_at IS NULL AND (title||coalesce(description,'')) LIKE '%—%')
 + (SELECT count(*) FROM onto_documents WHERE project_id='e81e7114-b6f7-4013-8052-13c792b6fdc5' AND deleted_at IS NULL AND (title||coalesce(content,'')) LIKE '%—%')
 + (SELECT count(*) FROM onto_plans WHERE project_id='e81e7114-b6f7-4013-8052-13c792b6fdc5' AND deleted_at IS NULL AND (name||coalesce(description,'')) LIKE '%—%')
 + (SELECT count(*) FROM onto_projects WHERE id='e81e7114-b6f7-4013-8052-13c792b6fdc5' AND (name||coalesce(description,'')) LIKE '%—%') AS n,
 (SELECT count(*) FROM onto_project_logs WHERE project_id='e81e7114-b6f7-4013-8052-13c792b6fdc5' AND coalesce(after_data::text,'') LIKE '%—%') AS logs_with_dash,
 (SELECT max(created_at) FROM onto_project_logs WHERE project_id='e81e7114-b6f7-4013-8052-13c792b6fdc5') AS newest_log,
 (SELECT string_agg(title||' '||to_char(due_at,'Mon DD'), '; ' ORDER BY due_at) FROM onto_tasks WHERE project_id='e81e7114-b6f7-4013-8052-13c792b6fdc5' AND due_at IS NOT NULL) AS task_dates;
COMMIT;
