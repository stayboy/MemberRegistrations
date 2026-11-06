import {
  Badge,
  Button,
  Card,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Text,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular, PhoneDesktopRegular, SendRegular } from '@fluentui/react-icons';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, isUnauthorized } from '../../api/errors';
import { sendUssdSession, type UssdProvider, type UssdSimulatorResponse } from '../../api/ussd';
import { useSession } from '../../auth/SessionProvider';
import { PageFrame } from '../../components/PageFrame';
import { useUssdStyles } from './ussd-styles';

const PROVIDER_CAPS: Record<UssdProvider, number> = { nalo: 120, hmac: 182 };

const PROVIDER_OPTIONS: readonly {
  readonly value: UssdProvider;
  readonly label: string;
}[] = [
  { value: 'nalo', label: 'Nalo (120 characters)' },
  { value: 'hmac', label: 'HMAC reference (182 characters)' },
];

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

function callbackCurl(payload: string, baseUrl: string): string {
  const singleQuoted = payload.replace(/'/g, `'\\''`);
  return [
    `raw='${singleQuoted}'`,
    `sig=$(printf '%s' "$raw" | openssl dgst -sha256 -hmac "$PAYMENT_GATEWAY_SECRET" | sed 's/^.* //')`,
    `curl -X POST '${baseUrl}/v1/payments/callback' \\`,
    `  -H 'Content-Type: application/json' -H "X-Payment-Signature: $sig" \\`,
    '  --data-raw "$raw"',
  ].join('\n');
}

/**
 * USSD → Simulator (development only). Posts each keypress to
 * `POST /dev/ussd/session`, renders the real provider text with its real
 * truncation, and exposes the reference and callback payload so a commit can be
 * completed end to end. The gateway secret never reaches the browser: the
 * callback is signed by the payment gateway (or the developer's shell) with
 * `PAYMENT_GATEWAY_SECRET`.
 */
export function UssdSimulatorPage() {
  const styles = useUssdStyles();
  const { baseUrl, signOut } = useSession();
  const [provider, setProvider] = useState<UssdProvider>('nalo');
  const [phone, setPhone] = useState('0240000000');
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [response, setResponse] = useState<UssdSimulatorResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [callbackReference, setCallbackReference] = useState('');
  const [callbackAmount, setCallbackAmount] = useState('100');
  const [callbackCurrency, setCallbackCurrency] = useState('GHS');
  const [callbackStatus, setCallbackStatus] = useState<'paid' | 'failed'>('paid');
  const [copied, setCopied] = useState<string | null>(null);

  const isDevelopment = import.meta.env.DEV;

  const sendMutation = useMutation({
    mutationFn: () => {
      if (!phone.trim()) throw new Error('A phone number is required.');
      return sendUssdSession(baseUrl, {
        provider,
        phone: phone.trim(),
        input,
        ...(sessionId ? { sessionId } : {}),
      });
    },
    onSuccess: (next) => {
      setActionError(null);
      setResponse(next);
      setSessionId(next.done ? null : next.sessionId);
      setInput('');
      const reference = /reference\s+([^\s]+)/i.exec(next.text)?.[1] ?? '';
      setCallbackReference(reference);
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setActionError(errorMessage(error));
    },
  });

  function resetSession(): void {
    setSessionId(null);
    setResponse(null);
    setInput('');
    setActionError(null);
    setCallbackReference('');
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

  if (!isDevelopment) {
    return (
      <PageFrame sectionId="ussd" title="USSD simulator" submenu="Simulator">
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>The simulator is development-only</MessageBarTitle>
            This production build cannot drive `POST /dev/ussd/session`: the entry refuses when
            NODE_ENV=production, and the gateway secret never reaches the browser.
          </MessageBarBody>
        </MessageBar>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      sectionId="ussd"
      title="USSD simulator"
      submenu="Simulator"
      description="A development-only handset over the real provider adapters and the real session pipeline. Every keypress goes through POST /dev/ussd/session; the screen shows the provider's real text and truncation."
      actions={
        <>
          <Button
            icon={<ArrowClockwiseRegular />}
            onClick={resetSession}
            disabled={sendMutation.isPending}
          >
            New session
          </Button>
        </>
      }
    >
      <div className={styles.page}>
        <Card className={styles.panel}>
          <div className={styles.panelBody}>
            <div className={styles.fields}>
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
                  disabled={sessionId !== null || sendMutation.isPending}
                  onChange={(_, data) => setPhone(data.value)}
                />
              </Field>

              <Field label="Keypress" className={styles.field}>
                <Input
                  value={input}
                  maxLength={64}
                  placeholder={sessionId ? 'e.g. 1' : 'leave empty to open the menu'}
                  onChange={(_, data) => setInput(data.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') sendMutation.mutate();
                  }}
                />
              </Field>

              <Button
                appearance="primary"
                icon={<SendRegular />}
                disabled={sendMutation.isPending || phone.trim().length === 0}
                onClick={() => sendMutation.mutate()}
              >
                {sendMutation.isPending ? 'Sending…' : 'Send'}
              </Button>
            </div>

            <Text size={200} className={styles.muted}>
              The provider builds the wire server-side; the HMAC reference and Nalo client id never
              reach this page.{' '}
              {sessionId ? `Session ${sessionId}` : 'The next send starts a fresh session.'}
            </Text>

            {actionError ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>The simulator request failed</MessageBarTitle>
                  {actionError}
                </MessageBarBody>
              </MessageBar>
            ) : null}
          </div>
        </Card>

        <div className={styles.fields}>
          <Card className={styles.panel} style={{ flex: 1, minWidth: '320px' }}>
            <div className={styles.panelBody}>
              <div className={styles.badgeRow}>
                <PhoneDesktopRegular />
                <Text weight="semibold">Handset</Text>
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
                  <Text size={200} className={styles.muted}>
                    {response.text.length}/{cap} characters
                  </Text>
                ) : null}
              </div>
              <div className={styles.handset} role="status" aria-live="polite">
                {response?.text ?? 'Send an empty keypress to open the main menu.'}
              </div>
              {response ? (
                <Text size={200} className={styles.muted}>
                  state: {response.state}
                  {response.text.endsWith('…') ? ' · truncated at the provider cap' : ''}
                </Text>
              ) : null}
              <details>
                <summary>Provider wire</summary>
                <pre className={styles.inlineCode}>
                  {response ? JSON.stringify(response.wire, null, 2) : 'No frame yet.'}
                </pre>
              </details>
            </div>
          </Card>
        </div>

        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Stub gateway callback</h2>
            <Text size={200} className={styles.muted}>
              Exposed for a completed commit; the signature stays server-side
            </Text>
          </div>
          <div className={styles.panelBody}>
            <Text size={200} className={styles.muted}>
              When a screen returns a reference, paste it here. The gateway (or your shell) signs
              the exact raw body with PAYMENT_GATEWAY_SECRET and posts it to /v1/payments/callback.
              This page never signs and never holds the secret.
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
              <pre className={styles.inlineCode}>{callbackCurl(payload, baseUrl)}</pre>
              <Button
                size="small"
                appearance="secondary"
                onClick={() => copy('curl', callbackCurl(payload, baseUrl))}
              >
                {copied === 'curl' ? 'Copied' : 'Copy command'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </PageFrame>
  );
}
