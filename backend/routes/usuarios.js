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
    if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Campo obrigatório: nome' });

    const safeMatricula = matricula ? (String(matricula).trim() || null) : null;

    if (safeMatricula) {
      const matriculaExistente = await prisma.usuario.findFirst({
        where: {
          OR: [
            { matricula: safeMatricula },
            { codigo: safeMatricula },
          ],
        },
      });
      if (matriculaExistente) {
        return res.status(400).json({
          erro: 'A matrícula informada já está cadastrada para outro colaborador. Verifique a matrícula e tente novamente.',
        });
      }
    }

    const usuario = await prisma.usuario.create({
      data: {
        nome: nome.trim(),
        matricula: safeMatricula,
        codigo: safeMatricula,
        telefone: telefone?.trim() || null,
        cidade: cidade?.trim() || null,
        estado: estado?.trim().toUpperCase() || null,
        status: status !== undefined ? Boolean(status) : true,
      },
    });
    res.status(201).json(usuario);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ erro: 'Já existe um colaborador cadastrado com esta matrícula.' });
    }
    console.error('POST /api/usuarios:', err);
    res.status(500).json({ erro: 'Erro ao criar usuário' });
  }
});

// PUT /api/usuarios/:id
router.put('/:id', async (req, res) => {
  try {
    const { nome, matricula, telefone, cidade, estado, status } = req.body;
    const usuarioId = req.params.id;

    const safeMatricula = matricula !== undefined && matricula !== null
      ? (String(matricula).trim() || null)
      : undefined;

    if (safeMatricula) {
      const matriculaExistente = await prisma.usuario.findFirst({
        where: {
          OR: [
            { matricula: safeMatricula },
            { codigo: safeMatricula },
          ],
        },
      });
      if (matriculaExistente && matriculaExistente.id !== usuarioId) {
        return res.status(400).json({
          erro: `A matrícula ${safeMatricula} já está cadastrada para outro colaborador. Informe uma matrícula diferente.`,
        });
      }
    }

    const data = {};
    if (nome !== undefined) data.nome = nome.trim();
    if (safeMatricula !== undefined) {
      data.matricula = safeMatricula;
      data.codigo = safeMatricula;
    }
    if (telefone !== undefined) data.telefone = telefone?.trim() || null;
    if (cidade !== undefined) data.cidade = cidade?.trim() || null;
    if (estado !== undefined) data.estado = estado?.trim().toUpperCase() || null;
    if (status !== undefined) data.status = Boolean(status);

    const usuario = await prisma.usuario.update({
      where: { id: usuarioId },
      data,
    });
    res.json(usuario);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    if (err.code === 'P2002') return res.status(400).json({ erro: 'Já existe um colaborador cadastrado com esta matrícula.' });
    console.error('PUT /api/usuarios/:id:', err);
    res.status(500).json({ erro: 'Erro ao atualizar usuário' });
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
