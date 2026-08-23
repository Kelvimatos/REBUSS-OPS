/**
 * REBUSS OPS — Singleton Prisma Client para Supabase / PostgreSQL
 * Driver adapter PrismaPg (@prisma/adapter-pg) compatível com Supabase Transaction Pooler
 */

import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

/**
 * Sanitiza e normaliza a URL do PostgreSQL:
 * - Remove aspas e espaços acidentais no início/fim
 * - Aplica URL encoding seguro em senhas/usuários com caracteres especiais (@, #, $, %, etc.)
 */
function sanitizeDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';

  let cleanUrl = rawUrl.trim().replace(/^["']|["']$/g, '').trim();

  try {
    const protoMatch = cleanUrl.match(/^([a-zA-Z0-9+.-]+:\/\/)/);
    if (!protoMatch) return cleanUrl;

    const protocol = protoMatch[1];
    const afterProto = cleanUrl.slice(protocol.length);

    const queryIndex = afterProto.indexOf('?');
    const pathIndex = afterProto.indexOf('/');

    let hostEndIndex = afterProto.length;
    if (pathIndex !== -1 && queryIndex !== -1) {
      hostEndIndex = Math.min(pathIndex, queryIndex);
    } else if (pathIndex !== -1) {
      hostEndIndex = pathIndex;
    } else if (queryIndex !== -1) {
      hostEndIndex = queryIndex;
    }

    const authAndHost = afterProto.slice(0, hostEndIndex);
    const pathAndQuery = afterProto.slice(hostEndIndex);

    const lastAtIndex = authAndHost.lastIndexOf('@');
    if (lastAtIndex === -1) {
      return cleanUrl;
    }

    const authPart = authAndHost.slice(0, lastAtIndex);
    const hostPart = authAndHost.slice(lastAtIndex + 1);

    const firstColonIndex = authPart.indexOf(':');
    if (firstColonIndex === -1) {
      return cleanUrl;
    }

    const rawUser = authPart.slice(0, firstColonIndex);
    const rawPass = authPart.slice(firstColonIndex + 1);

    let safeUser = rawUser;
    let safePass = rawPass;
    try {
      safeUser = encodeURIComponent(decodeURIComponent(rawUser));
      safePass = encodeURIComponent(decodeURIComponent(rawPass));
    } catch {
      safeUser = encodeURIComponent(rawUser);
      safePass = encodeURIComponent(rawPass);
    }

    return `${protocol}${safeUser}:${safePass}@${hostPart}${pathAndQuery || '/postgres'}`;
  } catch {
    return cleanUrl;
  }
}

/**
 * Remove parâmetros sslmode da query string da URL para evitar que o parser interno
 * do pg/pg-connection-string sobreponha a configuração explícita de ssl ({ rejectUnauthorized: false })
 * por 'verify-full' (que rejeita a cadeia de certificados intermediários do Supabase).
 */
function preparePgConnectionString(url) {
  if (!url || typeof url !== 'string') return '';
  return url
    .replace(/([?&])sslmode=[^&]*(&|$)/g, '$1')
    .replace(/[?&]$/, '')
    .replace(/\?&/, '?');
}

function createPrismaClient() {
  const rawConnectionString = process.env.DATABASE_URL || '';
  const connectionString = sanitizeDatabaseUrl(rawConnectionString);

  // Atualiza process.env.DATABASE_URL normalizada para os mecanismos internos do Prisma
  if (connectionString) {
    process.env.DATABASE_URL = connectionString;
  }

  const isLocal = !connectionString || connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  // Para conexões remotas (Supabase), remove sslmode da URL do pg para garantir que o Pool
  // utilize a configuração explícita ssl: { rejectUnauthorized: false }, mantendo TLS ativo
  const pgConnectionString = isLocal ? connectionString : preparePgConnectionString(connectionString);

  const pool = new Pool({
    connectionString: pgConnectionString,
    max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 4,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  pool.on('error', (err) => {
    console.warn('[Prisma PG Pool] Aviso de cliente idle:', err.message);
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

// Reutiliza instância global em ambientes serverless (Netlify Functions) para evitar conexões excessivas
const globalForPrisma = globalThis;
const prisma = globalForPrisma.rebussPrisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production' || process.env.NETLIFY) {
  globalForPrisma.rebussPrisma = prisma;
}

export default prisma;
