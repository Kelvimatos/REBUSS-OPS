/**
 * REBUSS OPS — Script de Limpeza de Fotos no Banco de Dados
 * Garante que todas as fotos personalizadas no banco sejam resetadas para NULL
 * para que todos os usuários iniciem utilizando o avatar padrão oficial REBUSS (assets/rebuss.png).
 */

import 'dotenv/config';
import prisma from '../backend/lib/prisma.js';

async function resetAllUserPhotos() {
  console.log('Iniciando limpeza de fotos de perfil no banco de dados...');

  try {
    const result = await prisma.usuarioSistema.updateMany({
      data: {
        fotoPerfil: null,
      },
    });

    console.log('==================================================');
    console.log('Sucesso! Todas as fotos de perfil no banco foram resetadas.');
    console.log(`Total de usuários atualizados com fotoPerfil = NULL: ${result.count}`);
    console.log('Todos os usuários agora utilizam o avatar padrão oficial: assets/rebuss.png');
    console.log('==================================================');
  } catch (err) {
    console.error('Erro ao limpar fotos no banco:', err);
  } finally {
    await prisma.$disconnect?.();
    process.exit(0);
  }
}

resetAllUserPhotos();
