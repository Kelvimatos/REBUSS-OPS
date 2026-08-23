/**
 * REBUSS OPS — Rotas de Gestão Operacional em Tempo Real
 * Isolamento Multi-Usuário (Multi-Tenant por Usuário do Sistema)
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Todas as rotas de operações exigem autenticação obrigatória
router.use(authenticateToken);

const STATUS_VALIDOS = [
  'PENDENTE',
  'CONFIRMADO',
  'A_CAMINHO',
  'EM_LOJA',
  'ATRASADO',
  'FALTOU',
  'RECUSOU',
  'CANCELADO'
];

/**
 * Limpa e normaliza o nome do colaborador, garantindo que contenha SOMENTE o nome.
 */
function cleanPersonName(rawText) {
  if (!rawText) return '';
  let text = rawText;

  const mdLinkMatch = text.match(/\[(.*?)\](?:\(.*?\))?/);
  if (mdLinkMatch) {
    text = mdLinkMatch[1];
  }

  text = text.replace(/^\s*\d{3,8}\s*[-–—:]\s*/, '');
  text = text.replace(/^\s*\d+[\.\)\-]?\s*/, '');
  text = text.replace(/\([^)]*\)/g, ' ');
  text = text.replace(/https?:\/\/\S+/gi, ' ');

  const statusPatterns = [
    /\b(No\s+confirmado|Não\s+confirmado|Nao\s+confirmado|Confirmado|Confirmada|Pendente|Presente|Faltou|Falta|Recusou|Recusado|Em\s+Loja|A\s+Caminho|Atrasado|Atrasada|Desistência|Substituído|Substituido|Cancelado)\b/gi,
  ];
  for (const sp of statusPatterns) {
    text = text.replace(sp, ' ');
  }

  const cargoKeywords = [
    'SUPERVISOR GENERAL', 'SUPERVISOR GERAL', 'SUPERVISOR', 'SUPERVISORA',
    'CHEFE DE GRUPO', 'OP. SISTEMA', 'OPERADOR DE SISTEMA',
    'CONTADOR', 'CONTADORA', 'OPERADOR', 'OPERADORA', 'AUXILIAR',
    'ESCANEADOR', 'ESCANEADORA', 'LÍDER', 'CONFERENTE', 'AUDITOR', 'AUDITORA'
  ];
  for (const ck of cargoKeywords) {
    text = text.replace(new RegExp(`\\b${ck}\\b`, 'gi'), ' ');
  }

  const citiesAndStates = [
    'Rio de Janeiro', 'São Paulo', 'Belo Horizonte', 'Juiz de Fora',
    'Curitiba', 'Brasília', 'Brasilia', 'Goiânia', 'Goiania',
    'Campinas', 'Niterói', 'Niteroi', 'Salvador', 'Fortaleza', 'Recife'
  ];
  for (const cs of citiesAndStates) {
    text = text.replace(new RegExp(`\\b${cs}\\b`, 'gi'), ' ');
  }
  text = text.replace(/\b(RJ|SP|MG|DF|GO|PR|BA|CE|PE|RS|SC|ES)\b/gi, ' ');
  text = text.replace(/\b\d{2}\s*9?\d{4,5}\s*[-.]?\s*\d{4}\b/g, ' ');
  text = text.replace(/\b\d{4,12}\b/g, ' ');
  text = text.replace(/[\*\-\—\–\:\;\,\/\\\|\#\_\•\[\]\(\)]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Parser de texto da equipe
 */
function parseEquipeText(rawText) {
  if (!rawText || !rawText.trim()) {
    throw new Error('Texto de importação vazio');
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const colaboradores = [];
  const processedKeys = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\|\s*Cargo\b/i.test(line) || /^\|\s*[-:\s|]+\s*$/i.test(line)) {
      continue;
    }

    let cargo = 'Operador';
    let codigo = null;
    let nome = '';
    let matricula = null;
    let cidade = '';
    let telefone = '';
    let statusImportado = 'PENDENTE';

    if (line.includes('|')) {
      const parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
      if (parts.length >= 2) {
        const cargoCand = parts[0];
        if (cargoCand && !cargoCand.startsWith('[')) {
          cargo = cargoCand.replace(/[*_]/g, '').trim() || 'Operador';
        }

        let personCand = parts.find(p => p.includes('[') || /\b\d{4,8}\s*[-–—]/.test(p)) || parts[1] || '';
        const codeMatch = personCand.match(/(?:\[|\b)(\d{4,8})\s*[-–—]/) || line.match(/\[(\d{4,8})\s*[-–—]/);
        if (codeMatch) {
          codigo = codeMatch[1];
        }

        nome = cleanPersonName(personCand);

        for (let pIdx = 1; pIdx < parts.length; pIdx++) {
          const p = parts[pIdx];
          const matM = p.match(/^\b(\d{6,12})\b$/);
          if (matM && matM[1] !== codigo) {
            matricula = matM[1];
            break;
          }
        }

        for (let pIdx = 1; pIdx < parts.length; pIdx++) {
          const p = parts[pIdx];
          const telM = p.match(/(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}/);
          if (telM) {
            telefone = telM[0].replace(/\D/g, '');
            break;
          }
        }

        for (let pIdx = 1; pIdx < parts.length; pIdx++) {
          const p = parts[pIdx];
          const stMatch = p.match(/\b(Confirmado|Confirmada|Pendente|Presente|Faltou|Falta|Recusou|Recusado|Em\s+Loja|A\s+Caminho|Atrasado|Cancelado)\b/i);
          if (stMatch) {
            const stStr = stMatch[1].toUpperCase().replace(/\s+/g, '_');
            if (stStr === 'PRESENTE') statusImportado = 'EM_LOJA';
            else if (stStr === 'FALTA') statusImportado = 'FALTOU';
            else if (stStr === 'CONFIRMADA') statusImportado = 'CONFIRMADO';
            else if (STATUS_VALIDOS.includes(stStr)) statusImportado = stStr;
            break;
          }
        }
      }
    } else {
      const codeMatch = line.match(/(?:\[|\b)(\d{4,8})\s*[-–—]/);
      if (codeMatch) codigo = codeMatch[1];

      const matM = line.match(/\b(\d{6,12})\b/);
      if (matM && matM[1] !== codigo) matricula = matM[1];

      const telM = line.match(/(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}/);
      if (telM) telefone = telM[0].replace(/\D/g, '');

      const cargoMatch = line.match(/\b(Supervisor General|Supervisor Geral|Supervisor|Supervisora|Chefe de Grupo|Op\. Sistema|Operador de Sistema|Contador|Contadora|Operador|Operadora|Auxiliar|Escaneador|Escaneadora|Líder|Conferente)\b/i);
      if (cargoMatch) cargo = cargoMatch[1];

      nome = cleanPersonName(line);
    }

    if (!nome || nome.length < 3) continue;

    const dedupKey = `${codigo || ''}_${nome.toLowerCase()}`;
    if (processedKeys.has(dedupKey)) continue;
    processedKeys.add(dedupKey);

    colaboradores.push({
      codigo,
      nome,
      matricula,
      cargo,
      cidade,
      telefone,
      status: statusImportado,
    });
  }

  return colaboradores;
}

/**
 * Parser de texto da operação completa
 */
function parseOperacaoCompletaText(rawText) {
  if (!rawText || !rawText.trim()) {
    throw new Error('Texto da operação não fornecido');
  }

  const lines = rawText.split('\n').map(l => l.trim());

  let lojaNome = '';
  let dataOperacao = new Date();
  let horario = '18:30';
  let cidade = 'São Paulo';
  let estado = 'SP';
  let pivNecessario = null;

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i];

    const lojaMatch = line.match(/(?:Loja|Unidade|Cliente|Local|Inventário\s+em)[:\s]+(.+)/i);
    if (lojaMatch && !lojaNome) {
      lojaNome = lojaMatch[1].replace(/[*_#]/g, '').trim();
    }

    const dataMatch = line.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
    if (dataMatch) {
      const dia = parseInt(dataMatch[1], 10);
      const mes = parseInt(dataMatch[2], 10) - 1;
      let ano = parseInt(dataMatch[3], 10);
      if (ano < 100) ano += 2000;
      dataOperacao = new Date(Date.UTC(ano, mes, dia, 12, 0, 0));
    }

    const horaMatch = line.match(/\b([01]?\d|2[0-3])[:hH]([0-5]\d)\b/);
    if (horaMatch) {
      horario = `${horaMatch[1].padStart(2, '0')}:${horaMatch[2]}`;
    }

    const pivMatch = line.match(/(?:PIV|Meta|Necessário|Meta\s+PIV|Qtd)[:\s]+(\d{1,3})/i);
    if (pivMatch) {
      pivNecessario = parseInt(pivMatch[1], 10);
    }
  }

  const colaboradores = parseEquipeText(rawText);
  if (!pivNecessario) {
    pivNecessario = Math.max(colaboradores.length, 5);
  }

  return {
    lojaNome,
    dataOperacao,
    horario,
    cidade,
    estado,
    pivNecessario,
    colaboradores,
  };
}

function parseDataOperacao(dataStr) {
  if (!dataStr) return new Date();
  if (dataStr instanceof Date) return dataStr;

  const brMatch = dataStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const d = parseInt(brMatch[1], 10);
    const m = parseInt(brMatch[2], 10) - 1;
    const y = parseInt(brMatch[3], 10);
    return new Date(Date.UTC(y, m, d, 12, 0, 0));
  }

  const dt = new Date(dataStr);
  return isNaN(dt.getTime()) ? new Date() : dt;
}

// POST /api/operacoes/analisar (Analisa texto e verifica se já existe para este usuário)
router.post('/analisar', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto || !texto.trim()) {
      return res.status(400).json({ erro: 'Envie o texto da operação para análise' });
    }

    const analise = parseOperacaoCompletaText(texto);

    let jaExiste = false;
    let escalaExistente = null;

    if (analise.lojaNome) {
      const dt = new Date(analise.dataOperacao);
      const start = new Date(dt);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(dt);
      end.setUTCHours(23, 59, 59, 999);

      escalaExistente = await prisma.escala.findFirst({
        where: {
          usuarioSistemaId: req.userSistema.id,
          loja: {
            nome: { contains: analise.lojaNome.trim(), mode: 'insensitive' },
            usuarioSistemaId: req.userSistema.id,
          },
          data: { gte: start, lte: end },
        },
        include: { loja: true },
      });

      if (escalaExistente) {
        jaExiste = true;
      }
    }

    res.json({
      sucesso: true,
      jaExiste,
      escalaExistenteId: escalaExistente?.id || null,
      totalColaboradores: analise.colaboradores.length,
      colaboradores: analise.colaboradores,
      analise: {
        lojaNome: analise.lojaNome,
        dataOperacao: analise.dataOperacao.toISOString(),
        horario: analise.horario,
        cidade: analise.cidade,
        estado: analise.estado,
        pivNecessario: analise.pivNecessario,
        colaboradores: analise.colaboradores,
      },
    });
  } catch (err) {
    console.error('POST /api/operacoes/analisar:', err);
    res.status(400).json({ erro: err.message });
  }
});

// POST /api/operacoes/importar (Grava operação vinculada ao usuário autenticado)
router.post('/importar', async (req, res) => {
  try {
    const {
      lojaNome,
      dataOperacao,
      data,
      horario,
      cidade,
      estado,
      endereco,
      pivNecessario,
      colaboradores = [],
    } = req.body;

    if (!lojaNome) {
      return res.status(400).json({ erro: 'O nome da loja é obrigatório' });
    }

    const dt = parseDataOperacao(dataOperacao || data);
    const start = new Date(dt);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(dt);
    end.setUTCHours(23, 59, 59, 999);

    // 1. Localizar ou Criar Loja do usuário
    let loja = await prisma.loja.findFirst({
      where: {
        usuarioSistemaId: req.userSistema.id,
        nome: { contains: lojaNome.trim(), mode: 'insensitive' },
      },
    });

    if (!loja) {
      loja = await prisma.loja.create({
        data: {
          usuarioSistemaId: req.userSistema.id,
          nome: lojaNome.trim(),
          cidade: cidade?.trim() || 'São Paulo',
          estado: estado?.trim().toUpperCase() || 'SP',
          endereco: endereco?.trim() || null,
        },
      });
    } else if (endereco && !loja.endereco) {
      loja = await prisma.loja.update({
        where: { id: loja.id },
        data: { endereco: endereco.trim() },
      });
    }

    // 2. Verificar se já existe a escala desta loja nesta data para o usuário
    let escala = await prisma.escala.findFirst({
      where: {
        usuarioSistemaId: req.userSistema.id,
        lojaId: loja.id,
        data: { gte: start, lte: end },
      },
      include: { membros: true, loja: true },
    });

    let isNova = false;
    const piv = pivNecessario ? parseInt(pivNecessario, 10) : Math.max(colaboradores.length, 5);

    if (!escala) {
      isNova = true;
      escala = await prisma.escala.create({
        data: {
          usuarioSistemaId: req.userSistema.id,
          lojaId: loja.id,
          data: dt,
          horario: (horario || '18:30').trim(),
          pivNecessario: piv,
          status: 'ABERTA',
          importadoPor: req.userSistema.nome,
          importadoEm: new Date(),
          statusLogs: {
            create: {
              tipo: 'IMPORTACAO',
              descricao: `Operação criada via importação inteligente (${colaboradores.length} colaboradores).`,
            },
          },
        },
        include: { membros: true, loja: true },
      });
    } else {
      escala = await prisma.escala.update({
        where: { id: escala.id },
        data: {
          horario: horario ? horario.trim() : escala.horario,
          pivNecessario: piv,
        },
        include: { membros: true, loja: true },
      });
    }

    // 3. Processar colaboradores
    let novosCadastrados = 0;
    let totalAtualizados = 0;

    for (const colab of colaboradores) {
      const nomeLimpo = cleanPersonName(colab.nome);
      if (!nomeLimpo) continue;

      let user = null;
      if (colab.codigo) {
        user = await prisma.usuario.findFirst({ where: { codigo: colab.codigo } });
      }
      if (!user && colab.matricula) {
        user = await prisma.usuario.findFirst({ where: { matricula: colab.matricula } });
      }
      if (!user) {
        user = await prisma.usuario.findFirst({
          where: { nome: { equals: nomeLimpo, mode: 'insensitive' } },
        });
      }

      if (!user) {
        user = await prisma.usuario.create({
          data: {
            nome: nomeLimpo,
            codigo: colab.codigo || null,
            matricula: colab.matricula || null,
            telefone: colab.telefone || null,
            cidade: colab.cidade || loja.cidade || 'São Paulo',
            estado: loja.estado || 'SP',
          },
        });
        novosCadastrados++;
      }

      const statusInicial = colab.status || 'PENDENTE';
      const initialHistory = JSON.stringify([
        { status: statusInicial, horario: new Date().toISOString() }
      ]);

      const membroExistente = escala.membros.find(m => m.usuarioId === user.id);
      if (!membroExistente) {
        await prisma.escalaMembro.create({
          data: {
            escalaId: escala.id,
            usuarioId: user.id,
            codigo: colab.codigo || user.codigo || null,
            cargo: colab.cargo || 'Operador',
            status: statusInicial,
            confirmou: statusInicial === 'CONFIRMADO',
            cidade: colab.cidade || user.cidade || null,
            telefone: colab.telefone || user.telefone || null,
            historicoStatus: initialHistory,
          },
        });
        totalAtualizados++;
      } else {
        await prisma.escalaMembro.update({
          where: { id: membroExistente.id },
          data: {
            cargo: colab.cargo || membroExistente.cargo,
            codigo: colab.codigo || membroExistente.codigo,
            telefone: colab.telefone || membroExistente.telefone,
            cidade: colab.cidade || membroExistente.cidade,
          },
        });
        totalAtualizados++;
      }
    }

    // 4. Gravar log de importação vinculado ao usuário
    try {
      await prisma.importacaoLog.create({
        data: {
          usuarioSistemaId: req.userSistema.id,
          usuarioNome: req.userSistema.nome,
          lojaNome: loja.nome,
          dataOperacao: dt,
          horarioOperacao: horario || '18:30',
          totalProcessados: colaboradores.length,
          totalNovos: novosCadastrados,
          escalaId: escala.id,
        },
      });
    } catch (e) {
      console.warn('Erro ao gravar importacaoLog:', e.message);
    }

    res.json({
      sucesso: true,
      mensagem: isNova
        ? `Operação ${loja.nome} criada com sucesso!`
        : `Operação ${loja.nome} atualizada com sucesso!`,
      operacaoId: escala.id,
      totalProcessados: colaboradores.length,
      totalNovos: novosCadastrados,
      totalAtualizados,
      erros: 0,
    });
  } catch (err) {
    console.error('POST /api/operacoes/importar:', err);
    res.status(500).json({ erro: 'Erro ao importar operação', detalhe: err.message });
  }
});

// Listar operações com filtros isolados por usuário
async function listarOperacoesComFiltro(query, usuarioSistemaId) {
  const { periodo = 'hoje', data, loja, cidade, estado, status, limit = 100, page = 1 } = query;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setUTCHours(23, 59, 59, 999);

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setUTCDate(tomorrowEnd.getUTCDate() + 1);

  const where = {
    usuarioSistemaId,
  };

  if (data) {
    const customDate = new Date(data);
    const start = new Date(customDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(customDate);
    end.setUTCHours(23, 59, 59, 999);
    where.data = { gte: start, lte: end };
  } else if (periodo === 'hoje') {
    where.data = { gte: todayStart, lte: todayEnd };
  } else if (periodo === 'amanha') {
    where.data = { gte: tomorrowStart, lte: tomorrowEnd };
  } else if (periodo === 'proximas') {
    where.data = { gte: todayStart };
    where.status = { not: 'FINALIZADA' };
  } else if (periodo === 'finalizadas') {
    where.status = 'FINALIZADA';
  }

  if (loja && loja.trim()) {
    where.loja = {
      ...where.loja,
      nome: { contains: loja.trim(), mode: 'insensitive' },
    };
  }

  if (cidade && cidade !== 'todas' && cidade.trim()) {
    where.loja = {
      ...where.loja,
      cidade: { contains: cidade.trim(), mode: 'insensitive' },
    };
  }

  if (estado && estado !== 'todos' && estado.trim()) {
    where.loja = {
      ...where.loja,
      estado: { contains: estado.trim(), mode: 'insensitive' },
    };
  }

  if (status && status !== 'todos') {
    if (status === 'FINALIZADA') {
      where.status = 'FINALIZADA';
    } else if (status === 'EM_ANDAMENTO') {
      where.status = { not: 'FINALIZADA' };
    }
  }

  const take = Math.min(200, parseInt(limit, 10) || 100);
  const skip = ((parseInt(page, 10) || 1) - 1) * take;

  const operacoes = await prisma.escala.findMany({
    where,
    orderBy: [{ data: 'desc' }, { horario: 'asc' }],
    take,
    skip,
    include: {
      loja: true,
      membros: {
        include: { usuario: true },
        orderBy: [{ cargo: 'desc' }, { usuario: { nome: 'asc' } }],
      },
      statusLogs: {
        orderBy: { criadoEm: 'desc' },
        take: 5,
      },
    },
  });

  return operacoes.map(op => {
    const pivNecessario = op.pivNecessario || op.membros.length || 0;
    const confirmados = op.membros.filter(m => m.status === 'CONFIRMADO' || m.confirmou).length;
    const aCaminho = op.membros.filter(m => m.status === 'A_CAMINHO').length;
    const emLoja = op.membros.filter(m => m.status === 'EM_LOJA' || m.chegou).length;
    const faltas = op.membros.filter(m => m.status === 'FALTOU').length;
    const atrasados = op.membros.filter(m => m.status === 'ATRASADO').length;
    const pendentes = op.membros.filter(m => m.status === 'PENDENTE').length;

    const deficit = Math.max(0, pivNecessario - emLoja);
    const pivIncompleto = emLoja < pivNecessario && op.status !== 'FINALIZADA';

    let statusBadge = 'Completo';
    if (op.status === 'FINALIZADA') {
      statusBadge = 'Finalizada';
    } else if (pivIncompleto && emLoja > 0) {
      statusBadge = 'PIV Incompleto';
    } else if (pendentes > 0) {
      statusBadge = 'Pendente';
    } else if (emLoja === 0 && confirmados > 0) {
      statusBadge = 'Confirmada';
    }

    return {
      id: op.id,
      lojaId: op.loja.id,
      loja: op.loja.nome,
      cidade: op.loja.cidade || 'São Paulo',
      estado: op.loja.estado || 'SP',
      endereco: op.loja.endereco || '',
      data: op.data,
      horario: op.horario,
      status: op.status,
      observacoes: op.observacoes,
      pivNecessario,
      confirmados,
      aCaminho,
      emLoja,
      faltas,
      atrasados,
      pendentes,
      deficit,
      pivIncompleto,
      statusBadge,
      totalMembros: op.membros.length,
      membros: op.membros.map(m => ({
        id: m.id,
        usuarioId: m.usuario.id,
        codigo: m.codigo || m.usuario.codigo || '—',
        nome: m.usuario.nome,
        matricula: m.usuario.matricula || '—',
        cargo: m.cargo || 'Operador',
        cidade: m.cidade || m.usuario.cidade || '',
        telefone: m.telefone || m.usuario.telefone || '',
        status: m.status,
        confirmou: m.confirmou,
        chegou: m.chegou,
        historicoStatus: m.historicoStatus ? JSON.parse(m.historicoStatus) : [],
      })),
    };
  });
}

// GET /api/operacoes
router.get('/', async (req, res) => {
  try {
    const formatadas = await listarOperacoesComFiltro(req.query, req.userSistema.id);
    res.json(formatadas);
  } catch (err) {
    console.error('GET /api/operacoes:', err);
    res.status(500).json({ erro: 'Erro ao buscar operações', detalhe: err.message });
  }
});

// GET /api/operacoes/hoje
router.get('/hoje', async (req, res) => {
  try {
    const query = { ...req.query, periodo: req.query.periodo || 'hoje' };
    const formatadas = await listarOperacoesComFiltro(query, req.userSistema.id);
    res.json(formatadas);
  } catch (err) {
    console.error('GET /api/operacoes/hoje:', err);
    res.status(500).json({ erro: 'Erro ao buscar operações', detalhe: err.message });
  }
});

// GET /api/operacoes/:id
router.get('/:id', async (req, res) => {
  try {
    const op = await prisma.escala.findFirst({
      where: {
        id: req.params.id,
        usuarioSistemaId: req.userSistema.id,
      },
      include: {
        loja: true,
        membros: {
          include: { usuario: true },
          orderBy: [{ cargo: 'desc' }, { usuario: { nome: 'asc' } }],
        },
        statusLogs: {
          orderBy: { criadoEm: 'desc' },
        },
      },
    });

    if (!op) {
      return res.status(404).json({ erro: 'Operação não encontrada ou não pertence ao seu usuário' });
    }

    const pivNecessario = op.pivNecessario || op.membros.length || 0;
    const confirmados = op.membros.filter(m => m.status === 'CONFIRMADO' || m.confirmou).length;
    const aCaminho = op.membros.filter(m => m.status === 'A_CAMINHO').length;
    const emLoja = op.membros.filter(m => m.status === 'EM_LOJA' || m.chegou).length;
    const faltas = op.membros.filter(m => m.status === 'FALTOU').length;
    const atrasados = op.membros.filter(m => m.status === 'ATRASADO').length;
    const pendentes = op.membros.filter(m => m.status === 'PENDENTE').length;
    const deficit = Math.max(0, pivNecessario - emLoja);

    res.json({
      id: op.id,
      lojaId: op.loja.id,
      loja: op.loja.nome,
      cidade: op.loja.cidade || 'São Paulo',
      estado: op.loja.estado || 'SP',
      endereco: op.loja.endereco || '',
      data: op.data,
      horario: op.horario,
      pivNecessario,
      status: op.status,
      observacoes: op.observacoes,
      importadoPor: op.importadoPor,
      importadoEm: op.importadoEm,
      finalizadoEm: op.finalizadoEm,
      metricas: {
        pivNecessario,
        confirmados,
        aCaminho,
        emLoja,
        faltas,
        atrasados,
        pendentes,
        deficit,
        pivIncompleto: emLoja < pivNecessario && op.status !== 'FINALIZADA',
      },
      membros: op.membros.map(m => ({
        id: m.id,
        usuarioId: m.usuario.id,
        codigo: m.codigo || m.usuario.codigo || '—',
        nome: m.usuario.nome,
        matricula: m.usuario.matricula || '—',
        cargo: m.cargo || 'Operador',
        cidade: m.cidade || m.usuario.cidade || '',
        telefone: m.telefone || m.usuario.telefone || '',
        status: m.status,
        confirmou: m.confirmou,
        chegou: m.chegou,
        historicoStatus: m.historicoStatus ? JSON.parse(m.historicoStatus) : [],
      })),
      timeline: op.statusLogs,
    });
  } catch (err) {
    console.error('GET /api/operacoes/:id:', err);
    res.status(500).json({ erro: 'Erro ao buscar operação', detalhe: err.message });
  }
});

// POST /api/operacoes (Criar Nova Operação Manual)
router.post('/', async (req, res) => {
  try {
    const {
      lojaNome,
      data,
      dataOperacao,
      horario,
      pivNecessario,
      cidade,
      estado,
      endereco,
      observacoes,
    } = req.body;

    const dataRecebida = data || dataOperacao;
    if (!lojaNome || !dataRecebida || !horario) {
      return res.status(400).json({ erro: 'Loja, Data e Horário são obrigatórios' });
    }

    const dt = parseDataOperacao(dataRecebida);

    // 1. Localizar ou Criar Loja pertencente ao usuário
    let loja = await prisma.loja.findFirst({
      where: {
        usuarioSistemaId: req.userSistema.id,
        nome: { contains: lojaNome.trim(), mode: 'insensitive' },
      },
    });

    if (!loja) {
      loja = await prisma.loja.create({
        data: {
          usuarioSistemaId: req.userSistema.id,
          nome: lojaNome.trim(),
          cidade: cidade?.trim() || 'São Paulo',
          estado: estado?.trim().toUpperCase() || 'SP',
          endereco: endereco?.trim() || null,
        },
      });
    }

    const piv = pivNecessario ? parseInt(pivNecessario, 10) : 5;

    // 2. Criar Operação vinculada ao usuário
    const escala = await prisma.escala.create({
      data: {
        usuarioSistemaId: req.userSistema.id,
        lojaId: loja.id,
        data: dt,
        horario: horario.trim(),
        pivNecessario: isNaN(piv) ? 5 : piv,
        observacoes: observacoes?.trim() || null,
        status: 'ABERTA',
        importadoPor: req.userSistema.nome,
        importadoEm: new Date(),
        statusLogs: {
          create: {
            tipo: 'CRIACAO',
            descricao: `Operação ${loja.nome} criada com PIV de ${isNaN(piv) ? 5 : piv} pessoas.`,
          },
        },
      },
      include: {
        loja: true,
        membros: { include: { usuario: true } },
      },
    });

    res.status(201).json({
      sucesso: true,
      mensagem: `Operação ${loja.nome} criada com sucesso!`,
      operacao: escala,
    });
  } catch (err) {
    console.error('POST /api/operacoes:', err);
    res.status(500).json({ erro: 'Erro ao criar operação', detalhe: err.message });
  }
});

// POST /api/operacoes/:id/importar-equipe
router.post('/:id/importar-equipe', async (req, res) => {
  try {
    const { id } = req.params;
    const { texto, colaboradores: rawColabs } = req.body;

    const escala = await prisma.escala.findFirst({
      where: { id, usuarioSistemaId: req.userSistema.id },
      include: { loja: true, membros: true },
    });

    if (!escala) {
      return res.status(404).json({ erro: 'Operação não encontrada ou não pertence ao seu usuário' });
    }

    let colaboradores = rawColabs;
    if (!colaboradores || colaboradores.length === 0) {
      if (!texto) return res.status(400).json({ erro: 'Envie o texto da equipe ou a lista de colaboradores' });
      colaboradores = parseEquipeText(texto);
    }

    let novosCadastrados = 0;
    let vinculados = 0;

    for (const colab of colaboradores) {
      const nomeLimpo = cleanPersonName(colab.nome);
      if (!nomeLimpo) continue;

      let user = null;
      if (colab.codigo) {
        user = await prisma.usuario.findFirst({ where: { codigo: colab.codigo } });
      }
      if (!user && colab.matricula) {
        user = await prisma.usuario.findFirst({ where: { matricula: colab.matricula } });
      }
      if (!user) {
        user = await prisma.usuario.findFirst({
          where: { nome: { equals: nomeLimpo, mode: 'insensitive' } },
        });
      }

      if (!user) {
        user = await prisma.usuario.create({
          data: {
            nome: nomeLimpo,
            codigo: colab.codigo || null,
            matricula: colab.matricula || null,
            telefone: colab.telefone || null,
            cidade: colab.cidade || escala.loja.cidade || 'São Paulo',
            estado: escala.loja.estado || 'SP',
          },
        });
        novosCadastrados++;
      }

      const statusInicial = colab.status || 'PENDENTE';
      const initialHistory = JSON.stringify([
        { status: statusInicial, horario: new Date().toISOString() }
      ]);

      const membroExistente = escala.membros.find(m => m.usuarioId === user.id);
      if (!membroExistente) {
        await prisma.escalaMembro.create({
          data: {
            escalaId: escala.id,
            usuarioId: user.id,
            codigo: colab.codigo || user.codigo || null,
            cargo: colab.cargo || 'Operador',
            status: statusInicial,
            confirmou: statusInicial === 'CONFIRMADO',
            cidade: colab.cidade || user.cidade || null,
            telefone: colab.telefone || user.telefone || null,
            historicoStatus: initialHistory,
          },
        });
        vinculados++;
      }
    }

    await prisma.statusLog.create({
      data: {
        escalaId: escala.id,
        tipo: 'IMPORTACAO',
        descricao: `Equipe importada com ${colaboradores.length} colaboradores (${novosCadastrados} novos cadastros).`,
      },
    });

    res.json({
      sucesso: true,
      mensagem: `${colaboradores.length} colaboradores importados para ${escala.loja.nome}!`,
      totalProcessados: colaboradores.length,
      novosCadastrados,
      vinculados,
    });
  } catch (err) {
    console.error('POST /api/operacoes/:id/importar-equipe:', err);
    res.status(500).json({ erro: 'Erro ao importar equipe', detalhe: err.message });
  }
});

// PUT /api/operacoes/:id/membros/:usuarioId/status
router.put('/:id/membros/:usuarioId/status', async (req, res) => {
  try {
    const { id: escalaId, usuarioId } = req.params;
    const { status } = req.body;

    if (!status || !STATUS_VALIDOS.includes(status.toUpperCase())) {
      return res.status(400).json({ erro: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` });
    }

    // Verificar se a escala pertence ao usuário
    const escala = await prisma.escala.findFirst({
      where: { id: escalaId, usuarioSistemaId: req.userSistema.id },
    });

    if (!escala) {
      return res.status(404).json({ erro: 'Operação não encontrada ou não pertence ao seu usuário' });
    }

    const s = status.toUpperCase();
    const membro = await prisma.escalaMembro.findUnique({
      where: { escalaId_usuarioId: { escalaId, usuarioId } },
      include: { usuario: true },
    });

    if (!membro) {
      return res.status(404).json({ erro: 'Membro não encontrado nesta operação' });
    }

    const agora = new Date();
    const updateData = { status: s };

    if (s === 'CONFIRMADO') {
      updateData.confirmou = true;
      updateData.horarioConfirmacao = agora;
    } else if (s === 'EM_LOJA') {
      updateData.chegou = true;
      updateData.confirmou = true;
      updateData.horarioChegada = agora;
    } else if (s === 'PENDENTE') {
      updateData.confirmou = false;
      updateData.chegou = false;
    }

    let historico = [];
    try {
      if (membro.historicoStatus) historico = JSON.parse(membro.historicoStatus);
    } catch {
      historico = [];
    }

    historico.push({
      status: s,
      horario: agora.toISOString(),
      statusAnterior: membro.status,
    });

    updateData.historicoStatus = JSON.stringify(historico);

    const membroAtualizado = await prisma.escalaMembro.update({
      where: { id: membro.id },
      data: updateData,
      include: { usuario: true },
    });

    await prisma.statusLog.create({
      data: {
        escalaId,
        usuarioId,
        tipo: 'STATUS_CHANGE',
        descricao: `${membro.usuario.nome} atualizado para ${s}`,
        dados: JSON.stringify({ status: s, horario: agora.toISOString() }),
      },
    });

    res.json({
      sucesso: true,
      membro: {
        ...membroAtualizado,
        historicoStatus: historico,
      },
    });
  } catch (err) {
    console.error('PUT /api/operacoes/:id/membros/:usuarioId/status:', err);
    res.status(500).json({ erro: 'Erro ao atualizar status', detalhe: err.message });
  }
});

// PUT /api/operacoes/:id/observacoes
router.put('/:id/observacoes', async (req, res) => {
  try {
    const { id } = req.params;
    const { observacoes } = req.body;

    const op = await prisma.escala.findFirst({
      where: { id, usuarioSistemaId: req.userSistema.id },
    });

    if (!op) return res.status(404).json({ erro: 'Operação não encontrada ou não pertence ao seu usuário' });

    const escalaAtualizada = await prisma.escala.update({
      where: { id },
      data: { observacoes: observacoes?.trim() || null },
    });

    await prisma.statusLog.create({
      data: {
        escalaId: id,
        tipo: 'OBSERVACOES',
        descricao: 'Observações da operação atualizadas.',
      },
    });

    res.json({ sucesso: true, observacoes: escalaAtualizada.observacoes });
  } catch (err) {
    console.error('PUT /api/operacoes/:id/observacoes:', err);
    res.status(500).json({ erro: 'Erro ao salvar observações', detalhe: err.message });
  }
});

// PUT /api/operacoes/:id/finalizar
router.put('/:id/finalizar', async (req, res) => {
  try {
    const { id } = req.params;

    const op = await prisma.escala.findFirst({
      where: { id, usuarioSistemaId: req.userSistema.id },
      include: { loja: true, membros: true },
    });

    if (!op) return res.status(404).json({ erro: 'Operação não encontrada ou não pertence ao seu usuário' });

    const piv = op.pivNecessario || op.membros.length;
    const emLoja = op.membros.filter(m => m.status === 'EM_LOJA' || m.chegou).length;
    const faltas = op.membros.filter(m => m.status === 'FALTOU').length;
    const deficit = Math.max(0, piv - emLoja);

    const escala = await prisma.escala.update({
      where: { id },
      data: {
        status: 'FINALIZADA',
        finalizadoEm: new Date(),
      },
      include: { loja: true },
    });

    await prisma.statusLog.create({
      data: {
        escalaId: id,
        tipo: 'FINALIZACAO',
        descricao: `Operação finalizada. PIV Necessário: ${piv} | Em loja: ${emLoja} | Faltas: ${faltas} | Déficit: ${deficit}`,
      },
    });

    res.json({
      sucesso: true,
      mensagem: `Operação ${escala.loja.nome} finalizada com sucesso!`,
      operacao: escala,
    });
  } catch (err) {
    console.error('PUT /api/operacoes/:id/finalizar:', err);
    res.status(500).json({ erro: 'Erro ao finalizar operação', detalhe: err.message });
  }
});

// POST /api/operacoes/:id/membros
router.post('/:id/membros', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuarioId, cargo, status } = req.body;

    if (!usuarioId) return res.status(400).json({ erro: 'usuarioId é obrigatório' });

    const op = await prisma.escala.findFirst({
      where: { id, usuarioSistemaId: req.userSistema.id },
    });

    if (!op) return res.status(404).json({ erro: 'Operação não encontrada ou não pertence ao seu usuário' });

    const membro = await prisma.escalaMembro.create({
      data: {
        escalaId: id,
        usuarioId,
        cargo: cargo || 'Operador',
        status: status || 'PENDENTE',
        historicoStatus: JSON.stringify([{ status: status || 'PENDENTE', horario: new Date().toISOString() }]),
      },
      include: { usuario: true },
    });

    await prisma.statusLog.create({
      data: {
        escalaId: id,
        usuarioId,
        tipo: 'STATUS_CHANGE',
        descricao: `${membro.usuario.nome} adicionado à operação como ${membro.cargo}.`,
      },
    });

    res.status(201).json(membro);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ erro: 'Colaborador já está nesta operação' });
    console.error('POST /api/operacoes/:id/membros:', err);
    res.status(500).json({ erro: 'Erro ao adicionar membro', detalhe: err.message });
  }
});

// DELETE /api/operacoes/:id/membros/:membroId
router.delete('/:id/membros/:membroId', async (req, res) => {
  try {
    const { id, membroId } = req.params;

    const op = await prisma.escala.findFirst({
      where: { id, usuarioSistemaId: req.userSistema.id },
    });

    if (!op) return res.status(404).json({ erro: 'Operação não encontrada ou não pertence ao seu usuário' });

    const membro = await prisma.escalaMembro.findFirst({
      where: { id: membroId, escalaId: id },
      include: { usuario: true },
    });

    if (!membro) return res.status(404).json({ erro: 'Membro não encontrado' });

    await prisma.escalaMembro.delete({ where: { id: membroId } });

    await prisma.statusLog.create({
      data: {
        escalaId: id,
        tipo: 'STATUS_CHANGE',
        descricao: `${membro.usuario.nome} removido da operação.`,
      },
    });

    res.json({ sucesso: true, mensagem: 'Colaborador removido da operação' });
  } catch (err) {
    console.error('DELETE /api/operacoes/:id/membros/:membroId:', err);
    res.status(500).json({ erro: 'Erro ao remover membro', detalhe: err.message });
  }
});

export default router;
