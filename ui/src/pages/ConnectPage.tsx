import {
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Spinner,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { useState, useEffect, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { probeGateway, requestMagicLink } from '../api/gateway';
import { useSession } from '../auth/SessionProvider';
import { normalizeGatewayUrl } from '../auth/session';
import { connectionErrorDetail } from '../shell/ConnectionBadge';

type Phase = 'idle' | 'checking' | 'sending' | 'sent' | 'exchanging' | 'error';

const useStyles = makeStyles({
  wrap: {
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
    paddingTop: tokens.spacingVerticalXXL,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    width: '100%',
    maxWidth: '520px',
    padding: tokens.spacingHorizontalXXL,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow8,
  },
  eyebrow: {
    margin: 0,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  title: {
    margin: 0,
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightHero700,
    fontWeight: tokens.fontWeightSemibold,
  },
  body: {
    margin: 0,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  hint: {
    margin: 0,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  spinnerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
});

/**
 * Reads the single-use token from `#/connect?token=…` once, then removes it so
 * the credential is not left in the address bar or history. The exchange itself
 * is de-duplicated at module scope because StrictMode mounts effects twice.
 */
function readTokenFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex < 0) return null;
  return new URLSearchParams(hash.slice(queryIndex + 1)).get('token');
}

function stripTokenFromHash(): void {
  const baseHash = window.location.hash.split('?')[0] || '#/connect';
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${baseHash}`,
  );
}

let pendingExchange: Promise<void> | null = null;

export function ConnectPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { status, officer, baseUrl, setBaseUrl, signIn, signOut } = useSession();

  const [incomingToken] = useState<string | null>(() => readTokenFromHash());
  const [gatewayInput, setGatewayInput] = useState(baseUrl);
  const [email, setEmail] = useState('');
  const [gatewayError, setGatewayError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [phase, setPhase] = useState<Phase>(incomingToken ? 'exchanging' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const reason = searchParams.get('reason');

  useEffect(() => {
    if (!incomingToken) return;
    stripTokenFromHash();

    if (!pendingExchange) {
      pendingExchange = signIn(incomingToken);
    }

    let active = true;
    pendingExchange
      .then(() => {
        if (!active) return;
        const from = (location.state as { from?: string } | null)?.from;
        navigate(from && from !== '/connect' ? from : '/members', { replace: true });
      })
      .catch((error: unknown) => {
        if (!active) return;
        pendingExchange = null;
        setPhase('error');
        setMessage(
          error instanceof Error
            ? error.message
            : 'The sign-in link is invalid or has expired. Request a new link.',
        );
      });

    return () => {
      active = false;
    };
  }, [incomingToken, location.state, navigate, signIn]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    const normalized = normalizeGatewayUrl(gatewayInput);
    const nextGatewayError = normalized
      ? undefined
      : 'Use an https:// URL (http:// is allowed only for localhost).';
    const trimmedEmail = email.trim();
    const nextEmailError =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) === true
        ? undefined
        : 'Enter the email address of an active officer.';

    setGatewayError(nextGatewayError);
    setEmailError(nextEmailError);
    if (nextGatewayError || nextEmailError || !normalized) return;

    setPhase('checking');
    try {
      await probeGateway(normalized, AbortSignal.timeout(6000));
      setPhase('sending');
      await requestMagicLink(normalized, trimmedEmail, AbortSignal.timeout(10000));
      setBaseUrl(normalized);
      setGatewayInput(normalized);
      setPhase('sent');
    } catch (error: unknown) {
      setPhase('error');
      setMessage(`${connectionErrorDetail(error)} Check the gateway URL and try again.`);
    }
  };

  if (incomingToken && phase === 'exchanging') {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <p className={styles.eyebrow}>Church Register</p>
          <h1 className={styles.title}>Signing you in</h1>
          <div className={styles.spinnerRow}>
            <Spinner size="small" />
            <p className={styles.body}>Exchanging the single-use magic link for a session…</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'signed-in' && !incomingToken) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <p className={styles.eyebrow}>Church Register</p>
          <h1 className={styles.title}>You are signed in</h1>
          <p className={styles.body}>
            {officer ? `${officer.name} (${officer.email})` : 'This tab already holds a session.'}{' '}
            Every signed-in officer can read and write the whole register.
          </p>
          <div className={styles.actions}>
            <Button appearance="primary" onClick={() => navigate('/members')}>
              Continue to Members
            </Button>
            <Button
              onClick={() => {
                void signOut().then(() => navigate('/connect', { replace: true }));
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const busy = phase === 'checking' || phase === 'sending';

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Church Register</p>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.body}>
          This browser never holds the church API token. The gateway holds it and issues a
          short-lived, revocable session for this tab.
        </p>

        {reason === 'expired' ? (
          <MessageBar intent="warning">
            <MessageBarBody>
              Your session expired or was revoked. Request a new sign-in link to continue.
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {message ? (
          <MessageBar intent="error">
            <MessageBarBody>{message}</MessageBarBody>
          </MessageBar>
        ) : null}

        {phase === 'sent' ? (
          <MessageBar intent="success">
            <MessageBarBody>
              If that address belongs to an active officer, a sign-in link has been sent. It expires
              in 15 minutes. Open the link in this browser to finish signing in.
            </MessageBarBody>
          </MessageBar>
        ) : null}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <Field
            label="Gateway URL"
            required
            validationMessage={gatewayError}
            validationState={gatewayError ? 'error' : 'none'}
            hint="The Vercel deployment that holds the API credential."
          >
            <Input
              type="url"
              value={gatewayInput}
              autoComplete="url"
              spellCheck={false}
              onChange={(_, data) => setGatewayInput(data.value)}
            />
          </Field>

          <Field
            label="Officer email"
            required
            validationMessage={emailError}
            validationState={emailError ? 'error' : 'none'}
          >
            <Input
              type="email"
              value={email}
              autoComplete="username"
              spellCheck={false}
              onChange={(_, data) => setEmail(data.value)}
            />
          </Field>

          <div className={styles.actions}>
            <Button type="submit" appearance="primary" disabled={busy}>
              {phase === 'checking'
                ? 'Checking gateway…'
                : phase === 'sending'
                  ? 'Sending link…'
                  : 'Email me a sign-in link'}
            </Button>
          </div>
          <p className={styles.hint}>
            The address response is identical for known and unknown officers, so this form cannot
            reveal who has an account.
          </p>
        </form>
      </div>
    </div>
  );
}
