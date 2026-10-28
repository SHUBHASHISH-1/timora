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

  const shutdown = async (signal: string) => {
    console.log(`[TIMORA SERVER] Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Failed to start Timora backend:', err);
  process.exit(1);
});
