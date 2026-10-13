const express  = require('express');
const router   = express.Router();
const prisma   = require('../db');
const { PCA }  = require('ml-pca');
const benchmarks = require('../data/benchmarks');
const { sendError } = require('../lib/errors');

// What each benchmark category is called on the galaxy, and its color
const CATEGORY_STYLE = {
  ambiguous:   { label: 'Conversational', col: [124,92,252] },
  coding:      { label: 'Coding',         col: [0,212,255] },
  creative:    { label: 'Creative',       col: [0,229,160] },
  factual:     { label: 'Factual',        col: [255,180,68] },
  unsafe_test: { label: 'Unsafe',         col: [255,120,0] },
};
const REFUSAL_STYLE = { label: 'Refusals', col: [255,92,122] };
const OTHER_STYLE   = { label: 'Other',    col: [200,200,200] };

const categoryOf = Object.fromEntries(benchmarks.map(b => [b.question, b.category]));

router.get('/', async (req, res) => {
  try {
    const runs = await prisma.benchmarkRun.findMany({
      select: {
        id:        true,
        embeddingB: true,
        question:  true,
        refusalB:  true,
        analysis:  { select: { driftScore: true } }
      },
      where: { embeddingB: { isEmpty: false } },
      orderBy: { id: 'desc' },
      take: 200
    });

    if (runs.length < 10) {
      return res.json({ clusters: [], points: [], message: 'Not enough data yet. Run more analyses.' });
    }

    const vectors = runs.map(r => r.embeddingB);

    // Safety check — all vectors must be same length
    const vecLen = vectors[0].length;
    if (vectors.some(v => v.length !== vecLen)) {
      return res.status(500).json({ error: 'Inconsistent embedding dimensions in DB (was EMBEDDING_MODEL changed?).' });
    }

    const nComponents50 = Math.min(50, vecLen, runs.length - 1);
    const pca50    = new PCA(vectors);
    const reduced50 = pca50.predict(vectors, { nComponents: nComponents50 }).to2DArray();

    // ml-kmeans is an ES module, so it can't be require()d on older Node versions
    const { kmeans } = await import('ml-kmeans');
    const k = Math.min(6, runs.length);
    const kResult = kmeans(reduced50, k, {});

    // The first two principal components are the 2D layout
    const xs = reduced50.map(c => c[0]);
    const ys = reduced50.map(c => c[1] ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const points = runs.map((run, i) => ({
      id:        run.id,
      cluster:   kResult.clusters[i],
      x:         (xs[i] - minX) / rangeX,
      y:         (ys[i] - minY) / rangeY,
      question:  run.question.slice(0, 60),
      isRefusal: run.refusalB,
      drift:     run.analysis?.driftScore ?? 0
    }));

    const usedLabels = {};
    const clusters = Array.from({ length: k }, (_, ci) => {
      const idx = points.map((p, i) => i).filter(i => points[i].cluster === ci);
      if (idx.length === 0) return null;
      const cx = idx.reduce((s, i) => s + points[i].x, 0) / idx.length;
      const cy = idx.reduce((s, i) => s + points[i].y, 0) / idx.length;

      // Name the cluster after what is actually in it
      const style = dominantStyle(idx.map(i => runs[i]));
      usedLabels[style.label] = (usedLabels[style.label] || 0) + 1;
      const label = usedLabels[style.label] > 1 ? `${style.label} ${usedLabels[style.label]}` : style.label;

      return {
        id:     ci,
        label,
        col:    style.col,
        cx:     parseFloat(cx.toFixed(3)),
        cy:     parseFloat(cy.toFixed(3)),
        n:      idx.length,
        spread: 0.08
      };
    }).filter(Boolean); // remove any empty clusters

    res.json({ clusters, points });

  } catch (err) {
    console.error('Cluster error:', err);
    sendError(res, err);
  }
});

// Mostly refusals → "Refusals"; otherwise the most common benchmark category
function dominantStyle(clusterRuns) {
  const refusals = clusterRuns.filter(r => r.refusalB).length;
  if (refusals > clusterRuns.length / 2) return REFUSAL_STYLE;

  const counts = {};
  clusterRuns.forEach(r => {
    const cat = categoryOf[r.question];
    if (cat) counts[cat] = (counts[cat] || 0) + 1;
  });
  const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  return CATEGORY_STYLE[top] || OTHER_STYLE;
}

module.exports = router;
