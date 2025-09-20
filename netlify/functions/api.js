// Netlify serverless function wrapper for the Express API. This file bundles
// the Express application defined in server/app.js using serverless-http. When
// deployed, requests matching the `/api/*` redirect in netlify.toml will be
// routed here.

import serverless from 'serverless-http';
import app from '../../server/app.js';

export const handler = serverless(app);