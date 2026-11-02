# Backlog

Deferred work, most important first. Round docs and lessons point here instead of silently cutting
scope. Move an item to a GitHub issue only when the tracker is adopted.

| Item                                           | Why deferred                                                                       | Revisit when                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| V2 UI, Tier 3 round and UI tester              | No UI exists yet                                                                   | The first UI lands; re-enable the mock gate and tester together |
| Per-officer authorization                      | v1 uses one shared bearer token; `X-Actor-Id` is audit only                        | Officers need scoped access                                     |
| Shepherding cadence and overdue flags          | Policy differs per church; the API exposes `lastCalledOn` and `membersNeverCalled` | A reporting UI or a cadence rule is agreed                      |
| Bulk assignment                                | One member per request keeps the consent gate simple                               | A UI needs multi-select assignment                              |
| Notifications (email/SMS)                      | Out of v1                                                                          | A delivery provider and consent model exist                     |
| Vercel project link and production environment | No Vercel team scope; `DATABASE_URL` and `API_BEARER_TOKEN` are not provisioned    | Vercel access is available                                      |
| Coverage threshold                             | A number without a policy invites gaming                                           | The owner sets a target                                         |
