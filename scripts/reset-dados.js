/**
 * REBUSS OPS — Script de Limpeza e Zeramento de Dados Operacionais/Históricos
 * Remove todos os dados de teste (Lojas, Escalas, Membros, Ocorrências, StatusLogs, Logs de Importação)
 * PRESERVA: UsuarioSistema (logins/senhas/perfis), Usuario (colaboradores base), Equipes.
 */

import 'dotenv/config';
import prisma from '../backend/lib/prisma.js';

async function resetOperationalData() {
  console.log('Iniciando limpeza de dados operacionais e de teste...');

  try {
    const result = await prisma.$transaction(async (tx) => {
      console.log('1. Removendo ocorrências...');
      const ocorrencias = await tx.ocorrencia.deleteMany({});

      console.log('2. Removendo logs de status...');
      const statusLogs = await tx.statusLog.deleteMany({});

      console.log('3. Removendo membros de escalas operacionais...');
      const escalaMembros = await tx.escalaMembro.deleteMany({});

      console.log('4. Removendo escalas operacionais...');
      const escalas = await tx.escala.deleteMany({});

      console.log('5. Removendo logs de importação...');
      const importacaoLogs = await tx.importacaoLog.deleteMany({});

      console.log('6. Removendo lojas cadastradas em testes...');
      const lojas = await tx.loja.deleteMany({});

      return {
        ocorrencias: ocorrencias.count,
        statusLogs: statusLogs.count,
        escalaMembros: escalaMembros.count,
        escalas: escalas.count,
        importacaoLogs: importacaoLogs.count,
        lojas: lojas.count
      };
    });

    console.log('==================================================');
    console.log('Limpeza concluída com sucesso!');
    console.log('Registros removidos:');
    console.log(' - Ocorrências:', result.ocorrencias);
    console.log(' - Status Logs:', result.statusLogs);
    console.log(' - Membros de Escalas:', result.escalaMembros);
    console.log(' - Escalas/Operações:', result.escalas);
    console.log(' - Logs de Importação:', result.importacaoLogs);
    console.log(' - Lojas:', result.lojas);
    console.log('==================================================');
    console.log('Usuários de login (UsuarioSistema), colaboradores (Usuario) e Equipes foram 100% PRESERVADOS.');
  } catch (err) {
    console.error('Erro ao executar limpeza:', err);
  } finally {
    await prisma.$disconnect?.();
    process.exit(0);
  }
}

resetOperationalData();
