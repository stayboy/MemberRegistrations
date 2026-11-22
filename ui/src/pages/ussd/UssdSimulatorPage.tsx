import {
  Badge,
  Button,
  Dropdown,
  Field,
  FluentProvider,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Text,
  webDarkTheme,
} from '@fluentui/react-components';
import {
  ArrowClockwiseRegular,
  DismissRegular,
  PhoneDesktopRegular,
  SendRegular,
} from '@fluentui/react-icons';
import { useEffect, useRef, useState } from 'react';
import { ApiError, isUnauthorized } from '../../api/errors';
import { sendUssdSession, type UssdProvider, type UssdSimulatorResponse } from '../../api/ussd';
import { useSession } from '../../auth/SessionProvider';
import { callbackCurl, runnableCurl } from '../../format/ussd-callback';
import { PageFrame } from '../../components/PageFrame';
import { isLocalTools } from '../../env/localTools';
import { useUssdStyles } from './ussd-styles';

const PROVIDER_CAPS: Record<UssdProvider, number> = { nalo: 120, hmac: 182 };

const PROVIDER_OPTIONS: readonly {
  readonly value: UssdProvider;
  readonly label: string;
}[] = [
  { value: 'nalo', label: 'Nalo (120 characters)' },
  { value: 'hmac', label: 'HMAC reference (182 characters)' },
];

/** The handset keypad, in reading order: three columns and four rows. */
const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;

/** The console keeps the newest frames; a long walkthrough cannot grow without bound. */
const FRAME_LIMIT = 60;

interface FrameRequest {
  readonly provider: UssdProvider;
  readonly phone: string;
  readonly input: string;
  readonly sessionId: string | null;
}

interface FrameResponse {
  readonly text: string;
  readonly state: string;
  readonly done: boolean;
  readonly wire: unknown;
}

interface Frame {
  readonly n: number;
  readonly at: string;
  readonly request: FrameRequest;
  readonly ms: number;
  readonly response?: FrameResponse;
  readonly error?: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'The simulator entry answered 404. It is unavailable in production or not mounted on this API.';
    }
    if (error.status === 503) {
      return 'USSD is disabled by configuration (USSD_ENABLED=false). Set it to true on a development API.';
    }
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/** The frame's wall-clock timing; module scope keeps the impure read out of render. */
function timerStart(): number {
  return performance.now();
}

function elapsedMs(started: number): number {
  return Math.round(performance.now() - started);
}

function callbackPayload(
  reference: string,
  amountMinor: string,
  currency: string,
  status: 'paid' | 'failed',
): string {
  return JSON.stringify(
    {
      reference,
      status,
      amountMinor: Number(amountMinor),
      currency,
      occurredAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

/**
 * USSD → Simulator / console (development and the local Compose build). Posts
 * each frame to `POST /dev/ussd/session`, renders the real provider text with
 * its real truncation, and keeps a per-frame terminal log of the request, the
 * response, `state`/`done` and the provider wire. The gateway secret never
 * reaches the browser: the callback is signed by the payment gateway (or the
 * developer's shell) with `PAYMENT_GATEWAY_SECRET`.
 */
export function UssdSimulatorPage() {
  const styles = useUssdStyles();
  const { baseUrl, signOut } = useSession();
  const [provider, setProvider] = useState<UssdProvider>('nalo');
  const [phone, setPhone] = useState('0240000000');
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [response, setResponse] = useState<UssdSimulatorResponse | null>(null);
  const [frames, setFrames] = useState<readonly Frame[]>([]);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [callbackReference, setCallbackReference] = useState('');
  const [callbackAmount, setCallbackAmount] = useState('100');
  const [callbackCurrency, setCallbackCurrency] = useState('GHS');
  const [callbackStatus, setCallbackStatus] = useState<'paid' | 'failed'>('paid');
  const [copied, setCopied] = useState<string | null>(null);
  const frameSeq = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [frames.length]);

  async function sendFrame(value: string): Promise<void> {
    if (sending) return;
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setActionError('A phone number is required.');
      return;
    }

    const request: FrameRequest = { provider, phone: trimmedPhone, input: value, sessionId };
    frameSeq.current += 1;
    const n = frameSeq.current;
    const at = new Date().toISOString();
    setSending(true);
    setActionError(null);
    const started = timerStart();

    try {
      const next = await sendUssdSession(baseUrl, {
        provider,
        phone: trimmedPhone,
        input: value,
        ...(sessionId ? { sessionId } : {}),
      });
      const ms = elapsedMs(started);
      const frame: Frame = {
        n,
        at,
        request,
        ms,
        response: {
          text: next.text,
          state: next.state,
          done: next.done,
          wire: next.wire,
        },
      };
      setFrames((current) => [...current, frame].slice(-FRAME_LIMIT));
      setResponse(next);
      setSessionId(next.done ? null : next.sessionId);
      setInput('');
      const reference = /reference\s+([^\s]+)/i.exec(next.text)?.[1] ?? '';
      setCallbackReference(reference);
    } catch (error: unknown) {
      const ms = elapsedMs(started);
      const message = errorMessage(error);
      const frame: Frame = { n, at, request, ms, error: message };
      setFrames((current) => [...current, frame].slice(-FRAME_LIMIT));
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setActionError(message);
    } finally {
      setSending(false);
    }
  }

  function resetSession(): void {
    setSessionId(null);
    setResponse(null);
    setInput('');
    setActionError(null);
    setFrames([]);
    setCallbackReference('');
    frameSeq.current = 0;
  }

  function clearLog(): void {
    setFrames([]);
  }

  function copy(label: string, value: string): void {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(value)
      .then(() => setCopied(label))
      .catch(() => setCopied(null));
  }

  const cap = PROVIDER_CAPS[provider];
  const payload = callbackPayload(
    callbackReference,
    callbackAmount,
    callbackCurrency,
    callbackStatus,
  );

  if (!isLocalTools()) {
    return (
      <PageFrame sectionId="ussd" title="USSD console" submenu="Simulator">
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>The USSD console is unavailable in this build</MessageBarTitle>A
            deployed build cannot drive `POST /dev/ussd/session`: the entry refuses when
            NODE_ENV=production, and the gateway secret never reaches the browser. A local build
            sets `VITE_USSD_CONSOLE=true` to run the console against its development API.
          </MessageBarBody>
        </MessageBar>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      sectionId="ussd"
      title="USSD console"
      submenu="Simulator"
      description="Development and local builds only — every keypress goes through POST /dev/ussd/session"
      actions={[
        {
          id: 'new-session',
          kind: 'verb',
          label: 'New session',
          icon: <ArrowClockwiseRegular />,
          onSelect: resetSession,
          disabled: sending,
        },
        {
          id: 'clear-log',
          kind: 'verb',
          label: 'Clear log',
          icon: <DismissRegular />,
          onSelect: clearLog,
          disabled: frames.length === 0,
        },
      ]}
    >
      <FluentProvider theme={webDarkTheme}>
        <div className={styles.console}>
          <div className={styles.consoleColumns}>
            <section className={styles.handsetColumn} aria-label="Handset">
              <div className={styles.badgeRow}>
                <PhoneDesktopRegular />
                <Text weight="semibold">Handset</Text>
              </div>

              <Field label="Provider" className={styles.field}>
                <Dropdown
                  aria-label="Provider"
                  value={
                    PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? 'Nalo'
                  }
                  selectedOptions={[provider]}
                  onOptionSelect={(_, data) => {
                    const next = data.optionValue === 'nalo' ? 'nalo' : 'hmac';
                    setProvider(next);
                    resetSession();
                  }}
                >
                  {PROVIDER_OPTIONS.map((option) => (
                    <Option key={option.value} value={option.value} text={option.label}>
                      {option.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>

              <Field label="Phone (MSISDN)" className={styles.field}>
                <Input
                  value={phone}
                  maxLength={32}
                  disabled={sessionId !== null || sending}
                  onChange={(_, data) => setPhone(data.value)}
                />
              </Field>

              <div className={styles.badgeRow}>
                <Badge appearance="tint" color="informative" size="small">
                  {provider} · {cap} chars
                </Badge>
                {response ? (
                  <Badge
                    appearance="tint"
                    color={response.done ? 'subtle' : 'success'}
                    size="small"
                  >
                    {response.done ? 'Done' : 'Open'}
                  </Badge>
                ) : null}
                {response ? (
                  <Badge appearance="tint" color="informative" size="small">
                    {response.text.length}/{cap} characters
                  </Badge>
                ) : null}
              </div>

              <pre className={styles.screen} role="status" aria-live="polite">
                {response?.text ?? 'Send an empty keypress to open the main menu.'}
              </pre>

              <Text size={200} className={styles.muted}>
                {response ? `state=${response.state}` : 'state=none'}
              </Text>

              <Text size={200} className={styles.muted}>
                The code and the acceptance link stay in the API console — docker compose logs -f
                app.
              </Text>

              <div className={styles.keypad}>
                {KEYPAD_KEYS.map((key) => (
                  <Button
                    key={key}
                    className={styles.keypadKey}
                    appearance="secondary"
                    aria-label={`Key ${key}`}
                    disabled={sending}
                    onClick={() => {
                      void sendFrame(key);
                    }}
                  >
                    {key}
                  </Button>
                ))}
              </div>

              <div className={styles.entryRow}>
                <Field label="Entry" className={styles.entryField}>
                  <Input
                    value={input}
                    maxLength={64}
                    placeholder={sessionId ? 'e.g. 1' : 'leave empty to open the menu'}
                    disabled={sending}
                    onChange={(_, data) => setInput(data.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !sending) void sendFrame(input);
                    }}
                  />
                </Field>
                <Button
                  appearance="primary"
                  icon={<SendRegular />}
                  disabled={sending || phone.trim().length === 0}
                  onClick={() => {
                    void sendFrame(input);
                  }}
                >
                  {sending ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </section>

            <section className={styles.logColumn} aria-label="Frame log">
              <div className={styles.badgeRow}>
                <Text weight="semibold">Frame log</Text>
                <Badge appearance="tint" color="informative" size="small">
                  {frames.length} {frames.length === 1 ? 'frame' : 'frames'}
                </Badge>
              </div>
              <div
                className={styles.log}
                role="log"
                aria-label="Frame log"
                aria-live="off"
                ref={logRef}
              >
                {frames.length === 0 ? (
                  <Text size={200} className={styles.muted}>
                    No frame yet. Press a key or Send.
                  </Text>
                ) : (
                  frames.map((frame) => (
                    <div className={styles.frameBlock} key={frame.n}>
                      <pre
                        className={
                          frame.error ? `${styles.frame} ${styles.frameError}` : styles.frame
                        }
                      >
                        <span className={styles.frameMeta}>
                          {`#${frame.n}  POST /dev/ussd/session`}
                        </span>
                        {'\n'}
                        {`${frame.request.provider} · ${frame.request.phone} · session ${
                          frame.request.sessionId ?? 'new'
                        } · input "${frame.request.input}"`}
                        {'\n'}
                        {frame.response
                          ? `200 · ${frame.ms} ms`
                          : `ERROR · ${frame.error ?? 'unknown error'}`}
                        {'\n'}
                        {frame.response
                          ? `state=${frame.response.state} done=${
                              frame.response.done ? 'true' : 'false'
                            }`
                          : ''}
                        {'\n\n'}
                        {frame.response?.text ?? ''}
                      </pre>
                      <details>
                        <summary>Provider wire</summary>
                        <pre className={styles.inlineCode}>
                          {frame.response
                            ? JSON.stringify(frame.response.wire, null, 2)
                            : 'No response.'}
                        </pre>
                      </details>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {actionError ? (
            <MessageBar intent="error">
              <MessageBarBody>
                <MessageBarTitle>The console request failed</MessageBarTitle>
                {actionError}
              </MessageBarBody>
            </MessageBar>
          ) : null}

          <details>
            <summary>Stub gateway callback</summary>
            <div className={styles.panelBody}>
              <Text size={200} className={styles.muted}>
                When a screen returns a reference, paste it here. The gateway (or your shell) signs
                the exact raw body with PAYMENT_GATEWAY_SECRET and posts it to
                /v1/payments/callback. This page never signs and never holds the secret.
              </Text>
              <div className={styles.fields}>
                <Field label="Reference" className={styles.field}>
                  <Input
                    value={callbackReference}
                    onChange={(_, data) => setCallbackReference(data.value)}
                  />
                </Field>
                <Field label="Amount (minor units)" className={styles.narrowField}>
                  <Input
                    type="number"
                    min={1}
                    value={callbackAmount}
                    onChange={(_, data) => setCallbackAmount(data.value)}
                  />
                </Field>
                <Field label="Currency" className={styles.narrowField}>
                  <Input
                    value={callbackCurrency}
                    maxLength={3}
                    onChange={(_, data) => setCallbackCurrency(data.value.toUpperCase())}
                  />
                </Field>
                <Field label="Status" className={styles.narrowField}>
                  <Dropdown
                    aria-label="Callback status"
                    value={callbackStatus === 'paid' ? 'Paid' : 'Failed'}
                    selectedOptions={[callbackStatus]}
                    onOptionSelect={(_, data) => {
                      setCallbackStatus(data.optionValue === 'failed' ? 'failed' : 'paid');
                    }}
                  >
                    <Option value="paid" text="Paid">
                      Paid
                    </Option>
                    <Option value="failed" text="Failed">
                      Failed
                    </Option>
                  </Dropdown>
                </Field>
              </div>

              <div>
                <Text size={200} weight="semibold">
                  Callback body
                </Text>
                <pre className={styles.inlineCode}>{payload}</pre>
                <Button size="small" appearance="secondary" onClick={() => copy('body', payload)}>
                  {copied === 'body' ? 'Copied' : 'Copy body'}
                </Button>
              </div>

              <div>
                <Text size={200} weight="semibold">
                  Signed callback template
                </Text>
                <pre className={styles.inlineCode}>{callbackCurl(payload)}</pre>
                <Button
                  size="small"
                  appearance="secondary"
                  onClick={() => copy('curl', runnableCurl(payload, baseUrl))}
                >
                  {copied === 'curl' ? 'Copied' : 'Copy command'}
                </Button>
              </div>
            </div>
          </details>
        </div>
      </FluentProvider>
    </PageFrame>
  );
}
