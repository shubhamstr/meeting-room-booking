import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { initDb, pool } from './config/db.js';

const PORT = process.env.PORT || 5000;

// Initialize Database schema and start server
async function startServer() {
  try {
    await initDb();
    const server = app.listen(PORT, () => {
      console.log(`[TurboSpace] Server is running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      console.log(`[TurboSpace] Web UI: http://localhost:${PORT}/customers`);
      console.log(`[TurboSpace] API Health check: http://localhost:${PORT}/api/health`);
    });

    // Handle graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Closing HTTP server gracefully...`);
      server.close(async () => {
        console.log('HTTP server closed.');
        try {
          await pool.end();
          console.log('[PostgreSQL] Connection pool closed.');
        } catch (e) {
          console.error('[PostgreSQL] Error closing pool:', e.message);
        }
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (err) {
    console.error('[TurboSpace] Fatal error during startup:', err);
    process.exit(1);
  }
}

startServer();
