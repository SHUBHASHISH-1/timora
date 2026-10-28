// backend/src/config/db.ts

import mongoose from 'mongoose';
import { env } from './env';

export function getSanitizedMongoUri(uri: string): string {
  try {
    return uri.replace(/\/\/[^@]+@/, '//***:***@');
  } catch {
    return 'mongodb://***:***@hidden';
  }
}

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);

  const sanitized = getSanitizedMongoUri(env.MONGODB_URI);

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log(`[TIMORA DB] Successfully connected to MongoDB Atlas at: ${sanitized}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const sanitizedError = getSanitizedMongoUri(errorMsg);
    console.error(`[TIMORA DB] Connection failed to ${sanitized}: ${sanitizedError}`);
    throw new Error(`Database connection failed: ${sanitizedError}`);
  }

  mongoose.connection.on('error', (err) => {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[TIMORA DB] Runtime error: ${getSanitizedMongoUri(errorMsg)}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[TIMORA DB] Disconnected from MongoDB.');
  });
}

export async function closeDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[TIMORA DB] Closed MongoDB connection gracefully.');
  }
}
