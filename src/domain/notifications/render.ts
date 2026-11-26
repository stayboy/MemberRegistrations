import { ValidationError } from '../../errors/domain-errors.js';
import {
  EMAIL_TEXT_VARIABLES,
  escapeHtml,
  substituteHtml,
  substitutePlain,
  type NotificationValues,
} from './variables.js';

/**
 * The four renders (member-registrations-event-notifications.md N-7, FR-13).
 *
 * Email is the only rich surface: a closed TipTap document becomes HTML plus the
 * stored plain-text alternative. WhatsApp is an approved template and ordered
 * parameter values, never prose and never a URL in the body. SMS is plain text
 * with its encoding and segment count. USSD is the inbox screen sequence inside
 * the adapter's budget. Nothing here calls a provider or writes anything.
 */

/** The one closed editor set (N-7); anything else is a client extension. */
const EMAIL_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'hardBreak',
  'bulletList',
  'orderedList',
  'listItem',
  'image',
]);

const EMAIL_MARK_TYPES = new Set(['bold', 'italic', 'underline', 'strike', 'link']);

const SAFE_LINK = /^(https?:\/\/|mailto:|\/)/i;

export interface EmailNode {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: EmailNode[];
  text?: string;
}

function nodeError(message: string): never {
  throw new ValidationError(message, 'invalid_email_body');
}

/**
 * The document is structured JSON from the editor, never HTML (FR-15). This
 * walks the closed set and refuses an unknown node, an unsafe link target and a
 * heading level the editor does not offer; the text it accepts is escaped by the
 * renderer, so a `<script>` in a text node is inert.
 */
export function validateEmailDocument(document: unknown): EmailNode {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    nodeError('body: the email body must be a structured document, not a string');
  }
  const root = document as EmailNode;
  if (root.type !== 'doc') nodeError('body: the document root must be `doc`');
  if (root.text !== undefined) nodeError('body: a document node carries no text');

  const visit = (node: EmailNode): void => {
    if (!EMAIL_NODE_TYPES.has(node.type)) {
      nodeError(`body: the editor has no \`${node.type}\` node`);
    }
    if (node.type === 'text') {
      if (typeof node.text !== 'string') nodeError('body: a text node needs its text');
    }
    if (node.type === 'heading') {
      const level = node.attrs?.level;
      if (level !== 2 && level !== 3) nodeError('body: a heading is level 2 or 3');
    }
    if (node.type === 'image') {
      const source = node.attrs?.src;
      if (typeof source !== 'string' || !SAFE_LINK.test(source)) {
        nodeError('body: an image needs an http(s) or same-origin src');
      }
    }
    for (const mark of node.marks ?? []) {
      if (!EMAIL_MARK_TYPES.has(mark.type)) {
        nodeError(`body: the editor has no \`${mark.type}\` mark`);
      }
      if (mark.type === 'link') {
        const href = mark.attrs?.href;
        if (typeof href !== 'string' || !SAFE_LINK.test(href)) {
          nodeError('body: a link needs an http(s), mailto or same-origin href');
        }
      }
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(root);
  return root;
}

function renderTextNode(node: EmailNode, values: NotificationValues): string {
  // The stored text is escaped first, then each variable value is escaped as it
  // is substituted, so neither the author nor a member's name can inject markup.
  let html = escapeHtml(node.text ?? '');
  html = substituteHtml(html, values);
  for (const mark of [...(node.marks ?? [])].reverse()) {
    switch (mark.type) {
      case 'bold':
        html = `<strong>${html}</strong>`;
        break;
      case 'italic':
        html = `<em>${html}</em>`;
        break;
      case 'underline':
        html = `<u>${html}</u>`;
        break;
      case 'strike':
        html = `<s>${html}</s>`;
        break;
      case 'link':
        html = `<a href="${escapeHtml(String(mark.attrs?.href ?? ''))}">${html}</a>`;
        break;
    }
  }
  return html;
}

function renderNode(node: EmailNode, values: NotificationValues): string {
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map((child) => renderNode(child, values)).join('');
    case 'paragraph':
      return `<p style="margin:0 0 12px">${(node.content ?? [])
        .map((child) => renderNode(child, values))
        .join('')}</p>`;
    case 'heading': {
      const level = node.attrs?.level === 3 ? 3 : 2;
      return `<h${level} style="margin:18px 0 8px;font-size:${level === 3 ? 17 : 20}px">${(
        node.content ?? []
      )
        .map((child) => renderNode(child, values))
        .join('')}</h${level}>`;
    }
    case 'text':
      return renderTextNode(node, values);
    case 'hardBreak':
      return '<br>';
    case 'bulletList':
      return `<ul style="margin:0 0 12px;padding-left:20px">${(node.content ?? [])
        .map((child) => renderNode(child, values))
        .join('')}</ul>`;
    case 'orderedList':
      return `<ol style="margin:0 0 12px;padding-left:20px">${(node.content ?? [])
        .map((child) => renderNode(child, values))
        .join('')}</ol>`;
    case 'listItem':
      return `<li>${(node.content ?? []).map((child) => renderNode(child, values)).join('')}</li>`;
    case 'image':
      return `<img src="${escapeHtml(String(node.attrs?.src ?? ''))}" alt="${escapeHtml(
        String(node.attrs?.alt ?? ''),
      )}" style="max-width:100%;height:auto">`;
    default:
      nodeError(`body: the editor has no \`${node.type}\` node`);
  }
}

export interface EmailTemplateContent {
  subject: string;
  body: EmailNode;
  bodyText: string;
}

export interface RenderedAttachment {
  filename: string;
  contentType: string;
  url: string;
  inline: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  attachments: RenderedAttachment[];
}

const EXTENSION: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export interface FlierReference {
  url: string;
  contentType: string;
  token: string;
}

function emailShell(bodyHtml: string, values: NotificationValues, replyTo: string | null): string {
  const churchName = escapeHtml(values.churchName ?? '');
  const reply = replyTo
    ? `<br>Reply to <a href="mailto:${escapeHtml(replyTo)}">${escapeHtml(replyTo)}</a>`
    : '';
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1b1b1b">' +
    bodyHtml +
    '<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">' +
    `<p style="font-size:12px;color:#666;margin:0">${churchName}<br>Manage alerts in USSD${reply}</p>` +
    '</div>'
  );
}

/**
 * Email: HTML from the document, the stored plain-text alternative, and the
 * flier as an inline attachment (FR-13, N-9). The attachment URL is the public
 * immutable `/fliers/{token}` path; R3's sender prefixes the API origin.
 */
export function renderEmail(
  content: EmailTemplateContent,
  values: NotificationValues,
  flier: FlierReference | null,
  replyTo: string | null,
): RenderedEmail {
  const document = validateEmailDocument(content.body);
  const bodyHtml = renderNode(document, values);
  const subject = substitutePlain(content.subject, values).replaceAll(/[\r\n]+/g, ' ');
  const text = substitutePlain(content.bodyText, values, EMAIL_TEXT_VARIABLES);
  return {
    subject,
    html: emailShell(bodyHtml, values, replyTo),
    text,
    attachments: flier
      ? [
          {
            filename: `flier.${EXTENSION[flier.contentType] ?? 'bin'}`,
            contentType: flier.contentType,
            url: flier.url,
            inline: true,
          },
        ]
      : [],
  };
}

export interface WhatsAppTemplateContent {
  templateName: string;
  parameterMap: Record<string, number>;
}

export interface RenderedWhatsApp {
  templateName: string;
  parameters: Array<{ name: string; slot: number; value: string }>;
  body: string;
  headerMediaUrl: string | null;
}

const PARAMETER_NAME = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * WhatsApp: the approved template's name and its ordered parameter values, which
 * is exactly what the provider interpolates into `{{1}}…{{n}}`. The flier is the
 * template header, so no body text carries a URL (N-7).
 */
export function renderWhatsApp(
  content: WhatsAppTemplateContent,
  values: NotificationValues,
  flier: FlierReference | null,
): RenderedWhatsApp {
  const entries = Object.entries(content.parameterMap);
  if (entries.length === 0) {
    throw new ValidationError(
      'templates.whatsapp.parameterMap: name at least one variable',
      'invalid_parameter_map',
    );
  }
  const slots = new Set<number>();
  for (const [name, slot] of entries) {
    if (!PARAMETER_NAME.test(name)) {
      throw new ValidationError(
        `templates.whatsapp.parameterMap.${name}: not a variable name`,
        'unknown_variable',
      );
    }
    if (!slots.has(slot)) slots.add(slot);
    else
      throw new ValidationError(
        `templates.whatsapp.parameterMap.${name}: slot ${slot} is used twice`,
        'invalid_parameter_map',
      );
  }
  const highest = Math.max(...slots);
  if (slots.size !== highest || [...slots].some((slot) => slot < 1)) {
    throw new ValidationError(
      'templates.whatsapp.parameterMap: slots must be 1..n with no gap',
      'invalid_parameter_map',
    );
  }

  const parameters = entries
    .map(([name, slot]) => ({
      name,
      slot,
      value: substitutePlain(`{{${name}}}`, values),
    }))
    .sort((left, right) => left.slot - right.slot);

  return {
    templateName: content.templateName,
    parameters,
    body: parameters.map((parameter) => parameter.value).join(' · '),
    headerMediaUrl: flier?.url ?? null,
  };
}

/**
 * The GSM 03.38 basic and extension tables. A character outside both switches
 * the whole message to UCS-2, which halves the per-segment budget (FR-13).
 */
const GSM_BASIC = new Set(
  [
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
  ].join(''),
);
const GSM_EXTENSION = new Set('^{}\\[~]|€');

export interface RenderedSms {
  body: string;
  encoding: 'gsm7' | 'ucs2';
  length: number;
  segments: number;
}

export function smsSegments(body: string): RenderedSms {
  let gsm7 = true;
  let length = 0;
  for (const character of body) {
    if (GSM_BASIC.has(character)) length += 1;
    else if (GSM_EXTENSION.has(character)) length += 2;
    else {
      gsm7 = false;
      break;
    }
  }
  if (!gsm7) length = body.length; // UTF-16 code units, which is what UCS-2 bills
  const single = gsm7 ? 160 : 70;
  const multi = gsm7 ? 153 : 67;
  const segments = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
  return { body, encoding: gsm7 ? 'gsm7' : 'ucs2', length, segments };
}

export function renderSms(bodyText: string, values: NotificationValues): RenderedSms {
  return smsSegments(substitutePlain(bodyText, values));
}

/** The Nalo adapter's cap; a longer body paginates rather than truncating. */
export const DEFAULT_USSD_BUDGET = 120;
export const USSD_MORE_MARKER = '0 More';

export interface RenderedUssd {
  body: string;
  screens: string[];
  budget: number;
}

/**
 * USSD: one body, paginated into screens inside the adapter budget. Every screen
 * but the last carries the fixed `0 More` key, and the key is part of the budget
 * so a screen can never overflow it (EC-12).
 */
export function paginateUssd(body: string, budget: number = DEFAULT_USSD_BUDGET): string[] {
  if (!Number.isInteger(budget) || budget < 9) {
    throw new ValidationError('budget: must be an integer of at least 9', 'invalid_budget');
  }
  let remaining = body.trim();
  if (remaining === '') return [''];
  const screens: string[] = [];
  while (remaining.length > budget) {
    const room = budget - (USSD_MORE_MARKER.length + 1);
    const space = remaining.lastIndexOf(' ', room);
    const cut = space > 0 ? space : room;
    const chunk = remaining.slice(0, cut).trimEnd();
    remaining = remaining.slice(cut).trimStart();
    screens.push(`${chunk}\n${USSD_MORE_MARKER}`);
  }
  screens.push(remaining);
  return screens;
}

export function renderUssd(
  bodyText: string,
  values: NotificationValues,
  budget: number = DEFAULT_USSD_BUDGET,
): RenderedUssd {
  const body = substitutePlain(bodyText, values);
  return { body, screens: paginateUssd(body, budget), budget };
}
