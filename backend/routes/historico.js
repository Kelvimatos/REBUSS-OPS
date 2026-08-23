/**
 * REBUSS OPS — Rotas de Histórico Operacional Permanente
 * Isolamento Multi-Usuário (Multi-Tenant) — Histórico privado do usuário logado
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

const MESES_NOMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function buildDateRange(periodo, dataInicio, dataFim, anoParam, mesParam) {
  const agora = new Date();

  if (periodo === 'hoje') {
    const inicio = new Date();
    inicio.setUTCHours(0, 0, 0, 0);
    const fim = new Date();
    fim.setUTCHours(23, 59, 59, 999);
    return { gte: inicio, lte: fim };
  }

  if (periodo === 'ontem') {
    const ontem = new Date();
    ontem.setDate(agora.getDate() - 1);
    const inicio = new Date(ontem);
    inicio.setUTCHours(0, 0, 0, 0);
    const fim = new Date(ontem);
    fim.setUTCHours(23, 59, 59, 999);
    return { gte: inicio, lte: fim };
  }

  if (periodo === '7dias') {
    const inicio = new Date();
    inicio.setDate(agora.getDate() - 7);
    inicio.setUTCHours(0, 0, 0, 0);
    const fim = new Date();
    fim.setUTCHours(23, 59, 59, 999);
    return { gte: inicio, lte: fim };
  }

  if (periodo === '30dias') {
    const inicio = new Date();
    inicio.setDate(agora.getDate() - 30);
    inicio.setUTCHours(0, 0, 0, 0);
    const fim = new Date();
    fim.setUTCHours(23, 59, 59, 999);
    return { gte: inicio, lte: fim };
  }

  if (periodo === 'mes_atual') {
    const inicio = new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0));
    const fim = new Date(Date.UTC(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999));
    return { gte: inicio, lte: fim };
  }

  if (periodo === 'mes_anterior') {
    const inicio = new Date(Date.UTC(agora.getFullYear(), agora.getMonth() - 1, 1, 0, 0, 0));
    const fim = new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59, 999));
    return { gte: inicio, lte: fim };
  }

  if (periodo === 'ano_2026' || periodo === 'ano') {
    const ano = anoParam ? parseInt(anoParam, 10) : 2026;
    const inicio = new Date(Date.UTC(ano, 0, 1, 0, 0, 0));
    const fim = new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999));
    return { gte: inicio, lte: fim };
  }

  if (dataInicio && dataFim) {
    const inicio = new Date(dataInicio);
    inicio.setUTCHours(0, 0, 0, 0);
    const fim = new Date(dataFim);
    fim.setUTCHours(23, 59, 59, 999);
    return { gte: inicio, lte: fim };
  }

  if (anoParam && mesParam !== undefined) {
    const ano = parseInt(anoParam, 10);
    const mes = parseInt(mesParam, 10);
    const inicio = new Date(Date.UTC(ano, mes, 1, 0, 0, 0));
    const fim = new Date(Date.UTC(ano, mes + 1, 0, 23, 59, 59, 999));
    return { gte: inicio, lte: fim };
  }

  return undefined;
}

// GET /api/historico/arvore (Estrutura Ano ➔ Mês ➔ Dia ➔ Operações do Usuário)
router.get('/arvore', async (req, res) => {
  try {
    const { ano = 2026 } = req.query;
    const anoNum = parseInt(ano, 10);

    const inicioAno = new Date(Date.UTC(anoNum, 0, 1, 0, 0, 0));
    const fimAno = new Date(Date.UTC(anoNum, 11, 31, 23, 59, 59, 999));

    const escalas = await prisma.escala.findMany({
      where: {
        usuarioSistemaId: req.userSistema.id,
        data: { gte: inicioAno, lte: fimAno },
      },
      include: {
        loja: true,
        membros: { include: { usuario: true } },
      },
      orderBy: [{ data: 'desc' }, { horario: 'asc' }],
    });

    const arvore = {
      ano: anoNum,
      totalOperacoesAno: escalas.length,
      meses: {},
    };

    for (const esc of escalas) {
      const dt = new Date(esc.data);
      const mesIdx = dt.getUTCMonth();
      const mesNome = MESES_NOMES[mesIdx];
      const diaNum = dt.getUTCDate().toString().padStart(2, '0');
      const mesNum = (mesIdx + 1).toString().padStart(2, '0');
      const diaKey = `${diaNum}/${mesNum}`;

      if (!arvore.meses[mesNome]) {
        arvore.meses[mesNome] = {
          mesIndice: mesIdx,
          mesNome,
          totalOperacoesMes: 0,
          dias: {},
        };
      }

      arvore.meses[mesNome].totalOperacoesMes++;

      if (!arvore.meses[mesNome].dias[diaKey]) {
        arvore.meses[mesNome].dias[diaKey] = {
          diaKey,
          dataISO: esc.data,
          totalOperacoesDia: 0,
          operacoes: [],
        };
      }

      arvore.meses[mesNome].dias[diaKey].totalOperacoesDia++;

      const confirmados = esc.membros.filter(m => m.confirmou).length;
      const presentes = esc.membros.filter(m => m.status === 'EM_LOJA' || m.chegou).length;
      const faltas = esc.membros.filter(m => m.status === 'FALTOU').length;
      const atrasos = esc.membros.filter(m => m.status === 'ATRASADO').length;

      arvore.meses[mesNome].dias[diaKey].operacoes.push({
        id: esc.id,
        loja: esc.loja.nome,
        cidade: esc.loja.cidade || 'SP',
        estado: esc.loja.estado || 'SP',
        horario: esc.horario,
        status: esc.status,
        pivNecessario: esc.pivNecessario || esc.membros.length,
        confirmados,
        presentes,
        faltas,
        atrasos,
        totalMembros: esc.membros.length,
        membros: esc.membros.map(m => ({
          id: m.id,
          matricula: m.usuario.matricula || '—',
          nome: m.usuario.nome,
          cargo: m.cargo || 'Operador',
          status: m.status,
          confirmou: m.confirmou,
          chegou: m.chegou,
        })),
      });
    }

    res.json(arvore);
  } catch (err) {
    console.error('GET /api/historico/arvore:', err);
    res.status(500).json({ erro: 'Erro ao gerar árvore do histórico', detalhe: err.message });
  }
});

// GET /api/historico/operacoes (Listagem com filtros por usuário)
router.get('/operacoes', async (req, res) => {
  try {
    const {
      periodo = '30dias',
      dataInicio,
      dataFim,
      cidade,
      lojaId,
      status,
      busca,
    } = req.query;

    const dateWhere = buildDateRange(periodo, dataInicio, dataFim);
    const where = {
      usuarioSistemaId: req.userSistema.id,
    };
    if (dateWhere) where.data = dateWhere;
    if (lojaId) where.lojaId = lojaId;
    if (status) where.status = status.toUpperCase();

    if (cidade && cidade !== 'todas') {
      where.loja = {
        usuarioSistemaId: req.userSistema.id,
        cidade: { contains: cidade, mode: 'insensitive' },
      };
    }

    if (busca) {
      where.OR = [
        { loja: { nome: { contains: busca, mode: 'insensitive' }, usuarioSistemaId: req.userSistema.id } },
        { membros: { some: { usuario: { nome: { contains: busca, mode: 'insensitive' } } } } },
        { membros: { some: { usuario: { matricula: { contains: busca } } } } },
      ];
    }

    const escalas = await prisma.escala.findMany({
      where,
      include: {
        loja: true,
        membros: {
          include: { usuario: true },
        },
        statusLogs: {
          orderBy: { criadoEm: 'desc' },
          take: 5,
        },
      },
      orderBy: [{ data: 'desc' }, { horario: 'asc' }],
    });

    const formatadas = escalas.map(op => {
      const pivNecessario = op.pivNecessario || op.membros.length;
      const confirmados = op.membros.filter(m => m.confirmou).length;
      const presentes = op.membros.filter(m => m.status === 'EM_LOJA' || m.chegou).length;
      const faltas = op.membros.filter(m => m.status === 'FALTOU').length;
      const atrasos = op.membros.filter(m => m.status === 'ATRASADO').length;

      return {
        id: op.id,
        lojaId: op.loja.id,
        loja: op.loja.nome,
        cidade: op.loja.cidade || 'SP',
        estado: op.loja.estado || 'SP',
        endereco: op.loja.endereco || '',
        data: op.data,
        horario: op.horario,
        status: op.status,
        observacoes: op.observacoes,
        importadoPor: op.importadoPor,
        importadoEm: op.importadoEm,
        finalizadoEm: op.finalizadoEm,
        pivNecessario,
        confirmados,
        presentes,
        faltas,
        atrasos,
        totalMembros: op.membros.length,
        membros: op.membros.map(m => ({
          id: m.id,
          usuarioId: m.usuario.id,
          nome: m.usuario.nome,
          matricula: m.usuario.matricula || '—',
          cargo: m.cargo || 'Operador',
          status: m.status,
          confirmou: m.confirmou,
          chegou: m.chegou,
        })),
        timeline: op.statusLogs,
      };
    });

    res.json(formatadas);
  } catch (err) {
    console.error('GET /api/historico/operacoes:', err);
    res.status(500).json({ erro: 'Erro ao listar operações do histórico', detalhe: err.message });
  }
});

// GET /api/historico/colaborador/:idOrMatricula (Dossiê Histórico individual filtrado por escalas do usuário)
router.get('/colaborador/:idOrMatricula', async (req, res) => {
  try {
    const { idOrMatricula } = req.params;

    const usuario = await prisma.usuario.findFirst({
      where: {
        OR: [
          { id: idOrMatricula },
          { matricula: idOrMatricula },
          { codigo: idOrMatricula },
        ],
      },
      include: {
        escalas: {
          where: {
            escala: {
              usuarioSistemaId: req.userSistema.id,
            },
          },
          include: {
            escala: {
              include: { loja: true },
            },
          },
          orderBy: { escala: { data: 'desc' } },
        },
      },
    });

    if (!usuario) {
      return res.status(404).json({ erro: 'Colaborador não encontrado' });
    }

    const totalEscalas = usuario.escalas.length;
    const presencas = usuario.escalas.filter(e => e.status === 'EM_LOJA' || e.chegou).length;
    const faltas = usuario.escalas.filter(e => e.status === 'FALTOU').length;
    const atrasos = usuario.escalas.filter(e => e.status === 'ATRASADO').length;
    const recusas = usuario.escalas.filter(e => e.status === 'RECUSADO').length;

    let score = 100;
    if (totalEscalas > 0) {
      const taxaPres = (presencas / totalEscalas) * 100;
      const penalidadeFalta = (faltas / totalEscalas) * 40;
      const penalidadeAtraso = (atrasos / totalEscalas) * 20;
      score = Math.max(0, Math.min(100, Math.round(taxaPres - penalidadeFalta - penalidadeAtraso)));
    }

    res.json({
      id: usuario.id,
      nome: usuario.nome,
      codigo: usuario.codigo,
      matricula: usuario.matricula,
      telefone: usuario.telefone,
      cidade: usuario.cidade,
      estado: usuario.estado,
      status: usuario.status,
      estatisticas: {
        totalEscalas,
        presencas,
        faltas,
        atrasos,
        recusas,
        taxaPresenca: totalEscalas > 0 ? Math.round((presencas / totalEscalas) * 100) : 100,
        score,
      },
      historicoEscalas: usuario.escalas.map(e => ({
        escalaId: e.escala.id,
        loja: e.escala.loja.nome,
        cidade: e.escala.loja.cidade,
        data: e.escala.data,
        horario: e.escala.horario,
        cargo: e.cargo,
        status: e.status,
        confirmou: e.confirmou,
        chegou: e.chegou,
        historicoStatus: e.historicoStatus ? JSON.parse(e.historicoStatus) : [],
      })),
    });
  } catch (err) {
    console.error('GET /api/historico/colaborador:', err);
    res.status(500).json({ erro: 'Erro ao gerar dossiê do colaborador', detalhe: err.message });
  }
});

// GET /api/historico/indicadores (Métricas consolidadas do histórico do usuário)
router.get('/indicadores', async (req, res) => {
  try {
    const { periodo = '30dias', dataInicio, dataFim } = req.query;
    const dateWhere = buildDateRange(periodo, dataInicio, dataFim);

    const where = {
      usuarioSistemaId: req.userSistema.id,
    };
    if (dateWhere) where.data = dateWhere;

    const escalas = await prisma.escala.findMany({
      where,
      include: { membros: true },
    });

    let totalOperacoes = escalas.length;
    let totalPiv = 0;
    let totalPresentes = 0;
    let totalFaltas = 0;
    let totalAtrasos = 0;

    for (const e of escalas) {
      totalPiv += e.pivNecessario || e.membros.length;
      for (const m of e.membros) {
        if (m.status === 'EM_LOJA' || m.chegou) totalPresentes++;
        if (m.status === 'FALTOU') totalFaltas++;
        if (m.status === 'ATRASADO') totalAtrasos++;
      }
    }

    res.json({
      periodo,
      totalOperacoes,
      totalPiv,
      totalPresentes,
      totalFaltas,
      totalAtrasos,
      taxaPresencaMedia: totalPiv > 0 ? parseFloat(((totalPresentes / totalPiv) * 100).toFixed(1)) : 100,
    });
  } catch (err) {
    console.error('GET /api/historico/indicadores:', err);
    res.status(500).json({ erro: 'Erro ao calcular indicadores do histórico', detalhe: err.message });
  }
});

export default router;
