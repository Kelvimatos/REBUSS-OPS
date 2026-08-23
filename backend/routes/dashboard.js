/**
 * REBUSS OPS — Rotas de Dashboard Operacional
 * Isolamento Multi-Usuário (Multi-Tenant) — Todos os indicadores pertencem ao usuário logado
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

function buildDateFilter(periodo, dataCustom) {
  const agora = new Date();
  let inicio = new Date();
  let fim = new Date();

  if (dataCustom) {
    inicio = new Date(dataCustom);
    inicio.setUTCHours(0, 0, 0, 0);
    fim = new Date(dataCustom);
    fim.setUTCHours(23, 59, 59, 999);
    return { gte: inicio, lte: fim };
  }

  if (periodo === 'hoje') {
    inicio.setUTCHours(0, 0, 0, 0);
    fim.setUTCHours(23, 59, 59, 999);
    return { gte: inicio, lte: fim };
  }

  if (periodo === '7dias') {
    inicio.setDate(agora.getDate() - 7);
    inicio.setUTCHours(0, 0, 0, 0);
    fim.setUTCHours(23, 59, 59, 999);
    return { gte: inicio, lte: fim };
  }

  if (periodo === 'mes') {
    inicio.setDate(1);
    inicio.setUTCHours(0, 0, 0, 0);
    fim.setMonth(agora.getMonth() + 1, 0);
    fim.setUTCHours(23, 59, 59, 999);
    return { gte: inicio, lte: fim };
  }

  return undefined;
}

// GET /api/dashboard/indicadores
router.get('/indicadores', async (req, res) => {
  try {
    const { periodo = 'hoje', data, cidade, estado, lojaId } = req.query;
    const dateWhere = buildDateFilter(periodo, data);

    const whereEscala = {
      usuarioSistemaId: req.userSistema.id,
    };

    if (dateWhere) whereEscala.data = dateWhere;
    if (lojaId) whereEscala.lojaId = lojaId;

    if (cidade || estado) {
      whereEscala.loja = {
        usuarioSistemaId: req.userSistema.id,
      };
      if (cidade && cidade !== 'todas') {
        whereEscala.loja.cidade = { contains: cidade, mode: 'insensitive' };
      }
      if (estado) {
        whereEscala.loja.estado = estado.toUpperCase();
      }
    }

    const escalas = await prisma.escala.findMany({
      where: whereEscala,
      include: {
        loja: true,
        membros: true,
      },
    });

    let pivTotal = 0;
    let confirmados = 0;
    let emLoja = 0;
    let aCaminho = 0;
    let recusas = 0;
    let faltas = 0;
    let atrasos = 0;
    let cancelamentos = 0;
    let convitesTotais = 0;

    for (const esc of escalas) {
      pivTotal += esc.pivNecessario || esc.membros.length;

      for (const m of esc.membros) {
        convitesTotais++;
        if (m.confirmou) confirmados++;
        if (m.status === 'EM_LOJA' || m.chegou) emLoja++;
        if (m.status === 'A_CAMINHO') aCaminho++;
        if (m.status === 'RECUSADO') recusas++;
        if (m.status === 'FALTOU') faltas++;
        if (m.status === 'ATRASADO') atrasos++;
        if (m.status === 'CANCELADO') cancelamentos++;
      }
    }

    const taxaAceitacao = convitesTotais > 0 ? ((confirmados / convitesTotais) * 100).toFixed(1) : 0;
    const taxaPresenca = confirmados > 0 ? ((emLoja / confirmados) * 100).toFixed(1) : 0;
    const taxaFalta = confirmados > 0 ? ((faltas / confirmados) * 100).toFixed(1) : 0;
    const taxaAtraso = emLoja > 0 ? ((atrasos / emLoja) * 100).toFixed(1) : 0;

    res.json({
      periodo,
      totalEscalas: escalas.length,
      pivTotal,
      confirmados,
      emLoja,
      aCaminho,
      recusas,
      faltas,
      atrasos,
      cancelamentos,
      convitesTotais,
      taxaAceitacao: parseFloat(taxaAceitacao),
      taxaPresenca: parseFloat(taxaPresenca),
      taxaFalta: parseFloat(taxaFalta),
      taxaAtraso: parseFloat(taxaAtraso),
    });
  } catch (err) {
    console.error('GET /api/dashboard/indicadores:', err);
    res.status(500).json({ erro: 'Erro ao calcular indicadores', detalhe: err.message });
  }
});

// GET /api/dashboard/escalas-hoje
router.get('/escalas-hoje', async (req, res) => {
  try {
    const { cidade } = req.query;
    const dateWhere = buildDateFilter('hoje');

    const where = {
      usuarioSistemaId: req.userSistema.id,
      data: dateWhere,
    };

    if (cidade && cidade !== 'todas') {
      where.loja = {
        usuarioSistemaId: req.userSistema.id,
        cidade: { contains: cidade, mode: 'insensitive' },
      };
    }

    const escalas = await prisma.escala.findMany({
      where,
      orderBy: { horario: 'asc' },
      include: {
        loja: true,
        membros: {
          include: { usuario: true },
        },
      },
    });

    const formatadas = escalas.map(e => {
      const confirmados = e.membros.filter(m => m.confirmou).length;
      const emLoja = e.membros.filter(m => m.status === 'EM_LOJA' || m.chegou).length;
      const aCaminho = e.membros.filter(m => m.status === 'A_CAMINHO').length;
      const faltas = e.membros.filter(m => m.status === 'FALTOU').length;

      return {
        id: e.id,
        loja: e.loja.nome,
        cidade: e.loja.cidade || 'SP',
        estado: e.loja.estado || 'SP',
        endereco: e.loja.endereco || '',
        data: e.data,
        horario: e.horario,
        status: e.status,
        pivNecessario: e.pivNecessario || e.membros.length,
        confirmados,
        emLoja,
        aCaminho,
        faltas,
        totalMembros: e.membros.length,
        membros: e.membros.map(m => ({
          id: m.id,
          usuarioId: m.usuarioId,
          nome: m.usuario.nome,
          matricula: m.usuario.matricula,
          status: m.status,
          confirmou: m.confirmou,
          chegou: m.chegou,
        })),
      };
    });

    res.json(formatadas);
  } catch (err) {
    console.error('GET /api/dashboard/escalas-hoje:', err);
    res.status(500).json({ erro: 'Erro ao buscar escalas de hoje', detalhe: err.message });
  }
});

// GET /api/dashboard/alertas
router.get('/alertas', async (req, res) => {
  try {
    const { cidade } = req.query;
    const dateWhere = buildDateFilter('hoje');

    const where = {
      usuarioSistemaId: req.userSistema.id,
      data: dateWhere,
    };

    if (cidade && cidade !== 'todas') {
      where.loja = {
        usuarioSistemaId: req.userSistema.id,
        cidade: { contains: cidade, mode: 'insensitive' },
      };
    }

    const escalas = await prisma.escala.findMany({
      where,
      include: {
        loja: true,
        membros: { include: { usuario: true } },
      },
    });

    const alertas = [];

    for (const esc of escalas) {
      const confirmados = esc.membros.filter(m => m.confirmou).length;
      const faltantesPIV = (esc.pivNecessario || 0) - confirmados;

      if (faltantesPIV > 0) {
        alertas.push({
          id: `piv-${esc.id}`,
          nivel: 'critico',
          icone: '🔴',
          titulo: `Escala ${esc.loja.nome}`,
          mensagem: `Está com ${faltantesPIV} PIV faltando para atingir a meta de ${esc.pivNecessario}.`,
          escalaId: esc.id,
          horario: esc.horario,
        });
      }

      const pendentes = esc.membros.filter(m => m.status === 'PENDENTE');
      if (pendentes.length > 0) {
        alertas.push({
          id: `pendente-${esc.id}`,
          nivel: 'aviso',
          icone: '🟡',
          titulo: `Confirmação pendente: ${esc.loja.nome}`,
          mensagem: `${pendentes.length} colaboradores ainda não confirmaram presença para às ${esc.horario}.`,
          escalaId: esc.id,
          horario: esc.horario,
        });
      }

      const atrasados = esc.membros.filter(m => m.status === 'ATRASADO');
      if (atrasados.length > 0) {
        alertas.push({
          id: `atraso-${esc.id}`,
          nivel: 'alerta',
          icone: '🟠',
          titulo: `Atrasos identificados: ${esc.loja.nome}`,
          mensagem: `${atrasados.length} colaborador(es) com status de atraso reportado.`,
          escalaId: esc.id,
          horario: esc.horario,
        });
      }

      const faltaram = esc.membros.filter(m => m.status === 'FALTOU');
      if (faltaram.length > 0) {
        alertas.push({
          id: `falta-${esc.id}`,
          nivel: 'critico',
          icone: '🚫',
          titulo: `Falta confirmada: ${esc.loja.nome}`,
          mensagem: `${faltaram.length} colaborador(es) não compareceram à loja.`,
          escalaId: esc.id,
          horario: esc.horario,
        });
      }
    }

    res.json(alertas);
  } catch (err) {
    console.error('GET /api/dashboard/alertas:', err);
    res.status(500).json({ erro: 'Erro ao gerar alertas', detalhe: err.message });
  }
});

// GET /api/dashboard/ranking (Calcula ranking baseado apenas nas escalas do usuário logado)
router.get('/ranking', async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: {
        status: true,
        escalas: {
          some: {
            escala: {
              usuarioSistemaId: req.userSistema.id,
            },
          },
        },
      },
      include: {
        escalas: {
          where: {
            escala: {
              usuarioSistemaId: req.userSistema.id,
            },
          },
        },
      },
    });

    const ranking = usuarios.map(u => {
      const totalEscalas = u.escalas.length;
      const presencas = u.escalas.filter(e => e.status === 'EM_LOJA' || e.chegou).length;
      const faltas = u.escalas.filter(e => e.status === 'FALTOU').length;
      const atrasos = u.escalas.filter(e => e.status === 'ATRASADO').length;

      let score = 100;
      if (totalEscalas > 0) {
        const taxaPres = (presencas / totalEscalas) * 100;
        const penalidadeFalta = (faltas / totalEscalas) * 40;
        const penalidadeAtraso = (atrasos / totalEscalas) * 20;
        score = Math.max(0, Math.min(100, Math.round(taxaPres - penalidadeFalta - penalidadeAtraso)));
      }

      return {
        id: u.id,
        nome: u.nome,
        matricula: u.matricula || '—',
        cidade: u.cidade || 'SP',
        totalEscalas,
        presencas,
        faltas,
        atrasos,
        taxaPresenca: totalEscalas > 0 ? Math.round((presencas / totalEscalas) * 100) : 100,
        score,
      };
    });

    ranking.sort((a, b) => b.score - a.score || b.presencas - a.presencas);

    res.json(ranking.slice(0, 10));
  } catch (err) {
    console.error('GET /api/dashboard/ranking:', err);
    res.status(500).json({ erro: 'Erro ao gerar ranking', detalhe: err.message });
  }
});

// GET /api/dashboard/equipes (Resumo das equipes baseado no usuário)
router.get('/equipes', async (req, res) => {
  try {
    const equipes = await prisma.equipe.findMany({
      where: { status: true },
      include: {
        membros: {
          include: {
            usuario: {
              include: {
                escalas: {
                  where: {
                    escala: {
                      usuarioSistemaId: req.userSistema.id,
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { nome: 'asc' },
    });

    const formatadas = equipes.map(eq => {
      let presencas = 0;
      let totalEscalas = 0;

      for (const m of eq.membros) {
        for (const esc of m.usuario.escalas) {
          totalEscalas++;
          if (esc.status === 'EM_LOJA' || esc.chegou) presencas++;
        }
      }

      const taxaPresenca = totalEscalas > 0 ? Math.round((presencas / totalEscalas) * 100) : 100;

      return {
        id: eq.id,
        nome: eq.nome,
        cidade: eq.cidade,
        estado: eq.estado,
        totalMembros: eq.membros.length,
        taxaPresenca,
      };
    });

    res.json(formatadas);
  } catch (err) {
    console.error('GET /api/dashboard/equipes:', err);
    res.status(500).json({ erro: 'Erro ao gerar resumo de equipes', detalhe: err.message });
  }
});

// GET /api/dashboard (Geral consolidado)
router.get('/', async (req, res) => {
  try {
    const { periodo = 'hoje', data, cidade } = req.query;
    const dateWhere = buildDateFilter(periodo, data);

    const where = {
      usuarioSistemaId: req.userSistema.id,
    };
    if (dateWhere) where.data = dateWhere;
    if (cidade && cidade !== 'todas') {
      where.loja = {
        usuarioSistemaId: req.userSistema.id,
        cidade: { contains: cidade, mode: 'insensitive' },
      };
    }

    const escalas = await prisma.escala.findMany({
      where,
      include: { loja: true, membros: { include: { usuario: true } } },
      orderBy: { horario: 'asc' },
    });

    res.json({
      periodo,
      totalEscalas: escalas.length,
      escalas,
    });
  } catch (err) {
    console.error('GET /api/dashboard:', err);
    res.status(500).json({ erro: 'Erro ao carregar dashboard', detalhe: err.message });
  }
});

export default router;
