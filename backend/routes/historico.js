/**
 * REBUSS OPS — Rotas de Histórico Operacional Permanente
 * GET /api/historico/arvore
 * GET /api/historico/operacoes
 * GET /api/historico/colaborador/:idOrMatricula
 * GET /api/historico/indicadores
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

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

// GET /api/historico/arvore (Estrutura Ano ➔ Mês ➔ Dia ➔ Operações)
router.get('/arvore', async (req, res) => {
  try {
    const { ano = 2026 } = req.query;
    const anoNum = parseInt(ano, 10);

    const inicioAno = new Date(Date.UTC(anoNum, 0, 1, 0, 0, 0));
    const fimAno = new Date(Date.UTC(anoNum, 11, 31, 23, 59, 59, 999));

    const escalas = await prisma.escala.findMany({
      where: {
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

// GET /api/historico/operacoes (Listagem com filtros)
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
    const where = {};
    if (dateWhere) where.data = dateWhere;
    if (lojaId) where.lojaId = lojaId;
    if (status) where.status = status.toUpperCase();

    if (cidade && cidade !== 'todas') {
      where.loja = { cidade: { contains: cidade, mode: 'insensitive' } };
    }

    if (busca) {
      where.OR = [
        { loja: { nome: { contains: busca, mode: 'insensitive' } } },
        { membros: { some: { usuario: { nome: { contains: busca, mode: 'insensitive' } } } } },
        { membros: { some: { usuario: { matricula: { contains: busca } } } } },
      ];
    }

    const escalas = await prisma.escala.findMany({
      where,
      include: {
        loja: true,
        membros: { include: { usuario: true } },
      },
      orderBy: [{ data: 'desc' }, { horario: 'asc' }],
    });

    const formatadas = escalas.map(e => {
      const confirmados = e.membros.filter(m => m.confirmou).length;
      const presentes = e.membros.filter(m => m.status === 'EM_LOJA' || m.chegou).length;
      const faltas = e.membros.filter(m => m.status === 'FALTOU').length;
      const atrasos = e.membros.filter(m => m.status === 'ATRASADO').length;

      return {
        id: e.id,
        loja: e.loja.nome,
        cidade: e.loja.cidade || 'SP',
        estado: e.loja.estado || 'SP',
        endereco: e.loja.endereco || '',
        data: e.data,
        horario: e.horario,
        status: e.status,
        importadoPor: e.importadoPor,
        importadoEm: e.importadoEm,
        finalizadoEm: e.finalizadoEm,
        pivNecessario: e.pivNecessario || e.membros.length,
        confirmados,
        presentes,
        faltas,
        atrasos,
        totalMembros: e.membros.length,
        membros: e.membros.map(m => ({
          id: m.id,
          usuarioId: m.usuarioId,
          matricula: m.usuario.matricula || '—',
          nome: m.usuario.nome,
          cargo: m.cargo || 'Operador',
          status: m.status,
          confirmou: m.confirmou,
          chegou: m.chegou,
        })),
      };
    });

    res.json(formatadas);
  } catch (err) {
    console.error('GET /api/historico/operacoes:', err);
    res.status(500).json({ erro: 'Erro ao buscar histórico de operações', detalhe: err.message });
  }
});

// GET /api/historico/colaborador/:idOrMatricula (Dossiê completo do colaborador)
router.get('/colaborador/:idOrMatricula', async (req, res) => {
  try {
    const { idOrMatricula } = req.params;

    // Localizar por ID, Código, Matrícula ou Nome
    let usuario = await prisma.usuario.findFirst({
      where: {
        OR: [
          { id: idOrMatricula },
          { codigo: idOrMatricula },
          { matricula: idOrMatricula },
          { nome: { equals: idOrMatricula, mode: 'insensitive' } },
        ],
      },
      include: {
        escalas: {
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
      return res.status(404).json({ erro: 'Colaborador não encontrado no histórico.' });
    }

    const totalEscalas = usuario.escalas.length;
    let presencas = 0;
    let faltas = 0;
    let atrasos = 0;
    let recusas = 0;
    let confirmados = 0;

    const timeline = usuario.escalas.map(em => {
      if (em.confirmou) confirmados++;
      if (em.status === 'EM_LOJA' || em.chegou) presencas++;
      if (em.status === 'FALTOU') faltas++;
      if (em.status === 'ATRASADO') atrasos++;
      if (em.status === 'RECUSADO') recusas++;

      return {
        escalaId: em.escala.id,
        lojaNome: em.escala.loja.nome,
        cidade: em.escala.loja.cidade || 'SP',
        estado: em.escala.loja.estado || 'SP',
        data: em.escala.data,
        horario: em.escala.horario,
        cargo: em.cargo || 'Operador',
        statusPresenca: em.status,
        confirmou: em.confirmou,
        chegou: em.chegou,
      };
    });

    const taxaPresenca = confirmados > 0 ? ((presencas / confirmados) * 100).toFixed(1) : (totalEscalas > 0 ? ((presencas / totalEscalas) * 100).toFixed(1) : 100);
    const taxaAceitacao = totalEscalas > 0 ? ((confirmados / totalEscalas) * 100).toFixed(1) : 100;

    res.json({
      colaborador: {
        id: usuario.id,
        nome: usuario.nome,
        codigo: usuario.codigo || usuario.matricula || '—',
        matricula: usuario.matricula || '—',
        telefone: usuario.telefone,
        cidade: usuario.cidade,
        estado: usuario.estado,
        status: usuario.status,
      },
      indicadores: {
        totalEscalas,
        presencas,
        faltas,
        atrasos,
        recusas,
        confirmados,
        taxaPresenca: parseFloat(taxaPresenca),
        taxaAceitacao: parseFloat(taxaAceitacao),
      },
      timeline,
    });
  } catch (err) {
    console.error('GET /api/historico/colaborador/:idOrMatricula:', err);
    res.status(500).json({ erro: 'Erro ao carregar histórico do colaborador', detalhe: err.message });
  }
});

// GET /api/historico/indicadores (Métricas consolidadas de qualquer período histórico)
router.get('/indicadores', async (req, res) => {
  try {
    const { periodo = 'ano_2026', dataInicio, dataFim, cidade, estado } = req.query;
    const dateWhere = buildDateRange(periodo, dataInicio, dataFim);

    const where = {};
    if (dateWhere) where.data = dateWhere;
    if (cidade && cidade !== 'todas') {
      where.loja = { cidade: { contains: cidade, mode: 'insensitive' } };
    }
    if (estado) {
      where.loja = { ...where.loja, estado: estado.toUpperCase() };
    }

    const escalas = await prisma.escala.findMany({
      where,
      include: { membros: true, loja: true },
    });

    let pivTotal = 0;
    let confirmados = 0;
    let presencas = 0;
    let faltas = 0;
    let atrasos = 0;
    let recusas = 0;
    let cancelamentos = 0;
    let convitesTotais = 0;

    for (const esc of escalas) {
      pivTotal += esc.pivNecessario || esc.membros.length;

      for (const m of esc.membros) {
        convitesTotais++;
        if (m.confirmou) confirmados++;
        if (m.status === 'EM_LOJA' || m.chegou) presencas++;
        if (m.status === 'FALTOU') faltas++;
        if (m.status === 'ATRASADO') atrasos++;
        if (m.status === 'RECUSADO') recusas++;
        if (m.status === 'CANCELADO') cancelamentos++;
      }
    }

    const taxaPresenca = confirmados > 0 ? ((presencas / confirmados) * 100).toFixed(1) : 0;
    const taxaAceitacao = convitesTotais > 0 ? ((confirmados / convitesTotais) * 100).toFixed(1) : 0;
    const taxaFalta = confirmados > 0 ? ((faltas / confirmados) * 100).toFixed(1) : 0;
    const taxaAtraso = presencas > 0 ? ((atrasos / presencas) * 100).toFixed(1) : 0;

    res.json({
      periodo,
      totalEscalas: escalas.length,
      pivTotal,
      confirmados,
      presencas,
      faltas,
      atrasos,
      recusas,
      cancelamentos,
      convitesTotais,
      taxaPresenca: parseFloat(taxaPresenca),
      taxaAceitacao: parseFloat(taxaAceitacao),
      taxaFalta: parseFloat(taxaFalta),
      taxaAtraso: parseFloat(taxaAtraso),
    });
  } catch (err) {
    console.error('GET /api/historico/indicadores:', err);
    res.status(500).json({ erro: 'Erro ao calcular indicadores históricos', detalhe: err.message });
  }
});

export default router;
