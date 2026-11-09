import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Text,
} from '@fluentui/react-components';
import type { ReactNode } from 'react';
import type { EventOfferingItem } from '../../api/events';
import { AnnouncedOffertoryForm, PledgeForm, type GiftSubmission, type PledgeSubmission } from './OfferingGivingForms';
import { useUssdStyles } from './ussd-styles';

function Shell({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = useUssdStyles();

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <Text size={200} className={styles.muted}>
              {description}
            </Text>
          ) : null}
          <DialogContent>{children}</DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export function RecordCountDialog({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Shell open={open} title={title} description={description} onClose={onClose}>
      {children}
    </Shell>
  );
}

export function AnnouncedOffertoryDialog({
  open,
  offerings,
  defaultSessionDate,
  currency,
  pending,
  notice,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  offerings: readonly EventOfferingItem[];
  defaultSessionDate: string;
  currency: string;
  pending: boolean;
  notice: string | null;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: GiftSubmission) => void;
}) {
  return (
    <Shell open={open} title="Record announced offertory" onClose={onClose}>
      <AnnouncedOffertoryForm
        offerings={offerings}
        defaultSessionDate={defaultSessionDate}
        currency={currency}
        pending={pending}
        notice={notice}
        error={error}
        onSubmit={onSubmit}
        onCancel={onClose}
      />
    </Shell>
  );
}

export function PledgeDialog({
  open,
  offerings,
  currency,
  pending,
  notice,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  offerings: readonly EventOfferingItem[];
  currency: string;
  pending: boolean;
  notice: string | null;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: PledgeSubmission) => void;
}) {
  return (
    <Shell open={open} title="Record pledge" onClose={onClose}>
      <PledgeForm
        offerings={offerings}
        currency={currency}
        pending={pending}
        notice={notice}
        error={error}
        onSubmit={onSubmit}
        onCancel={onClose}
      />
    </Shell>
  );
}
