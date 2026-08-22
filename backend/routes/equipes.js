/**
 * REBUSS OPS — Rota: Equipes
 * GET    /api/equipes
 * GET    /api/equipes/:id
 * POST   /api/equipes
 * PUT    /api/equipes/:id
 * DELETE /api/equipes/:id
 * GET    /api/equipes/:id/membros
 * POST   /api/equipes/:id/membros
 * DELETE /api/equipes/:id/membros/:usuarioId
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

// GET /api/equipes
router.get('/', async (req, res) => {
  try {
    const { busca, cidade, estado, status } = req.query;
    const where = {};
    if (busca) where.nome = { contains: busca, mode: 'insensitive' };
    if (cidade) where.cidade = { contains: cidade, mode: 'insensitive' };
    if (estado) where.estado = estado.toUpperCase();
    if (status !== undefined) where.status = status === 'true';

    const equipes = await prisma.equipe.findMany({
      where,
      orderBy: { nome: 'asc' },
      include: {
        membros: {
          include: { usuario: true },
          orderBy: { usuario: { nome: 'asc' } },
        },
      },
    });
    res.json(equipes);
  } catch (err) {
    console.error('GET /api/equipes:', err);
    res.status(500).json({ erro: 'Erro ao buscar equipes', detalhe: err.message });
  }
});

// GET /api/equipes/:id
router.get('/:id', async (req, res) => {
  try {
    const equipe = await prisma.equipe.findUnique({
      where: { id: req.params.id },
      include: {
        membros: {
          include: { usuario: true },
          orderBy: { usuario: { nome: 'asc' } },
        },
      },
    });
    if (!equipe) return res.status(404).json({ erro: 'Equipe não encontrada' });
    res.json(equipe);
  } catch (err) {
    console.error('GET /api/equipes/:id:', err);
    res.status(500).json({ erro: 'Erro ao buscar equipe', detalhe: err.message });
  }
});

// POST /api/equipes
router.post('/', async (req, res) => {
  try {
    const { nome, cidade, estado, status } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Campo obrigatório: nome' });

    const equipe = await prisma.equipe.create({
      data: {
        nome: nome.trim(),
        cidade: cidade?.trim() || null,
        estado: estado?.trim().toUpperCase() || null,
        status: status !== undefined ? Boolean(status) : true,
      },
    });
    res.status(201).json(equipe);
  } catch (err) {
    console.error('POST /api/equipes:', err);
    res.status(500).json({ erro: 'Erro ao criar equipe', detalhe: err.message });
  }
});

// PUT /api/equipes/:id
router.put('/:id', async (req, res) => {
  try {
    const { nome, cidade, estado, status } = req.body;
    const data = {};
    if (nome !== undefined) data.nome = nome.trim();
    if (cidade !== undefined) data.cidade = cidade?.trim() || null;
    if (estado !== undefined) data.estado = estado?.trim().toUpperCase() || null;
    if (status !== undefined) data.status = Boolean(status);

    const equipe = await prisma.equipe.update({
      where: { id: req.params.id },
      data,
    });
    res.json(equipe);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Equipe não encontrada' });
    console.error('PUT /api/equipes/:id:', err);
    res.status(500).json({ erro: 'Erro ao atualizar equipe', detalhe: err.message });
  }
});

// DELETE /api/equipes/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.equipe.delete({ where: { id: req.params.id } });
    res.json({ mensagem: 'Equipe excluída com sucesso' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Equipe não encontrada' });
    console.error('DELETE /api/equipes/:id:', err);
    res.status(500).json({ erro: 'Erro ao excluir equipe', detalhe: err.message });
  }
});

// GET /api/equipes/:id/membros
router.get('/:id/membros', async (req, res) => {
  try {
    const membros = await prisma.equipeMembro.findMany({
      where: { equipeId: req.params.id },
      include: { usuario: true },
      orderBy: { usuario: { nome: 'asc' } },
    });
    res.json(membros);
  } catch (err) {
    console.error('GET /api/equipes/:id/membros:', err);
    res.status(500).json({ erro: 'Erro ao buscar membros', detalhe: err.message });
  }
});

// POST /api/equipes/:id/membros
router.post('/:id/membros', async (req, res) => {
  try {
    const { usuarioId } = req.body;
    if (!usuarioId) return res.status(400).json({ erro: 'Campo obrigatório: usuarioId' });

    const membro = await prisma.equipeMembro.create({
      data: { equipeId: req.params.id, usuarioId },
      include: { usuario: true },
    });
    res.status(201).json(membro);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ erro: 'Usuário já está nesta equipe' });
    if (err.code === 'P2003') return res.status(404).json({ erro: 'Equipe ou usuário não encontrado' });
    console.error('POST /api/equipes/:id/membros:', err);
    res.status(500).json({ erro: 'Erro ao adicionar membro', detalhe: err.message });
  }
});

// DELETE /api/equipes/:id/membros/:usuarioId
router.delete('/:id/membros/:usuarioId', async (req, res) => {
  try {
    await prisma.equipeMembro.deleteMany({
      where: { equipeId: req.params.id, usuarioId: req.params.usuarioId },
    });
    res.json({ mensagem: 'Membro removido da equipe' });
  } catch (err) {
    console.error('DELETE /api/equipes/:id/membros/:usuarioId:', err);
    res.status(500).json({ erro: 'Erro ao remover membro', detalhe: err.message });
  }
});

export default router;
