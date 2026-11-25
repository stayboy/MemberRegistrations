import { createHash, createHmac } from 'node:crypto';
import { DeliveryUnavailableError } from '../errors/domain-errors.js';
import {
  flierStorageKey,
  type FlierLocator,
  type FlierStore,
  type FlierWrite,
} from './flier-store.js';

/**
 * The S3-compatible adapter (N-9): the same code serves MinIO in Compose and
 * Cloudflare R2 (or any other S3 target) in a hosted deployment, because both
 * speak S3. Requests are signed here rather than by a vendor SDK, which keeps
 * the dependency list and the port free of one vendor's vocabulary; path-style
 * addressing is what MinIO requires and R2 accepts.
 *
 * Only the three object operations a flier needs are implemented: put, get and
 * delete. No bucket policy, no presigning, no listing.
 */

export interface S3FlierStoreOptions {
  /** The S3 endpoint's origin, e.g. `http://minio:9000`. */
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Injectable so a test can drive a local double; defaults to global fetch. */
  fetch?: typeof fetch;
  /** The clock seam; defaults to now. */
  now?: () => Date;
}

/** RFC 3986: the only characters SigV4 leaves unescaped in a path segment. */
function encodeSegment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function sha256Hex(payload: Uint8Array | string): string {
  return createHash('sha256').update(payload).digest('hex');
}

function hmac(key: Uint8Array | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function amzDate(at: Date): { stamp: string; date: string } {
  const stamp = at.toISOString().replaceAll(/[:-]|\.\d{3}/g, '');
  return { stamp, date: stamp.slice(0, 8) };
}

export function createS3FlierStore(options: S3FlierStoreOptions): FlierStore {
  const endpoint = options.endpoint.replace(/\/+$/, '');
  const base = new URL(endpoint);
  const bucket = options.bucket.replace(/^\/+|\/+$/g, '');
  const region = options.region || 'us-east-1';
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());

  function objectUrl(key: string): URL {
    const path = `/${encodeSegment(bucket)}/${key.split('/').map(encodeSegment).join('/')}`;
    return new URL(`${base.origin}${base.pathname.replace(/\/+$/, '')}${path}`);
  }

  async function signedRequest(
    method: 'PUT' | 'GET' | 'DELETE',
    key: string,
    body: Uint8Array | null,
    contentType?: string,
  ): Promise<Response> {
    const url = objectUrl(key);
    const payloadHash = sha256Hex(body ?? new Uint8Array());
    const { stamp, date } = amzDate(now());
    const canonicalUri = url.pathname;
    const canonicalHeaders =
      `host:${url.host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${stamp}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      method,
      canonicalUri,
      url.searchParams.toString(),
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const scope = `${date}/${region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonicalRequest)].join('\n');

    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${options.secretAccessKey}`, date), region), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const headers: Record<string, string> = {
      Host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': stamp,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
    if (contentType) headers['Content-Type'] = contentType;

    try {
      return await doFetch(url, {
        method,
        headers,
        body: body ? new Uint8Array(body) : undefined,
      });
    } catch {
      throw new DeliveryUnavailableError('The flier store could not be reached');
    }
  }

  return {
    storage: 's3',

    async save(token: string, bytes: Uint8Array): Promise<FlierWrite> {
      const key = flierStorageKey(token);
      const response = await signedRequest('PUT', key, bytes, 'application/octet-stream');
      if (!response.ok) {
        await response.text().catch(() => '');
        throw new DeliveryUnavailableError('The flier store refused the upload');
      }
      return { storageKey: key, inlineBytes: null };
    },

    async load(locator: FlierLocator): Promise<Uint8Array | null> {
      const key = locator.storageKey ?? flierStorageKey(locator.token);
      const response = await signedRequest('GET', key, null);
      if (response.status === 404) return null;
      if (!response.ok) {
        await response.text().catch(() => '');
        throw new DeliveryUnavailableError('The flier store refused the read');
      }
      return new Uint8Array(await response.arrayBuffer());
    },

    async discard(locator: FlierLocator): Promise<void> {
      const key = locator.storageKey ?? flierStorageKey(locator.token);
      const response = await signedRequest('DELETE', key, null);
      // A delete of an object that is already gone is the same outcome.
      if (response.ok || response.status === 404) return;
      await response.text().catch(() => '');
      throw new DeliveryUnavailableError('The flier store refused the removal');
    },
  };
}
