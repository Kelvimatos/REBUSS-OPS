/**
 * REBUSS OPS — Seed Inicial Seguro
 * Lê credenciais de variáveis de ambiente (.env) sem expor senhas no repositório
 */

import bcrypt from 'bcryptjs';
import prisma from './prisma.js';

export async function seedInitialAdmin() {
  try {
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
    const adminPass = process.env.INITIAL_ADMIN_PASSWORD;

    if (!adminEmail || !adminPass) {
      return; // Se não estiver configurado no .env, não executa seed automático
    }

    const adminExiste = await prisma.usuarioSistema.findUnique({
      where: { email: adminEmail.toLowerCase().trim() },
    });

    if (!adminExiste) {
      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(adminPass, salt);

      await prisma.usuarioSistema.create({
        data: {
          nome: process.env.INITIAL_ADMIN_NAME || 'Administrador',
          email: adminEmail.toLowerCase().trim(),
          senhaHash,
          perfil: 'ADMIN',
          ativo: true,
          cidade: 'São Paulo',
          estado: 'SP',
        },
      });
      console.log(`✅ Administrador inicial verificado com sucesso.`);
    }
  } catch (err) {
    console.error('⚠️ Erro ao verificar/criar administrador:', err.message);
  }
}
