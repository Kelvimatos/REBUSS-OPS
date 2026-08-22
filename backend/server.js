/**
 * REBUSS OPS — Servidor Express
 * Porta: 3001
 * API: /api/*
 * Frontend: arquivos estáticos servidos em /
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Seed Admin
import { seedInitialAdmin } from './lib/seedAdmin.js';

// Rotas
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import usuariosRouter from './routes/usuarios.js';
import equipesRouter from './routes/equipes.js';
import lojasRouter from './routes/lojas.js';
import escalasRouter from './routes/escalas.js';
import ocorrenciasRouter from './routes/ocorrencias.js';
import dashboardRouter from './routes/dashboard.js';
import operacoesRouter from './routes/operacoes.js';
import historicoRouter from './routes/historico.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middlewares ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:5500'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    sistema: 'REBUSS OPS API',
    versao: '2.1.0',
    status: 'online',
    horario: new Date().toISOString(),
    endpoints: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET  /api/auth/me',
      'GET  /api/admin/usuarios',
      'GET  /api/dashboard/indicadores',
      'GET  /api/dashboard/escalas-hoje',
      'GET  /api/dashboard/alertas',
      'GET  /api/dashboard/ranking',
      'POST /api/operacoes/analisar',
      'POST /api/operacoes/importar',
      'PUT  /api/operacoes/:id/finalizar',
      'GET  /api/operacoes/logs',
      'GET  /api/historico/arvore',
      'GET  /api/historico/operacoes',
      'GET  /api/historico/colaborador/:idOrMatricula',
      'GET  /api/historico/indicadores',
    ],
  });
});

// ─── Rotas API ─────────────────────────────────────────────────────────────────
app.use('/api/auth',         authRouter);
app.use('/api/admin',        adminRouter);
app.use('/api/usuarios',     usuariosRouter);
app.use('/api/equipes',      equipesRouter);
app.use('/api/lojas',        lojasRouter);
app.use('/api/escalas',      escalasRouter);
app.use('/api/ocorrencias',  ocorrenciasRouter);
app.use('/api/dashboard',    dashboardRouter);
app.use('/api/operacoes',    operacoesRouter);
app.use('/api/historico',    historicoRouter);

// ─── Frontend Estático ─────────────────────────────────────────────────────────
// Serve os arquivos do frontend (index.html, css/, js/, assets/)
const frontendDir = join(__dirname, '..');
app.use(express.static(frontendDir, {
  index: 'index.html',
  // Não servir node_modules, backend, prisma, gerado
  setHeaders: (res, filePath) => {
    if (filePath.includes('node_modules') || filePath.includes('backend') || filePath.includes('.env')) {
      res.status(403).end();
    }
  },
}));

// SPA fallback — qualquer rota não encontrada retorna o index.html
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ erro: 'Endpoint não encontrado' });
  }
  res.sendFile(join(frontendDir, 'index.html'));
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[REBUSS OPS Error]', err);
  res.status(500).json({ erro: 'Erro interno do servidor', detalhe: err.message });
});

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       REBUSS OPS — API & Frontend        ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  URL:    http://localhost:${PORT}            ║`);
  console.log(`║  API:    http://localhost:${PORT}/api        ║`);
  console.log(`║  Banco:  rebuss_ops (PostgreSQL)          ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // Executar seed do admin se necessário
  await seedInitialAdmin();
});

export default app;
