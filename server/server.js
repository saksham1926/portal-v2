// Entry point for running the Express API locally. When deployed on Netlify,
// the API is exposed as a serverless function via netlify/functions/api.js.

import app from './app.js';

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});