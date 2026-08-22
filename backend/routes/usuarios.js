/**
 * REBUSS OPS — Rota: Usuários
 * GET    /api/usuarios
 * GET    /api/usuarios/:id
 * POST   /api/usuarios
 * PUT    /api/usuarios/:id
 * DELETE /api/usuarios/:id
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

// GET /api/usuarios
router.get('/', async (req, res) => {
  try {
    const { busca, cidade, estado, status } = req.query;
    const where = {};

    if (busca) {
      where.OR = [
        { nome: { contains: busca, mode: 'insensitive' } },
        { matricula: { contains: busca, mode: 'insensitive' } },
      ];
    }
    if (cidade) where.cidade = { contains: cidade, mode: 'insensitive' };
    if (estado) where.estado = estado.toUpperCase();
    if (status !== undefined) where.status = status === 'true';

    const usuarios = await prisma.usuario.findMany({
      where,
      orderBy: { nome: 'asc' },
      include: {
        equipes: { include: { equipe: true } },
      },
    });
    res.json(usuarios);
  } catch (err) {
    console.error('GET /api/usuarios:', err);
    res.status(500).json({ erro: 'Erro ao buscar usuários', detalhe: err.message });
  }
});

// GET /api/usuarios/:id
router.get('/:id', async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.params.id },
      include: {
        equipes: { include: { equipe: true } },
        escalas: { include: { escala: { include: { loja: true } } } },
      },
    });
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json(usuario);
  } catch (err) {
    console.error('GET /api/usuarios/:id:', err);
    res.status(500).json({ erro: 'Erro ao buscar usuário', detalhe: err.message });
  }
});

// POST /api/usuarios
router.post('/', async (req, res) => {
  try {
    const { nome, matricula, telefone, cidade, estado, status } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Campo obrigatório: nome' });

    const usuario = await prisma.usuario.create({
      data: {
        nome: nome.trim(),
        matricula: matricula ? String(matricula).trim() : null,
        telefone: telefone?.trim() || null,
        cidade: cidade?.trim() || null,
        estado: estado?.trim().toUpperCase() || null,
        status: status !== undefined ? Boolean(status) : true,
      },
    });
    res.status(201).json(usuario);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ erro: 'Matrícula já cadastrada' });
    }
    console.error('POST /api/usuarios:', err);
    res.status(500).json({ erro: 'Erro ao criar usuário', detalhe: err.message });
  }
});

// PUT /api/usuarios/:id
router.put('/:id', async (req, res) => {
  try {
    const { nome, matricula, telefone, cidade, estado, status } = req.body;
    const data = {};
    if (nome !== undefined) data.nome = nome.trim();
    if (matricula !== undefined) data.matricula = matricula ? String(matricula).trim() : null;
    if (telefone !== undefined) data.telefone = telefone?.trim() || null;
    if (cidade !== undefined) data.cidade = cidade?.trim() || null;
    if (estado !== undefined) data.estado = estado?.trim().toUpperCase() || null;
    if (status !== undefined) data.status = Boolean(status);

    const usuario = await prisma.usuario.update({
      where: { id: req.params.id },
      data,
    });
    res.json(usuario);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    if (err.code === 'P2002') return res.status(409).json({ erro: 'Matrícula já cadastrada' });
    console.error('PUT /api/usuarios/:id:', err);
    res.status(500).json({ erro: 'Erro ao atualizar usuário', detalhe: err.message });
  }
});

// DELETE /api/usuarios/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.usuario.delete({ where: { id: req.params.id } });
    res.json({ mensagem: 'Usuário excluído com sucesso' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    console.error('DELETE /api/usuarios/:id:', err);
    res.status(500).json({ erro: 'Erro ao excluir usuário', detalhe: err.message });
  }
});

export default router;
