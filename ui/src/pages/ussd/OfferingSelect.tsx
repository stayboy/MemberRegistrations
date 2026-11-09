import { Dropdown, Field, Option } from '@fluentui/react-components';
import type { EventOfferingItem } from '../../api/events';

/**
 * The offering selector shared by the count card and the announced-gift and
 * pledge forms. It lists the event's active attachments and their current terms
 * currency; the caller owns the selected id.
 */
export function OfferingSelect({
  offerings,
  value,
  onChange,
  disabled = false,
  label = 'Offering',
}: {
  offerings: readonly EventOfferingItem[];
  value: string | null;
  onChange: (offeringId: string | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const selected = offerings.find((offering) => offering.offeringId === value);

  return (
    <Field label={label}>
      <Dropdown
        aria-label={label}
        placeholder={offerings.length === 0 ? 'No active offering' : 'Choose an offering'}
        value={selected ? `${selected.name} · ${selected.terms.currency}` : ''}
        selectedOptions={selected ? [selected.offeringId] : []}
        disabled={disabled || offerings.length === 0}
        onOptionSelect={(_, data) => {
          onChange(data.optionValue ? data.optionValue : null);
        }}
      >
        {offerings.map((offering) => (
          <Option
            key={offering.offeringId}
            value={offering.offeringId}
            text={`${offering.name} · ${offering.terms.currency}`}
          >
            {offering.name} · {offering.terms.currency}
          </Option>
        ))}
      </Dropdown>
    </Field>
  );
}
