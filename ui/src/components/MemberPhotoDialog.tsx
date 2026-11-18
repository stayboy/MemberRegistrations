import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { CameraRegular, DeleteRegular, ImageRegular } from '@fluentui/react-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { deleteMemberPhoto, uploadMemberPhoto } from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { useObjectUrl } from '../hooks/useObjectUrl';
import {
  encodePhoto,
  PHOTO_OUTPUT_SIZE,
  PhotoTooLargeError,
  PhotoUnsupportedError,
  type EncodedPhoto,
} from '../format/photo';
import { MemberAvatar } from './MemberAvatar';

const useStyles = makeStyles({
  surface: {
    width: '520px',
    maxWidth: '100%',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  photoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
  },
  preview: {
    width: '208px',
    height: '208px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  cameraFrame: {
    width: '100%',
    maxWidth: '320px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground4,
    transform: 'scaleX(-1)',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
  },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    flex: '1 1 220px',
    minWidth: 0,
  },
  hiddenInput: {
    display: 'none',
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
  /** MR-15: the identity panel's left portrait; the square derives its width from the field stack's height. */
  photoColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    // The measurement sets this from the field inputs' span; the fallback keeps
    // the first paint at the mock's 238 px until the observer runs.
    flex: '0 0 var(--identity-photo-size, 238px)',
    width: 'var(--identity-photo-size, 238px)',
    alignSelf: 'flex-start',
    '@media (max-width: 560px)': {
      width: 'auto',
      flex: '0 0 auto',
      alignSelf: 'flex-start',
    },
  },
  photoHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '10px',
  },
  photoLabel: {
    color: tokens.colorNeutralForeground1,
  },
  photoSquare: {
    position: 'relative',
    width: '100%',
    height: 'var(--identity-photo-size, 238px)',
    flex: 'none',
    overflow: 'hidden',
    containerType: 'size',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground4,
    '@media (max-width: 560px)': {
      width: '96px',
      height: '96px',
    },
  },
  photoChange: {
    minWidth: 0,
    height: 'auto',
    paddingInline: 0,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'nowrap',
  },
});

function photoErrorMessage(error: unknown): string {
  if (error instanceof PhotoTooLargeError || error instanceof PhotoUnsupportedError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The photo could not be prepared. Try another image.';
}

async function captureFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  const side = Math.min(width, height);
  if (side <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(
    video,
    Math.floor((width - side) / 2),
    Math.floor((height - side) / 2),
    side,
    side,
    0,
    0,
    side,
    side,
  );
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export interface MemberPhotoDialogProps {
  readonly memberNo: string;
  readonly memberName: string;
  readonly initials?: string;
  /** Null means no stored photo; a timestamp means one exists. */
  readonly photoUpdatedAt: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Runs after a successful upload or delete, in addition to the cache invalidation. */
  readonly onSaved?: () => void;
}

/**
 * The photo surface (MR-20): a file or the device camera, the same crop and
 * encode pipeline for both, remove, and one Save that applies the change. The
 * camera degrades to the file input with an explanation when permission is
 * denied, there is no camera, or the context is insecure.
 */
export function MemberPhotoDialog({
  memberNo,
  memberName,
  initials,
  photoUpdatedAt,
  open,
  onOpenChange,
  onSaved,
}: MemberPhotoDialogProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { baseUrl, session } = useSession();
  const token = session?.token ?? '';

  const [staged, setStaged] = useState<EncodedPhoto | null>(null);
  const [removeRequested, setRemoveRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const upload = useMutation({
    mutationFn: (photo: Blob) => uploadMemberPhoto(baseUrl, token, memberNo, photo),
  });
  const remove = useMutation({
    mutationFn: () => deleteMemberPhoto(baseUrl, token, memberNo),
  });
  const busy = upload.isPending || remove.isPending;

  function stopCamera(): void {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }

  function reset(): void {
    stopCamera();
    setStaged(null);
    setRemoveRequested(false);
    setError(null);
    setCameraError(null);
  }

  function close(): void {
    if (busy) return;
    reset();
    onOpenChange(false);
  }

  // A staged blob is previewed through its own object URL: created after commit
  // and revoked on change, on close and on Strict Mode's discarded mount.
  const previewUrl = useObjectUrl(staged?.blob);

  // Attach the live stream once React has mounted the video element.
  useEffect(() => {
    if (!cameraActive) return;
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    const played = video.play() as Promise<void> | undefined;
    void played?.catch(() => {});
  }, [cameraActive]);

  // Releasing the camera on unmount matters even when the dialog is removed abruptly.
  useEffect(
    () => () => {
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
    },
    [],
  );

  async function chooseFile(file: File): Promise<void> {
    setError(null);
    setCameraError(null);
    try {
      const encoded = await encodePhoto(file);
      setStaged(encoded);
      setRemoveRequested(false);
    } catch (caught) {
      setError(photoErrorMessage(caught));
    }
  }

  async function startCamera(): Promise<void> {
    setCameraError(null);
    setError(null);
    stopCamera();

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'This browser or connection does not offer a camera. Choose a file instead; the file input still works.',
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch {
      setCameraError(
        'Camera access was denied or no camera is available. Choose a file instead; the file input still works.',
      );
    }
  }

  async function capture(): Promise<void> {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    try {
      const frame = await captureFrame(video);
      if (!frame) {
        setError('The camera produced no frame. Try again or choose a file.');
        return;
      }
      const encoded = await encodePhoto(frame);
      setStaged(encoded);
      setRemoveRequested(false);
      stopCamera();
    } catch (caught) {
      setError(photoErrorMessage(caught));
      stopCamera();
    }
  }

  function removePhoto(): void {
    setError(null);
    setStaged(null);
    // Removing a staged choice just clears it; only a stored photo needs a delete.
    setRemoveRequested(photoUpdatedAt !== null);
  }

  function saved(): void {
    void queryClient.invalidateQueries({ queryKey: ['member', baseUrl, memberNo] });
    void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
    void queryClient.invalidateQueries({ queryKey: ['member-photo', baseUrl, memberNo] });
    // The avatar also rides along on lists that are cached under their own keys:
    // the pickers, the form's guardian candidates and the shepherding rosters.
    void queryClient.invalidateQueries({ queryKey: ['member-picker', baseUrl] });
    void queryClient.invalidateQueries({ queryKey: ['member-form', baseUrl] });
    void queryClient.invalidateQueries({ queryKey: ['shepherding', baseUrl] });
    stopCamera();
    onSaved?.();
    reset();
    onOpenChange(false);
  }

  function fail(caught: unknown): void {
    setError(photoErrorMessage(caught));
  }

  function save(): void {
    if (busy) return;
    setError(null);
    if (staged) {
      upload.mutate(staged.blob, { onSuccess: saved, onError: fail });
      return;
    }
    if (removeRequested) {
      remove.mutate(undefined, { onSuccess: saved, onError: fail });
    }
  }

  const hasSomethingToSave = staged !== null || removeRequested;
  const showsInitials = !previewUrl && (removeRequested || photoUpdatedAt === null);

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open) close();
      }}
    >
      <DialogSurface className={styles.surface} aria-label={`Profile photo for ${memberName}`}>
        <DialogBody>
          <DialogTitle>Profile photo</DialogTitle>
          <DialogContent className={styles.content}>
            <Text size={200} className={styles.hint}>
              The image is centre-cropped to a square and stored at {PHOTO_OUTPUT_SIZE} ×{' '}
              {PHOTO_OUTPUT_SIZE}. The original file is never uploaded, so its name and metadata
              stay on this device.
            </Text>

            <div className={styles.photoRow}>
              <div className={styles.preview} data-testid="member-photo-preview">
                {previewUrl ? (
                  <img className={styles.previewImage} src={previewUrl} alt="Selected profile" />
                ) : showsInitials ? (
                  <MemberAvatar
                    memberNo={memberNo}
                    name={memberName}
                    initials={initials}
                    photoUpdatedAt={null}
                    size={96}
                    data-testid="member-photo-initials"
                  />
                ) : (
                  <MemberAvatar
                    memberNo={memberNo}
                    name={memberName}
                    initials={initials}
                    photoUpdatedAt={photoUpdatedAt}
                    size={96}
                    data-testid="member-photo-current"
                  />
                )}
              </div>

              <div className={styles.controls}>
                <input
                  ref={fileInput}
                  className={styles.hiddenInput}
                  type="file"
                  accept="image/*"
                  data-testid="member-photo-file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    // Reset so choosing the same file twice still fires `change`.
                    event.target.value = '';
                    if (file) void chooseFile(file);
                  }}
                />
                <div className={styles.actions}>
                  <Button
                    icon={<ImageRegular />}
                    appearance="secondary"
                    disabled={busy}
                    onClick={() => fileInput.current?.click()}
                  >
                    Upload photo
                  </Button>
                  <Button
                    icon={<CameraRegular />}
                    appearance="secondary"
                    disabled={busy || cameraActive}
                    onClick={() => {
                      void startCamera();
                    }}
                  >
                    Take photo
                  </Button>
                  <Button
                    icon={<DeleteRegular />}
                    appearance="subtle"
                    disabled={busy || (!staged && !removeRequested && photoUpdatedAt === null)}
                    onClick={removePhoto}
                  >
                    Remove
                  </Button>
                </div>

                {cameraActive ? (
                  <div className={styles.controls}>
                    <video
                      ref={videoRef}
                      className={styles.cameraFrame}
                      autoPlay
                      playsInline
                      muted
                      aria-label="Camera preview"
                    />
                    <div className={styles.actions}>
                      <Button appearance="primary" disabled={busy} onClick={() => void capture()}>
                        Capture photo
                      </Button>
                      <Button appearance="secondary" onClick={stopCamera}>
                        Stop camera
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {cameraError ? (
              <MessageBar intent="warning">
                <MessageBarBody>
                  <MessageBarTitle>Camera unavailable</MessageBarTitle>
                  {cameraError}
                </MessageBarBody>
              </MessageBar>
            ) : null}

            {error ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>The photo was not saved</MessageBarTitle>
                  {error}
                </MessageBarBody>
              </MessageBar>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={save}
              disabled={!hasSomethingToSave || busy}
              data-testid="member-photo-save"
            >
              Save photo
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export interface MemberPhotoControlProps {
  readonly memberNo: string;
  readonly memberName: string;
  readonly initials?: string;
  /** Null when there is no photo; a timestamp when one exists. */
  readonly photoUpdatedAt: string | null;
  /** The create form has no member yet, so the action explains rather than opening. */
  readonly disabled?: boolean;
  readonly disabledHint?: string;
}

/**
 * The form's portrait control (MR-15): the left column of the Identity panel.
 * The square's height follows the field stack beside it, so its bottom meets the
 * last input's bottom and its width follows that height; `Change` is the compact
 * text action beside it. The 512 crop is previewed in {@link MemberPhotoDialog},
 * not here.
 */
export function MemberPhotoControl({
  memberNo,
  memberName,
  initials,
  photoUpdatedAt,
  disabled = false,
  disabledHint = 'Save the member first, then add a photo from its record.',
}: MemberPhotoControlProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className={styles.photoColumn} data-testid="member-photo-control-column">
        <div className={styles.photoHead}>
          <Text size={200} className={styles.photoLabel}>
            Photo
          </Text>
          <Button
            appearance="transparent"
            size="small"
            className={styles.photoChange}
            disabled={disabled}
            title={disabled ? disabledHint : undefined}
            onClick={() => setOpen(true)}
            data-testid="member-photo-control"
          >
            Change
          </Button>
        </div>
        <div className={styles.photoSquare} data-testid="member-photo-control-square">
          <MemberAvatar
            memberNo={memberNo}
            name={memberName}
            initials={initials}
            photoUpdatedAt={photoUpdatedAt}
            size={120}
            shape="square"
            fluid
            data-testid="member-photo-control-avatar"
          />
        </div>
      </div>

      {disabled ? null : (
        <MemberPhotoDialog
          memberNo={memberNo}
          memberName={memberName}
          initials={initials}
          photoUpdatedAt={photoUpdatedAt}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
