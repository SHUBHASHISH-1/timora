// backend/src/config/env.ts

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from cwd first, fallback to package directory and repository roots
dotenv.config();

const potentialEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend', '.env'),
  path.resolve(process.cwd(), 'timora', 'backend', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
  path.resolve(__dirname, '..', '..', '..', '.env'),
  path.resolve(__dirname, '..', '..', '..', '..', '.env'),
];

for (const envPath of potentialEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

const envSchema = z.object({
  PORT: z.string().default('4000'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/timora_db'),
  JWT_SECRET: z.string().min(16).default('timora_super_secret_jwt_key_webster_2026_sh_trio'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  UPLOAD_DIR: z.string().default('./uploads/cvs'),
  GEMINI_API_KEY: z.string().optional().default(''),
});

export const env = envSchema.parse(process.env);

