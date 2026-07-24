# Decision — Gmail Relevance Phase A, Slice 4 Review Context

**Decision date:** 2026-07-24  
**Status:** Implemented locally; production activation remains default-off  
**Applies to:** The exact-user, human-only Slice 4 review surface

## Decision

Use a request-lifetime metadata re-fetch for one explicitly opened review sample. Do not create a
review cache.

The review action may request one Gmail message with `format=metadata` and return only the
normalized fields needed for a human decision:

- subject, limited and sanitized by the existing metadata normalizer;
- Gmail snippet, limited and sanitized by the existing metadata normalizer;
- normalized participant addresses;
- internal date; and
- the fixed inbox/sent category booleans.

The action must not request or return a body payload, raw MIME, attachments, arbitrary headers,
provider identifiers, raw labels, Gmail URLs, query strings, access tokens, or page cursors.

## Lifetime and output boundary

- The metadata is fetched only after an explicit `Open metadata` POST for one opaque sample ID.
- The route sets `Cache-Control: private, no-store`, `Pragma: no-cache`, and `Referrer-Policy:
no-referrer`.
- The metadata is returned only in that form-action response and is discarded when the reviewer
  records a decision or navigates away.
- No mailbox-derived string is written to a review table, log, error, metric, trace, analytics
  event, queue payload, or model request.
- Browser analytics already runs with autocapture and session recording disabled. The review
  implementation emits no manual analytics event.

## Authorization and provider boundary

- Review has independent default-off environment variables and an exact-user allowlist. Enabling
  review does not enable the Slice 3 scan route.
- Every list, prepare, open, and adjudicate request derives the user from the authenticated
  session and rechecks the review allowlist.
- Opening a sample revalidates run, sample, observation, project, connection, retention, Gmail read
  capability, active credential, and read-only scope ownership.
- The existing gateway performs exactly one `users.messages.get` call for the opened sample and
  reauthorizes immediately before the provider call.

## Rejected alternative

An encrypted short-lived review cache was rejected for Slice 4. It would add a second sensitive
retention system without improving the one-reviewer pilot enough to justify its schema,
encryption, purge, and leak-review surface.

## Consequences

Review requires a live read-only Gmail connection for each opened sample. A disconnected account,
expired source row, timeout, or provider rejection fails closed with a fixed error. The sample can
be marked ambiguous when the allowed metadata is insufficient; this decision does not authorize a
body fetch.
