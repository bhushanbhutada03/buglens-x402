import { config } from './config.js';
import { createApp } from './app.js';

const app = createApp(config);

const server = app.listen(config.PORT, () => {
  console.log(`[BugLens] Server running on port ${config.PORT}`);
  console.log(`[BugLens] Environment: ${config.NODE_ENV}`);
  console.log(`[BugLens] Mode: ${config.isMockMode ? 'MOCK (Isolated Local Simulation)' : 'LIVE (Testnet Facilitator)'}`);
  console.log(`[BugLens] Network: ${config.X402_NETWORK}`);
  console.log(`[BugLens] Asset: ${config.X402_ASSET}`);
  console.log(`[BugLens] Report Price: ${config.REPORT_PRICE} atomic units`);
  console.log(`[BugLens] Pay-To Address: ${config.PAY_TO_ADDRESS}`);
});

process.on('SIGTERM', () => {
  console.log('[BugLens] SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
