const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });

const prisma = require('./db');
const { CHAT_MODELS, EMBEDDING_MODEL } = require('./lib/llm');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api/analyze',    require('./routes/analyze'));
app.use('/api/versions',   require('./routes/versions'));
app.use('/api/benchmarks', require('./routes/benchmarks'));
app.use('/api/clusters',   require('./routes/clusters'));
app.use('/api/safety',     require('./routes/safety'));
app.use('/api/overview',   require('./routes/overview'));
app.use('/api/drift',      require('./routes/drift'));
app.use('/api/compare',    require('./routes/compare'));

// Health check — the dashboard also reads the model list from here
app.get('/api/health', async (req, res) => {
  let database = true;
  try { await prisma.$queryRaw`SELECT 1`; } catch (e) { database = false; }
  res.json({
    status: 'DriftLens backend running',
    database,
    llmConfigured: Boolean(process.env.OPENAI_API_KEY),
    models: CHAT_MODELS,
    embeddingModel: EMBEDDING_MODEL,
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl}` }));

// Serve the dashboard itself, so the whole app lives at http://localhost:PORT
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend.html')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Unexpected error' });
});

const server = app.listen(PORT, () => console.log(`DriftLens running at http://localhost:${PORT}`));
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set a different PORT in backend/.env.`);
    process.exit(1);
  }
  throw err;
});
