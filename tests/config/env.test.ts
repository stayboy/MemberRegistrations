import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COUNTRY_CODE,
  DEFAULT_OTP_PEPPER,
  DEFAULT_PAYMENT_GATEWAY_SECRET,
  DEFAULT_REGISTRATION_PHONE_KEY,
  DEFAULT_USSD_CODE_PEPPER,
  DEFAULT_USSD_GATEWAY_SECRET,
  DEFAULT_USSD_NALO_MAX_MSG_CHARS,
  DEFAULT_USSD_NALO_USER_ID,
  DEFAULT_USSD_PHONE_PEPPER,
  DEFAULT_VERIFICATION_LINK_BASE,
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
  OTP_PEPPER: 'production-otp-pepper',
  REGISTRATION_PHONE_KEY: 'production-registration-key',
  VERIFICATION_LINK_BASE: 'https://register.example.test/v',
  USSD_GATEWAY_SECRET: 'production-ussd-gateway-secret',
  USSD_PHONE_PEPPER: 'production-ussd-phone-pepper',
  USSD_CODE_PEPPER: 'production-ussd-code-pepper',
  USSD_NALO_USER_ID: 'production-nalo-client',
  PAYMENT_GATEWAY_SECRET: 'production-payment-gateway-secret',
};

describe('environment', () => {
  it('fails a production boot without a visitor phone pepper override', () => {
    expect(() => loadEnv(production)).toThrow(/VISITOR_PHONE_PEPPER/);
  });

  it('fails a production boot without an OTP pepper override', () => {
    expect(() =>
      loadEnv({ ...production, VISITOR_PHONE_PEPPER: 'production-phone-pepper' }),
    ).toThrow(/OTP_PEPPER/);
  });

  it('fails a production boot without a registration phone key or a link base', () => {
    expect(() =>
      loadEnv({
        ...production,
        VISITOR_PHONE_PEPPER: 'production-phone-pepper',
        OTP_PEPPER: 'production-otp-pepper',
      }),
    ).toThrow(/REGISTRATION_PHONE_KEY/);

    expect(() =>
      loadEnv({
        ...production,
        VISITOR_PHONE_PEPPER: 'production-phone-pepper',
        OTP_PEPPER: 'production-otp-pepper',
        REGISTRATION_PHONE_KEY: 'production-registration-key',
      }),
    ).toThrow(/VERIFICATION_LINK_BASE/);
  });

  it('boots production with only the required names and both subsystems off', () => {
    const env = loadEnv({
      ...production,
      VISITOR_PHONE_PEPPER: 'production-phone-pepper',
      OTP_PEPPER: 'production-otp-pepper',
      REGISTRATION_PHONE_KEY: 'production-registration-key',
      VERIFICATION_LINK_BASE: 'https://register.example.test/v',
    });
    expect(env.USSD_ENABLED).toBe(false);
    expect(env.PAYMENTS_ENABLED).toBe(false);
    // Codes are stored under this pepper; a production boot never keeps the
    // development default.
    expect(env.OTP_PEPPER).toBe('production-otp-pepper');
    expect(env.REGISTRATION_PHONE_KEY).toBe('production-registration-key');
    expect(env.VERIFICATION_LINK_BASE).toBe('https://register.example.test/v');
    // The disabled subsystems keep their development defaults; they are inert.
    expect(env.USSD_GATEWAY_SECRET).toBe(DEFAULT_USSD_GATEWAY_SECRET);
    expect(env.USSD_PHONE_PEPPER).toBe(DEFAULT_USSD_PHONE_PEPPER);
    expect(env.USSD_CODE_PEPPER).toBe(DEFAULT_USSD_CODE_PEPPER);
    expect(env.USSD_NALO_USER_ID).toBe(DEFAULT_USSD_NALO_USER_ID);
    expect(env.PAYMENT_GATEWAY_SECRET).toBe(DEFAULT_PAYMENT_GATEWAY_SECRET);
  });

  it('fails a production boot with a development secret when that subsystem is on', () => {
    expect(() =>
      loadEnv({
        ...production,
        ...productionSecrets,
        USSD_ENABLED: 'true',
        USSD_GATEWAY_SECRET: DEFAULT_USSD_GATEWAY_SECRET,
      }),
    ).toThrow(/USSD_GATEWAY_SECRET/);
    expect(() =>
      loadEnv({
        ...production,
        ...productionSecrets,
        USSD_ENABLED: 'true',
        USSD_PHONE_PEPPER: DEFAULT_USSD_PHONE_PEPPER,
      }),
    ).toThrow(/USSD_PHONE_PEPPER/);
    expect(() =>
      loadEnv({
        ...production,
        ...productionSecrets,
        USSD_ENABLED: 'true',
        USSD_CODE_PEPPER: DEFAULT_USSD_CODE_PEPPER,
      }),
    ).toThrow(/USSD_CODE_PEPPER/);
    expect(() =>
      loadEnv({
        ...production,
        ...productionSecrets,
        USSD_ENABLED: 'true',
        USSD_NALO_USER_ID: DEFAULT_USSD_NALO_USER_ID,
      }),
    ).toThrow(/USSD_NALO_USER_ID/);
    expect(() =>
      loadEnv({
        ...production,
        ...productionSecrets,
        PAYMENTS_ENABLED: 'true',
        PAYMENT_GATEWAY_SECRET: DEFAULT_PAYMENT_GATEWAY_SECRET,
      }),
    ).toThrow(/PAYMENT_GATEWAY_SECRET/);
  });

  it('validates the Nalo client id and message cap bounds', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).USSD_NALO_USER_ID).toBe(DEFAULT_USSD_NALO_USER_ID);
    expect(loadEnv({ NODE_ENV: 'test' }).USSD_NALO_MAX_MSG_CHARS).toBe(
      DEFAULT_USSD_NALO_MAX_MSG_CHARS,
    );
    expect(loadEnv({ NODE_ENV: 'test', USSD_NALO_USER_ID: 'a' }).USSD_NALO_USER_ID).toBe('a');
    expect(
      loadEnv({ NODE_ENV: 'test', USSD_NALO_USER_ID: 'x'.repeat(32) }).USSD_NALO_USER_ID,
    ).toHaveLength(32);
    expect(() => loadEnv({ NODE_ENV: 'test', USSD_NALO_USER_ID: '' })).toThrow(/USSD_NALO_USER_ID/);
    expect(() => loadEnv({ NODE_ENV: 'test', USSD_NALO_USER_ID: 'x'.repeat(33) })).toThrow(
      /USSD_NALO_USER_ID/,
    );
    expect(
      loadEnv({ NODE_ENV: 'test', USSD_NALO_MAX_MSG_CHARS: '1' }).USSD_NALO_MAX_MSG_CHARS,
    ).toBe(1);
    expect(
      loadEnv({ NODE_ENV: 'test', USSD_NALO_MAX_MSG_CHARS: '182' }).USSD_NALO_MAX_MSG_CHARS,
    ).toBe(182);
    expect(() => loadEnv({ NODE_ENV: 'test', USSD_NALO_MAX_MSG_CHARS: '0' })).toThrow(
      /USSD_NALO_MAX_MSG_CHARS/,
    );
    expect(() => loadEnv({ NODE_ENV: 'test', USSD_NALO_MAX_MSG_CHARS: '183' })).toThrow(
      /USSD_NALO_MAX_MSG_CHARS/,
    );
  });

  it('accepts production with explicit secrets and both subsystems off', () => {
    const env = loadEnv({ ...production, ...productionSecrets });
    expect(env.VISITOR_PHONE_PEPPER).toBe('production-phone-pepper');
    expect(env.OTP_PEPPER).toBe('production-otp-pepper');
    expect(env.REGISTRATION_PHONE_KEY).toBe('production-registration-key');
    expect(env.VERIFICATION_LINK_BASE).toBe('https://register.example.test/v');
    expect(env.USSD_ENABLED).toBe(false);
    expect(env.PAYMENTS_ENABLED).toBe(false);
    expect(env.USSD_GATEWAY_SECRET).toBe('production-ussd-gateway-secret');
    expect(env.PAYMENT_GATEWAY_SECRET).toBe('production-payment-gateway-secret');
  });

  it('accepts production with payments enabled and a real secret', () => {
    const env = loadEnv({
      ...production,
      VISITOR_PHONE_PEPPER: 'production-phone-pepper',
      OTP_PEPPER: 'production-otp-pepper',
      REGISTRATION_PHONE_KEY: 'production-registration-key',
      VERIFICATION_LINK_BASE: 'https://register.example.test/v',
      PAYMENTS_ENABLED: 'true',
      PAYMENT_GATEWAY_SECRET: 'production-payment-gateway-secret',
    });
    expect(env.PAYMENTS_ENABLED).toBe(true);
  });

  it('refuses to enable USSD in production', () => {
    expect(() => loadEnv({ ...production, ...productionSecrets, USSD_ENABLED: 'true' })).toThrow(
      /USSD_ENABLED must be false when NODE_ENV=production until a real aggregator exists/,
    );
  });

  it('keeps USSD driveable with the development defaults outside production', () => {
    const env = loadEnv({ NODE_ENV: 'development', USSD_ENABLED: 'true' });
    expect(env.USSD_ENABLED).toBe(true);
    expect(env.USSD_GATEWAY_SECRET).toBe(DEFAULT_USSD_GATEWAY_SECRET);
  });

  it('keeps the development and test defaults', () => {
    expect(loadEnv({ NODE_ENV: 'development' }).VISITOR_PHONE_PEPPER).toBe(
      DEFAULT_VISITOR_PHONE_PEPPER,
    );
    expect(loadEnv({ NODE_ENV: 'test' }).VISITOR_PHONE_PEPPER).toBe(DEFAULT_VISITOR_PHONE_PEPPER);
    expect(loadEnv({ NODE_ENV: 'test' }).OTP_PEPPER).toBe(DEFAULT_OTP_PEPPER);
    expect(loadEnv({ NODE_ENV: 'test' }).REGISTRATION_PHONE_KEY).toBe(
      DEFAULT_REGISTRATION_PHONE_KEY,
    );
    expect(loadEnv({ NODE_ENV: 'test' }).VERIFICATION_LINK_BASE).toBe(
      DEFAULT_VERIFICATION_LINK_BASE,
    );
    expect(loadEnv({ NODE_ENV: 'test' }).DEFAULT_COUNTRY_CODE).toBe(DEFAULT_COUNTRY_CODE);
    expect(loadEnv({ NODE_ENV: 'test' }).WHATSAPP_SEND_URL).toBeUndefined();
    expect(loadEnv({ NODE_ENV: 'test' }).SMS_SEND_URL).toBeUndefined();
    expect(loadEnv({ NODE_ENV: 'test' }).MESSAGE_SEND_TOKEN).toBeUndefined();
    expect(loadEnv({ NODE_ENV: 'test' }).USSD_ENABLED).toBe(false);
    expect(loadEnv({ NODE_ENV: 'test' }).PAYMENTS_ENABLED).toBe(false);
    expect(loadEnv({ NODE_ENV: 'test', PAYMENTS_ENABLED: 'true' }).PAYMENTS_ENABLED).toBe(true);
    expect(loadEnv({ NODE_ENV: 'test' }).PAYMENT_GATEWAY_SECRET).toBe(
      DEFAULT_PAYMENT_GATEWAY_SECRET,
    );
  });

  it('validates the country code and the provider-neutral sender settings', () => {
    expect(loadEnv({ NODE_ENV: 'test', DEFAULT_COUNTRY_CODE: '1' }).DEFAULT_COUNTRY_CODE).toBe('1');
    expect(loadEnv({ NODE_ENV: 'test', DEFAULT_COUNTRY_CODE: '234' }).DEFAULT_COUNTRY_CODE).toBe(
      '234',
    );
    expect(() => loadEnv({ NODE_ENV: 'test', DEFAULT_COUNTRY_CODE: '1234' })).toThrow(
      /DEFAULT_COUNTRY_CODE/,
    );
    expect(() => loadEnv({ NODE_ENV: 'test', DEFAULT_COUNTRY_CODE: '+233' })).toThrow(
      /DEFAULT_COUNTRY_CODE/,
    );

    const configured = loadEnv({
      NODE_ENV: 'test',
      WHATSAPP_SEND_URL: 'https://messages.example.test/whatsapp',
      SMS_SEND_URL: 'https://messages.example.test/sms',
      MESSAGE_SEND_TOKEN: 'provider-token',
    });
    expect(configured.WHATSAPP_SEND_URL).toBe('https://messages.example.test/whatsapp');
    expect(configured.SMS_SEND_URL).toBe('https://messages.example.test/sms');
    expect(configured.MESSAGE_SEND_TOKEN).toBe('provider-token');
    expect(() => loadEnv({ NODE_ENV: 'test', WHATSAPP_SEND_URL: 'not-a-url' })).toThrow(
      /WHATSAPP_SEND_URL/,
    );
  });

  it('validates the registration key length and the acceptance page URL', () => {
    expect(() => loadEnv({ NODE_ENV: 'test', REGISTRATION_PHONE_KEY: 'too-short' })).toThrow(
      /REGISTRATION_PHONE_KEY/,
    );
    expect(
      loadEnv({ NODE_ENV: 'test', REGISTRATION_PHONE_KEY: 'a-valid-key-of-16' })
        .REGISTRATION_PHONE_KEY,
    ).toBe('a-valid-key-of-16');
    expect(() => loadEnv({ NODE_ENV: 'test', VERIFICATION_LINK_BASE: 'not-a-url' })).toThrow(
      /VERIFICATION_LINK_BASE/,
    );
    expect(
      loadEnv({ NODE_ENV: 'test', VERIFICATION_LINK_BASE: 'https://example.test/v' })
        .VERIFICATION_LINK_BASE,
    ).toBe('https://example.test/v');
  });

  it('rejects a PAYMENTS_ENABLED value other than true or false', () => {
    expect(() => loadEnv({ NODE_ENV: 'test', PAYMENTS_ENABLED: 'yes' })).toThrow(
      /PAYMENTS_ENABLED/,
    );
  });
});
