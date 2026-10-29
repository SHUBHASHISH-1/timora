// backend/src/server.ts

import { app } from './app';
import { connectDatabase, closeDatabase } from './config/db';
import { env } from './config/env';

async function bootstrap() {
  await connectDatabase();
  const port = Number(env.PORT) || 4000;

  const server = app.listen(port, () => {
    console.log(`[TIMORA SERVER] Running at http://localhost:${port}`);
  });

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[TIMORA SERVER] Received ${signal}. Shutting down gracefully...`);

    const forceTimer = setTimeout(() => {
      console.warn('[TIMORA SERVER] Forcing shutdown after timeout.');
      process.exit(1);
    }, 8000);
    forceTimer.unref();

    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    console.error('[TIMORA SERVER] Unhandled Promise Rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[TIMORA SERVER] Uncaught Exception:', err);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start Timora backend:', err);
  process.exit(1);
});