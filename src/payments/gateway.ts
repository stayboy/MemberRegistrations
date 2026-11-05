/**
 * The payment gateway port. The stub is an in-process adapter; a real
 * aggregator replaces it without changing the money path or the wire
 * contracts. No card data ever crosses this port.
 */
export interface PaymentItem {
  offeringId: string;
  name: string;
  amountMinor: number;
  termsVersion: number;
}

export type PaymentPayer = { memberNo: string } | { phoneHash: string };

export interface InitiatePaymentInput {
  reference: string;
  totalMinor: number;
  currency: string;
  payer: PaymentPayer;
  items: PaymentItem[];
}

export interface InitiatedPayment {
  reference: string;
  status: 'initiated';
}

export interface PaymentGateway {
  initiate(input: InitiatePaymentInput): Promise<InitiatedPayment>;
}

/** Records the intent in-process and reports it initiated; no network call. */
export class StubPaymentGateway implements PaymentGateway {
  async initiate(input: InitiatePaymentInput): Promise<InitiatedPayment> {
    return { reference: input.reference, status: 'initiated' };
  }
}
