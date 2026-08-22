/**
 * REBUSS OPS — Singleton Prisma Client
 * Usa prisma-client-js (Prisma 7 legado) com adapter PrismaPg
 */

import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export default prisma;
