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
 * Normaliza o nome da loja removendo prefixos comuns (DSP, DP, LOJA, UNIDADE, CD, etc.)
 */
function cleanLojaName(rawName) {
  if (!rawName) return '';
  return String(rawName)
    .replace(/^(DSP|DP|LOJA|UNIDADE|CD|LOCAL|INVENTÁRIO EM|INVENTARIO EM)\s*[-–—:]*\s*/i, '')
    .replace(/[*_#]/g, '')
    .trim();
}

/**
 * Retorna o Date normalizado (meio-dia UTC) e o intervalo de início e fim do dia (UTC)
 * para busca e armazenamento seguros sem desvios de fuso horário.
 */
function getDiaDateRange(dataInput) {
  const dt = parseDataOperacao(dataInput);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  const d = dt.getUTCDate();

  const dataNormalizada = new Date(Date.UTC(y, m, d, 12, 0, 0));
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

  return { dataNormalizada, start, end };
}

/**
 * Localiza ou cria a Loja respeitando o escopo do usuário (ou global se ADMIN/GESTOR)
 * com suporte a variações de prefixos (ex: "DSP JOAQUINA RAMALHO" vs "JOAQUINA RAMALHO").
 */
async function findOrCreateLoja(prismaInstance, { lojaNome, cidade, estado, endereco, userSistema }) {
  if (!lojaNome || !lojaNome.trim()) {
    throw new Error('O nome da loja é obrigatório');
  }

  const rawNome = lojaNome.trim();
  const cleanedNome = cleanLojaName(rawNome);
  const isAdminOrGestor = userSistema && (userSistema.perfil === 'ADMIN' || userSistema.perfil === 'GESTOR');
  const baseWhere = isAdminOrGestor ? {} : { usuarioSistemaId: userSistema?.id };

  // 1. Busca exata por nome no escopo do usuário
  let loja = await prismaInstance.loja.findFirst({
    where: {
      ...baseWhere,
      nome: { equals: rawNome, mode: 'insensitive' },
    },
  });

  // 2. Busca por nome limpo (se diferente)
  if (!loja && cleanedNome && cleanedNome !== rawNome) {
    loja = await prismaInstance.loja.findFirst({
      where: {
        ...baseWhere,
        OR: [
          { nome: { equals: cleanedNome, mode: 'insensitive' } },
          { nome: { contains: cleanedNome, mode: 'insensitive' } },
        ],
      },
    });
  }

  // 3. Busca por contains
  if (!loja) {
    loja = await prismaInstance.loja.findFirst({
      where: {
        ...baseWhere,
        OR: [
          { nome: { contains: rawNome, mode: 'insensitive' } },
          ...(cleanedNome ? [{ nome: { contains: cleanedNome, mode: 'insensitive' } }] : []),
        ],
      },
    });
  }

  // 4. Se não achou e não era admin, busca no escopo global para reaproveitar cadastro existente
  if (!loja && !isAdminOrGestor) {
    loja = await prismaInstance.loja.findFirst({
      where: {
        OR: [
          { nome: { equals: rawNome, mode: 'insensitive' } },
          ...(cleanedNome ? [{ nome: { equals: cleanedNome, mode: 'insensitive' } }] : []),
          { nome: { contains: rawNome, mode: 'insensitive' } },
        ],
      },
    });
  }

  // 5. Criar loja se não existir
  if (!loja) {
    loja = await prismaInstance.loja.create({
      data: {
        usuarioSistemaId: userSistema?.id || null,
        nome: rawNome,
        cidade: cidade?.trim() || 'São Paulo',
        estado: estado?.trim().toUpperCase() || 'SP',
        endereco: endereco?.trim() || null,
      },
    });
  } else if (endereco && !loja.endereco) {
    loja = await prismaInstance.loja.update({
      where: { id: loja.id },
      data: { endereco: endereco.trim() },
    });
  }

  return loja;
}

/**
 * Localiza escala existente para a mesma loja e mesma data respeitando escopo de permissão.
 */
async function findExistingEscala(prismaInstance, { lojaId, lojaNome, data, horario, userSistema }) {
  const { start, end } = getDiaDateRange(data);
  const isAdminOrGestor = userSistema && (userSistema.perfil === 'ADMIN' || userSistema.perfil === 'GESTOR');
  const userFilter = isAdminOrGestor ? {} : { usuarioSistemaId: userSistema?.id };

  const orConditions = [];

  if (lojaId) {
    orConditions.push({
      lojaId,
      data: { gte: start, lte: end },
      ...userFilter,
    });
  }

  if (lojaNome) {
    const rawNome = lojaNome.trim();
    const cleaned = cleanLojaName(rawNome);

    const lojaConditions = [
      { nome: { equals: rawNome, mode: 'insensitive' } },
      { nome: { contains: rawNome, mode: 'insensitive' } },
    ];
    if (cleaned && cleaned !== rawNome) {
      lojaConditions.push({ nome: { equals: cleaned, mode: 'insensitive' } });
      lojaConditions.push({ nome: { contains: cleaned, mode: 'insensitive' } });
    }

    orConditions.push({
      loja: { OR: lojaConditions },
      data: { gte: start, lte: end },
      ...userFilter,
    });
  }

  if (orConditions.length === 0) return null;

  return await prismaInstance.escala.findFirst({
    where: { OR: orConditions },
    include: { membros: { include: { usuario: true } }, loja: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Consolida registros duplicados legados de Escala no banco (mesma lojaId e mesma data/horário)
 */
async function consolidarEscalasDuplicadas(prismaInstance) {
  try {
    const escalas = await prismaInstance.escala.findMany({
      include: {
        membros: true,
        statusLogs: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const groups = new Map();

    for (const esc of escalas) {
      const dt = new Date(esc.data);
      const dayKey = `${esc.lojaId}_${dt.getUTCFullYear()}-${dt.getUTCMonth()}-${dt.getUTCDate()}_${(esc.horario || '').trim()}`;

      if (!groups.has(dayKey)) {
        groups.set(dayKey, []);
      }
      groups.get(dayKey).push(esc);
    }

    for (const [, list] of groups) {
      if (list.length <= 1) continue;

      const primary = list[0];
      const existingUserIds = new Set(primary.membros.map(m => m.usuarioId));

      for (let i = 1; i < list.length; i++) {
        const secondary = list[i];

        // Mover membros da secundária para a primária
        for (const membro of secondary.membros) {
          if (!existingUserIds.has(membro.usuarioId)) {
            try {
              await prismaInstance.escalaMembro.update({
                where: { id: membro.id },
                data: { escalaId: primary.id },
              });
              existingUserIds.add(membro.usuarioId);
            } catch (mErr) {
              console.warn('Consolidação: membro ignorado:', mErr.message);
            }
          }
        }

        // Mover statusLogs
        try {
          await prismaInstance.statusLog.updateMany({
            where: { escalaId: secondary.id },
            data: { escalaId: primary.id },
          });
        } catch {}

        // Excluir escala duplicada secundária
        try {
          await prismaInstance.escala.delete({
            where: { id: secondary.id },
          });
        } catch (delErr) {
          console.warn('Consolidação: falha ao deletar escala duplicada:', delErr.message);
        }
      }
    }
  } catch (err) {
    console.warn('Aviso: falha na consolidação de escalas duplicadas:', err.message);
  }
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
 * Detecta e padroniza o cargo extraído de qualquer texto/coluna
 */
function extractCargo(text) {
  if (!text) return null;
  const t = String(text).trim();
  if (/supervisor(\s+general|\s+geral)?/i.test(t)) return 'Supervisor';
  if (/jefe(\s+de\s+grupo)?/i.test(t)) return 'Jefe de Grupo';
  if (/chefe(\s+de\s+grupo)?/i.test(t)) return 'Chefe de Grupo';
  if (/l[íi]der/i.test(t)) return 'Chefe de Grupo';
  if (/contador(a)?/i.test(t)) return 'Contador';
  if (/(escaneador(a)?|op\.?\s*sistema|operador\s+de\s+sistema|op\.?\s*de\s*sistema)/i.test(t)) return 'Escaneador';
  if (/conferente/i.test(t)) return 'Conferente';
  if (/auxiliar/i.test(t)) return 'Auxiliar';
  if (/operador(a)?/i.test(t)) return 'Operador';
  return null;
}

/**
 * Identifica se a célula é um documento (CPF, RG, ID numérico longo) para descartar
 */
function isDocumentOrUselessNumber(text) {
  if (!text) return false;
  const c = String(text).trim();
  if (/^\d{6,16}$/.test(c)) return true;
  if (/^\d{1,3}(\.\d{3}){2,3}(-\d{1,2})?$/.test(c)) return true; // CPF: 186.052.047-29 ou RG
  if (/^\d{1,2}\.?\d{3}\.?\d{3}[-\/]?[\dxX]?$/i.test(c)) return true; // RG
  return false;
}

/**
 * Parser de texto da equipe da aba Operações
 * Extrai: Nome, Cidade, Matrícula (string), Telefone e Cargo.
 * Descarta: 'Confirmado' e 'No confirmado' (todo colaborador inicia sempre como PENDENTE).
 * Suporta formatos com tabelas markdown (|), tabulações, listas com colchetes e linhas simples.
 */
function parseEquipeText(rawText) {
  if (!rawText || !rawText.trim()) {
    return [];
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const colaboradores = [];
  const processedKeys = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ignorar linhas de cabeçalho markdown ou separadores
    if (/^\|\s*[-:\s|]+\s*$/.test(line)) continue;
    if (/^\|\s*(Cargo|Função|Nome|Colaborador|ID|Matrícula)\b/i.test(line)) continue;

    let matricula = '';
    let nome = '';
    let cidade = '';
    let telefone = '';
    let cargo = 'Operador';

    // 1. Extração da Matrícula e Nome dentro dos colchetes: [109186 - Albetisa Rodrigues Da Silva] ou [Nome]
    const bracketWithCode = line.match(/\[\s*(\d+)\s*[-–—:]\s*([^\]]+)\]/);
    const bracketOnlyName = line.match(/\[\s*([^\]0-9][^\]]+)\]/);

    if (bracketWithCode) {
      matricula = String(bracketWithCode[1]).trim();
      nome = cleanPersonName(bracketWithCode[2]);
    } else if (bracketOnlyName) {
      nome = cleanPersonName(bracketOnlyName[1]);
    } else {
      // Fallback para linhas sem colchetes: 109186 - Nome Sobrenome
      const fallbackCode = line.match(/(?:^|\|\s*|\t)(\d{3,8})\s*[-–—:]\s*([A-Za-zÀ-ÖØ-öø-ÿ\s'.]+?)(?=(?:\s*\||\s*\t|\s*\(|\s*\d{6,}|\s*$))/);
      if (fallbackCode) {
        matricula = String(fallbackCode[1]).trim();
        nome = cleanPersonName(fallbackCode[2]);
      } else {
        // Fallback para linhas com apenas nome
        const fallbackName = line.match(/(?:^|\|\s*|\t)([A-Za-zÀ-ÖØ-öø-ÿ]{2,}(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ]{2,})+)(?=(?:\s*\||\s*\t|\s*\(|\s*\d{6,}|\s*$))/);
        if (fallbackName && !/^(Supervisor|Operador|Chefe|Contador|Escaneador|Status|Nome|Cidade|Função|Cargo)/i.test(fallbackName[1].trim())) {
          nome = cleanPersonName(fallbackName[1]);
        }
      }
    }

    if (!nome && !matricula) continue;
    if (!nome && matricula) nome = `Colaborador ${matricula}`;

    // 2. Extração de Cargo, Cidade e Telefone através das colunas da tabela
    const delimiter = line.includes('|') ? '|' : (line.includes('\t') ? '\t' : null);

    if (delimiter) {
      const parts = line.split(delimiter).map(p => p.trim());
      const nameCellIdx = parts.findIndex(p =>
        p.includes('[') ||
        (matricula && p.includes(matricula)) ||
        (nome && p.includes(nome))
      );

      // Extração de cargo: verifica colunas anteriores ao nome
      if (nameCellIdx > 0) {
        for (let j = 0; j < nameCellIdx; j++) {
          const detectedCargo = extractCargo(parts[j]);
          if (detectedCargo) {
            cargo = detectedCargo;
            break;
          }
        }
      }

      // Se ainda não achou cargo, verifica todas as células
      if (cargo === 'Operador') {
        for (let j = 0; j < parts.length; j++) {
          if (j === nameCellIdx) continue;
          const detectedCargo = extractCargo(parts[j]);
          if (detectedCargo) {
            cargo = detectedCargo;
            break;
          }
        }
      }

      if (nameCellIdx !== -1) {
        const afterCells = parts.slice(nameCellIdx + 1).filter(p => p !== '');
        let foundUselessNumber = false;
        let foundCidade = false;

        for (const cell of afterCells) {
          const trimmedCell = cell.trim();
          if (!trimmedCell) continue;

          // Pular status ('Confirmado', 'No confirmado', etc. são descartados)
          if (/^(Confirmado|Confirmada|No\s+confirmado|No\s+confirma|Não\s+confirmado|Nao\s+confirmado|Pendente|Presente|Falta|Faltou|Atrasado|Atrasada|Recusado|Recusou|Cancelado)$/i.test(trimmedCell)) {
            continue;
          }

          // Pular cargo
          if (extractCargo(trimmedCell)) {
            continue;
          }

          // Pular número de documento / ID inútil (ex: 00090765303, 19432854, 186.052.047-29)
          if (!foundUselessNumber && isDocumentOrUselessNumber(trimmedCell)) {
            foundUselessNumber = true;
            continue;
          }

          // Célula após o número inútil é a CIDADE
          if (!foundCidade) {
            if (!isDocumentOrUselessNumber(trimmedCell) && !/^[\d\(\)\s\-\+]{8,20}$/.test(trimmedCell) && !/\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}/.test(trimmedCell)) {
              cidade = trimmedCell;
              foundCidade = true;
              continue;
            }
          }

          // Célula de TELEFONE
          if (!telefone && (/^[\d\(\)\s\-\+]{8,20}$/.test(trimmedCell) || /\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}/.test(trimmedCell))) {
            telefone = trimmedCell;
            break;
          }
        }
      }
    }

    // Se o cargo ainda não foi identificado por colunas, tenta extrair da linha inteira
    if (cargo === 'Operador') {
      const lineCargo = extractCargo(line);
      if (lineCargo) cargo = lineCargo;
    }

    // Fallback para telefone se não encontrado por colunas
    if (!telefone) {
      const lineWithoutBrackets = line.replace(/\[[^\]]+\](?:\([^)]*\))?/g, ' ');
      const telMatch = lineWithoutBrackets.match(/\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}/);
      if (telMatch) telefone = telMatch[0].trim();
    }

    // Deduplicação na mesma importação pela chave matricula_nome
    const dedupKey = matricula ? `${matricula}_${nome.toLowerCase()}` : nome.toLowerCase();
    if (processedKeys.has(dedupKey)) continue;
    processedKeys.add(dedupKey);

    colaboradores.push({
      nome,
      cidade: cidade || 'São Paulo',
      matricula: matricula ? String(matricula) : null,
      codigo: matricula ? String(matricula) : null,
      telefone: telefone || null,
      cargo,
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
  const now = new Date();
  let dataOperacao = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0));
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
      escalaExistente = await findExistingEscala(prisma, {
        lojaNome: analise.lojaNome,
        data: analise.dataOperacao,
        horario: analise.horario,
        userSistema: req.userSistema,
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

    const { dataNormalizada } = getDiaDateRange(dataOperacao || data);

    // 1. Localizar ou Criar Loja do usuário de forma resiliente
    const loja = await findOrCreateLoja(prisma, {
      lojaNome,
      cidade,
      estado,
      endereco,
      userSistema: req.userSistema,
    });

    // 2. Verificar se já existe a escala desta loja nesta data para o usuário
    let escala = await findExistingEscala(prisma, {
      lojaId: loja.id,
      lojaNome: loja.nome,
      data: dataNormalizada,
      horario,
      userSistema: req.userSistema,
    });

    let isNova = false;
    const piv = pivNecessario ? parseInt(pivNecessario, 10) : Math.max(colaboradores.length, 5);

    if (!escala) {
      isNova = true;
      escala = await prisma.escala.create({
        data: {
          usuarioSistemaId: req.userSistema.id,
          lojaId: loja.id,
          data: dataNormalizada,
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

      const matriculaStr = colab.matricula ? String(colab.matricula).trim() : null;
      const codigoStr = colab.codigo ? String(colab.codigo).trim() : matriculaStr;
      const telefoneStr = colab.telefone ? String(colab.telefone).trim() : null;
      const cidadeStr = colab.cidade ? String(colab.cidade).trim() : (loja.cidade || 'São Paulo');
      const cargoStr = colab.cargo || 'Operador';
      const statusInicial = colab.status || 'PENDENTE';

      let user = null;
      if (matriculaStr) {
        user = await prisma.usuario.findFirst({
          where: {
            OR: [
              { matricula: matriculaStr },
              { codigo: matriculaStr }
            ]
          }
        });
      }
      if (!user && codigoStr && codigoStr !== matriculaStr) {
        user = await prisma.usuario.findFirst({
          where: {
            OR: [
              { matricula: codigoStr },
              { codigo: codigoStr }
            ]
          }
        });
      }
      if (!user) {
        user = await prisma.usuario.findFirst({
          where: { nome: { equals: nomeLimpo, mode: 'insensitive' } },
        });
      }

      if (!user) {
        let safeMatricula = matriculaStr;
        let safeCodigo = codigoStr;

        if (safeMatricula) {
          const matExist = await prisma.usuario.findFirst({ where: { matricula: safeMatricula } });
          if (matExist) safeMatricula = null;
        }
        if (safeCodigo) {
          const codExist = await prisma.usuario.findFirst({ where: { codigo: safeCodigo } });
          if (codExist) safeCodigo = null;
        }

        try {
          user = await prisma.usuario.create({
            data: {
              nome: nomeLimpo,
              codigo: safeCodigo,
              matricula: safeMatricula,
              telefone: telefoneStr || null,
              cidade: cidadeStr,
              estado: loja.estado || 'SP',
            },
          });
          novosCadastrados++;
        } catch (createErr) {
          console.warn('Fallback na criação de usuário em /importar:', createErr.message);
          user = await prisma.usuario.create({
            data: {
              nome: nomeLimpo,
              codigo: null,
              matricula: null,
              telefone: telefoneStr || null,
              cidade: cidadeStr,
              estado: loja.estado || 'SP',
            },
          });
          novosCadastrados++;
        }
      } else {
        const updateUserData = {};
        if (!user.telefone && telefoneStr) updateUserData.telefone = telefoneStr;
        if (!user.cidade && cidadeStr) updateUserData.cidade = cidadeStr;

        if (matriculaStr && !user.matricula) {
          const matExist = await prisma.usuario.findFirst({ where: { matricula: matriculaStr } });
          if (!matExist) updateUserData.matricula = matriculaStr;
        }
        if (codigoStr && !user.codigo) {
          const codExist = await prisma.usuario.findFirst({ where: { codigo: codigoStr } });
          if (!codExist) updateUserData.codigo = codigoStr;
        }

        if (Object.keys(updateUserData).length > 0) {
          try {
            user = await prisma.usuario.update({
              where: { id: user.id },
              data: updateUserData,
            });
          } catch (updErr) {
            console.warn('Aviso: Falha ao atualizar dados do usuário em /importar:', updErr.message);
          }
        }
      }

      const initialHistory = JSON.stringify([
        { status: 'PENDENTE', horario: new Date().toISOString() }
      ]);

      const membroExistente = escala.membros.find(m => m.usuarioId === user.id);
      if (!membroExistente) {
        try {
          const novoMembro = await prisma.escalaMembro.create({
            data: {
              escalaId: escala.id,
              usuarioId: user.id,
              codigo: matriculaStr || codigoStr || user.codigo || null,
              cargo: cargoStr,
              status: 'PENDENTE',
              confirmou: false,
              cidade: cidadeStr || user.cidade || null,
              telefone: telefoneStr || user.telefone || null,
              historicoStatus: initialHistory,
            },
          });
          escala.membros.push(novoMembro);
          totalAtualizados++;
        } catch (membroErr) {
          console.warn('Aviso: Membro já existente na escala em /importar:', membroErr.message);
        }
      } else {
        try {
          await prisma.escalaMembro.update({
            where: { id: membroExistente.id },
            data: {
              cargo: cargoStr || membroExistente.cargo,
              codigo: matriculaStr || codigoStr || user.codigo || membroExistente.codigo,
              telefone: telefoneStr || user.telefone || membroExistente.telefone,
              cidade: cidadeStr || user.cidade || membroExistente.cidade,
            },
          });
          totalAtualizados++;
        } catch (updMembroErr) {
          console.warn('Aviso: Falha ao atualizar membro existente em /importar:', updMembroErr.message);
        }
      }
    }

    // 4. Gravar log de importação vinculado ao usuário
    try {
      await prisma.importacaoLog.create({
        data: {
          usuarioSistemaId: req.userSistema.id,
          usuarioNome: req.userSistema.nome,
          lojaNome: loja.nome,
          dataOperacao: dataNormalizada,
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

  // Limpeza de duplicatas legadas antes da listagem
  await consolidarEscalasDuplicadas(prisma);

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  // Hoje no calendário local
  const todayStart = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const todayEnd = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

  // Amanhã no calendário local
  const tomorrowStart = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  const tomorrowEnd = new Date(Date.UTC(y, m, d + 1, 23, 59, 59, 999));

  const where = {};
  if (userSistema && typeof userSistema === 'object') {
    if (userSistema.perfil !== 'ADMIN' && userSistema.perfil !== 'GESTOR') {
      where.usuarioSistemaId = userSistema.id;
    }
  } else if (userSistema) {
    where.usuarioSistemaId = userSistema;
  }

  if (data) {
    const { start, end } = getDiaDateRange(data);
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
    const rawLoja = loja.trim();
    const cleaned = cleanLojaName(rawLoja);
    const lojaFilterOr = [{ nome: { contains: rawLoja, mode: 'insensitive' } }];
    if (cleaned && cleaned !== rawLoja) {
      lojaFilterOr.push({ nome: { contains: cleaned, mode: 'insensitive' } });
    }
    where.loja = {
      ...where.loja,
      OR: lojaFilterOr,
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

  // Deduplicação estrita por op.id para garantir que nenhum ID apareça duplicado na resposta
  const uniqueOperacoesMap = new Map();
  for (const op of operacoes) {
    if (!op || !op.id) continue;
    if (!uniqueOperacoesMap.has(op.id)) {
      uniqueOperacoesMap.set(op.id, op);
    }
  }

  const operacoesUnicas = Array.from(uniqueOperacoesMap.values());

  return operacoesUnicas.map(op => {
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
      lojaId: op.loja?.id || op.lojaId,
      loja: op.loja?.nome || 'Operação',
      cidade: op.loja?.cidade || 'São Paulo',
      estado: op.loja?.estado || 'SP',
      endereco: op.loja?.endereco || '',
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
        usuarioId: m.usuario?.id || m.usuarioId,
        codigo: m.codigo || m.usuario?.codigo || '—',
        nome: m.usuario?.nome || 'Colaborador',
        matricula: m.usuario?.matricula || '—',
        cargo: m.cargo || 'Operador',
        cidade: m.cidade || m.usuario?.cidade || '',
        telefone: m.telefone || m.usuario?.telefone || '',
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

    const { dataNormalizada } = getDiaDateRange(dataRecebida);

    // 1. Localizar ou Criar Loja pertencente ao usuário de forma resiliente
    const loja = await findOrCreateLoja(prisma, {
      lojaNome,
      cidade,
      estado,
      endereco,
      userSistema: req.userSistema,
    });

    const piv = pivNecessario ? parseInt(pivNecessario, 10) : 5;

    // 2. Verificar se já existe uma operação para esta loja nesta data
    let escala = await findExistingEscala(prisma, {
      lojaId: loja.id,
      lojaNome: loja.nome,
      data: dataNormalizada,
      horario,
      userSistema: req.userSistema,
    });

    let isNova = false;

    if (!escala) {
      isNova = true;
      escala = await prisma.escala.create({
        data: {
          usuarioSistemaId: req.userSistema.id,
          lojaId: loja.id,
          data: dataNormalizada,
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
    } else {
      // Se já existia uma escala para esta loja nesta data, atualiza sem duplicar
      escala = await prisma.escala.update({
        where: { id: escala.id },
        data: {
          horario: horario.trim(),
          pivNecessario: isNaN(piv) ? escala.pivNecessario : piv,
          observacoes: observacoes !== undefined ? (observacoes?.trim() || null) : escala.observacoes,
        },
        include: {
          loja: true,
          membros: { include: { usuario: true } },
        },
      });
    }

    res.status(isNova ? 201 : 200).json({
      sucesso: true,
      mensagem: isNova ? `Operação ${loja.nome} criada com sucesso!` : `Operação ${loja.nome} atualizada com sucesso!`,
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
      where: getOperacaoWhere(id, req.userSistema),
      include: { loja: true, membros: true },
    });

    if (!escala) {
      return res.status(404).json({ erro: 'Operação não encontrada ou não pertence ao seu usuário' });
    }

    let colaboradores = Array.isArray(rawColabs) && rawColabs.length > 0 ? rawColabs : null;
    if (!colaboradores) {
      if (!texto || !texto.trim()) {
        return res.status(400).json({ erro: 'Envie o texto da equipe ou a lista de colaboradores' });
      }
      colaboradores = parseEquipeText(texto);
    }

    if (!colaboradores || colaboradores.length === 0) {
      return res.status(400).json({ erro: 'Nenhum colaborador válido identificado no texto fornecido' });
    }

    let novosCadastrados = 0;
    let vinculados = 0;

    for (const colab of colaboradores) {
      const nomeLimpo = cleanPersonName(colab.nome);
      if (!nomeLimpo) continue;

      const matriculaStr = colab.matricula ? String(colab.matricula).trim() : null;
      const codigoStr = colab.codigo ? String(colab.codigo).trim() : matriculaStr;
      const telefoneStr = colab.telefone ? String(colab.telefone).trim() : null;
      const cidadeStr = colab.cidade ? String(colab.cidade).trim() : (escala.loja?.cidade || 'São Paulo');
      const cargoStr = colab.cargo || 'Operador';
      const statusInicial = colab.status || 'PENDENTE';

      let user = null;

      // 1. Busca segura por matrícula ou código
      if (matriculaStr) {
        user = await prisma.usuario.findFirst({
          where: {
            OR: [
              { matricula: matriculaStr },
              { codigo: matriculaStr }
            ]
          }
        });
      }

      if (!user && codigoStr && codigoStr !== matriculaStr) {
        user = await prisma.usuario.findFirst({
          where: {
            OR: [
              { matricula: codigoStr },
              { codigo: codigoStr }
            ]
          }
        });
      }

      // 2. Busca por nome se não achou por código/matrícula
      if (!user) {
        user = await prisma.usuario.findFirst({
          where: { nome: { equals: nomeLimpo, mode: 'insensitive' } },
        });
      }

      // 3. Criação ou Atualização do Usuário
      if (!user) {
        let safeMatricula = matriculaStr;
        let safeCodigo = codigoStr;

        // Evita colisões de chave única
        if (safeMatricula) {
          const matExist = await prisma.usuario.findFirst({ where: { matricula: safeMatricula } });
          if (matExist) safeMatricula = null;
        }
        if (safeCodigo) {
          const codExist = await prisma.usuario.findFirst({ where: { codigo: safeCodigo } });
          if (codExist) safeCodigo = null;
        }

        try {
          user = await prisma.usuario.create({
            data: {
              nome: nomeLimpo,
              codigo: safeCodigo,
              matricula: safeMatricula,
              telefone: telefoneStr || null,
              cidade: cidadeStr,
              estado: escala.loja?.estado || 'SP',
            },
          });
          novosCadastrados++;
        } catch (createErr) {
          console.warn('Fallback na criação de usuário:', createErr.message);
          user = await prisma.usuario.create({
            data: {
              nome: nomeLimpo,
              codigo: null,
              matricula: null,
              telefone: telefoneStr || null,
              cidade: cidadeStr,
              estado: escala.loja?.estado || 'SP',
            },
          });
          novosCadastrados++;
        }
      } else {
        // Atualiza campos complementares se estiverem vazios
        const updateUserData = {};
        if (!user.telefone && telefoneStr) updateUserData.telefone = telefoneStr;
        if (!user.cidade && cidadeStr) updateUserData.cidade = cidadeStr;

        if (matriculaStr && !user.matricula) {
          const matExist = await prisma.usuario.findFirst({ where: { matricula: matriculaStr } });
          if (!matExist) updateUserData.matricula = matriculaStr;
        }
        if (codigoStr && !user.codigo) {
          const codExist = await prisma.usuario.findFirst({ where: { codigo: codigoStr } });
          if (!codExist) updateUserData.codigo = codigoStr;
        }

        if (Object.keys(updateUserData).length > 0) {
          try {
            user = await prisma.usuario.update({
              where: { id: user.id },
              data: updateUserData,
            });
          } catch (updErr) {
            console.warn('Aviso: Não foi possível atualizar usuário:', updErr.message);
          }
        }
      }

      // 4. Vincular colaborador à Escala (Sempre inicia como PENDENTE)
      const initialHistory = JSON.stringify([
        { status: 'PENDENTE', horario: new Date().toISOString() }
      ]);

      const membroExistente = escala.membros.find(m => m.usuarioId === user.id);
      if (!membroExistente) {
        try {
          const novoMembro = await prisma.escalaMembro.create({
            data: {
              escalaId: escala.id,
              usuarioId: user.id,
              codigo: matriculaStr || codigoStr || user.codigo || null,
              cargo: cargoStr,
              status: 'PENDENTE',
              confirmou: false,
              cidade: cidadeStr || user.cidade || null,
              telefone: telefoneStr || user.telefone || null,
              historicoStatus: initialHistory,
            },
          });
          escala.membros.push(novoMembro);
          vinculados++;
        } catch (membroErr) {
          console.warn('Aviso: Membro já vinculado na escala:', membroErr.message);
        }
      } else {
        try {
          await prisma.escalaMembro.update({
            where: { id: membroExistente.id },
            data: {
              cargo: cargoStr || membroExistente.cargo,
              codigo: matriculaStr || codigoStr || user.codigo || membroExistente.codigo,
              telefone: telefoneStr || user.telefone || membroExistente.telefone,
              cidade: cidadeStr || user.cidade || membroExistente.cidade,
              status: 'PENDENTE',
              confirmou: false,
              horarioConfirmacao: null,
              chegou: false,
              horarioChegada: null,
            },
          });
          vinculados++;
        } catch (updMembroErr) {
          console.warn('Aviso: Falha ao atualizar membro existente na escala:', updMembroErr.message);
        }
      }
    }

    try {
      await prisma.statusLog.create({
        data: {
          escalaId: escala.id,
          usuarioId: req.userSistema?.id || null,
          tipo: 'IMPORTACAO',
          descricao: `Equipe importada com ${colaboradores.length} colaboradores (${novosCadastrados} novos cadastros, ${vinculados} vinculados).`,
        },
      });
    } catch (logErr) {
      console.warn('Aviso: Falha ao gravar statusLog:', logErr.message);
    }

    const lojaNome = escala.loja?.nome || 'Operação';
    res.json({
      sucesso: true,
      mensagem: `${colaboradores.length} colaboradores importados para ${lojaNome}!`,
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
