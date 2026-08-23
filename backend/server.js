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

const currentModuleUrl = (typeof import.meta !== 'undefined' && import.meta && import.meta.url) ? import.meta.url : null;
const __filename = currentModuleUrl ? fileURLToPath(currentModuleUrl) : (typeof __filename !== 'undefined' ? __filename : process.cwd());
const __dirname = currentModuleUrl ? dirname(__filename) : (typeof __dirname !== 'undefined' ? __dirname : process.cwd());

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middlewares ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Normaliza o caminho se a requisição for roteada via Netlify Functions ou serverless
app.use((req, res, next) => {
  if (req.url.startsWith('/.netlify/functions/api/')) {
    req.url = req.url.replace('/.netlify/functions/api/', '/api/');
  } else if (req.url === '/.netlify/functions/api') {
    req.url = '/api';
  } else if (!req.url.startsWith('/api/') && !req.url.startsWith('/api') && (
    req.url.startsWith('/auth') ||
    req.url.startsWith('/operacoes') ||
    req.url.startsWith('/dashboard') ||
    req.url.startsWith('/historico') ||
    req.url.startsWith('/usuarios') ||
    req.url.startsWith('/equipes') ||
    req.url.startsWith('/lojas') ||
    req.url.startsWith('/escalas') ||
    req.url.startsWith('/ocorrencias') ||
    req.url.startsWith('/admin')
  )) {
    req.url = '/api' + req.url;
  }
  next();
});

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    sistema: 'REBUSS OPS API',
    versao: '2.1.0',
    status: 'online',
    ambiente: process.env.NETLIFY ? 'netlify-serverless' : 'standalone-node',
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

// ─── Frontend Estático (Apenas em execução Node standalone) ────────────────────
const frontendDir = join(__dirname, '..');
app.use(express.static(frontendDir, {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (filePath.includes('node_modules') || filePath.includes('backend') || filePath.includes('.env')) {
      res.status(403).end();
    }
  },
}));

// SPA fallback — qualquer rota não encontrada retorna o index.html (ou 404 em /api)
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

// ─── Start (Executa apenas quando iniciado diretamente via CLI/Node) ──────────
const isDirectRun = Boolean(
  process.argv[1] && (
    (currentModuleUrl && fileURLToPath(currentModuleUrl) === process.argv[1]) ||
    process.argv[1].endsWith('backend\\server.js') ||
    process.argv[1].endsWith('backend/server.js') ||
    process.argv[1].endsWith('server.js')
  ) &&
  !process.env.NETLIFY &&
  !process.env.AWS_LAMBDA_FUNCTION_NAME
);

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║       REBUSS OPS — API & Frontend        ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  URL:    http://localhost:${PORT}            ║`);
    console.log(`║  API:    http://localhost:${PORT}/api        ║`);
    console.log(`║  Banco:  PostgreSQL (Prisma)              ║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log('');

    // Executar seed do admin se configurado
    try {
      await seedInitialAdmin();
    } catch (e) {
      console.warn('[REBUSS OPS] Aviso ao verificar seed inicial:', e.message);
    }
  });
}

export default app;
