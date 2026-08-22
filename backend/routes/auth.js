/**
 * REBUSS OPS — Rotas de Autenticação
 * POST /api/auth/register
 * POST /api/auth/login
 * POST /api/auth/logout
 * GET  /api/auth/me
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { authenticateToken, JWT_SECRET } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register (Cadastro público — sempre OPERADOR)
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha, confirmarSenha, telefone, cidade, estado } = req.body;

    // Validações
    if (!nome || !nome.trim()) {
      return res.status(400).json({ erro: 'O nome completo é obrigatório.' });
    }

    if (!email || !email.trim() || !email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ erro: 'Informe um endereço de e-mail válido.' });
    }

    const emailLimpo = email.trim().toLowerCase();

    if (!senha || senha.length < 8) {
      return res.status(400).json({ erro: 'A senha deve conter no mínimo 8 caracteres.' });
    }

    if (confirmarSenha !== undefined && senha !== confirmarSenha) {
      return res.status(400).json({ erro: 'As senhas informadas não conferem.' });
    }

    // Verificar e-mail duplicado
    const emailExistente = await prisma.usuarioSistema.findUnique({
      where: { email: emailLimpo },
    });

    if (emailExistente) {
      return res.status(409).json({ erro: 'Este endereço de e-mail já está cadastrado no sistema.' });
    }

    // Hash da senha com bcrypt
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);

    // Criar usuário com acesso completo (ADMIN) para os membros da escala
    const novoUsuario = await prisma.usuarioSistema.create({
      data: {
        nome: nome.trim(),
        email: emailLimpo,
        senhaHash,
        perfil: 'ADMIN',
        ativo: true,
        telefone: telefone?.trim() || null,
        cidade: cidade?.trim() || null,
        estado: estado?.trim().toUpperCase() || null,
      },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        ativo: true,
        telefone: true,
        cidade: true,
        estado: true,
        createdAt: true,
      },
    });

    // Gerar token JWT de sessão
    const token = jwt.sign(
      { id: novoUsuario.id, email: novoUsuario.email, perfil: novoUsuario.perfil },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      mensagem: 'Conta criada com sucesso!',
      token,
      usuario: novoUsuario,
    });
  } catch (err) {
    console.error('POST /api/auth/register:', err);
    res.status(500).json({ erro: 'Erro ao cadastrar usuário', detalhe: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: 'Preencha o e-mail e a senha.' });
    }

    const emailLimpo = email.trim().toLowerCase();

    // Buscar usuário pelo e-mail
    const usuario = await prisma.usuarioSistema.findUnique({
      where: { email: emailLimpo },
    });

    if (!usuario) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    if (!usuario.ativo) {
      return res.status(403).json({ erro: 'Esta conta de usuário foi desativada pelo administrador.' });
    }

    // Comparar senha com hash
    const senhaValida = await bcrypt.compare(senha, usuario.senhaHash);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, perfil: usuario.perfil },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      mensagem: 'Login realizado com sucesso!',
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        ativo: usuario.ativo,
        telefone: usuario.telefone,
        cidade: usuario.cidade,
        estado: usuario.estado,
        createdAt: usuario.createdAt,
      },
    });
  } catch (err) {
    console.error('POST /api/auth/login:', err);
    res.status(500).json({ erro: 'Erro ao processar login', detalhe: err.message });
  }
});

// GET /api/auth/me (Dados do usuário logado)
router.get('/me', authenticateToken, (req, res) => {
  res.json({ usuario: req.userSistema });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.json({ mensagem: 'Sessão encerrada com sucesso.' });
});

export default router;
