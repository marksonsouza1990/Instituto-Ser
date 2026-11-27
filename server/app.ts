import express from 'express';
import { initSchema } from './db.js';
import { seedDatabaseIfEmpty } from './seed.js';
import { registerRoutes } from './routes.js';

export function createApiApp(): express.Express {
  initSchema();
  seedDatabaseIfEmpty();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));

  registerRoutes(app);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota da API não encontrada.' });
  });

  return app;
}
