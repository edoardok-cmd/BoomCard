import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import analyticsRoutes from './routes/analytics.routes';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'analytics-service' });
});

app.use('/api/analytics', analyticsRoutes);

app.use(errorHandler);