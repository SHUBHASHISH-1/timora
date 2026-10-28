// backend/src/app.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { apiRouter } from './routes/api.routes';

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/v1', apiLimiter, apiRouter);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Timora Recruitment Scheduler API' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[TIMORA API ERROR]:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

