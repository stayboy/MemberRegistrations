import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { isUnauthorized } from '../api/errors';
import { getMember, getMemberShepherding, type Gender } from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { isFollowUpEligible } from '../format/follow-up';

/** The officer the API would record when the pledge's officer field is left empty. */
export interface FollowUpShepherd {
  readonly memberNo: string;
  readonly name: string;
  readonly gender: Gender;
  readonly age: number | null;
}

/**
 * `idle` — no member picked yet; `loading` — a read is in flight; `ready` — the summary was read;
 * `error` — a read failed, so the default is unknown and the officer is required.
 */
export type FollowUpDefaultStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FollowUpDefault {
  readonly status: FollowUpDefaultStatus;
  /** The eligible shepherd, or null when there is none **or** the summary's shepherd fails the
   * pledge's predicate (FR-26a). */
  readonly shepherd: FollowUpShepherd | null;
}

const IDLE: FollowUpDefault = { status: 'idle', shepherd: null };
const LOADING: FollowUpDefault = { status: 'loading', shepherd: null };
const ERROR: FollowUpDefault = { status: 'error', shepherd: null };
const READY_WITHOUT_SHEPHERD: FollowUpDefault = { status: 'ready', shepherd: null };

function requireMemberNo(value: string | null): string {
  // The queries are `enabled` only with a member number; this keeps the narrowing honest rather
  // than asserting a non-null that the guard already established.
  if (value === null)
    throw new Error('The member number is required to read the follow-up default.');
  return value;
}

/**
 * FR-26a: the pledge's follow-up default. Reads `GET /v1/members/{memberNo}/shepherding`, then the
 * shepherd's member detail for `isPresbyter`/`archivedAt`/`purgedAt`, and applies the pledge's own
 * predicate in one place (`isFollowUpEligible`). A summary shepherd that fails it is reported as
 * **no active shepherd**, so the form never names an officer the API will refuse.
 *
 * `staleTime: 0` and `retry: false` are deliberate: the requirement is evaluated against the
 * summary current at submit, and a failed read must say the default is unavailable rather than
 * retrying silently behind a "checking" hint.
 */
export function useFollowUpDefault(memberNo: string | null): FollowUpDefault {
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  // The same read the member page's shepherding tab makes, so the suffix matches its key
  // (`MemberDetailPage.tsx`) and one cache entry serves both.
  const shepherdingQuery = useQuery({
    queryKey: ['member', baseUrl, memberNo, 'shepherding'],
    queryFn: ({ signal }) =>
      getMemberShepherding(baseUrl, token, requireMemberNo(memberNo), signal),
    enabled: Boolean(token) && memberNo !== null,
    staleTime: 0,
    retry: false,
  });

  const summaryShepherd = shepherdingQuery.data?.shepherd ?? null;

  // The `'follow-up'` suffix is load-bearing: without it this key is the member **detail** key
  // that `MemberDetailPage`, `MemberFormPage` and `ContactsDialog` write with `fetchMemberDetail`
  // (shape `{ member, etag }`). The two shapes are not interchangeable — a shared entry would make
  // `isFollowUpEligible` read `isPresbyter` off `{ member, etag }` (a false "no active shepherd")
  // or the member page dereference `member.memberNo` on `undefined`. Prefix invalidation by
  // `['member', baseUrl, memberNo]` still reaches this entry, which is what a member change wants.
  const officerQuery = useQuery({
    queryKey: ['member', baseUrl, summaryShepherd?.memberNo, 'follow-up'],
    queryFn: ({ signal }) =>
      getMember(baseUrl, token, requireMemberNo(summaryShepherd?.memberNo ?? null), signal),
    enabled: Boolean(token) && summaryShepherd !== null,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (isUnauthorized(shepherdingQuery.error) || isUnauthorized(officerQuery.error)) {
      void signOut();
    }
  }, [shepherdingQuery.error, officerQuery.error, signOut]);

  if (memberNo === null) return IDLE;
  // `isPending` rather than `isLoading`: with the guards above, "no data and no error yet" is
  // exactly "the read has not answered", which is what the disabled field and hint mean. It also
  // closes the one-render gap between the summary arriving and the shepherd's detail starting,
  // so the field never flashes "required" before the default is known.
  if (shepherdingQuery.isPending) return LOADING;
  if (shepherdingQuery.isError) return ERROR;
  if (!summaryShepherd) return READY_WITHOUT_SHEPHERD;
  if (officerQuery.isPending) return LOADING;
  if (officerQuery.isError) return ERROR;

  const officer = officerQuery.data;
  if (!officer) return READY_WITHOUT_SHEPHERD;
  if (!isFollowUpEligible(officer)) return READY_WITHOUT_SHEPHERD;

  return {
    status: 'ready',
    shepherd: {
      memberNo: summaryShepherd.memberNo,
      name: summaryShepherd.name,
      gender: summaryShepherd.gender,
      age: summaryShepherd.age,
    },
  };
}
