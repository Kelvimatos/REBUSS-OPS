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

// Rotas
import usuariosRouter from './routes/usuarios.js';
import equipesRouter from './routes/equipes.js';
import lojasRouter from './routes/lojas.js';
import escalasRouter from './routes/escalas.js';
import ocorrenciasRouter from './routes/ocorrencias.js';
import dashboardRouter from './routes/dashboard.js';

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
    versao: '1.0.0',
    status: 'online',
    horario: new Date().toISOString(),
    endpoints: [
      'GET  /api/usuarios',
      'GET  /api/equipes',
      'GET  /api/lojas',
      'GET  /api/escalas',
      'GET  /api/ocorrencias',
      'GET  /api/dashboard',
    ],
  });
});

// ─── Rotas API ─────────────────────────────────────────────────────────────────
app.use('/api/usuarios',     usuariosRouter);
app.use('/api/equipes',      equipesRouter);
app.use('/api/lojas',        lojasRouter);
app.use('/api/escalas',      escalasRouter);
app.use('/api/ocorrencias',  ocorrenciasRouter);
app.use('/api/dashboard',    dashboardRouter);

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
app.get('*', (req, res) => {
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
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       REBUSS OPS — API & Frontend        ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  URL:    http://localhost:${PORT}            ║`);
  console.log(`║  API:    http://localhost:${PORT}/api        ║`);
  console.log(`║  Banco:  rebuss_ops (PostgreSQL)          ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});

export default app;
