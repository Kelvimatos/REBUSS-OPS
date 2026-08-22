/**
 * REBUSS OPS — Rota: Lojas
 * GET    /api/lojas
 * GET    /api/lojas/:id
 * POST   /api/lojas
 * PUT    /api/lojas/:id
 * DELETE /api/lojas/:id
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

// GET /api/lojas
router.get('/', async (req, res) => {
  try {
    const { busca, cidade, estado } = req.query;
    const where = {};
    if (busca) {
      where.OR = [
        { nome: { contains: busca, mode: 'insensitive' } },
        { endereco: { contains: busca, mode: 'insensitive' } },
      ];
    }
    if (cidade) where.cidade = { contains: cidade, mode: 'insensitive' };
    if (estado) where.estado = estado.toUpperCase();

    const lojas = await prisma.loja.findMany({
      where,
      orderBy: { nome: 'asc' },
    });
    res.json(lojas);
  } catch (err) {
    console.error('GET /api/lojas:', err);
    res.status(500).json({ erro: 'Erro ao buscar lojas', detalhe: err.message });
  }
});

// GET /api/lojas/:id
router.get('/:id', async (req, res) => {
  try {
    const loja = await prisma.loja.findUnique({
      where: { id: req.params.id },
      include: {
        escalas: {
          orderBy: { data: 'desc' },
          take: 10,
        },
      },
    });
    if (!loja) return res.status(404).json({ erro: 'Loja não encontrada' });
    res.json(loja);
  } catch (err) {
    console.error('GET /api/lojas/:id:', err);
    res.status(500).json({ erro: 'Erro ao buscar loja', detalhe: err.message });
  }
});

// POST /api/lojas
router.post('/', async (req, res) => {
  try {
    const { nome, endereco, cidade, estado, cep, latitude, longitude } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Campo obrigatório: nome' });

    const loja = await prisma.loja.create({
      data: {
        nome: nome.trim(),
        endereco: endereco?.trim() || null,
        cidade: cidade?.trim() || null,
        estado: estado?.trim().toUpperCase() || null,
        cep: cep?.trim() || null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
      },
    });
    res.status(201).json(loja);
  } catch (err) {
    console.error('POST /api/lojas:', err);
    res.status(500).json({ erro: 'Erro ao criar loja', detalhe: err.message });
  }
});

// PUT /api/lojas/:id
router.put('/:id', async (req, res) => {
  try {
    const { nome, endereco, cidade, estado, cep, latitude, longitude } = req.body;
    const data = {};
    if (nome !== undefined) data.nome = nome.trim();
    if (endereco !== undefined) data.endereco = endereco?.trim() || null;
    if (cidade !== undefined) data.cidade = cidade?.trim() || null;
    if (estado !== undefined) data.estado = estado?.trim().toUpperCase() || null;
    if (cep !== undefined) data.cep = cep?.trim() || null;
    if (latitude !== undefined) data.latitude = latitude ? parseFloat(latitude) : null;
    if (longitude !== undefined) data.longitude = longitude ? parseFloat(longitude) : null;

    const loja = await prisma.loja.update({
      where: { id: req.params.id },
      data,
    });
    res.json(loja);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Loja não encontrada' });
    console.error('PUT /api/lojas/:id:', err);
    res.status(500).json({ erro: 'Erro ao atualizar loja', detalhe: err.message });
  }
});

// DELETE /api/lojas/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.loja.delete({ where: { id: req.params.id } });
    res.json({ mensagem: 'Loja excluída com sucesso' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Loja não encontrada' });
    console.error('DELETE /api/lojas/:id:', err);
    res.status(500).json({ erro: 'Erro ao excluir loja', detalhe: err.message });
  }
});

export default router;
