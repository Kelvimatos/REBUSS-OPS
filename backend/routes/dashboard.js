/**
 * REBUSS OPS — Rota: Dashboard
 * GET /api/dashboard
 * GET /api/dashboard?data=YYYY-MM-DD
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { data } = req.query;

    const whereEscala = {};
    if (data) {
      const inicio = new Date(data);
      inicio.setUTCHours(0, 0, 0, 0);
      const fim = new Date(data);
      fim.setUTCHours(23, 59, 59, 999);
      whereEscala.data = { gte: inicio, lte: fim };
    }

    // Buscar todas as escalas do período com seus membros
    const escalas = await prisma.escala.findMany({
      where: whereEscala,
      include: {
        loja: true,
        membros: { include: { usuario: true } },
      },
    });

    // Calcular indicadores
    let pivNecessario = 0;
    let pivConfirmado = 0;
    let presentes = 0;
    let aCaminho = 0;
    let faltas = 0;
    let atrasos = 0;
    let recusas = 0;
    let cancelamentos = 0;
    let totalMembros = 0;

    for (const escala of escalas) {
      pivNecessario += escala.pivNecessario || 0;

      for (const membro of escala.membros) {
        totalMembros++;
        const s = membro.status;
        if (membro.confirmou) pivConfirmado++;
        if (s === 'EM_LOJA') presentes++;
        if (s === 'A_CAMINHO') aCaminho++;
        if (s === 'FALTOU') faltas++;
        if (s === 'ATRASADO') atrasos++;
        if (s === 'RECUSADO') recusas++;
        if (s === 'CANCELADO') cancelamentos++;
      }
    }

    const taxaPresenca = totalMembros > 0 ? ((presentes / totalMembros) * 100).toFixed(1) : 0;
    const taxaAceitacao = totalMembros > 0 ? (((totalMembros - recusas - cancelamentos) / totalMembros) * 100).toFixed(1) : 0;

    // Escalas por data (para o calendário)
    const escalasPorData = escalas.map(e => ({
      id: e.id,
      loja: e.loja?.nome || '',
      lojaId: e.lojaId,
      data: e.data,
      horario: e.horario,
      status: e.status,
      pivNecessario: e.pivNecessario,
      pivConfirmado: e.membros.filter(m => m.confirmou).length,
      totalMembros: e.membros.length,
      presentes: e.membros.filter(m => m.status === 'EM_LOJA').length,
    }));

    res.json({
      periodo: data || 'todos',
      totalEscalas: escalas.length,
      pivNecessario,
      pivConfirmado,
      presentes,
      aCaminho,
      faltas,
      atrasos,
      recusas,
      cancelamentos,
      totalMembros,
      taxaPresenca: parseFloat(taxaPresenca),
      taxaAceitacao: parseFloat(taxaAceitacao),
      escalas: escalasPorData,
    });
  } catch (err) {
    console.error('GET /api/dashboard:', err);
    res.status(500).json({ erro: 'Erro ao carregar dashboard', detalhe: err.message });
  }
});

export default router;
