import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYMENT_GATEWAY_SECRET,
  DEFAULT_USSD_CODE_PEPPER,
  DEFAULT_USSD_GATEWAY_SECRET,
  DEFAULT_USSD_PHONE_PEPPER,
  DEFAULT_VISITOR_PHONE_PEPPER,
  loadEnv,
} from '../../src/config/env.js';

const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/members',
  API_BEARER_TOKEN: 'production-api-token',
  RESEND_API_KEY: 're_production_key',
  MAGIC_LINK_FROM: 'noreply@example.com',
} satisfies NodeJS.ProcessEnv;

const productionSecrets = {
  VISITOR_PHONE_PEPPER: 'production-phone-pepper',
  USSD_GATEWAY_SECRET: 'production-ussd-gateway-secret',
  USSD_PHONE_PEPPER: 'production-ussd-phone-pepper',
  USSD_CODE_PEPPER: 'production-ussd-code-pepper',
  PAYMENT_GATEWAY_SECRET: 'production-payment-gateway-secret',
};

describe('environment', () => {
  it('fails a production boot without a visitor phone pepper override', () => {
    expect(() => loadEnv(production)).toThrow(/VISITOR_PHONE_PEPPER/);
  });

  it('fails a production boot with a development USSD or payment secret', () => {
    expect(() =>
      loadEnv({
        ...production,
        ...productionSecrets,
        USSD_GATEWAY_SECRET: DEFAULT_USSD_GATEWAY_SECRET,
      }),
    ).toThrow(/USSD_GATEWAY_SECRET/);
    expect(() =>
      loadEnv({
        ...production,
        ...productionSecrets,
        USSD_PHONE_PEPPER: DEFAULT_USSD_PHONE_PEPPER,
      }),
    ).toThrow(/USSD_PHONE_PEPPER/);
    expect(() =>
      loadEnv({ ...production, ...productionSecrets, USSD_CODE_PEPPER: DEFAULT_USSD_CODE_PEPPER }),
    ).toThrow(/USSD_CODE_PEPPER/);
    expect(() =>
      loadEnv({
        ...production,
        ...productionSecrets,
        PAYMENT_GATEWAY_SECRET: DEFAULT_PAYMENT_GATEWAY_SECRET,
      }),
    ).toThrow(/PAYMENT_GATEWAY_SECRET/);
  });

  it('accepts production with explicit secrets and USSD disabled', () => {
    const env = loadEnv({ ...production, ...productionSecrets });
    expect(env.VISITOR_PHONE_PEPPER).toBe('production-phone-pepper');
    expect(env.USSD_ENABLED).toBe(false);
    expect(env.USSD_GATEWAY_SECRET).toBe('production-ussd-gateway-secret');
    expect(env.PAYMENT_GATEWAY_SECRET).toBe('production-payment-gateway-secret');
  });

  it('refuses to enable USSD in production', () => {
    expect(() => loadEnv({ ...production, ...productionSecrets, USSD_ENABLED: 'true' })).toThrow(
      /USSD_ENABLED/,
    );
  });

  it('keeps the development and test defaults', () => {
    expect(loadEnv({ NODE_ENV: 'development' }).VISITOR_PHONE_PEPPER).toBe(
      DEFAULT_VISITOR_PHONE_PEPPER,
    );
    expect(loadEnv({ NODE_ENV: 'test' }).VISITOR_PHONE_PEPPER).toBe(DEFAULT_VISITOR_PHONE_PEPPER);
    expect(loadEnv({ NODE_ENV: 'test' }).USSD_ENABLED).toBe(false);
    expect(loadEnv({ NODE_ENV: 'test' }).PAYMENT_GATEWAY_SECRET).toBe(
      DEFAULT_PAYMENT_GATEWAY_SECRET,
    );
  });
});
