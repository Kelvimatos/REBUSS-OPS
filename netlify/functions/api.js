/**
 * REBUSS OPS — Netlify Serverless Function Handler
 * Encaminha todas as requisições /api/* diretamente para o app Express
 */

import serverless from 'serverless-http';
import app from '../../backend/server.js';

export const handler = serverless(app);
