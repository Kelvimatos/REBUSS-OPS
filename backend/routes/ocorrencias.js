/**
 * REBUSS OPS — Rota: Ocorrências
 * GET    /api/ocorrencias
 * POST   /api/ocorrencias
 * DELETE /api/ocorrencias/:id
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

const TIPOS_VALIDOS = ['FALTA', 'ATRASO', 'CANCELAMENTO', 'RECUSA', 'OUTROS'];

// GET /api/ocorrencias
router.get('/', async (req, res) => {
  try {
    const { escalaId, usuarioId, tipo } = req.query;
    const where = {};
    if (escalaId) where.escalaId = escalaId;
    if (usuarioId) where.usuarioId = usuarioId;
    if (tipo) where.tipo = tipo.toUpperCase();

    const ocorrencias = await prisma.ocorrencia.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json(ocorrencias);
  } catch (err) {
    console.error('GET /api/ocorrencias:', err);
    res.status(500).json({ erro: 'Erro ao buscar ocorrências', detalhe: err.message });
  }
});

// POST /api/ocorrencias
router.post('/', async (req, res) => {
  try {
    const { escalaId, usuarioId, tipo, observacao } = req.body;
    if (!escalaId) return res.status(400).json({ erro: 'Campo obrigatório: escalaId' });
    if (!usuarioId) return res.status(400).json({ erro: 'Campo obrigatório: usuarioId' });
    if (!tipo) return res.status(400).json({ erro: 'Campo obrigatório: tipo' });

    const tipoUp = tipo.toUpperCase();
    if (!TIPOS_VALIDOS.includes(tipoUp)) {
      return res.status(400).json({ erro: `Tipo inválido. Use: ${TIPOS_VALIDOS.join(', ')}` });
    }

    const ocorrencia = await prisma.ocorrencia.create({
      data: {
        escalaId,
        usuarioId,
        tipo: tipoUp,
        observacao: observacao?.trim() || null,
      },
    });
    res.status(201).json(ocorrencia);
  } catch (err) {
    console.error('POST /api/ocorrencias:', err);
    res.status(500).json({ erro: 'Erro ao criar ocorrência', detalhe: err.message });
  }
});

// DELETE /api/ocorrencias/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.ocorrencia.delete({ where: { id: req.params.id } });
    res.json({ mensagem: 'Ocorrência excluída com sucesso' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Ocorrência não encontrada' });
    console.error('DELETE /api/ocorrencias/:id:', err);
    res.status(500).json({ erro: 'Erro ao excluir ocorrência', detalhe: err.message });
  }
});

export default router;
