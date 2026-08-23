/**
 * REBUSS OPS — Rotas de Gestão Operacional em Tempo Real
 * Controle Diário de Operações: Criar -> Importar Equipe -> Acompanhar Status -> Finalizar -> Histórico -> Dashboard
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

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
 * Nunca junta matrícula, telefone, cidade, status, PH, I, código.
 */
function cleanPersonName(rawText) {
  if (!rawText) return '';
  let text = rawText;

  // 1. Se veio no formato [104136 - Leandro Tameirao Pereira](URL), extrair apenas o texto interno
  const mdLinkMatch = text.match(/\[(.*?)\](?:\(.*?\))?/);
  if (mdLinkMatch) {
    text = mdLinkMatch[1];
  }

  // 2. Remover códigos no início (ex: "104136 - ", "100654 – ")
  text = text.replace(/^\s*\d{3,8}\s*[-–—:]\s*/, '');

  // 3. Remover numeração de lista no início (ex: "1.", "1 -", "01.")
  text = text.replace(/^\s*\d+[\.\)\-]?\s*/, '');

  // 4. Remover parênteses e seus conteúdos (ex: (PH: 1.410, I: 73), (SP), (MG), (31) 9999-9999)
  text = text.replace(/\([^)]*\)/g, ' ');

  // 5. Remover URLs residuais
  text = text.replace(/https?:\/\/\S+/gi, ' ');

  // 6. Remover status operacionais residuais
  const statusPatterns = [
    /\b(No\s+confirmado|Não\s+confirmado|Nao\s+confirmado|Confirmado|Confirmada|Pendente|Presente|Faltou|Falta|Recusou|Recusado|Em\s+Loja|A\s+Caminho|Atrasado|Atrasada|Desistência|Substituído|Substituido|Cancelado)\b/gi,
  ];
  for (const sp of statusPatterns) {
    text = text.replace(sp, ' ');
  }

  // 7. Remover cargos conhecidos
  const cargoKeywords = [
    'SUPERVISOR GENERAL', 'SUPERVISOR GERAL', 'SUPERVISOR', 'SUPERVISORA',
    'CHEFE DE GRUPO', 'OP. SISTEMA', 'OPERADOR DE SISTEMA',
    'CONTADOR', 'CONTADORA', 'OPERADOR', 'OPERADORA', 'AUXILIAR',
    'ESCANEADOR', 'ESCANEADORA', 'LÍDER', 'CONFERENTE', 'AUDITOR', 'AUDITORA'
  ];
  for (const ck of cargoKeywords) {
    text = text.replace(new RegExp(`\\b${ck}\\b`, 'gi'), ' ');
  }

  // 8. Remover cidades conhecidas e siglas de estados
  const citiesAndStates = [
    'Rio de Janeiro', 'São Paulo', 'Belo Horizonte', 'Juiz de Fora',
    'Curitiba', 'Brasília', 'Brasilia', 'Goiânia', 'Goiania',
    'Campinas', 'Niterói', 'Niteroi', 'Salvador', 'Fortaleza', 'Recife'
  ];
  for (const cs of citiesAndStates) {
    text = text.replace(new RegExp(`\\b${cs}\\b`, 'gi'), ' ');
  }
  text = text.replace(/\b(RJ|SP|MG|DF|GO|PR|BA|CE|PE|RS|SC|ES)\b/gi, ' ');

  // 9. Remover telefones e números isolados
  text = text.replace(/\b\d{2}\s*9?\d{4,5}\s*[-.]?\s*\d{4}\b/g, ' ');
  text = text.replace(/\b\d{4,12}\b/g, ' ');

  // 10. Remover pontuações residuais
  text = text.replace(/[\*\-\—\–\:\;\,\/\\\|\#\_\•\[\]\(\)]/g, ' ');

  // 11. Normalizar espaços em branco
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Parser de texto da equipe do Admin Rebuss / WhatsApp / Tabela
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

    // Ignorar linhas de cabeçalho de tabela Markdown (ex: "| Cargo | Nome | ... |")
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

    // CASO 1: Linha formatada com pipes (| Col1 | Col2 | Col3 ...)
    if (line.includes('|')) {
      const parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
      if (parts.length >= 2) {
        // Encontrar a parte que contém o cargo
        const cargoCand = parts[0];
        if (cargoCand && !cargoCand.startsWith('[')) {
          cargo = cargoCand.replace(/[*_]/g, '').trim() || 'Operador';
        }

        // Encontrar a parte que contém o [Código - Nome](URL) ou Nome
        let personCand = parts.find(p => p.includes('[') || /\b\d{4,8}\s*[-–—]/.test(p)) || parts[1] || '';

        // Extrair código
        const codeMatch = personCand.match(/(?:\[|\b)(\d{4,8})\s*[-–—]/) || line.match(/\[(\d{4,8})\s*[-–—]/);
        if (codeMatch) {
          codigo = codeMatch[1];
        }

        // Extrair Nome limpo
        nome = cleanPersonName(personCand);

        // Extrair Matrícula (procura nas outras colunas um número com 5 a 12 dígitos)
        for (let pIdx = 1; pIdx < parts.length; pIdx++) {
          const p = parts[pIdx];
          const matM = p.match(/^\b(\d{6,12})\b$/);
          if (matM && matM[1] !== codigo) {
            matricula = matM[1];
            break;
          }
        }

        // Extrair Telefone
        for (const p of parts) {
          const telM = p.match(/(?:\(?\d{2}\)?\s*)?9?\d{4,5}[-.\s]?\d{4}/);
          if (telM && !matricula?.includes(telM[0])) {
            telefone = telM[0].trim();
            break;
          }
        }

        // Extrair Cidade
        for (const p of parts) {
          if (/Belo Horizonte|São Paulo|Rio de Janeiro|Brasília|Goiânia|Juiz de Fora|Curitiba|Campinas/i.test(p)) {
            cidade = p.replace(/[*_]/g, '').trim();
            break;
          }
        }

        // Extrair Status
        const lastPart = parts[parts.length - 1];
        if (/No\s+confirmado|Não\s+confirmado|Nao\s+confirmado/i.test(line)) {
          statusImportado = 'PENDENTE';
        } else if (/Confirmad[oa]|Presente|Em\s+Loja/i.test(lastPart) || /Confirmad[oa]/i.test(line)) {
          statusImportado = 'CONFIRMADO';
        }
      }
    }

    // CASO 2: Linha sem pipes (texto livre ou lista do WhatsApp/Admin)
    if (!nome) {
      // Procurar código e nome no padrão [104136 - Leandro Tameirao](...)
      const matchBracket = line.match(/\[(\d{4,8})\s*[-–—:]\s*([^\]]+)\]/);
      if (matchBracket) {
        codigo = matchBracket[1];
        nome = cleanPersonName(matchBracket[2]);
      } else {
        const matchCodeLine = line.match(/\b(\d{4,8})\s*[-–—:]\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,})/);
        if (matchCodeLine) {
          codigo = matchCodeLine[1];
          nome = cleanPersonName(matchCodeLine[2]);
        }
      }

      // Se ainda não achou nome, tenta limpar a linha toda
      if (!nome) {
        const cleaned = cleanPersonName(line);
        if (cleaned.length >= 3 && !/^\d+$/.test(cleaned)) {
          nome = cleaned;
        }
      }

      // Matrícula
      const matMatch = line.match(/\b(\d{6,12})\b/);
      if (matMatch && matMatch[1] !== codigo) {
        matricula = matMatch[1];
      }

      // Telefone
      const telMatch = line.match(/(?:\(?\d{2}\)?\s*)?9?\d{4,5}[-.\s]?\d{4}/);
      if (telMatch) {
        telefone = telMatch[0];
      }

      // Cargo
      const cargoKeywords = [
        'SUPERVISOR GENERAL', 'SUPERVISOR GERAL', 'SUPERVISOR', 'SUPERVISORA',
        'CHEFE DE GRUPO', 'OP. SISTEMA', 'OPERADOR DE SISTEMA',
        'CONTADOR', 'CONTADORA', 'OPERADOR', 'OPERADORA', 'AUXILIAR',
        'ESCANEADOR', 'ESCANEADORA', 'LÍDER', 'CONFERENTE', 'AUDITOR'
      ];
      for (const ck of cargoKeywords) {
        if (new RegExp(`\\b${ck}\\b`, 'i').test(line)) {
          cargo = ck.charAt(0).toUpperCase() + ck.slice(1).toLowerCase();
          break;
        }
      }

      // Status
      if (/No\s+confirmado|Não\s+confirmado|Nao\s+confirmado/i.test(line)) {
        statusImportado = 'PENDENTE';
      } else if (/Confirmad[oa]|Presente|Em\s+Loja/i.test(line)) {
        statusImportado = 'CONFIRMADO';
      }
    }

    // Validação mínima para incluir o colaborador
    if (nome && nome.length >= 2) {
      const key = codigo || matricula || nome.toLowerCase();
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        colaboradores.push({
          codigo: codigo || null,
          nome,
          cargo: cargo || 'Operador',
          matricula: matricula || null,
          cidade: cidade || '',
          telefone: telefone || '',
          status: statusImportado,
          confirmou: statusImportado === 'CONFIRMADO',
        });
      }
    }
  }

  return colaboradores;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/operacoes/analisar (Pré-visualização da equipe sem gravar)
router.post('/analisar', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto || !texto.trim()) {
      return res.status(400).json({ erro: 'Envie o texto da equipe para análise' });
    }

    const colaboradores = parseEquipeText(texto);

    res.json({
      sucesso: true,
      totalColaboradores: colaboradores.length,
      colaboradores,
    });
  } catch (err) {
    console.error('POST /api/operacoes/analisar:', err);
    res.status(400).json({ erro: err.message });
  }
});

// Função utilitária para listar e formatar operações com filtros
async function listarOperacoesComFiltro(query) {
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

  // Filtro de Período / Data
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
  } else if (periodo === 'todas') {
    // Sem restrição de data primária
  }

  // Filtro de Loja
  if (loja && loja.trim()) {
    where.loja = {
      ...where.loja,
      nome: { contains: loja.trim(), mode: 'insensitive' },
    };
  }

  // Filtro de Cidade
  if (cidade && cidade !== 'todas' && cidade.trim()) {
    where.loja = {
      ...where.loja,
      cidade: { contains: cidade.trim(), mode: 'insensitive' },
    };
  }

  // Filtro de Estado
  if (estado && estado !== 'todos' && estado.trim()) {
    where.loja = {
      ...where.loja,
      estado: { contains: estado.trim(), mode: 'insensitive' },
    };
  }

  // Filtro de Status da Operação
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

// GET /api/operacoes (Lista operações com filtros de período, loja, cidade, status)
router.get('/', async (req, res) => {
  try {
    const formatadas = await listarOperacoesComFiltro(req.query);
    res.json(formatadas);
  } catch (err) {
    console.error('GET /api/operacoes:', err);
    res.status(500).json({ erro: 'Erro ao buscar operações', detalhe: err.message });
  }
});

// GET /api/operacoes/hoje (Compatibilidade direta)
router.get('/hoje', async (req, res) => {
  try {
    const query = { ...req.query, periodo: req.query.periodo || 'hoje' };
    const formatadas = await listarOperacoesComFiltro(query);
    res.json(formatadas);
  } catch (err) {
    console.error('GET /api/operacoes/hoje:', err);
    res.status(500).json({ erro: 'Erro ao buscar operações', detalhe: err.message });
  }
});

// GET /api/operacoes/:id (Detalhes completos da operação)
router.get('/:id', async (req, res) => {
  try {
    const op = await prisma.escala.findUnique({
      where: { id: req.params.id },
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
      return res.status(404).json({ erro: 'Operação não encontrada' });
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

// POST /api/operacoes (Criar Nova Operação)
router.post('/', async (req, res) => {
  try {
    const {
      lojaNome,
      data,
      horario,
      pivNecessario,
      cidade,
      estado,
      endereco,
      observacoes,
      usuarioCriador
    } = req.body;

    if (!lojaNome || !data || !horario) {
      return res.status(400).json({ erro: 'Loja, Data e Horário são obrigatórios' });
    }

    const dt = new Date(data);
    dt.setUTCHours(12, 0, 0, 0);

    // 1. Localizar ou Criar Loja
    let loja = await prisma.loja.findFirst({
      where: { nome: { contains: lojaNome.trim(), mode: 'insensitive' } },
    });

    if (!loja) {
      loja = await prisma.loja.create({
        data: {
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

    // 2. Criar Operação
    const escala = await prisma.escala.create({
      data: {
        lojaId: loja.id,
        data: dt,
        horario: horario.trim(),
        pivNecessario: pivNecessario ? parseInt(pivNecessario, 10) : 5,
        observacoes: observacoes?.trim() || null,
        status: 'ABERTA',
        importadoPor: usuarioCriador || 'Kelvi Matos',
        importadoEm: new Date(),
        statusLogs: {
          create: {
            tipo: 'CRIACAO',
            descricao: `Operação ${loja.nome} criada com PIV de ${pivNecessario || 5} pessoas.`,
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

// POST /api/operacoes/:id/importar-equipe (Cola e vincula a equipe à operação)
router.post('/:id/importar-equipe', async (req, res) => {
  try {
    const { id } = req.params;
    const { texto, colaboradores: rawColabs } = req.body;

    const escala = await prisma.escala.findUnique({
      where: { id },
      include: { loja: true, membros: true },
    });

    if (!escala) {
      return res.status(404).json({ erro: 'Operação não encontrada' });
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

      // 1. Localizar usuário existente pelo código, matrícula ou nome
      let user = null;
      if (colab.codigo) {
        user = await prisma.usuario.findFirst({
          where: { codigo: colab.codigo },
        });
      }
      if (!user && colab.matricula) {
        user = await prisma.usuario.findFirst({
          where: { matricula: colab.matricula },
        });
      }
      if (!user) {
        user = await prisma.usuario.findFirst({
          where: { nome: { equals: nomeLimpo, mode: 'insensitive' } },
        });
      }

      // 2. Se não existir, criar novo cadastro
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
      } else {
        // Atualizar dados que faltavam
        const updateData = {};
        if (colab.codigo && !user.codigo) updateData.codigo = colab.codigo;
        if (colab.matricula && !user.matricula) updateData.matricula = colab.matricula;
        if (colab.telefone && !user.telefone) updateData.telefone = colab.telefone;
        if (colab.cidade && !user.cidade) updateData.cidade = colab.cidade;

        if (Object.keys(updateData).length > 0) {
          await prisma.usuario.update({
            where: { id: user.id },
            data: updateData,
          });
        }
      }

      // 3. Vincular na EscalaMembro
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
      }
    }

    // Registrar Log na Timeline
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

// PUT /api/operacoes/:id/membros/:usuarioId/status (Atualização Rápida de Status com Registro Histórico)
router.put('/:id/membros/:usuarioId/status', async (req, res) => {
  try {
    const { id: escalaId, usuarioId } = req.params;
    const { status } = req.body;

    if (!status || !STATUS_VALIDOS.includes(status.toUpperCase())) {
      return res.status(400).json({ erro: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` });
    }

    const s = status.toUpperCase();

    const membro = await prisma.escalaMembro.findUnique({
      where: { escalaId_usuarioId: { escalaId, usuarioId } },
      include: { usuario: true, escala: { include: { loja: true } } },
    });

    if (!membro) {
      return res.status(404).json({ erro: 'Membro não encontrado nesta operação' });
    }

    const agora = new Date();
    const updateData = {
      status: s,
    };

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

    // Histórico detalhado de transição
    let historico = [];
    try {
      if (membro.historicoStatus) {
        historico = JSON.parse(membro.historicoStatus);
      }
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

    // Registrar na Timeline da Operação
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

// PUT /api/operacoes/:id/observacoes (Salva observações da operação)
router.put('/:id/observacoes', async (req, res) => {
  try {
    const { id } = req.params;
    const { observacoes } = req.body;

    const op = await prisma.escala.update({
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

    res.json({ sucesso: true, observacoes: op.observacoes });
  } catch (err) {
    console.error('PUT /api/operacoes/:id/observacoes:', err);
    res.status(500).json({ erro: 'Erro ao salvar observações', detalhe: err.message });
  }
});

// PUT /api/operacoes/:id/finalizar (Finaliza a operação)
router.put('/:id/finalizar', async (req, res) => {
  try {
    const { id } = req.params;

    const op = await prisma.escala.findUnique({
      where: { id },
      include: { loja: true, membros: true },
    });

    if (!op) return res.status(404).json({ erro: 'Operação não encontrada' });

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

// POST /api/operacoes/:id/membros (Adicionar membro individual)
router.post('/:id/membros', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuarioId, cargo, status } = req.body;

    if (!usuarioId) return res.status(400).json({ erro: 'usuarioId é obrigatório' });

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

// DELETE /api/operacoes/:id/membros/:membroId (Remover membro)
router.delete('/:id/membros/:membroId', async (req, res) => {
  try {
    const { id, membroId } = req.params;

    const membro = await prisma.escalaMembro.findUnique({
      where: { id: membroId },
      include: { usuario: true },
    });

    if (!membro) return res.status(404).json({ erro: 'Membro não encontrado' });

    await prisma.escalaMembro.delete({
      where: { id: membroId },
    });

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
