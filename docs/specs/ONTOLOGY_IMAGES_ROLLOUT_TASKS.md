<!-- docs/specs/ONTOLOGY_IMAGES_ROLLOUT_TASKS.md -->

# Ontology Images Rollout Tasks

Last updated: 2026-02-19

## 1. Deployment order

1. Deploy DB migrations:

- `supabase/migrations/20260426000000_add_ontology_assets_with_ocr.sql`
- `supabase/migrations/20260426000001_add_images_to_onto_search_entities.sql`

2. Deploy web API + UI.
3. Deploy worker with `extract_onto_asset_ocr` processor enabled.

## 2. Smoke checks after deploy

1. Create image asset via `POST /api/onto/assets` and upload object to signed URL.
2. Finalize with `POST /api/onto/assets/:id/complete`.
3. Confirm OCR transition `pending -> processing -> complete` in `onto_assets`.
4. Confirm render redirect works via `GET /api/onto/assets/:id/render`.
5. Confirm attach/unlink to task/document via link routes.
6. Confirm manual OCR edit persists via `PATCH /api/onto/assets/:id/ocr`.

## 3. Monitoring

Track daily for first 7 days:

1. OCR failure rate:

```sql
select
  date_trunc('day', created_at) as day,
  count(*) filter (where ocr_status = 'failed') as failed_count,
  count(*) as total_count,
  round(
    100.0 * count(*) filter (where ocr_status = 'failed') / nullif(count(*), 0),
    2
  ) as failed_pct
from onto_assets
where deleted_at is null
group by 1
order by 1 desc;
```

2. Stuck OCR jobs (`pending`/`processing` older than 30 minutes):

```sql
select id, project_id, ocr_status, updated_at
from onto_assets
where deleted_at is null
  and ocr_status in ('pending', 'processing')
  and updated_at < now() - interval '30 minutes'
order by updated_at asc
limit 100;
```

3. Render failures from API logs:

- endpoint: `/api/onto/assets/:id/render`
- status >= 500
- segment by `project_id` and `asset_id`

## 4. Follow-up ticket backlog

1. Expand `onto_asset_links.entity_kind` support for non-MVP entities (`plan`, `goal`, `risk`, `milestone`) in UI affordances.
2. Add thumbnail/derivative generation pipeline for faster list rendering.
3. Add OCR provider abstraction and confidence threshold-based reprocess queueing.
4. Add agent tool for direct image detail retrieval by asset id.
