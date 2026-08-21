export function sanitize(value: unknown) {
  return String(value || '').trim();
}

export function toPositiveInt(value: unknown, fallback = 0) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function inEnum<T extends string>(value: string, allowed: T[], fallback: T): T {
  return (allowed.includes(value as T) ? value : fallback) as T;
}

export function requireNonEmptyString(value: string, min = 1, max = 255) {
  return value.trim().length >= min && value.trim().length <= max;
}

export const INDONESIAN_MOBILE_PREFIXES = [
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '21',
  '22',
  '23',
  '31',
  '32',
  '33',
  '38',
  '51',
  '52',
  '53',
  '55',
  '56',
  '57',
  '58',
  '59',
  '77',
  '78',
  '81',
  '82',
  '83',
  '84',
  '85',
  '86',
  '87',
  '88',
  '89',
  '95',
  '96',
  '97',
  '98',
  '99',
] as const;

const INDONESIAN_MOBILE_PREFIX_PATTERN = INDONESIAN_MOBILE_PREFIXES.join('|');

export const INDONESIAN_WA_REGEX = new RegExp(`^628(${INDONESIAN_MOBILE_PREFIX_PATTERN})\\d{5,8}$`);

export function isValidWa62(value: string) {
  return INDONESIAN_WA_REGEX.test(value);
}

/**
 * The one Indonesian phone normaliser for input, validation, and persistence.
 * `meta-identity.ts` keeps a separate `toE164Digits` on purpose: this one must
 * tolerate a half-typed number so a live input event does not erase what the
 * buyer is still typing, while that one must return nothing rather than hash a
 * number it cannot vouch for.
 */
export function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (!digits) return '';
  // `0062…` is how a phone keyboard writes the international prefix. Without
  // this the leading zero was treated as the local trunk prefix and the number
  // became `620062…`, which the submit schema then rejected — a real customer,
  // typing a real number, told it was invalid.
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('620')) return `62${digits.slice(3)}`;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  if (digits.startsWith('62')) return digits;
  return digits;
}
