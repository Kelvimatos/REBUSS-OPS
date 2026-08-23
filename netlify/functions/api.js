/**
 * REBUSS OPS — Netlify Serverless Function Handler
 * Encaminha todas as requisições /api/* diretamente para o app Express
 */

import serverless from 'serverless-http';
import app from '../../backend/server.js';
import { seedInitialAdmin } from '../../backend/lib/seedAdmin.js';

let isSeeded = false;
const serverlessHandler = serverless(app);

export const handler = async (event, context) => {
  if (!isSeeded && process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD) {
    try {
      await seedInitialAdmin();
      isSeeded = true;
    } catch (err) {
      console.warn('[Netlify Function] Seed inicial:', err.message);
    }
  }

  return serverlessHandler(event, context);
};

