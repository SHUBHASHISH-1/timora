// backend/src/app.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from './config/env';
import { apiRouter } from './routes/api.routes';

export const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, true); // Allow localhost/LAN variations during dev/demos
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again shortly.' },
});

app.use('/api/v1', apiLimiter, apiRouter);

app.get('/health', (_req: Request, res: Response) => {
  const dbStates: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  res.json({
    status: 'ok',
    service: 'Timora Recruitment Scheduler API',
    dbStatus: dbStates[mongoose.connection.readyState] ?? 'unknown',
  });
});

// 404 Handler for unmatched API routes
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// Centralized Production Error Handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error in request payload.',
      details: err.issues,
    });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      error: `Invalid identifier format for field "${err.path}".`,
    });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({
      error: err.message,
    });
    return;
  }

  // MongoDB Duplicate Key Error (E11000)
  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
    res.status(409).json({
      error: 'Duplicate record conflict: A resource with that unique name or identifier already exists.',
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected server error';
  console.error('[TIMORA API ERROR]:', message);

  res.status(500).json({
    error: message || 'Internal server error',
  });
});