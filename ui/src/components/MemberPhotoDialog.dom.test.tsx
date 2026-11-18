import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteMemberPhoto, fetchMemberPhoto, uploadMemberPhoto } from '../api/members';
import { encodePhoto } from '../format/photo';
import { renderWithProviders } from '../test/render';
import { MemberPhotoDialog } from './MemberPhotoDialog';

const uploadMock = vi.mocked(uploadMemberPhoto);
const deleteMock = vi.mocked(deleteMemberPhoto);
const fetchPhotoMock = vi.mocked(fetchMemberPhoto);
const encodeMock = vi.mocked(encodePhoto);
const createObjectURL = vi.fn((blob: Blob) => `blob:${blob.size}`);
const revokeObjectURL = vi.fn();

vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return {
    ...actual,
    uploadMemberPhoto: vi.fn(),
    deleteMemberPhoto: vi.fn(),
    fetchMemberPhoto: vi.fn(),
  };
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

vi.mock('../format/photo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../format/photo')>();
  return { ...actual, encodePhoto: vi.fn() };
});

const ENCODED = new Blob(['512-square-webp'], { type: 'image/webp' });

beforeEach(() => {
  uploadMock.mockReset();
  deleteMock.mockReset();
  fetchPhotoMock.mockReset();
  encodeMock.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();

  uploadMock.mockResolvedValue({ photoUpdatedAt: '2026-11-18T12:00:00.000Z' });
  deleteMock.mockResolvedValue(undefined);
  fetchPhotoMock.mockResolvedValue(new Blob(['stored'], { type: 'image/webp' }));
  encodeMock.mockResolvedValue({ blob: ENCODED, contentType: 'image/webp' });

  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
});

const unstub: Array<() => void> = [];

/** Sets a prototype member for one test and remembers how to put the original back. */
function stubProperty(target: object, property: string, descriptor: PropertyDescriptor): void {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, ...descriptor });
  unstub.push(() => {
    if (original) Object.defineProperty(target, property, original);
    else Reflect.deleteProperty(target, property);
  });
}

/** A granted camera: a live stream, a 640 × 480 frame and a canvas that answers in PNG. */
function stubGrantedCamera(): {
  readonly stop: ReturnType<typeof vi.fn>;
  readonly drawImage: ReturnType<typeof vi.fn>;
} {
  const stop = vi.fn();
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  unstub.push(() => Reflect.deleteProperty(navigator, 'mediaDevices'));

  stubProperty(HTMLVideoElement.prototype, 'videoWidth', { get: () => 640 });
  stubProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => 480 });
  // jsdom has no media pipeline; the dialog ignores a failed play promise.
  stubProperty(HTMLMediaElement.prototype, 'play', { value: async () => undefined });

  const drawImage = vi.fn();
  stubProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => ({ drawImage }) });
  stubProperty(HTMLCanvasElement.prototype, 'toBlob', {
    value: (callback: BlobCallback) => callback(new Blob(['frame'], { type: 'image/png' })),
  });

  return { stop, drawImage };
}

afterEach(() => {
  while (unstub.length > 0) unstub.pop()?.();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

function renderDialog(options: {
  photoUpdatedAt?: string | null;
  onOpenChange?: (open: boolean) => void;
}): void {
  renderWithProviders(
    <MemberPhotoDialog
      memberNo="M-1001"
      memberName="Kwame Asante"
      initials="KA"
      photoUpdatedAt={options.photoUpdatedAt ?? null}
      open
      onOpenChange={options.onOpenChange ?? vi.fn()}
    />,
  );
}

function chooseFile(): void {
  const input = screen.getByTestId('member-photo-file');
  fireEvent.change(input, {
    target: { files: [new File(['source'], 'family-reunion.png', { type: 'image/png' })] },
  });
}

describe('MemberPhotoDialog (MR-15, MR-20)', () => {
  it('previews the 512 crop and uploads it only on Save photo', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    chooseFile();

    const preview = await screen.findByRole('img', { name: 'Selected profile' });
    expect(preview).toHaveAttribute('src', `blob:${ENCODED.size}`);
    expect(uploadMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save photo' }));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'M-1001',
      ENCODED,
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('explains a denied camera and leaves the file input usable (AC-MR31)', async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    renderDialog({});

    await user.click(screen.getByRole('button', { name: 'Take photo' }));

    expect(
      await screen.findByText(/Camera access was denied or no camera is available/),
    ).toBeVisible();
    expect(screen.getByTestId('member-photo-file')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeEnabled();
  });

  it('takes a camera frame, previews it and uploads it only on Save (AC-MR31)', async () => {
    const user = userEvent.setup();
    const { stop, drawImage } = stubGrantedCamera();
    renderDialog({});

    await user.click(screen.getByRole('button', { name: 'Take photo' }));
    await user.click(await screen.findByRole('button', { name: 'Capture photo' }));

    await waitFor(() => expect(encodeMock).toHaveBeenCalledTimes(1));
    const frame = encodeMock.mock.calls[0]?.[0];
    expect(frame).toBeInstanceOf(Blob);
    expect(frame?.type).toBe('image/png');
    // The 640 × 480 frame is centre-cropped to its 480 px short side, 80 px in.
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(HTMLVideoElement),
      80,
      0,
      480,
      480,
      0,
      0,
      480,
      480,
    );
    // Capturing releases the camera.
    expect(stop).toHaveBeenCalledTimes(1);

    const preview = await screen.findByRole('img', { name: 'Selected profile' });
    expect(preview).toHaveAttribute('src', `blob:${ENCODED.size}`);
    expect(uploadMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save photo' }));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'M-1001',
      ENCODED,
    );
  });

  it('removes a stored photo through the delete endpoint on Save', async () => {
    const user = userEvent.setup();
    renderDialog({ photoUpdatedAt: '2026-11-18T10:00:00.000Z' });

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Save photo' }));

    await waitFor(() =>
      expect(deleteMock).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'M-1001'),
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('sends nothing on Cancel', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    chooseFile();
    await screen.findByRole('img', { name: 'Selected profile' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(uploadMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
