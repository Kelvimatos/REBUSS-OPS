/**
 * REBUSS OPS — Singleton Prisma Client
 * Usa prisma-client-js (Prisma 7) com adapter PrismaPg
 */

import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const isLocalhost = !connectionString || connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

const pool = new Pool({
  connectionString,
  max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: isLocalhost ? false : { rejectUnauthorized: false },
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export default prisma;

