import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMemberPhoto } from '../api/members';
import { renderWithProviders } from '../test/render';
import { MemberAvatar } from './MemberAvatar';

const fetchPhotoMock = vi.mocked(fetchMemberPhoto);
const createObjectURL = vi.fn(() => 'blob:member-photo');
const revokeObjectURL = vi.fn();

vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return { ...actual, fetchMemberPhoto: vi.fn() };
});

vi.mock('../api/gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/gateway')>();
  return {
    ...actual,
    fetchMe: vi.fn(async () => ({
      id: 'officer-1',
      name: 'Efua Boateng',
      email: 'efua@example.test',
      actorId: 'efua',
    })),
  };
});

beforeEach(() => {
  fetchPhotoMock.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MemberAvatar (MR-18, MR-19)', () => {
  it('shows the initials and never fetches when the record has no photo', () => {
    renderWithProviders(
      <MemberAvatar
        memberNo="M-1001"
        name="Kwame Asante"
        initials="KA"
        photoUpdatedAt={null}
        data-testid="avatar"
      />,
    );

    expect(screen.getByTestId('avatar')).toHaveTextContent('KA');
    expect(fetchPhotoMock).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('fetches the bytes as an authenticated blob and shows them through an object URL', async () => {
    const blob = new Blob(['photo-bytes'], { type: 'image/webp' });
    fetchPhotoMock.mockResolvedValueOnce(blob);

    renderWithProviders(
      <MemberAvatar
        memberNo="M-1001"
        name="Kwame Asante"
        photoUpdatedAt="2026-11-18T10:00:00.000Z"
        data-testid="avatar"
      />,
    );

    await waitFor(() => expect(fetchPhotoMock).toHaveBeenCalledTimes(1));
    expect(fetchPhotoMock.mock.calls[0]?.slice(0, 3)).toEqual([
      expect.any(String),
      expect.any(String),
      'M-1001',
    ]);
    const image = await waitFor(() => {
      const found = screen.getByTestId('avatar').querySelector('img');
      expect(found).not.toBeNull();
      return found!;
    });
    expect(image.getAttribute('src')).toBe('blob:member-photo');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('revokes the object URL on unmount', async () => {
    fetchPhotoMock.mockResolvedValueOnce(new Blob(['photo-bytes'], { type: 'image/webp' }));

    const { unmount } = renderWithProviders(
      <MemberAvatar
        memberNo="M-1001"
        name="Kwame Asante"
        photoUpdatedAt="2026-11-18T10:00:00.000Z"
        data-testid="avatar"
      />,
    );

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:member-photo');
  });

  it('falls back to initials when the photo read fails', async () => {
    fetchPhotoMock.mockRejectedValueOnce(new Error('404'));

    renderWithProviders(
      <MemberAvatar
        memberNo="M-1001"
        name="Kwame Asante"
        initials="KA"
        photoUpdatedAt="2026-11-18T10:00:00.000Z"
        data-testid="avatar"
      />,
    );

    await waitFor(() => expect(fetchPhotoMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('avatar')).toHaveTextContent('KA');
    expect(screen.getByTestId('avatar').querySelector('img')).toBeNull();
  });
});
