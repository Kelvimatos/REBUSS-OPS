/**
 * REBUSS OPS — Script de Ajuste de Usuários Administradores
 * 1. Remove admin@rebuss.com e seus registros exclusivos
 * 2. Define kelvimatosalves@gmail.com como ADMIN principal ativo
 * 3. Permite atualizar a senha do ADMIN principal via argumento ou interativo
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../backend/lib/prisma.js';

async function ajustarAdmins(novaSenhaMaster) {
  console.log('--- Iniciando Ajuste de Usuários Administradores ---');

  try {
    // 1. Localizar admin@rebuss.com
    const oldAdmin = await prisma.usuarioSistema.findUnique({
      where: { email: 'admin@rebuss.com' },
      include: {
        lojas: true,
        escalas: true,
        importacoesLog: true,
      },
    });

    if (oldAdmin) {
      console.log(`Encontrado admin antigo: ${oldAdmin.email} (id: ${oldAdmin.id})`);

      // Remover dependências em cascata se existirem
      if (oldAdmin.escalas.length > 0) {
        const escalaIds = oldAdmin.escalas.map(e => e.id);
        await prisma.statusLog.deleteMany({ where: { escalaId: { in: escalaIds } } });
        await prisma.escalaMembro.deleteMany({ where: { escalaId: { in: escalaIds } } });
        await prisma.ocorrencia.deleteMany({ where: { escalaId: { in: escalaIds } } });
        await prisma.escala.deleteMany({ where: { id: { in: escalaIds } } });
        console.log(` ✓ Removidas ${oldAdmin.escalas.length} escalas antigas de admin@rebuss.com`);
      }

      if (oldAdmin.lojas.length > 0) {
        await prisma.loja.deleteMany({ where: { usuarioSistemaId: oldAdmin.id } });
        console.log(` ✓ Removidas ${oldAdmin.lojas.length} lojas antigas de admin@rebuss.com`);
      }

      if (oldAdmin.importacoesLog.length > 0) {
        await prisma.importacaoLog.deleteMany({ where: { usuarioSistemaId: oldAdmin.id } });
        console.log(` ✓ Removidos ${oldAdmin.importacoesLog.length} logs de importação de admin@rebuss.com`);
      }

      // Excluir o usuário admin@rebuss.com
      await prisma.usuarioSistema.delete({
        where: { id: oldAdmin.id },
      });
      console.log(' ✓ Usuário admin@rebuss.com EXCLUÍDO com sucesso!');
    } else {
      console.log(' - Usuário admin@rebuss.com já não existe no banco.');
    }

    // 2. Garantir que kelvimatosalves@gmail.com é o ADMIN principal
    let masterUser = await prisma.usuarioSistema.findUnique({
      where: { email: 'kelvimatosalves@gmail.com' },
    });

    const updateData = {
      perfil: 'ADMIN',
      ativo: true,
      nome: 'Kelvi Matos',
      fotoPerfil: null, // Resetar foto para garantir que use rebuss.png
    };

    if (novaSenhaMaster && typeof novaSenhaMaster === 'string' && novaSenhaMaster.length >= 6) {
      const salt = await bcrypt.genSalt(10);
      updateData.senhaHash = await bcrypt.hash(novaSenhaMaster, salt);
      console.log(' ✓ Nova senha criptografada com sucesso para kelvimatosalves@gmail.com');
    }

    if (masterUser) {
      masterUser = await prisma.usuarioSistema.update({
        where: { id: masterUser.id },
        data: updateData,
      });
      console.log(` ✓ Usuário ${masterUser.email} atualizado como ADMIN PRINCIPAL.`);
    } else {
      // Se por algum motivo não existir, criar com senha padrão ou informada
      const salt = await bcrypt.genSalt(10);
      const senhaPadrao = novaSenhaMaster || 'Admin@2026';
      const senhaHash = await bcrypt.hash(senhaPadrao, salt);

      masterUser = await prisma.usuarioSistema.create({
        data: {
          nome: 'Kelvi Matos',
          email: 'kelvimatosalves@gmail.com',
          senhaHash,
          perfil: 'ADMIN',
          ativo: true,
        },
      });
      console.log(` ✓ Usuário ${masterUser.email} CRIADO como ADMIN PRINCIPAL.`);
    }

    // 3. Listar estado final dos usuários
    const todosUsuarios = await prisma.usuarioSistema.findMany({
      select: { id: true, nome: true, email: true, perfil: true, ativo: true },
    });

    console.log('==================================================');
    console.log('Estado atual dos usuários no sistema:');
    console.table(todosUsuarios);
    console.log('==================================================');
  } catch (err) {
    console.error('Erro ao ajustar administradores:', err);
  } finally {
    await prisma.$disconnect?.();
  }
}

const args = process.argv.slice(2);
const senhaArg = args[0] || process.env.NOVA_SENHA_ADMIN || null;

ajustarAdmins(senhaArg);
