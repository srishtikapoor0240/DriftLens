const OpenAI = require('openai');

const CHAT_MODELS = (process.env.CHAT_MODELS || 'gpt-4o-mini,gpt-4o,gpt-4-turbo,gpt-3.5-turbo')
  .split(',').map(m => m.trim()).filter(Boolean);
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

// Created on first use so the server can still start (and serve saved data)
// when no API key is configured.
let client = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    const err = new Error('OPENAI_API_KEY is not set. Add it to backend/.env and restart the server.');
    err.status = 503;
    throw err;
  }
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// Returns the model to use, or throws a 400 for models this backend can't call
function resolveModel(model) {
  if (!model) return CHAT_MODELS[0];
  if (!CHAT_MODELS.includes(model)) {
    const err = new Error(`Unsupported model "${model}". Available: ${CHAT_MODELS.join(', ')}`);
    err.status = 400;
    throw err;
  }
  return model;
}

async function chat({ model, system, user, maxTokens = 500, temperature, json = false }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user });

  const res = await getClient().chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    ...(temperature !== undefined && { temperature }),
    ...(json && { response_format: { type: 'json_object' } }),
  });
  return {
    text:   res.choices[0]?.message?.content ?? '',
    tokens: res.usage?.completion_tokens ?? 0,
  };
}

async function getEmbedding(text) {
  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: (text || ' ').slice(0, 8000)  // max input length
  });
  return res.data[0].embedding;
}

function cosineSimilarity(a, b) {
  const dot  = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const magB = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

module.exports = { CHAT_MODELS, EMBEDDING_MODEL, resolveModel, chat, getEmbedding, cosineSimilarity };
