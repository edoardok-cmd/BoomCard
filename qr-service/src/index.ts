import dotenv from 'dotenv';
import { app } from './app';
import { logger } from './utils/logger';

dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`qr-service is running on port ${PORT}`);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err);
  process.exit(1);
});