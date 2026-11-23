import express from 'express';
import path from 'node:path';
import dotenv from 'dotenv';
import { initSchema } from './server/db.ts';
import { seedDatabaseIfEmpty } from './server/seed.ts';
import { registerRoutes } from './server/routes.ts';

dotenv.config();

async function startServer() {
  initSchema();
  seedDatabaseIfEmpty();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));

  registerRoutes(app);

  // Explicit 404 for unmatched API paths
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota da API não encontrada.' });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*splat', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Instituto SER — Gestão Integrada em execução na porta ${port}`);
  });
}

startServer().catch((err) => {
  console.error('Erro ao iniciar o servidor:', err);
  process.exit(1);
});
