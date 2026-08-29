import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  }

  return env.DB;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

export function getApWebhookSecret(): string {
  const secret = env.AP_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error('AP_WEBHOOK_SECRET is unavailable.');
  }

  return secret;
}

function getHttpsEnvUrl(name: 'AP_ACCOUNT_API_URL' | 'AP_ATTENDANCE_API_URL'): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is unavailable.`);

  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(`${name} must be an HTTPS URL without credentials.`);
  }
  return url.toString();
}

export function getApAccountApiUrl(): string {
  return getHttpsEnvUrl('AP_ACCOUNT_API_URL');
}

export function getApAttendanceApiUrl(): string {
  return getHttpsEnvUrl('AP_ATTENDANCE_API_URL');
}
