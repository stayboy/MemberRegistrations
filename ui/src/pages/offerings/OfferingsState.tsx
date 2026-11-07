import {
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
} from '@fluentui/react-components';
import { useOfferingsStyles } from './offerings-styles';

/** The landing's two loading panels share one spinner shape. */
export function OfferingsLoading({ label }: { label: string }) {
  const styles = useOfferingsStyles();
  return (
    <div className={styles.state}>
      <Spinner label={label} />
    </div>
  );
}

/**
 * The summary and worklist failures share one retryable error bar. The caller
 * owns the refetch and the error text, so no request state lives here.
 */
export function OfferingsError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : 'Check the API connection and try again.';

  return (
    <MessageBar intent="error">
      <MessageBarBody>
        <MessageBarTitle>{title}</MessageBarTitle>
        {message}
        <Button size="small" appearance="transparent" onClick={onRetry}>
          Retry
        </Button>
      </MessageBarBody>
    </MessageBar>
  );
}
