import {
  Button,
  Field,
  FluentProvider,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
  makeStyles,
  tokens,
  webDarkTheme,
  webLightTheme,
} from '@fluentui/react-components';
import { useState, type FormEvent } from 'react';
import { acceptMemberVerification } from '../api/members';
import { ApiError } from '../api/errors';
import { resolveGatewayOrigin } from '../auth/gatewayOrigin';

/**
 * The public member acceptance page (FR-25b, MR-51).
 *
 * The token from `#t=` names one live code, whatever channel the register chose;
 * the six digits prove it. There is no session, no member number and no member
 * data before acceptance: success shows only the masked destination. The link
 * never verifies by itself.
 */

const useStyles = makeStyles({
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
    backgroundColor: tokens.colorNeutralBackground2,
    boxSizing: 'border-box',
  },
  card: {
    width: '100%',
    maxWidth: '440px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalXXL,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
  },
  heading: {
    margin: 0,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightHero700,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  copy: {
    color: tokens.colorNeutralForeground2,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
});

/** `#t=<token>`: the fragment is the only place the token appears. */
export function tokenFromHash(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return (params.get('t') ?? '').trim();
}

function failureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return 'Too many requests. Wait a minute and try again.';
    }
    if (error.status === 400) {
      const code = error.problem?.code;
      if (code === 'code_expired') {
        return 'That code has expired. Ask the office to send a new one.';
      }
      if (code === 'too_many_tries') {
        return 'Too many tries. This code is closed; ask the office to send a new one.';
      }
      // MR-25/AC-MR17: the remaining-attempt count is member-safe and helps the
      // member more than the bare refusal, so it is surfaced when the API names it.
      const detail = error.problem?.detail;
      if (typeof detail === 'string' && /\battempts? remain\b/.test(detail)) {
        return `${detail}. Check the six digits and try again.`;
      }
      return 'That code is not right. Check the six digits and try again.';
    }
  }
  return 'The code could not be checked. Check the connection and try again.';
}

export function AcceptancePage() {
  const styles = useStyles();
  const [token] = useState(() => tokenFromHash(window.location.hash));
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!/^\d{6}$/.test(code) || sending) return;

    setSending(true);
    setError(null);
    try {
      const origin = resolveGatewayOrigin(import.meta.env.VITE_GATEWAY_URL, import.meta.env.MODE);
      const result = await acceptMemberVerification(origin, token, code);
      setMasked(result.masked);
      setCode('');
    } catch (caught) {
      setError(failureMessage(caught));
    } finally {
      setSending(false);
    }
  }

  return (
    <FluentProvider theme={dark ? webDarkTheme : webLightTheme}>
      <main className={styles.page}>
        <section className={styles.card} aria-label="Verify your contact">
          <h1 className={styles.heading}>Verify your contact</h1>
          {token === '' ? (
            <MessageBar intent="warning">
              <MessageBarBody>
                <MessageBarTitle>This link is incomplete</MessageBarTitle>
                Open the link from the message the church sent you, exactly as it appears.
              </MessageBarBody>
            </MessageBar>
          ) : masked !== null ? (
            <>
              <MessageBar intent="success">
                <MessageBarBody>
                  <MessageBarTitle>Your contact is verified</MessageBarTitle>
                  The register now treats {masked} as proven.
                </MessageBarBody>
              </MessageBar>
              <Text size={200} className={styles.copy}>
                You can close this page.
              </Text>
            </>
          ) : (
            <>
              <Text className={styles.copy}>
                Enter the six-digit code from the message we sent you. The link on its own does not
                verify anything.
              </Text>
              <form className={styles.form} onSubmit={submit} noValidate>
                <Field label="Six-digit code">
                  <Input
                    value={code}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    autoFocus
                    onChange={(_, data) => setCode(data.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </Field>
                {error !== null ? (
                  <MessageBar intent="error" role="alert">
                    <MessageBarBody>
                      <MessageBarTitle>The code was not accepted</MessageBarTitle>
                      {error}
                    </MessageBarBody>
                  </MessageBar>
                ) : null}
                <Button
                  type="submit"
                  appearance="primary"
                  disabled={sending || !/^\d{6}$/.test(code)}
                >
                  {sending ? (
                    <Spinner size="tiny" label="Checking the code…" />
                  ) : (
                    'Verify my contact'
                  )}
                </Button>
              </form>
              <Text size={100} className={styles.copy}>
                This page shows no member details, and the code can be used only once.
              </Text>
            </>
          )}
        </section>
      </main>
    </FluentProvider>
  );
}
