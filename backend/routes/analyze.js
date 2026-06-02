const express   = require('express');
const router    = express.Router();
const OpenAI    = require('openai');
const prisma    = require('../db');
const benchmarks = require('../data/benchmarks');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// POST /api/analyze
router.post('/', async (req, res) => {
  const { promptA, promptB, model = 'gpt-4o-mini' } = req.body;

  if (!promptA || !promptB) {
    return res.status(400).json({ error: 'Both prompts required' });
  }

  try {
    const results = [];

    // Loop through each benchmark question
    for (const bench of benchmarks) {
      // Call OpenAI with Prompt A
      const [resA, resB] = await Promise.all([
        openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: promptA },
            { role: 'user',   content: bench.question }
          ],
          max_tokens: 500
        }),
        openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: promptB },
            { role: 'user',   content: bench.question }
          ],
          max_tokens: 500
        })
      ]);

      const textA = resA.choices[0].message.content;
      const textB = resB.choices[0].message.content;

      // Get embeddings for both responses
      const [embA, embB] = await Promise.all([
        getEmbedding(textA),
        getEmbedding(textB)
      ]);

      // Calculate similarity between the two responses
      const similarity = cosineSimilarity(embA, embB);

      results.push({
        question:   bench.question,
        category:   bench.category,
        responseA:  textA,
        responseB:  textB,
        embeddingA: embA,
        embeddingB: embB,
        similarity,
        tokensA:    resA.usage.completion_tokens,
        tokensB:    resB.usage.completion_tokens,
        refusalA:   isRefusal(textA),
        refusalB:   isRefusal(textB),
        sentiment:  simpleSentiment(textB),
      });
    }

    // Compute aggregate metrics
    const metrics = computeMetrics(results);

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
          }))
        }
      }
    });

    res.json({ success: true, analysisId: analysis.id, metrics, runs: results });

  } catch (err) {
    console.error('Analysis failed:', err);
    res.status(500).json({ error: 'Analysis failed', detail: err.message });
  }
});

// ─── Helper: Get embedding vector for a text ─────────────────────────────
async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000)  // max input length
  });
  return response.data[0].embedding;
}

// ─── Helper: Cosine similarity between two vectors ──────────────────────
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const magB = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  return dot / (magA * magB);
}

// ─── Helper: Check if response is a refusal ─────────────────────────────
function isRefusal(text) {
  const lower = text.toLowerCase();
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

  // Verbosity = how much longer are B responses vs A?
  const avgTokA = results.reduce((s, r) => s + r.tokensA, 0) / n;
  const avgTokB = results.reduce((s, r) => s + r.tokensB, 0) / n;
  const verbosity = Math.min(100, Math.round((avgTokB / Math.max(avgTokA, 1)) * 50));

  // Refusal rate for B prompt
  const refusalCount = results.filter(r => r.refusalB).length;
  const refusalRate = Math.round((refusalCount / n) * 100);

  // Sentiment average
  const sentiment = Math.round(results.reduce((s, r) => s + r.sentiment, 0) / n * 100);

  // Drift score: 1 - similarity + verbosity penalty
  const driftScore = parseFloat((
    (1 - avgSimilarity) * 0.6 + 
    Math.abs(avgTokB - avgTokA) / Math.max(avgTokA, 1) * 0.15 +
    Math.abs(50 - refusalRate) / 100 * 0.25
  ).toFixed(2));

  return {
    driftScore:   Math.min(1, driftScore),
    avgSimilarity: parseFloat(avgSimilarity.toFixed(2)),
    verbosity,
    confidence: 72,  // placeholder — enhance with uncertainty marker analysis
    creativity: 65,  // placeholder — enhance with vocabulary diversity
    refusalRate,
    hallucinRisk: Math.max(0, 100 - refusalRate - 20),
    sentiment,
    toxicity: 3,     // placeholder — integrate moderation API
  };
}

module.exports = router;
