<!-- docs/marketing/social-media/discovery/README.md -->

# Social Discovery

This folder holds top-of-funnel discovery queues for social relationship building.

Discovery is upstream of warmup:

1. Discover new people and accounts.
2. Score them.
3. Create or update profile memory.
4. Hand off the best candidates to a platform warmup.
5. Log real touches and reactions in the comment ledger.

Do not treat discovery as an engagement action. Discovery is read-only.

## Platform Folders

- `instagram/` - Instagram discovery queue, search terms, and scan notes

## Relationship To Other Files

- `../instagram-profiles/` stores account-level relationship memory.
- `../people/` stores cross-platform person records.
- `../daily-engagement/` stores dated warmup and reply working docs.
- `../comment-log.md` stores the cross-run touchpoint ledger.

## Promotion Rule

A discovered account moves forward only when it has a concrete next action:

- inspect a specific post in warmup
- mine a specific comment thread
- create or refresh a profile
- monitor for a later opening
- skip with a durable reason
