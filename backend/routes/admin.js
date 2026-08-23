/**
 * REBUSS OPS — Rotas de Gestão Administrativa de Usuários do Sistema
 * Restritas para perfil ADMIN
 * GET    /api/admin/usuarios
 * GET    /api/admin/usuarios/:id
 * PUT    /api/admin/usuarios/:id
 * DELETE /api/admin/usuarios/:id
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Todas as rotas deste router exigem autenticação e perfil ADMIN
router.use(authenticateToken);
router.use(requireRole(['ADMIN']));

// GET /api/admin/usuarios (Lista usuários do sistema com busca e paginação)
router.get('/usuarios', async (req, res) => {
  try {
    const { busca, perfil, status } = req.query;
    const where = {};

    if (busca) {
      where.OR = [
        { nome: { contains: busca, mode: 'insensitive' } },
        { email: { contains: busca, mode: 'insensitive' } },
      ];
    }
    if (perfil) where.perfil = perfil.toUpperCase();
    if (status !== undefined) where.ativo = status === 'true';

    const usuarios = await prisma.usuarioSistema.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        ativo: true,
        telefone: true,
        cidade: true,
        estado: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(usuarios);
  } catch (err) {
    console.error('GET /api/admin/usuarios:', err);
    res.status(500).json({ erro: 'Erro ao listar usuários do sistema', detalhe: err.message });
  }
});

// GET /api/admin/usuarios/:id
router.get('/usuarios/:id', async (req, res) => {
  try {
    const usuario = await prisma.usuarioSistema.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        ativo: true,
        telefone: true,
        cidade: true,
        estado: true,
        createdAt: true,
      },
    });

    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json(usuario);
  } catch (err) {
    console.error('GET /api/admin/usuarios/:id:', err);
    res.status(500).json({ erro: 'Erro ao buscar usuário', detalhe: err.message });
  }
});

// PUT /api/admin/usuarios/:id (Alterar perfil, status ou dados)
router.put('/usuarios/:id', async (req, res) => {
  try {
    const { nome, perfil, ativo, telefone, cidade, estado, novaSenha } = req.body;
    const updateData = {};

    if (nome !== undefined) updateData.nome = nome.trim();
    if (telefone !== undefined) updateData.telefone = telefone?.trim() || null;
    if (cidade !== undefined) updateData.cidade = cidade?.trim() || null;
    if (estado !== undefined) updateData.estado = estado?.trim().toUpperCase() || null;
    if (ativo !== undefined) updateData.ativo = Boolean(ativo);

    if (perfil !== undefined) {
      const p = perfil.toUpperCase();
      if (!['ADMIN', 'GESTOR', 'OPERADOR'].includes(p)) {
        return res.status(400).json({ erro: 'Perfil inválido. Use ADMIN, GESTOR ou OPERADOR.' });
      }
      updateData.perfil = p;
    }

    if (novaSenha) {
      if (novaSenha.length < 8) {
        return res.status(400).json({ erro: 'A nova senha deve ter no mínimo 8 caracteres.' });
      }
      const salt = await bcrypt.genSalt(10);
      updateData.senhaHash = await bcrypt.hash(novaSenha, salt);
    }

    const usuarioAtualizado = await prisma.usuarioSistema.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        ativo: true,
        telefone: true,
        cidade: true,
        estado: true,
        updatedAt: true,
      },
    });

    res.json(usuarioAtualizado);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    console.error('PUT /api/admin/usuarios/:id:', err);
    res.status(500).json({ erro: 'Erro ao atualizar usuário', detalhe: err.message });
  }
});

// DELETE /api/admin/usuarios/:id
router.delete('/usuarios/:id', async (req, res) => {
  try {
    // Evitar que o próprio admin logado se autoexclua acidentalmente
    if (req.userSistema.id === req.params.id) {
      return res.status(400).json({ erro: 'Você não pode excluir sua própria conta de administrador.' });
    }

    await prisma.usuarioSistema.delete({
      where: { id: req.params.id },
    });

    res.json({ mensagem: 'Usuário do sistema excluído com sucesso.' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    console.error('DELETE /api/admin/usuarios/:id:', err);
    res.status(500).json({ erro: 'Erro ao excluir usuário', detalhe: err.message });
  }
});

// POST /api/admin/reset-dados-operacionais (Zera lojas, escalas, operações e histórico)
router.post('/reset-dados-operacionais', async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const ocorrencias = await tx.ocorrencia.deleteMany({});
      const statusLogs = await tx.statusLog.deleteMany({});
      const escalaMembros = await tx.escalaMembro.deleteMany({});
      const escalas = await tx.escala.deleteMany({});
      const importacaoLogs = await tx.importacaoLog.deleteMany({});
      const lojas = await tx.loja.deleteMany({});

      return {
        ocorrencias: ocorrencias.count,
        statusLogs: statusLogs.count,
        escalaMembros: escalaMembros.count,
        escalas: escalas.count,
        importacaoLogs: importacaoLogs.count,
        lojas: lojas.count
      };
    });

    res.json({
      sucesso: true,
      mensagem: 'Dados operacionais, lojas e histórico zerados com sucesso para início oficial.',
      registrosRemovidos: result
    });
  } catch (err) {
    console.error('POST /api/admin/reset-dados-operacionais:', err);
    res.status(500).json({ erro: 'Erro ao zerar dados operacionais', detalhe: err.message });
  }
});

export default router;

