import { describe, expect, it } from 'vitest';
import { DEFAULT_VISITOR_PHONE_PEPPER, loadEnv } from '../../src/config/env.js';

const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/members',
  API_BEARER_TOKEN: 'production-api-token',
  RESEND_API_KEY: 're_production_key',
  MAGIC_LINK_FROM: 'noreply@example.com',
} satisfies NodeJS.ProcessEnv;

describe('environment', () => {
  it('fails a production boot without a visitor phone pepper override', () => {
    expect(() => loadEnv(production)).toThrow(/VISITOR_PHONE_PEPPER/);
  });

  it('accepts production with an explicit visitor phone pepper', () => {
    const env = loadEnv({ ...production, VISITOR_PHONE_PEPPER: 'production-phone-pepper' });
    expect(env.VISITOR_PHONE_PEPPER).toBe('production-phone-pepper');
  });

  it('keeps the development and test default', () => {
    expect(loadEnv({ NODE_ENV: 'development' }).VISITOR_PHONE_PEPPER).toBe(
      DEFAULT_VISITOR_PHONE_PEPPER,
    );
    expect(loadEnv({ NODE_ENV: 'test' }).VISITOR_PHONE_PEPPER).toBe(DEFAULT_VISITOR_PHONE_PEPPER);
  });
});
