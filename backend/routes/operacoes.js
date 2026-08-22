/**
 * REBUSS OPS — Rotas de Importação Inteligente e Gestão de Operações
 * POST /api/operacoes/analisar
 * POST /api/operacoes/importar
 * PUT  /api/operacoes/:id/finalizar
 * GET  /api/operacoes/logs
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

// Helper para parsing inteligente de texto do Admin Rebuss / WhatsApp / Planilha
function parseOperacaoText(rawText) {
  if (!rawText || !rawText.trim()) {
    throw new Error('Texto de importação vazio');
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const textFull = rawText;

  // 1. Identificar Cidade e Estado antes da loja
  let cidade = 'São Paulo';
  let estado = 'SP';
  const locMatch = textFull.match(/([A-Za-zÀ-ÖØ-öø-ÿ\s]+)\s*[\/\-]\s*([A-Z]{2})/);
  if (locMatch) {
    cidade = locMatch[1].replace(/^(📍|em|na cidade de)\s*/i, '').trim();
    estado = locMatch[2].toUpperCase().trim();
  } else if (/Rio de Janeiro/i.test(textFull)) {
    cidade = 'Rio de Janeiro';
    estado = 'RJ';
  } else if (/Belo Horizonte/i.test(textFull)) {
    cidade = 'Belo Horizonte';
    estado = 'MG';
  } else if (/Brasília|Brasilia/i.test(textFull)) {
    cidade = 'Brasília';
    estado = 'DF';
  } else if (/Goiânia|Goiania/i.test(textFull)) {
    cidade = 'Goiânia';
    estado = 'GO';
  }

  // 2. Identificar Loja
  let lojaNome = '';
  const storePatterns = [
    /(?:Loja|Unidade|Store|Local|🏪)?\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]+(?:\d{2,5}|Centro|Shopping|Express|Hiper|Super))/i,
    /([A-ZÀ-Úa-zà-ú\s]+(?:\d{2,5}))/,
    /^([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,35}\s+\d{2,5})/m,
  ];

  for (const pat of storePatterns) {
    const match = textFull.match(pat);
    if (match && match[1]) {
      const candidate = match[1].replace(/^(Loja|Unidade|Local|🏪)\s*:?\s*/i, '').trim();
      if (!/^(Operador|Supervisor|Contador|Escaneador|Chefe|Líder)/i.test(candidate)) {
        lojaNome = candidate;
        break;
      }
    }
  }

  if (!lojaNome && lines.length > 0) {
    const firstLine = lines[0].replace(/^[📅🏪📍\s*]+/, '').trim();
    if (
      firstLine.length < 50 &&
      !firstLine.match(/^\d{1,2}[\/\-]/) &&
      !firstLine.match(/^(Operador|Supervisor|Contador|Escaneador|Chefe|Líder|Confirmado)/i) &&
      !firstLine.match(/^\d{4,6}\b/)
    ) {
      lojaNome = firstLine;
    } else {
      lojaNome = `Operação ${cidade} (${new Date().toLocaleDateString('pt-BR')})`;
    }
  }

  // 3. Identificar Data (com validação estrita de dia 1-31 e mês 1-12)
  let dataOperacao = new Date();
  const dateMatch = textFull.match(/\b(0?[1-9]|[12][0-9]|3[01])[\/\-\.](0?[1-9]|1[012])(?:[\/\-\.](20\d\d|\d{2}))?\b/);
  if (dateMatch) {
    const dia = parseInt(dateMatch[1], 10);
    const mes = parseInt(dateMatch[2], 10) - 1;
    let ano = dateMatch[3] ? parseInt(dateMatch[3], 10) : new Date().getFullYear();
    if (ano < 100) ano += 2000;
    dataOperacao = new Date(Date.UTC(ano, mes, dia, 12, 0, 0));
  } else {
    dataOperacao.setUTCHours(12, 0, 0, 0);
  }

  // 4. Identificar Horário
  let horario = '18:30';
  const timeMatch = textFull.match(/(?:às|as|horário|horario|⏰)?\s*([01]?\d|2[0-3])[:hH]([0-5]\d)/);
  if (timeMatch) {
    const hh = timeMatch[1].padStart(2, '0');
    const mm = timeMatch[2];
    horario = `${hh}:${mm}`;
  }

// Helper específico para limpar nomes de colaboradores do Admin Rebuss
function cleanPersonName(rawLine, matricula) {
  let text = rawLine;

  // 1. Remover numeração de lista no início (ex: "1.", "1 -", "01.")
  text = text.replace(/^\s*\d+[\.\)\-]?\s*/, '');

  // 2. Remover a matrícula específica se fornecida
  if (matricula) {
    text = text.replace(new RegExp(`\\b${matricula}\\b\\s*[-–—:]?\\s*`, 'g'), ' ');
  }

  // 3. Remover parênteses e seus conteúdos (ex: (PH: 1.410, I: 73), (SP), (MG))
  text = text.replace(/\([^)]*\)/g, ' ');

  // 4. Remover status operacionais residuais
  const statusPatterns = [
    /\b(No\s+confirmado|Não\s+confirmado|Nao\s+confirmado|Confirmado|Pendente|Presente|Faltou|Falta|Recusou|Recusado|Em\s+Loja|Desistência|Substituído|Substituido)\b/gi,
  ];
  for (const sp of statusPatterns) {
    text = text.replace(sp, ' ');
  }

  // 5. Remover cargos conhecidos
  const cargoKeywords = [
    'CHEFE DE GRUPO', 'OP. SISTEMA', 'OPERADOR DE SISTEMA',
    'SUPERVISOR', 'SUPERVISORA', 'CONTADOR', 'CONTADORA',
    'OPERADOR', 'OPERADORA', 'AUXILIAR', 'ESCANEADOR', 'ESCANEADORA',
    'LÍDER', 'CONFERENTE', 'AUDITOR', 'AUDITORA'
  ];
  for (const ck of cargoKeywords) {
    text = text.replace(new RegExp(`\\b${ck}\\b`, 'gi'), ' ');
  }

  // 6. Remover cidades conhecidas e siglas de estados
  const citiesAndStates = [
    'Rio de Janeiro', 'São Paulo', 'Belo Horizonte', 'Juiz de Fora',
    'Curitiba', 'Brasília', 'Brasilia', 'Goiânia', 'Goiania',
    'Campinas', 'Niterói', 'Niteroi'
  ];
  for (const cs of citiesAndStates) {
    text = text.replace(new RegExp(`\\b${cs}\\b`, 'gi'), ' ');
  }
  text = text.replace(/\b(RJ|SP|MG|DF|GO|PR|BA|CE|PE|RS|SC|ES)\b/gi, ' ');

  // 7. Remover telefones no formato com espaços (ex: 32 99919 4901 ou 21 96999 5330)
  text = text.replace(/\b\d{2}\s+9?\d{4,5}\s+\d{4}\b/g, ' ');
  text = text.replace(/\b9?\d{4,5}[\s\-.]?\d{4}\b/g, ' ');

  // 8. Remover números de documentos / CPFs / RGs / dígitos soltos
  text = text.replace(/\b\d+\b/g, ' ');

  // 9. Remover pontuações residuais
  text = text.replace(/[\*\-\—\–\:\;\,\/\\\|\#\_\•\[\]]/g, ' ');

  // 10. Normalizar espaços em branco
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

  // 5. Identificar Colaboradores
  const colaboradores = [];
  const matriculaSet = new Set();

  const cargoKeywords = [
    'SUPERVISOR', 'SUPERVISORA', 'CHEFE DE GRUPO', 'OP. SISTEMA', 'OPERADOR DE SISTEMA',
    'CONTADOR', 'CONTADORA', 'OPERADOR', 'OPERADORA', 'AUXILIAR', 'ESCANEADOR', 'ESCANEADORA',
    'LÍDER', 'CONFERENTE', 'AUDITOR', 'AUDITORA'
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Verificar se há matrícula (4 a 8 dígitos)
    const matMatch = line.match(/\b(\d{4,8})\b/);
    if (matMatch) {
      const matricula = matMatch[1];
      if (matriculaSet.has(matricula)) continue;

      let cargo = 'Operador';
      for (const ck of cargoKeywords) {
        if (new RegExp(`\\b${ck}\\b`, 'i').test(line)) {
          cargo = ck.charAt(0).toUpperCase() + ck.slice(1).toLowerCase();
          break;
        }
      }

      // Se o cargo estiver na linha anterior (formato padrão do Admin Rebuss)
      if (cargo === 'Operador' && i > 0) {
        for (const ck of cargoKeywords) {
          if (new RegExp(`\\b${ck}\\b`, 'i').test(lines[i - 1])) {
            cargo = ck.charAt(0).toUpperCase() + ck.slice(1).toLowerCase();
            break;
          }
        }
      }

      // Verificar status de confirmação (na linha atual ou na linha seguinte)
      let confirmou = false;
      if (/Confirmado|Presente|Em Loja/i.test(line) && !/No\s+confirmado|Não\s+confirmado|Nao\s+confirmado/i.test(line)) {
        confirmou = true;
      } else if (i + 1 < lines.length && /Confirmado|Presente|Em Loja/i.test(lines[i + 1]) && !/No\s+confirmado|Não\s+confirmado|Nao\s+confirmado/i.test(lines[i + 1])) {
        confirmou = true;
      }

      // Extrair o nome 100% limpo
      let nome = cleanPersonName(line, matricula);

      // Se o nome ficou vazio, tenta pegar da próxima linha se for texto
      if ((!nome || nome.length < 3) && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (!nextLine.match(/^\d+$/) && !/Confirmado|Pendente/i.test(nextLine) && nextLine.length > 2) {
          nome = cleanPersonName(nextLine, matricula);
        }
      }

      if (nome && nome.length >= 2) {
        matriculaSet.add(matricula);
        colaboradores.push({
          matricula,
          nome,
          cargo,
          confirmou,
          status: confirmou ? 'CONFIRMADO' : 'PENDENTE',
        });
      }
    }
  }

  return {
    lojaNome,
    dataOperacao: dataOperacao.toISOString(),
    horario,
    cidade,
    estado,
    pivNecessario: colaboradores.length || 10,
    colaboradores,
    totalIdentificados: colaboradores.length,
  };
}

// POST /api/operacoes/analisar (Pré-visualização da importação)
router.post('/analisar', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ erro: 'Envie o texto para análise' });

    const analise = parseOperacaoText(texto);

    // Verificar se já existe uma operação para essa loja + data + horário
    const dt = new Date(analise.dataOperacao);
    const startOfDay = new Date(dt);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(dt);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const operacaoExistente = await prisma.escala.findFirst({
      where: {
        loja: { nome: { contains: analise.lojaNome, mode: 'insensitive' } },
        data: { gte: startOfDay, lte: endOfDay },
      },
      include: { loja: true, membros: { include: { usuario: true } } },
    });

    res.json({
      analise,
      jaExiste: Boolean(operacaoExistente),
      operacaoExistente: operacaoExistente ? {
        id: operacaoExistente.id,
        loja: operacaoExistente.loja.nome,
        horario: operacaoExistente.horario,
        status: operacaoExistente.status,
        totalMembrosAtuais: operacaoExistente.membros.length,
      } : null,
    });
  } catch (err) {
    console.error('POST /api/operacoes/analisar:', err);
    res.status(400).json({ erro: err.message });
  }
});

// POST /api/operacoes/importar (Grava no PostgreSQL sem duplicar)
router.post('/importar', async (req, res) => {
  try {
    const {
      lojaNome,
      dataOperacao,
      horario,
      cidade,
      estado,
      pivNecessario,
      colaboradores = [],
      usuarioResponsavel,
    } = req.body;

    if (!lojaNome || !dataOperacao) {
      return res.status(400).json({ erro: 'Loja e data são obrigatórios' });
    }

    const dt = new Date(dataOperacao);
    const startOfDay = new Date(dt);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(dt);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // 1. Localizar ou criar Loja
    let loja = await prisma.loja.findFirst({
      where: { nome: { contains: lojaNome.trim(), mode: 'insensitive' } },
    });

    if (!loja) {
      loja = await prisma.loja.create({
        data: {
          nome: lojaNome.trim(),
          cidade: cidade || 'São Paulo',
          estado: estado || 'SP',
        },
      });
    }

    // 2. Verificar se a operação já existe para a mesma loja e data
    let escala = await prisma.escala.findFirst({
      where: {
        lojaId: loja.id,
        data: { gte: startOfDay, lte: endOfDay },
      },
      include: { membros: true },
    });

    let isAtualizacao = Boolean(escala);

    if (!escala) {
      escala = await prisma.escala.create({
        data: {
          lojaId: loja.id,
          data: dt,
          horario: horario || '18:30',
          pivNecessario: pivNecessario || colaboradores.length,
          status: 'ABERTA',
          importadoPor: usuarioResponsavel || 'Admin Rebuss',
          importadoEm: new Date(),
        },
        include: { membros: true },
      });
    } else {
      // Se já existe, atualiza os dados básicos sem apagar histórico
      escala = await prisma.escala.update({
        where: { id: escala.id },
        data: {
          horario: horario || escala.horario,
          pivNecessario: pivNecessario || escala.pivNecessario,
        },
        include: { membros: true },
      });
    }

    // 3. Processar Colaboradores (Criar/Atualizar na tabela Usuario e vincular na Escala)
    let totalNovos = 0;
    let totalAtualizados = 0;
    let erros = 0;

    for (const colab of colaboradores) {
      try {
        const nomeLimpo = cleanPersonName(colab.nome, colab.matricula);
        if (!nomeLimpo) continue;

        let user = null;
        if (colab.matricula) {
          user = await prisma.usuario.findUnique({
            where: { matricula: colab.matricula },
          });
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
              matricula: colab.matricula || null,
              cidade: cidade || 'São Paulo',
              estado: estado || 'SP',
            },
          });
          totalNovos++;
        } else {
          totalAtualizados++;
          // Atualizar matrícula ou corrigir nome se necessário
          const updateData = {};
          if (colab.matricula && !user.matricula) updateData.matricula = colab.matricula;
          if (user.nome !== nomeLimpo && !user.email) updateData.nome = nomeLimpo;

          if (Object.keys(updateData).length > 0) {
            await prisma.usuario.update({
              where: { id: user.id },
              data: updateData,
            });
          }
        }

        // Vincular na EscalaMembro com o cargo
        const membroExistente = escala.membros.find(m => m.usuarioId === user.id);
        if (!membroExistente) {
          await prisma.escalaMembro.create({
            data: {
              escalaId: escala.id,
              usuarioId: user.id,
              cargo: colab.cargo || 'Operador',
              status: colab.status || 'PENDENTE',
              confirmou: Boolean(colab.confirmou),
              chegou: Boolean(colab.chegou),
            },
          });
        } else if (colab.cargo) {
          await prisma.escalaMembro.update({
            where: { id: membroExistente.id },
            data: { cargo: colab.cargo },
          });
        }
      } catch (colabErr) {
        console.error('Erro ao processar colaborador:', colab, colabErr);
        erros++;
      }
    }

    // 4. Registrar Log de Importação
    const log = await prisma.importacaoLog.create({
      data: {
        usuarioNome: usuarioResponsavel || 'Kelvi Matos',
        lojaNome: loja.nome,
        dataOperacao: dt,
        horarioOperacao: horario,
        totalProcessados: colaboradores.length,
        totalNovos,
        totalAtualizados,
        erros,
        escalaId: escala.id,
        detalhes: isAtualizacao ? 'Operação existente sincronizada com sucesso' : 'Nova operação importada',
      },
    });

    res.json({
      sucesso: true,
      mensagem: isAtualizacao
        ? `Operação ${loja.nome} sincronizada com sucesso!`
        : `Nova operação ${loja.nome} registrada no histórico permanente!`,
      escalaId: escala.id,
      log,
      totalProcessados: colaboradores.length,
      totalNovos,
      totalAtualizados,
      erros,
    });
  } catch (err) {
    console.error('POST /api/operacoes/importar:', err);
    res.status(500).json({ erro: 'Erro ao importar operação', detalhe: err.message });
  }
});

// PUT /api/operacoes/:id/finalizar (Finaliza a operação e trava no histórico)
router.put('/:id/finalizar', async (req, res) => {
  try {
    const escala = await prisma.escala.update({
      where: { id: req.params.id },
      data: {
        status: 'FINALIZADA',
        finalizadoEm: new Date(),
      },
      include: { loja: true, membros: { include: { usuario: true } } },
    });

    res.json({
      mensagem: `Operação ${escala.loja.nome} finalizada e arquivada com sucesso!`,
      escala,
    });
  } catch (err) {
    console.error('PUT /api/operacoes/:id/finalizar:', err);
    res.status(500).json({ erro: 'Erro ao finalizar operação', detalhe: err.message });
  }
});

// GET /api/operacoes/logs (Lista logs de importação)
router.get('/logs', async (req, res) => {
  try {
    const logs = await prisma.importacaoLog.findMany({
      orderBy: { dataHora: 'desc' },
      take: 50,
    });
    res.json(logs);
  } catch (err) {
    console.error('GET /api/operacoes/logs:', err);
    res.status(500).json({ erro: 'Erro ao buscar logs', detalhe: err.message });
  }
});

export default router;
