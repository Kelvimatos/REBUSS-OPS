/**
 * REBUSS OPS — Singleton Prisma Client para Supabase / PostgreSQL
 * Driver adapter PrismaPg (@prisma/adapter-pg) compatível com Supabase Transaction Pooler
 */

import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  const isLocal = !connectionString || connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  const pool = new Pool({
    connectionString,
    // Pool dimensionado para Serverless / Supabase Transaction Pooler
    max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 4,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
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


