// src/lib/neon.js
// Neon Postgres serverless client for Musik Pintar
import { neon } from '@neondatabase/serverless';

const isDesktop = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
const databaseUrl = isDesktop ? null : (import.meta.env.VITE_DATABASE_URL || import.meta.env.DATABASE_URL);

export const neonSql = databaseUrl
  ? neon(databaseUrl, { disableWarningInBrowsers: true })
  : null;
