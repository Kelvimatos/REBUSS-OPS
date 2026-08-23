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
 * Retorna o filtro Prisma para localizar a operação respeitando papéis ADMIN/GESTOR e Multi-Tenant
 */
function getOperacaoWhere(id, userSistema) {
  if (userSistema && (userSistema.perfil === 'ADMIN' || userSistema.perfil === 'GESTOR')) {
    return { id };
  }
  return { id, usuarioSistemaId: userSistema?.id };
}

/**
 * Limpa e normaliza o nome do colaborador, garantindo que contenha SOMENTE o nome.
 */
function cleanPersonName(rawText) {
  if (!rawText) return '';
  let text = rawText;

  // Se vier com formato markdown link [109186 - Nome](url)
  const mdLinkMatch = text.match(/\[(?:\d+\s*[-–—:]\s*)?(.*?)\](?:\(.*?\))?/);
  if (mdLinkMatch) {
    text = mdLinkMatch[1];
  }

  // Remove matrícula do início caso ainda reste
  text = text.replace(/^\s*\d{3,8}\s*[-–—:]\s*/, '');
  text = text.replace(/^\s*\d+[\.\)\-]?\s*/, '');
  text = text.replace(/\([^)]*\)/g, ' ');
  text = text.replace(/https?:\/\/\S+/gi, ' ');
  text = text.replace(/[*_#]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Parser de texto da equipe da aba Operações
 * Extrai rigorosamente: Nome, Cidade, Matrícula (string) e Telefone.
 * Descarta: Cargo, URL, PH/I, número inútil antes da cidade e Status.
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

    // Ignorar linhas de cabeçalho markdown ou separadores
    if (/^\|\s*[-:\s|]+\s*$/.test(line)) continue;
    if (/^\|\s*(Cargo|Função|Nome|Colaborador)\b/i.test(line)) continue;

    let matricula = '';
    let nome = '';
    let cidade = '';
    let telefone = '';

    // 1. Extração da Matrícula e Nome dentro dos colchetes: [109186 - Albetisa Rodrigues Da Silva]
    const bracketMatch = line.match(/\[\s*(\d+)\s*[-–—:]\s*([^\]]+)\]/);
    if (bracketMatch) {
      matricula = String(bracketMatch[1]).trim();
      nome = bracketMatch[2]
        .replace(/\([^)]*\)/g, '')
        .replace(/[*_#]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      // Fallback para linhas sem colchetes: 109186 - Nome Sobrenome
      const fallbackCode = line.match(/(?:^|\|\s*)(\d{4,8})\s*[-–—:]\s*([A-Za-zÀ-ÖØ-öø-ÿ\s'.]+?)(?=(?:\s*\||\s*\(|\s*\d{6,}|\s*$))/);
      if (fallbackCode) {
        matricula = String(fallbackCode[1]).trim();
        nome = fallbackCode[2]
          .replace(/\([^)]*\)/g, '')
          .replace(/[*_#]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }

    if (!nome && !matricula) continue;

    // 2. Extração de Cidade e Telefone através das colunas da tabela
    const delimiter = line.includes('|') ? '|' : (line.includes('\t') ? '\t' : null);

    if (delimiter) {
      const parts = line.split(delimiter).map(p => p.trim());
      // Localizar o índice da célula que contém o nome/matrícula
      const nameCellIdx = parts.findIndex(p =>
        p.includes('[') ||
        (matricula && p.includes(matricula)) ||
        (nome && p.includes(nome))
      );

      if (nameCellIdx !== -1) {
        const afterCells = parts.slice(nameCellIdx + 1).filter(p => p !== '');
        let foundUselessNumber = false;
        let foundCidade = false;

        for (const cell of afterCells) {
          const trimmedCell = cell.trim();
          if (!trimmedCell) continue;

          // Ignorar qualquer status (Confirmado, No confirmado, etc.)
          if (/^(Confirmado|Confirmada|No\s+confirmado|No\s+confirma|Não\s+confirmado|Nao\s+confirmado|Pendente|Presente|Falta|Faltou|Atrasado|Atrasada|Recusado|Recusou|Cancelado)$/i.test(trimmedCell)) {
            continue;
          }

          // Ignorar qualquer cargo que apareça em células posteriores
          if (/^(Supervisor\s+general|Supervisor\s+geral|Supervisor|Supervisora|Jefe\s+de\s+grupo|Chefe\s+de\s+grupo|Operador|Operadora|Escaneador|Escaneadora|Op\.\s*Sistema|Contador|Contadora|Auxiliar|Líder|Conferente)$/i.test(trimmedCell)) {
            continue;
          }

          // 1º número após o nome/link é o NÚMERO INÚTIL (ex: 00090765303, 19432854) -> DESCARTAR!
          if (!foundUselessNumber && /^\d{6,15}$/.test(trimmedCell)) {
            foundUselessNumber = true;
            continue;
          }

          // Célula após o número inútil é a CIDADE
          if (!foundCidade) {
            // Garante que não é padrão de telefone
            if (!/^[\d\(\)\s\-\+]{8,20}$/.test(trimmedCell) && !/\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}/.test(trimmedCell)) {
              cidade = trimmedCell;
              foundCidade = true;
              continue;
            }
          }

          // Célula após a cidade é o TELEFONE
          if (!telefone && (/^[\d\(\)\s\-\+]{8,20}$/.test(trimmedCell) || /\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}/.test(trimmedCell))) {
            telefone = trimmedCell;
            break;
          }
        }
      }
    }

    // Fallback para telefone se não encontrado por colunas
    if (!telefone) {
      const lineWithoutBrackets = line.replace(/\[[^\]]+\](?:\([^)]*\))?/g, ' ');
      const telMatch = lineWithoutBrackets.match(/\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}/);
      if (telMatch) telefone = telMatch[0].trim();
    }

    // Deduplicação na mesma importação pela chave matricula_nome
    const dedupKey = `${matricula}_${nome.toLowerCase()}`;
    if (processedKeys.has(dedupKey)) continue;
    processedKeys.add(dedupKey);

    colaboradores.push({
      nome,
      cidade: cidade || 'São Paulo',
      matricula: String(matricula),
      codigo: String(matricula),
      telefone,
      cargo: 'Operador',
      status: 'PENDENTE',
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

  const str = String(dataStr).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    return new Date(Date.UTC(y, m, d, 12, 0, 0));
  }

  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brMatch) {
    const d = parseInt(brMatch[1], 10);
    const m = parseInt(brMatch[2], 10) - 1;
    const y = parseInt(brMatch[3], 10);
    return new Date(Date.UTC(y, m, d, 12, 0, 0));
  }

  const dt = new Date(str);
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
async function listarOperacoesComFiltro(query, userSistema) {
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

  const where = {};
  if (userSistema && typeof userSistema === 'object') {
    if (userSistema.perfil !== 'ADMIN' && userSistema.perfil !== 'GESTOR') {
      where.usuarioSistemaId = userSistema.id;
    }
  } else if (userSistema) {
    where.usuarioSistemaId = userSistema;
  }

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
    const formatadas = await listarOperacoesComFiltro(req.query, req.userSistema);
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
    const formatadas = await listarOperacoesComFiltro(query, req.userSistema);
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
      where: getOperacaoWhere(req.params.id, req.userSistema),
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
      const nomeLimpo = colab.nome ? colab.nome.trim() : '';
      if (!nomeLimpo) continue;

      const matriculaStr = colab.matricula ? String(colab.matricula).trim() : null;
      const telefoneStr = colab.telefone ? String(colab.telefone).trim() : null;
      const cidadeStr = colab.cidade ? String(colab.cidade).trim() : (escala.loja.cidade || 'São Paulo');

      let user = null;
      if (matriculaStr) {
        user = await prisma.usuario.findFirst({ where: { matricula: matriculaStr } });
      }
      if (!user && colab.codigo) {
        user = await prisma.usuario.findFirst({ where: { codigo: String(colab.codigo).trim() } });
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
            codigo: matriculaStr || colab.codigo || null,
            matricula: matriculaStr || null,
            telefone: telefoneStr || null,
            cidade: cidadeStr,
            estado: escala.loja.estado || 'SP',
          },
        });
        novosCadastrados++;
      } else {
        // Se o usuário já existe mas tem telefone/cidade vazios, atualiza com os dados importados
        const updateUserData = {};
        if (!user.matricula && matriculaStr) updateUserData.matricula = matriculaStr;
        if (!user.codigo && matriculaStr) updateUserData.codigo = matriculaStr;
        if (!user.telefone && telefoneStr) updateUserData.telefone = telefoneStr;
        if (!user.cidade && cidadeStr) updateUserData.cidade = cidadeStr;
        if (Object.keys(updateUserData).length > 0) {
          await prisma.usuario.update({
            where: { id: user.id },
            data: updateUserData,
          });
        }
      }

      const statusInicial = 'PENDENTE';
      const initialHistory = JSON.stringify([
        { status: statusInicial, horario: new Date().toISOString() }
      ]);

      const membroExistente = escala.membros.find(m => m.usuarioId === user.id);
      if (!membroExistente) {
        await prisma.escalaMembro.create({
          data: {
            escalaId: escala.id,
            usuarioId: user.id,
            codigo: matriculaStr || user.codigo || null,
            cargo: 'Operador',
            status: statusInicial,
            confirmou: false,
            cidade: cidadeStr || user.cidade || null,
            telefone: telefoneStr || user.telefone || null,
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

// PUT /api/operacoes/:id (Editar dados da Operação: Loja, Data, Horário, PIV, Cidade, Estado)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lojaNome, data, horario, pivNecessario, cidade, estado } = req.body;

    const op = await prisma.escala.findFirst({
      where: getOperacaoWhere(id, req.userSistema),
      include: { loja: true },
    });

    if (!op) return res.status(404).json({ erro: 'Operação não encontrada ou não pertence ao seu usuário' });

    const updateEscalaData = {};
    if (data) {
      updateEscalaData.data = parseDataOperacao(data);
    }
    if (horario) {
      updateEscalaData.horario = horario.trim();
    }
    if (pivNecessario !== undefined) {
      const piv = parseInt(pivNecessario, 10);
      if (!isNaN(piv)) updateEscalaData.pivNecessario = piv;
    }

    // Atualizar dados da Loja se informados
    if (lojaNome || cidade || estado) {
      const updateLojaData = {};
      if (lojaNome) updateLojaData.nome = lojaNome.trim();
      if (cidade) updateLojaData.cidade = cidade.trim();
      if (estado) updateLojaData.estado = estado.trim().toUpperCase();

      await prisma.loja.update({
        where: { id: op.lojaId },
        data: updateLojaData,
      });
    }

    const escalaAtualizada = await prisma.escala.update({
      where: { id },
      data: updateEscalaData,
      include: {
        loja: true,
        membros: { include: { usuario: true } },
      },
    });

    await prisma.statusLog.create({
      data: {
        escalaId: id,
        tipo: 'STATUS_CHANGE',
        descricao: 'Dados da operação atualizados.',
      },
    });

    res.json({
      sucesso: true,
      mensagem: 'Operação atualizada com sucesso!',
      operacao: escalaAtualizada,
    });
  } catch (err) {
    console.error('PUT /api/operacoes/:id:', err);
    res.status(500).json({ erro: 'Erro ao atualizar operação', detalhe: err.message });
  }
});

// PUT /api/operacoes/:id/membros/:usuarioId (Editar dados do Colaborador: Nome, Matrícula, Cidade, Telefone)
router.put('/:id/membros/:usuarioId', async (req, res) => {
  try {
    const { id: escalaId, usuarioId } = req.params;
    const { nome, matricula, cidade, telefone, cargo } = req.body;

    const op = await prisma.escala.findFirst({
      where: getOperacaoWhere(escalaId, req.userSistema),
    });

    if (!op) return res.status(404).json({ erro: 'Operação não encontrada ou não pertence ao seu usuário' });

    const membro = await prisma.escalaMembro.findUnique({
      where: { escalaId_usuarioId: { escalaId, usuarioId } },
      include: { usuario: true },
    });

    if (!membro) return res.status(404).json({ erro: 'Membro não encontrado nesta operação' });

    // 1. Atualizar registro global do Usuario
    const userUpdate = {};
    if (nome && nome.trim()) userUpdate.nome = nome.trim();
    if (matricula !== undefined) userUpdate.matricula = matricula ? String(matricula).trim() : null;
    if (cidade !== undefined) userUpdate.cidade = cidade ? cidade.trim() : null;
    if (telefone !== undefined) userUpdate.telefone = telefone ? telefone.trim() : null;

    if (Object.keys(userUpdate).length > 0) {
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: userUpdate,
      });
    }

    // 2. Atualizar registro local na EscalaMembro
    const membroUpdate = {};
    if (matricula !== undefined) membroUpdate.codigo = matricula ? String(matricula).trim() : null;
    if (cidade !== undefined) membroUpdate.cidade = cidade ? cidade.trim() : null;
    if (telefone !== undefined) membroUpdate.telefone = telefone ? telefone.trim() : null;
    if (cargo && cargo.trim()) membroUpdate.cargo = cargo.trim();

    const membroAtualizado = await prisma.escalaMembro.update({
      where: { id: membro.id },
      data: membroUpdate,
      include: { usuario: true },
    });

    await prisma.statusLog.create({
      data: {
        escalaId,
        usuarioId,
        tipo: 'STATUS_CHANGE',
        descricao: `Dados de ${membroAtualizado.usuario.nome} atualizados.`,
      },
    });

    res.json({
      sucesso: true,
      mensagem: 'Colaborador atualizado com sucesso!',
      membro: membroAtualizado,
    });
  } catch (err) {
    console.error('PUT /api/operacoes/:id/membros/:usuarioId:', err);
    res.status(500).json({ erro: 'Erro ao atualizar colaborador', detalhe: err.message });
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
      where: getOperacaoWhere(escalaId, req.userSistema),
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
      where: getOperacaoWhere(id, req.userSistema),
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
      where: getOperacaoWhere(id, req.userSistema),
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
      where: getOperacaoWhere(id, req.userSistema),
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
      where: getOperacaoWhere(id, req.userSistema),
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
