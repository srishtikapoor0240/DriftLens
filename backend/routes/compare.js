const express = require('express');
const router  = express.Router();
const prisma  = require('../db');
const { resolveModel, chat, cosineSimilarity } = require('../lib/llm');
const { sendError, analysisLabel } = require('../lib/errors');

// POST /api/compare — compare two prompts on the same question
router.post('/', async (req, res) => {
  const { promptA, promptB, question } = req.body || {};
  const q = question || 'Explain the Pythagorean theorem';

  if (!promptA?.trim() || !promptB?.trim()) {
    return res.status(400).json({ error: 'Both prompts required' });
  }

  try {
    const model = resolveModel(req.body.model);

    const [resA, resB] = await Promise.all([
      chat({ model, system: promptA, user: q, maxTokens: 400 }),
      chat({ model, system: promptB, user: q, maxTokens: 400 })
    ]);

    // Ask the model to generate the diff analysis
    const diffRes = await chat({
      model,
      json: true,
      user: `Compare these two AI responses. Identify: added phrases, removed phrases, tone shifts, structural changes. "removed" phrases must be copied word-for-word from Response A; all other phrases must be copied word-for-word from Response B. Respond ONLY with valid JSON: { "added": ["phrase1"], "removed": ["phrase2"], "toneShifts": ["phrase3"], "structural": ["phrase4"] }\n\nResponse A: ${resA.text}\n\nResponse B: ${resB.text}`
    });

    res.json({
      question:  q,
      model,
      responseA: resA.text,
      responseB: resB.text,
      tokensA:   resA.tokens,
      tokensB:   resB.tokens,
      diff:      parseDiff(diffRes.text),
      similarity: computeWordOverlap(resA.text, resB.text)
    });

  } catch (err) {
    console.error('Compare failed:', err);
    sendError(res, err);
  }
});

// GET /api/compare/heatmap — similarity matrix between the most recent analyses
router.get('/heatmap', async (req, res) => {
  try {
    const analyses = (await prisma.driftAnalysis.findMany({
      orderBy: { createdAt: 'desc' }, take: 6,
      include: {
        runs:    { select: { question: true, embeddingB: true } },
        version: { select: { versionId: true } }
      }
    })).reverse();

    // Build similarity matrix
    const n = analyses.length;
    const matrix = Array.from({ length: n }, () => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        matrix[i][j] = i === j ? 1 : parseFloat(analysisSimilarity(analyses[i], analyses[j]).toFixed(2));
      }
    }

    res.json({ matrix, labels: analyses.map(analysisLabel) });
  } catch (err) {
    sendError(res, err);
  }
});

// Average similarity of the two analyses' answers to the same benchmark questions
function analysisSimilarity(a, b) {
  const sims = [];
  for (const runA of a.runs) {
    const runB = b.runs.find(r => r.question === runA.question);
    if (runB && runA.embeddingB.length && runA.embeddingB.length === runB.embeddingB.length) {
      sims.push(cosineSimilarity(runA.embeddingB, runB.embeddingB));
    }
  }
  return sims.length ? sims.reduce((s, x) => s + x, 0) / sims.length : 0.5;
}

// Models often wrap JSON in ```json fences — tolerate that
function parseDiff(text) {
  let diff = {};
  try {
    const match = text.match(/\{[\s\S]*\}/);
    diff = JSON.parse(match ? match[0] : text);
  } catch (e) { diff = {}; }

  const list = v => (Array.isArray(v) ? v.filter(p => typeof p === 'string' && p.trim()) : []);
  return {
    added:      list(diff.added),
    removed:    list(diff.removed),
    toneShifts: list(diff.toneShifts),
    structural: list(diff.structural)
  };
}

function computeWordOverlap(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const intersection = [...setA].filter(w => setB.has(w)).length;
  return parseFloat((intersection / Math.max(setA.size, setB.size, 1)).toFixed(2));
}

module.exports = router;
