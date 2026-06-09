const express = require('express');
const router  = express.Router();
const OpenAI  = require('openai');
const prisma  = require('../db');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// POST /api/compare — compare two prompts on the same question
router.post('/', async (req, res) => {
  const { promptA, promptB, model = 'gpt-4o-mini', question } = req.body;
  const q = question || 'Explain the Pythagorean theorem';

  try {
    const [resA, resB] = await Promise.all([
      openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: promptA }, { role: 'user', content: q }],
        max_tokens: 400
      }),
      openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: promptB }, { role: 'user', content: q }],
        max_tokens: 400
      })
    ]);

    const textA = resA.choices[0].message.content;
    const textB = resB.choices[0].message.content;

    // Ask GPT to generate the diff analysis
    const diffRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Compare these two AI responses. Identify: added phrases, removed phrases, tone shifts, structural changes. Respond ONLY with valid JSON: { "added": ["phrase1"], "removed": ["phrase2"], "toneShifts": ["phrase3"], "structural": ["phrase4"] }\n\nResponse A: ${textA}\n\nResponse B: ${textB}`
      }],
      max_tokens: 500
    });

    let diff = {};
    try { diff = JSON.parse(diffRes.choices[0].message.content); } catch(e) { diff = {}; }

    res.json({
      responseA: textA,
      responseB: textB,
      tokensA:   resA.usage.completion_tokens,
      tokensB:   resB.usage.completion_tokens,
      diff,
      similarity: computeWordOverlap(textA, textB)
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compare/heatmap — similarity matrix between all stored versions
router.get('/heatmap', async (req, res) => {
  try {
    const analyses = await prisma.driftAnalysis.findMany({
      orderBy: { createdAt: 'asc' }, take: 5,
      include: { runs: { select: { embeddingB: true }, take: 1 } }
    });

    // Build similarity matrix
    const n = analyses.length;
    const matrix = Array.from({ length: n }, () => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) { matrix[i][j] = 1; continue; }
        const embI = analyses[i].runs[0]?.embeddingB;
        const embJ = analyses[j].runs[0]?.embeddingB;
        if (embI && embJ) matrix[i][j] = parseFloat(cosineSim(embI, embJ).toFixed(2));
        else matrix[i][j] = 0.5;
      }
    }

    res.json({ matrix, labels: analyses.map((a, i) => 'v1.' + i + '.0') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function cosineSim(a, b) {
  const dot = a.reduce((s, ai, i) => s + ai * b[i], 0);
  return dot / (Math.sqrt(a.reduce((s,x)=>s+x*x,0)) * Math.sqrt(b.reduce((s,x)=>s+x*x,0)));
}

function computeWordOverlap(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...setA].filter(w => setB.has(w)).length;
  return parseFloat((intersection / Math.max(setA.size, setB.size)).toFixed(2));
}

module.exports = router;
