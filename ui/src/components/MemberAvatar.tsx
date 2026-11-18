import { Avatar, type AvatarProps } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { fetchMemberPhoto } from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { useObjectUrl } from '../hooks/useObjectUrl';

/** First and last initial, the Fluent avatar's fallback (MR-19). */
export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '';
  return `${first}${last}`.toUpperCase() || '?';
}

export interface MemberAvatarProps {
  /** The member whose photo is fetched; the DTO's timestamp only gates the fetch. */
  readonly memberNo: string;
  readonly name: string;
  /** Defaults to the first and last initial of `name`. */
  readonly initials?: string;
  /** Null means the record has no photo; a timestamp means one exists (MR-18). */
  readonly photoUpdatedAt?: string | null;
  readonly size?: AvatarProps['size'];
  readonly color?: AvatarProps['color'];
  /** Circular by default; the form's identity portrait is square (MR-15). */
  readonly shape?: AvatarProps['shape'];
  /** Fills its container; the form sizes the square from the field column's height. */
  readonly fluid?: boolean;
  readonly 'data-testid'?: string;
  readonly 'aria-hidden'?: boolean;
}

/**
 * The one member avatar (MR-19). The session credential travels in a header, so
 * an `<img src>` cannot fetch the photo; this component asks the API client for
 * a blob, shows it through an object URL, revokes that URL on unmount, and falls
 * back to the Fluent initials avatar when there is no photo or the read fails.
 */
export function MemberAvatar({
  memberNo,
  name,
  initials,
  photoUpdatedAt,
  size = 32,
  color = 'colorful',
  shape = 'circular',
  fluid = false,
  'data-testid': testId,
  'aria-hidden': ariaHidden,
}: MemberAvatarProps) {
  const { baseUrl, session } = useSession();
  const token = session?.token ?? '';
  const hasPhoto = typeof photoUpdatedAt === 'string' && photoUpdatedAt.length > 0;

  const photoQuery = useQuery({
    queryKey: ['member-photo', baseUrl, memberNo, photoUpdatedAt],
    queryFn: ({ signal }) => fetchMemberPhoto(baseUrl, token, memberNo, signal),
    enabled: Boolean(token) && Boolean(memberNo) && hasPhoto,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const blob = photoQuery.data;
  // The object URL is created after commit and revoked when the blob goes away;
  // never in render, and never in a `useMemo` that Strict Mode could discard.
  const src = useObjectUrl(blob);

  return (
    <Avatar
      name={name}
      initials={initials ?? avatarInitials(name)}
      image={src ? { src, alt: '' } : undefined}
      color={color}
      size={size}
      shape={shape}
      // Fluent sizes the root from a fixed table; a fluid avatar fills the
      // square the form derives from the field column's height instead.
      style={
        fluid ? { width: '100%', height: '100%', fontSize: 'clamp(20px, 22cqw, 72px)' } : undefined
      }
      data-testid={testId}
      aria-hidden={ariaHidden}
    />
  );
}
