/**
 * REBUSS OPS — Rota: Escalas + Controle de Presença
 * Isolamento Multi-Usuário (Multi-Tenant)
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

const STATUS_VALIDOS = ['PENDENTE', 'CONFIRMADO', 'RECUSADO', 'A_CAMINHO', 'EM_LOJA', 'ATRASADO', 'FALTOU', 'CANCELADO'];
const STATUS_ESCALA_VALIDOS = ['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'FINALIZADA', 'CANCELADA'];

// GET /api/escalas
router.get('/', async (req, res) => {
  try {
    const { data, lojaId, status } = req.query;
    const where = {
      usuarioSistemaId: req.userSistema.id,
    };

    if (lojaId) where.lojaId = lojaId;
    if (status) where.status = status.toUpperCase();
    if (data) {
      const inicio = new Date(data);
      inicio.setUTCHours(0, 0, 0, 0);
      const fim = new Date(data);
      fim.setUTCHours(23, 59, 59, 999);
      where.data = { gte: inicio, lte: fim };
    }

    const escalas = await prisma.escala.findMany({
      where,
      orderBy: [{ data: 'desc' }, { horario: 'asc' }],
      include: {
        loja: true,
        membros: {
          include: { usuario: true },
          orderBy: { usuario: { nome: 'asc' } },
        },
      },
    });
    res.json(escalas);
  } catch (err) {
    console.error('GET /api/escalas:', err);
    res.status(500).json({ erro: 'Erro ao buscar escalas', detalhe: err.message });
  }
});

// GET /api/escalas/:id
router.get('/:id', async (req, res) => {
  try {
    const escala = await prisma.escala.findFirst({
      where: {
        id: req.params.id,
        usuarioSistemaId: req.userSistema.id,
      },
      include: {
        loja: true,
        membros: {
          include: { usuario: true },
          orderBy: { usuario: { nome: 'asc' } },
        },
      },
    });
    if (!escala) return res.status(404).json({ erro: 'Escala não encontrada ou não pertence ao seu usuário' });
    res.json(escala);
  } catch (err) {
    console.error('GET /api/escalas/:id:', err);
    res.status(500).json({ erro: 'Erro ao buscar escala', detalhe: err.message });
  }
});

// POST /api/escalas
router.post('/', async (req, res) => {
  try {
    const { lojaId, data, horario, pivNecessario, observacoes, status, membros } = req.body;
    if (!lojaId) return res.status(400).json({ erro: 'Campo obrigatório: lojaId' });
    if (!data) return res.status(400).json({ erro: 'Campo obrigatório: data' });
    if (!horario) return res.status(400).json({ erro: 'Campo obrigatório: horario' });

    // Verificar se a loja pertence ao usuário
    const loja = await prisma.loja.findFirst({
      where: { id: lojaId, usuarioSistemaId: req.userSistema.id },
    });

    if (!loja) {
      return res.status(404).json({ erro: 'Loja não encontrada ou não pertence ao seu usuário' });
    }

    const dt = new Date(data);
    const y = isNaN(dt.getTime()) ? new Date().getUTCFullYear() : dt.getUTCFullYear();
    const m = isNaN(dt.getTime()) ? new Date().getUTCMonth() : dt.getUTCMonth();
    const d = isNaN(dt.getTime()) ? new Date().getUTCDate() : dt.getUTCDate();
    const dataNormalizada = new Date(Date.UTC(y, m, d, 12, 0, 0));
    const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

    let escalaExistente = await prisma.escala.findFirst({
      where: {
        lojaId,
        data: { gte: start, lte: end },
        ...(req.userSistema.perfil === 'ADMIN' || req.userSistema.perfil === 'GESTOR' ? {} : { usuarioSistemaId: req.userSistema.id }),
      },
      include: {
        loja: true,
        membros: { include: { usuario: true } },
      },
    });

    if (escalaExistente) {
      const escala = await prisma.escala.update({
        where: { id: escalaExistente.id },
        data: {
          horario: horario.trim(),
          pivNecessario: pivNecessario !== undefined ? (pivNecessario ? parseInt(pivNecessario) : null) : escalaExistente.pivNecessario,
          observacoes: observacoes !== undefined ? (observacoes?.trim() || null) : escalaExistente.observacoes,
          status: status?.toUpperCase() || escalaExistente.status,
        },
        include: {
          loja: true,
          membros: { include: { usuario: true } },
        },
      });
      return res.status(200).json(escala);
    }

    const escala = await prisma.escala.create({
      data: {
        usuarioSistemaId: req.userSistema.id,
        lojaId,
        data: dataNormalizada,
        horario: horario.trim(),
        pivNecessario: pivNecessario ? parseInt(pivNecessario) : null,
        observacoes: observacoes?.trim() || null,
        status: status?.toUpperCase() || 'ABERTA',
        importadoPor: req.userSistema.nome,
        membros: membros && membros.length > 0
          ? {
              create: membros.map(uid => ({
                usuarioId: typeof uid === 'string' ? uid : uid.usuarioId,
                status: 'PENDENTE',
              })),
            }
          : undefined,
      },
      include: {
        loja: true,
        membros: { include: { usuario: true } },
      },
    });
    res.status(201).json(escala);
  } catch (err) {
    if (err.code === 'P2003') return res.status(404).json({ erro: 'Loja ou usuário não encontrado' });
    console.error('POST /api/escalas:', err);
    res.status(500).json({ erro: 'Erro ao criar escala', detalhe: err.message });
  }
});

// PUT /api/escalas/:id
router.put('/:id', async (req, res) => {
  try {
    const escalaExistente = await prisma.escala.findFirst({
      where: { id: req.params.id, usuarioSistemaId: req.userSistema.id },
    });

    if (!escalaExistente) {
      return res.status(404).json({ erro: 'Escala não encontrada ou não pertence ao seu usuário' });
    }

    const { lojaId, data, horario, pivNecessario, observacoes, status } = req.body;
    const dadosUpdate = {};
    if (lojaId !== undefined) dadosUpdate.lojaId = lojaId;
    if (data !== undefined) dadosUpdate.data = new Date(data);
    if (horario !== undefined) dadosUpdate.horario = horario.trim();
    if (pivNecessario !== undefined) dadosUpdate.pivNecessario = pivNecessario ? parseInt(pivNecessario) : null;
    if (observacoes !== undefined) dadosUpdate.observacoes = observacoes?.trim() || null;
    if (status !== undefined) {
      const s = status.toUpperCase();
      if (!STATUS_ESCALA_VALIDOS.includes(s)) {
        return res.status(400).json({ erro: `Status inválido. Use: ${STATUS_ESCALA_VALIDOS.join(', ')}` });
      }
      dadosUpdate.status = s;
    }

    const escala = await prisma.escala.update({
      where: { id: req.params.id },
      data: dadosUpdate,
      include: { loja: true, membros: { include: { usuario: true } } },
    });
    res.json(escala);
  } catch (err) {
    console.error('PUT /api/escalas/:id:', err);
    res.status(500).json({ erro: 'Erro ao atualizar escala', detalhe: err.message });
  }
});

// DELETE /api/escalas/:id
router.delete('/:id', async (req, res) => {
  try {
    const escalaExistente = await prisma.escala.findFirst({
      where: { id: req.params.id, usuarioSistemaId: req.userSistema.id },
    });

    if (!escalaExistente) {
      return res.status(404).json({ erro: 'Escala não encontrada ou não pertence ao seu usuário' });
    }

    await prisma.escala.delete({ where: { id: req.params.id } });
    res.json({ mensagem: 'Escala excluída com sucesso' });
  } catch (err) {
    console.error('DELETE /api/escalas/:id:', err);
    res.status(500).json({ erro: 'Erro ao excluir escala', detalhe: err.message });
  }
});

// POST /api/escalas/:id/membros
router.post('/:id/membros', async (req, res) => {
  try {
    const escalaExistente = await prisma.escala.findFirst({
      where: { id: req.params.id, usuarioSistemaId: req.userSistema.id },
    });

    if (!escalaExistente) {
      return res.status(404).json({ erro: 'Escala não encontrada ou não pertence ao seu usuário' });
    }

    const { usuarioId } = req.body;
    if (!usuarioId) return res.status(400).json({ erro: 'Campo obrigatório: usuarioId' });

    const membro = await prisma.escalaMembro.create({
      data: { escalaId: req.params.id, usuarioId, status: 'PENDENTE' },
      include: { usuario: true },
    });
    res.status(201).json(membro);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ erro: 'Usuário já está nesta escala' });
    console.error('POST /api/escalas/:id/membros:', err);
    res.status(500).json({ erro: 'Erro ao adicionar membro', detalhe: err.message });
  }
});

// PUT /api/escalas/:escalaId/membros/:usuarioId
router.put('/:escalaId/membros/:usuarioId', async (req, res) => {
  try {
    const escalaExistente = await prisma.escala.findFirst({
      where: { id: req.params.escalaId, usuarioSistemaId: req.userSistema.id },
    });

    if (!escalaExistente) {
      return res.status(404).json({ erro: 'Escala não encontrada ou não pertence ao seu usuário' });
    }

    const { status, confirmou, horarioConfirmacao, chegou, horarioChegada } = req.body;
    const data = {};

    if (status !== undefined) {
      const s = status.toUpperCase();
      if (!STATUS_VALIDOS.includes(s)) {
        return res.status(400).json({ erro: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` });
      }
      data.status = s;

      if (s === 'CONFIRMADO') data.confirmou = true;
      if (s === 'EM_LOJA') { data.chegou = true; data.confirmou = true; }
      if (s === 'PENDENTE') { data.confirmou = false; data.chegou = false; }
    }

    if (confirmou !== undefined) {
      data.confirmou = Boolean(confirmou);
      if (data.confirmou) data.horarioConfirmacao = horarioConfirmacao ? new Date(horarioConfirmacao) : new Date();
    }
    if (chegou !== undefined) {
      data.chegou = Boolean(chegou);
      if (data.chegou) data.horarioChegada = horarioChegada ? new Date(horarioChegada) : new Date();
    }

    const membro = await prisma.escalaMembro.update({
      where: { escalaId_usuarioId: { escalaId: req.params.escalaId, usuarioId: req.params.usuarioId } },
      data,
      include: { usuario: true },
    });
    res.json(membro);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Membro não encontrado nesta escala' });
    console.error('PUT /api/escalas/:escalaId/membros/:usuarioId:', err);
    res.status(500).json({ erro: 'Erro ao atualizar presença', detalhe: err.message });
  }
});

// DELETE /api/escalas/:escalaId/membros/:usuarioId
router.delete('/:escalaId/membros/:usuarioId', async (req, res) => {
  try {
    const escalaExistente = await prisma.escala.findFirst({
      where: { id: req.params.escalaId, usuarioSistemaId: req.userSistema.id },
    });

    if (!escalaExistente) {
      return res.status(404).json({ erro: 'Escala não encontrada ou não pertence ao seu usuário' });
    }

    await prisma.escalaMembro.deleteMany({
      where: { escalaId: req.params.escalaId, usuarioId: req.params.usuarioId },
    });
    res.json({ mensagem: 'Membro removido da escala' });
  } catch (err) {
    console.error('DELETE /api/escalas/:escalaId/membros/:usuarioId:', err);
    res.status(500).json({ erro: 'Erro ao remover membro', detalhe: err.message });
  }
});

export default router;
