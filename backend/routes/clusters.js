const express  = require('express');
const router   = express.Router();
const prisma   = require('../db');
const KMeans   = require('ml-kmeans');
const { PCA }  = require('ml-pca');

const CLUSTER_NAMES  = ['Conversational','Coding','Creative','Refusals','Factual','Unsafe'];
const CLUSTER_COLORS = [
  [124,92,252],[0,212,255],[0,229,160],[255,92,122],[255,180,68],[255,120,0]
];

router.get('/', async (req, res) => {
  try {
    const runs = await prisma.benchmarkRun.findMany({
      select: {
        id:        true,
        embeddingB: true,
        question:  true,
        refusalB:  true,
        analysis:  { select: { driftScore: true } }
        // removed category: false — invalid Prisma syntax
      },
      where: { embeddingB: { isEmpty: false } },
      take: 200
    });

    if (runs.length < 10) {
      return res.json({ clusters: [], message: 'Not enough data yet. Run more analyses.' });
    }

    const vectors = runs.map(r => r.embeddingB);

    // Safety check — all vectors must be same length
    const vecLen = vectors[0].length;
    if (vectors.some(v => v.length !== vecLen)) {
      return res.status(500).json({ error: 'Inconsistent embedding dimensions in DB.' });
    }

    const nComponents50 = Math.min(50, vecLen, runs.length - 1);
    const pca50    = new PCA(vectors);
    const reduced50 = pca50.predict(vectors, { nComponents: nComponents50 });

    const k = Math.min(6, runs.length);
    const kResult = KMeans.kmeans(reduced50.to2DArray(), k, {});

    const pca2     = new PCA(reduced50.to2DArray());
    const coords2D = pca2.predict(reduced50.to2DArray(), { nComponents: 2 }).to2DArray();

    const xs = coords2D.map(c => c[0]);
    const ys = coords2D.map(c => c[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const points = runs.map((run, i) => ({
      id:        run.id,
      cluster:   kResult.clusters[i],
      x:         (coords2D[i][0] - minX) / rangeX,
      y:         (coords2D[i][1] - minY) / rangeY,
      question:  run.question.slice(0, 60),
      isRefusal: run.refusalB,
      drift:     run.analysis?.driftScore ?? 0
    }));

    const clusters = Array.from({ length: k }, (_, ci) => {
      const clusterPts = points.filter(p => p.cluster === ci);
      if (clusterPts.length === 0) return null;
      const cx = clusterPts.reduce((s, p) => s + p.x, 0) / clusterPts.length;
      const cy = clusterPts.reduce((s, p) => s + p.y, 0) / clusterPts.length;
      return {
        id:     ci,
        label:  CLUSTER_NAMES[ci] || `Cluster ${ci}`,
        col:    CLUSTER_COLORS[ci] || [200,200,200],
        cx:     parseFloat(cx.toFixed(3)),
        cy:     parseFloat(cy.toFixed(3)),
        n:      clusterPts.length,
        spread: 0.08
      };
    }).filter(Boolean); // remove any empty clusters

    res.json({ clusters, points });

  } catch (err) {
    console.error('Cluster error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;