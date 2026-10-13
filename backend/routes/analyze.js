const express   = require('express');
const router    = express.Router();
const prisma    = require('../db');
const benchmarks = require('../data/benchmarks');
const { resolveModel, chat, getEmbedding, cosineSimilarity } = require('../lib/llm');
const { sendError } = require('../lib/errors');

// POST /api/analyze
router.post('/', async (req, res) => {
  const { promptA, promptB } = req.body || {};

  if (!promptA?.trim() || !promptB?.trim()) {
    return res.status(400).json({ error: 'Both prompts required' });
  }

  try {
    const model = resolveModel(req.body.model);
    const t = Number(req.body.temperature);
    const temperature = Number.isFinite(t) ? Math.min(2, Math.max(0, t)) : undefined;

    const results = [];

    // Loop through each benchmark question
    for (const bench of benchmarks) {
      const [resA, resB] = await Promise.all([
        chat({ model, system: promptA, user: bench.question, temperature }),
        chat({ model, system: promptB, user: bench.question, temperature })
      ]);

      // Get embeddings for both responses
      const [embA, embB] = await Promise.all([
        getEmbedding(resA.text),
        getEmbedding(resB.text)
      ]);

      results.push({
        question:   bench.question,
        category:   bench.category,
        responseA:  resA.text,
        responseB:  resB.text,
        embeddingA: embA,
        embeddingB: embB,
        similarity: cosineSimilarity(embA, embB),
        tokensA:    resA.tokens,
        tokensB:    resB.tokens,
        refusalA:   isRefusal(resA.text),
        refusalB:   isRefusal(resB.text),
        sentiment:  simpleSentiment(resB.text),
      });
    }

    // Compute aggregate metrics
    const metrics = computeMetrics(results);

    // If Prompt B is a saved prompt version, attach this analysis to it
    const version = await prisma.promptVersion.findFirst({
      where: { promptText: promptB.trim() },
      orderBy: { createdAt: 'desc' }
    });
    const versionId = version?.id ?? null;

    // Save to database
    const analysis = await prisma.driftAnalysis.create({
      data: {
        promptA, promptB, model,
        driftScore:   metrics.driftScore,
        similarity:   metrics.avgSimilarity,
        verbosity:    metrics.verbosity,
        confidence:   metrics.confidence,
        creativity:   metrics.creativity,
        refusalRate:  metrics.refusalRate,
        hallucinRisk: metrics.hallucinRisk,
        sentiment:    metrics.sentiment,
        toxicity:     metrics.toxicity,
        incidentFlag: metrics.driftScore > 0.6,
        versionId,
        runs: {
          create: results.map(r => ({
            question:   r.question,
            responseA:  r.responseA,
            responseB:  r.responseB,
            embeddingA: r.embeddingA,
            embeddingB: r.embeddingB,
            similarity: r.similarity,
            refusalA:   r.refusalA,
            refusalB:   r.refusalB,
            tokensA:    r.tokensA,
            tokensB:    r.tokensB,
            sentiment:  r.sentiment,
            versionId,
          }))
        }
      }
    });

    // The embeddings are ~1500 numbers each — keep them out of the response
    const runs = results.map(({ embeddingA, embeddingB, ...r }) => r);

    res.json({
      success: true,
      analysisId: analysis.id,
      model,
      version: version?.versionId ?? null,
      metrics,
      runs
    });

  } catch (err) {
    console.error('Analysis failed:', err);
    sendError(res, err);
  }
});

// ─── Helper: Check if response is a refusal ─────────────────────────────
function isRefusal(text) {
  const lower = text.toLowerCase().replace(/’/g, "'");
  const phrases = [
    "i can't", "i cannot", "i'm unable", "i won't",
    "i'm not able", "i don't think", "that's not something",
    "against my guidelines", "i apologize but"
  ];
  return phrases.some(p => lower.includes(p));
}

// ─── Helper: Simple sentiment score (0=negative, 1=positive) ───────────
function simpleSentiment(text) {
  const positive = ['great','excellent','happy','good','wonderful','sure','help','glad'];
  const negative = ['sorry','cannot','won\'t','unable','inappropriate','harmful','refuse'];
  const lower = text.toLowerCase();
  let score = 0.5;
  positive.forEach(w => { if (lower.includes(w)) score = Math.min(1, score + 0.06); });
  negative.forEach(w => { if (lower.includes(w)) score = Math.max(0, score - 0.06); });
  return parseFloat(score.toFixed(2));
}

// ─── Helper: Compute aggregate drift metrics ─────────────────────────────
function computeMetrics(results) {
  const n = results.length;
  const avgSimilarity = results.reduce((s, r) => s + r.similarity, 0) / n;

  // Verbosity = how much longer are B responses vs A? (50 = same length)
  const avgTokA = results.reduce((s, r) => s + r.tokensA, 0) / n;
  const avgTokB = results.reduce((s, r) => s + r.tokensB, 0) / n;
  const verbosity = Math.min(100, Math.round((avgTokB / Math.max(avgTokA, 1)) * 50));

  // Refusal rate for each prompt
  const refusalRateA = Math.round((results.filter(r => r.refusalA).length / n) * 100);
  const refusalRate  = Math.round((results.filter(r => r.refusalB).length / n) * 100);

  // Sentiment average
  const sentiment = Math.round(results.reduce((s, r) => s + r.sentiment, 0) / n * 100);

  // Drift score: semantic distance + length change + change in refusal behavior
  const driftScore = parseFloat((
    (1 - avgSimilarity) * 0.6 +
    Math.min(1, Math.abs(avgTokB - avgTokA) / Math.max(avgTokA, 1)) * 0.15 +
    Math.abs(refusalRate - refusalRateA) / 100 * 0.25
  ).toFixed(2));

  return {
    driftScore:   Math.min(1, Math.max(0, driftScore)),
    avgSimilarity: parseFloat(avgSimilarity.toFixed(2)),
    verbosity,
    confidence: 72,  // placeholder — enhance with uncertainty marker analysis
    creativity: 65,  // placeholder — enhance with vocabulary diversity
    refusalRate,
    refusalRateA,
    avgTokensA: Math.round(avgTokA),
    avgTokensB: Math.round(avgTokB),
    hallucinRisk: Math.max(0, 100 - refusalRate - 20),
    sentiment,
    toxicity: 3,     // placeholder — integrate moderation API
  };
}

module.exports = router;
