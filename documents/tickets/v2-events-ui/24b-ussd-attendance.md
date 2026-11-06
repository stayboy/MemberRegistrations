# 24b: USSD attendance, codes and clocking

**Tier:** 2

**What to build:** The attendance domain of the USSD tree: today/day/period status, one-time codes, the
anonymous registration request, presbyter clocking with delegation and the member profile aggregate with
attendance regularity. (The operator's headcount seam initially shipped here was corrected on
2026-11-05 and lands in 24d; see **Correction** below.)

**Blocked by:** 24a. Migration **0014** (`members.presbyter_rank`, `attendance_codes`,
`registration_requests`, `clocking_delegations`, `event_session_expected`, superseded by the 24d
correction) and the bearer seams for code
issuance/list/void, registration request list/approve/reject, delegation, the
windowed attendance summary and the profile aggregate are authorised for this round by the owner
(2026-11-05). Code redemption and registration-request creation stay inside `POST /ussd/session`; no
new bearer route is added for them.

**Status:** ready-for-agent

- [ ] The member menu gains **My Profile**, and the anonymous menu gains **Register**; both menus gain
      **Activities** and **Attendance**, each opening its primary content with `9`, `0` and `00`.
- [ ] Attendance opens today's status; `1` a day, `2` a period (month, quarter, year), `3` I was present
      (code) and, for presbyters, `4` clocking. Checks never fabricate an absence and ignore
      headcount-only events (`tracksMembers = false`).
- [ ] Summaries render a count and a per-event list, latest event first, from one member-scoped
      aggregate; a headcount-only event is listed in Activities with its current headcount and takes no
      per-member attendance.
- [ ] An admin issues a six-digit CSPRNG code against one event session with a purpose
      (`attendance_punch` or `registration`), a 15-minute TTL and single use; only an HMAC-SHA-256 hash
      under `USSD_CODE_PEPPER` is stored and the plain code is shown once.
- [ ] A valid `attendance_punch` code records attendance for that member and session; expired, used,
      voided, wrong-session and unknown codes are refused, and five failed attempts per phone in 15
      minutes answer "Too many attempts" without revealing whether the code exists.
- [ ] A `registration` code plus first and last name creates a pending registration request tied to the
      session and code and returns a reference; no member row exists until the back office approves with
      the immutable member number. Reject leaves no member.
- [ ] Any presbyter may clock in a member they actively shepherd; a senior presbyter (`presbyter_rank`
      non-null) may clock in any member for a session, and must delegate first when not recorded present
      themselves. A delegation names the grantor, delegate, session and reason and ends with the session.
- [ ] (superseded 2026-11-05) The headcount seam is corrected in 24d: `event_session_headcounts` with
      mode/buckets/`asOf`/`supersedesId` replaces `event_session_expected`; the pair
      `GET`/`POST /v1/events/{eventId}/headcounts` replaces `/expected`. The register-derived `expected` keeps its
      wire name and is labelled **Roster**.
- [ ] `GET /v1/members/{memberNo}/profile` returns the identity parts, member number, up to three
      ministries, the shepherd and the attendance regularity over the last five tracked held sessions,
      with the join-date and ministry-assignment floors; a presbyter-only session is dropped for a
      non-presbyter. The USSD profile shows the shared identity label and never repeats a separate
      gender/age line.
- [ ] `USSD_CODE_PEPPER` is production-required with a dev/test default and a startup error when a default
      survives in production.
- [ ] Tests cover code issuance/use/void/expiry/attempts, registration approve/reject, delegation rules,
      headcounts, the profile aggregate floors and the exact USSD screens.

**Correction (2026-11-05):** the operator's figure is a **headcount** (actual counted attendance), not an
"expected" figure. The headcount table/route, the Activities eligibility filter and ordering (three
events, ministry priority, presbyter-only visibility, the zero-events-today next-events prompt), and the
`presbyterOnly` flag land in 24d, which also removes `/expected`. The wire's register-derived `expected`
stays and is labelled **Roster**.

**Out of scope:** welfare products and claims (24c), the admin portal and simulator (24d), complaints
(24e).
