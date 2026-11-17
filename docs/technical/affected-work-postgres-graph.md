# Affected work and how the Postgres graph is queried

The prototype starts with one task and returns open tasks downstream of its recorded dependencies. It is read-only: it does not reschedule tasks or infer dependencies from their descriptions. Open a task in the desktop reader or task edit modal and expand **Affected work**. The section fetches only when opened; changing the step limit reruns the query.

## Graphs still have records

A node is an entity. A relationship, also called an edge, connects two entities and says what the connection means. In BuildOS, a task node is an ordinary `onto_tasks` row. A relationship is an ordinary `onto_edges` row. A graph is the shape those records form, not a requirement to abandon tables.

For a small example, let A be Approve design, B Build checkout, and C Test checkout:

| Stored source | Relationship | Stored destination | Meaning                             |
| ------------- | ------------ | ------------------ | ----------------------------------- |
| B             | depends_on   | A                  | Build checkout needs Approve design |
| C             | depends_on   | B                  | Test checkout needs Build checkout  |

Those stored arrows point from dependent to prerequisite: `C → B → A`. The impact question walks in the opposite direction: changing A can affect B, then C. A `blocks` relationship has the reverse storage convention: `A blocks B` is already pointing in the impact direction.

The database does not discover the meaning of a sentence. The UI or agent supplies a structured relationship such as `depends_on`, with real entity IDs. The existing write gateway validates the operation. A reference link or similar wording in two task descriptions does not establish a dependency.

## Storing a relationship

This is the underlying row shape; parameters represent real UUIDs:

```sql
-- $1 = project ID, $2 = B's ID, $3 = A's ID
INSERT INTO public.onto_edges
  (project_id, src_kind, src_id, rel, dst_kind, dst_id)
VALUES
  ($1, 'task', $2, 'depends_on', 'task', $3);
```

Application writes should continue through BuildOS's existing authorized gateway and atomic edge operation. The prototype only reads these rows. No new node table, duplicate graph store, or embedding is required.

## One step is an ordinary join

To find tasks that directly depend on the selected task:

```sql
-- $1 = selected task ID, $2 = its authorized project ID
SELECT dependent.id, dependent.title
FROM public.onto_edges edge
JOIN public.onto_tasks dependent
  ON dependent.id = edge.src_id
 AND dependent.project_id = edge.project_id
WHERE edge.dst_id = $1
  AND edge.project_id = $2
  AND edge.src_kind = 'task'
  AND edge.dst_kind = 'task'
  AND edge.rel = 'depends_on'
  AND dependent.deleted_at IS NULL
  AND dependent.archived_at IS NULL
  AND dependent.completed_at IS NULL
  AND dependent.state_key IN ('todo', 'in_progress', 'blocked');
```

The key join is `dependent.id = edge.src_id`. The key filter is `edge.dst_id = selected_task_id`. Existing endpoint indexes help find these edges without loading all project content. The authenticated database session retains row-level security; the shipped function additionally checks membership and the source/project visibility.

## More steps repeat the join

Postgres can express repeated traversal with `WITH RECURSIVE`. This teaching query handles `depends_on` only and retains all simple paths up to the depth limit. It is not the bounded implementation shipped by the prototype:

```sql
WITH RECURSIVE walk AS (
  SELECT t.id, t.project_id, 0 AS distance, ARRAY[t.id] AS path
  FROM public.onto_tasks t
  WHERE t.id = $1 AND t.project_id = $2
    AND t.deleted_at IS NULL AND t.archived_at IS NULL

  UNION ALL

  SELECT next_task.id, w.project_id, w.distance + 1,
         w.path || next_task.id
  FROM walk w
  JOIN public.onto_edges e
    ON e.dst_id = w.id AND e.project_id = w.project_id
   AND e.src_kind = 'task' AND e.dst_kind = 'task'
   AND e.rel = 'depends_on'
  JOIN public.onto_tasks next_task
    ON next_task.id = e.src_id
   AND next_task.project_id = w.project_id
  WHERE w.distance < $3
    AND NOT next_task.id = ANY(w.path)
    AND next_task.deleted_at IS NULL
    AND next_task.archived_at IS NULL
    AND next_task.completed_at IS NULL
    AND next_task.state_key IN ('todo', 'in_progress', 'blocked')
)
SELECT id, MIN(distance) AS distance
FROM walk
WHERE distance > 0
GROUP BY id
ORDER BY distance, id;
```

The first SELECT starts the walk. The second SELECT finds the next layer. `distance` counts links, and `path` prevents a cycle from revisiting a task on that path. The final SELECT combines duplicates reached by different routes. [Postgres recursive-query documentation](https://www.postgresql.org/docs/current/queries-with.html).

Cycle prevention alone does not bound the number of alternative paths in a dense graph. The prototype therefore uses a breadth-first loop inside Postgres, retaining each task once globally and one shortest explanation path. This avoids enumerating all paths just to discard most of them afterward.

## What the prototype actually executes

The exact function is in [the migration](/Users/djwayne/buildos-platform/supabase/migrations/20261116205351_task_affected_work.sql). Each loop expands the current frontier using this relationship pattern:

```sql
-- f.id is one task in the current layer.
-- Both arms also filter project_id and task endpoint kinds in the real query.
SELECT edge.id, edge.rel, edge.src_id AS next_id
FROM public.onto_edges edge
WHERE edge.dst_id = f.id
  AND edge.rel IN ('depends_on', 'requires', 'blocked_by', 'builds_on')

UNION ALL

SELECT edge.id, edge.rel, edge.dst_id AS next_id
FROM public.onto_edges edge
WHERE edge.src_id = f.id AND edge.rel = 'blocks';
```

The outer query joins `next_id` to live tasks in the same project, excludes already-visited IDs, and selects one stable path per newly reached task. `blocked_by` and `builds_on` are explicit legacy relationship tokens, not language interpretation. Each returned task includes its distance, task-title path, edge IDs, and stored relationship types.

Limits are enforced in the function:

- Default three steps, selectable from one through six.
- Default 50 affected tasks, hard maximum 100.
- One shortest path per task, deterministic tie-breaking by IDs.
- Completed, cancelled, archived, and deleted tasks stop expansion.
- Only current, unmerged, unarchived projects accessible through membership.
- One extra layer/candidate checks whether the result really omits eligible work. Exact exhaustion of the graph is not mislabeled as truncation.

These limits bound retained traversal state and visited tasks. A high-degree node can still require scanning many candidate edges; production latency must be measured on representative data. A partial result is labeled partial, and an empty result says that no recorded downstream dependencies were found.

## Making it dynamic

The SQL stays fixed. The selected task and limits change as typed parameters:

```ts
const { data, error } = await supabase.rpc('onto_task_affected_work', {
	p_task_id: selectedTaskId,
	p_max_depth: 3,
	p_max_tasks: 50
});
```

That is one request from the application; the repeated joins happen inside Postgres. The browser calls [the authenticated endpoint](/Users/djwayne/buildos-platform/apps/web/src/routes/api/onto/tasks/[id]/affected-work/+server.ts), which validates the UUID and limits and uses the caller's session client. It never constructs SQL by concatenating input. [Supabase RPC reference](https://supabase.com/docs/reference/javascript/rpc).

The frontend sends `GET /api/onto/tasks/<id>/affected-work?max_depth=3&max_tasks=50`. Selecting another task changes `<id>`; choosing another step limit changes `max_depth`. Late responses from a previously selected task are ignored.

Later, an upstream query could reverse these directions, or a goal-support query could use `supports_goal`. Those are explicit query modes with validated relationship types and separate semantics. The first prototype deliberately exposes only downstream task dependencies.

## What a dedicated graph query looks like

For comparison, Neo4j's Cypher can describe a path directly. Given the same dependent-to-prerequisite storage convention:

```cypher
MATCH p = (affected:Task)-[:DEPENDS_ON*1..6]->(start:Task {id: $taskId})
WHERE length(p) <= $maxDepth
RETURN affected.id AS id, min(length(p)) AS distance
ORDER BY distance, id
LIMIT $maxTasks
```

The pattern asks for tasks that reach the selected task through one to six dependency links. The fixed six-step ceiling is in the query; the smaller requested depth and result count are parameters. A real implementation would also enforce scope, lifecycle visibility, and traversal budgets. This is illustrative Cypher, not the language used by Omnigraph or by this prototype. [Cypher path documentation](https://neo4j.com/docs/cypher-manual/current/patterns/variable-length-paths/).

Graph databases make nodes, relationships, and traversal central to their query model. Postgres represents the same connections with rows and indexed joins. For this feature, both can answer the question; BuildOS can start with the tables and access controls it already owns.

## Prototype validation and rollout status

Validated locally on November 16, 2026:

- 18 focused UI/API tests passed, covering lazy loading, stale-response cancellation, retry, partial results, parameter validation, and authenticated RPC calls.
- The full web Svelte check passed with zero errors and warnings; targeted lint and formatting checks passed.
- The new migration passed rehearsal against a production-schema snapshot, including the SQL graph fixture, all four standing checks, and the role comparison. The role comparison retained one pre-existing anonymous read failure; authenticated reads had zero failures before and after.
- The SQL fixture exercises dependency direction, shortest paths, diamonds, cycles, limits, exact exhaustion, lifecycle visibility, project membership, cross-project edge rejection, and execution grants.

The migration has **not** been applied to a hosted database. The UI needs this migration before its endpoint can return results. No live model tests or production latency measurements were run. Browser rendering was not inspected; the repository's browser harness remains paused at the user's request.
