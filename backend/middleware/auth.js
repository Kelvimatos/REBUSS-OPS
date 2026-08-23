/**
 * REBUSS OPS — Middleware de Autenticação e Permissões (JWT / RBAC)
 */

import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'rebuss-ops-secret-key-2026-secure-jwt';

/**
 * Middleware para validar o token JWT
 */
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ erro: 'Acesso negado. Token de autenticação não fornecido.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.usuarioSistema.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        ativo: true,
        telefone: true,
        cidade: true,
        estado: true,
        fotoPerfil: true,
      },
    });

    if (!user) {
      return res.status(401).json({ erro: 'Usuário não encontrado ou sessão inválida.' });
    }

    if (!user.ativo) {
      return res.status(403).json({ erro: 'Conta de usuário desativada. Entre em contato com o administrador.' });
    }

    req.userSistema = user;
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.', detalhe: err.message });
  }
}

/**
 * Middleware para validar permissões por perfil (RBAC)
 * Ex: requireRole(['ADMIN', 'GESTOR'])
 */
export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.userSistema) {
      return res.status(401).json({ erro: 'Não autenticado.' });
    }

    const userRole = req.userSistema.perfil?.toUpperCase();
    const normalizedAllowed = allowedRoles.map(r => r.toUpperCase());

    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({
        erro: `Acesso restrito. Seu perfil (${userRole}) não possui permissão para esta ação.`,
      });
    }

    next();
  };
}

export { JWT_SECRET };
