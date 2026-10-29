// backend/src/config/db.ts

import mongoose from 'mongoose';
import { env } from './env';

let listenersRegistered = false;

export function getSanitizedMongoUri(uri: string): string {
  try {
    return uri.replace(/\/\/[^@]+@/, '//***:***@');
  } catch {
    return 'mongodb://***:***@hidden';
  }
}

interface DoHAnswer {
  type: number;
  data: string;
}

interface DoHResponse {
  Status?: number;
  Answer?: DoHAnswer[];
}

async function queryDoH(name: string, type: 'SRV' | 'TXT'): Promise<DoHAnswer[]> {
  const endpoints = [
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as DoHResponse;
      if (json.Status === 0 && Array.isArray(json.Answer) && json.Answer.length > 0) {
        return json.Answer;
      }
    } catch {
      // Try next DoH provider
    }
  }
  return [];
}

/**
 * Resolves a mongodb+srv:// URI into a standard mongodb://shard1:27017,shard2:27017,... URI
 * over HTTPS (port 443) so ISP/campus UDP DNS blocks never trigger `querySrv ETIMEOUT`.
 */
async function resolveSrvUriOverHttps(srvUri: string): Promise<string> {
  if (!srvUri.startsWith('mongodb+srv://')) return srvUri;

  try {
    const parsed = new URL(srvUri);
    const hostname = parsed.hostname;

    const [srvAnswers, txtAnswers] = await Promise.all([
      queryDoH(`_mongodb._tcp.${hostname}`, 'SRV'),
      queryDoH(hostname, 'TXT'),
    ]);

    const hosts: string[] = [];
    for (const ans of srvAnswers) {
      if (ans.type !== 33) continue; // 33 = SRV record
      const parts = ans.data.trim().split(/\s+/);
      if (parts.length >= 4) {
        const port = parts[2];
        const target = parts[3].replace(/\.$/, '');
        hosts.push(`${target}:${port}`);
      }
    }

    if (hosts.length === 0) {
      return srvUri;
    }

    const mergedParams = new URLSearchParams();
    for (const ans of txtAnswers) {
      if (ans.type !== 16) continue; // 16 = TXT record
      const rawTxt = ans.data.replace(/^"|"$/g, '').replace(/"\s*"/g, '');
      const txtParams = new URLSearchParams(rawTxt);
      txtParams.forEach((val, key) => mergedParams.set(key, val));
    }

    parsed.searchParams.forEach((val, key) => mergedParams.set(key, val));
    if (!mergedParams.has('ssl') && !mergedParams.has('tls')) {
      mergedParams.set('ssl', 'true');
    }
    if (!mergedParams.has('authSource')) {
      mergedParams.set('authSource', 'admin');
    }

    const authPrefix = parsed.username
      ? `${parsed.username}:${parsed.password}@`
      : '';
    const dbPath = parsed.pathname || '/timora_db';

    return `mongodb://${authPrefix}${hosts.join(',')}${dbPath}?${mergedParams.toString()}`;
  } catch {
    return srvUri;
  }
}

function registerConnectionListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('error', (err) => {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[TIMORA DB] Runtime socket error: ${getSanitizedMongoUri(errorMsg)}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[TIMORA DB] Disconnected from MongoDB.');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[TIMORA DB] Reconnected to MongoDB successfully.');
  });
}

const MONGOOSE_CONNECT_OPTIONS: mongoose.ConnectOptions = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxIdleTimeMS: 30000,
  heartbeatFrequencyMS: 10000,
  maxPoolSize: 10,
  minPoolSize: 1,
  family: 4, // Force IPv4
};

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  registerConnectionListeners();

  const sanitizedPrimary = getSanitizedMongoUri(env.MONGODB_URI);

  // Resolve mongodb+srv:// via HTTPS DNS so UDP querySrv ETIMEOUT cannot occur
  const resolvedUri = await resolveSrvUriOverHttps(env.MONGODB_URI);

  try {
    await mongoose.connect(resolvedUri, MONGOOSE_CONNECT_OPTIONS);
    console.log(`[TIMORA DB] Successfully connected to MongoDB at: ${sanitizedPrimary}`);
    return;
  } catch (primaryError) {
    const errorMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
    const sanitizedError = getSanitizedMongoUri(errorMsg);
    console.error(`[TIMORA DB] Connection failed to ${sanitizedPrimary}: ${sanitizedError}`);
    throw new Error(`Database connection failed: ${sanitizedError}`);
  }
}

export async function closeDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[TIMORA DB] Closed MongoDB connection gracefully.');
  }
}