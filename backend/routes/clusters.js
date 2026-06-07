const express = require('express'); 
const router  = express.Router(); 
const prisma  = require('../db'); 
const KMeans  = require('ml-kmeans'); 
const { PCA } = require('ml-pca'); 
 
// GET /api/clusters — get clustered response coordinates 
router.get('/', async (req, res) => { 
  try { 
    // Fetch all runs that have embeddings 
    const runs = await prisma.benchmarkRun.findMany({ 
      select: { 
        id: true, 
        embeddingB: true, 
        question: true, 
        refusalB: true, 
        category: false, 
        analysis: { select: { driftScore: true } } 
      }, 
      where: { embeddingB: { isEmpty: false } }, 
      take: 200 
    }); 
 
    if (runs.length < 10) { 
      return res.json({ clusters: [], message: 'Not enough data yet. Run more analyses.' }); } 
 
    // Extract embedding vectors 
    const vectors = runs.map(r => r.embeddingB); 
 
    // Reduce to 50 dimensions first (PCA is slow on 1536) 
    const pca50 = new PCA(vectors); 
    const reduced50 = pca50.predict(vectors, { nComponents: Math.min(50, 
vectors[0].length) }); 
 
    // K-means cluster into 6 groups 
    const k = 6; 
    const kResult = KMeans.kmeans(reduced50.to2DArray(), k, {}); 
 
    // Further reduce to 2D for display 
    const pca2 = new PCA(reduced50.to2DArray()); 
    const coords2D = pca2.predict(reduced50.to2DArray(), { nComponents: 2 
}).to2DArray(); 
 
    // Normalize to 0-1 range 
    const xs = coords2D.map(c => c[0]); 
    const ys = coords2D.map(c => c[1]); 
    const minX = Math.min(...xs), maxX = Math.max(...xs); 
    const minY = Math.min(...ys), maxY = Math.max(...ys); 
 
    const points = runs.map((run, i) => ({ 
      id:       run.id, 
      cluster:  kResult.clusters[i], 
      x:        (coords2D[i][0] - minX) / (maxX - minX), 
      y:        (coords2D[i][1] - minY) / (maxY - minY), 
      question: run.question.slice(0, 60), 
      isRefusal: run.refusalB, 
      drift:    run.analysis?.driftScore ?? 0 
    })); 
 
    // Compute cluster centers 
    const CLUSTER_NAMES = 
['Conversational','Coding','Creative','Refusals','Factual','Unsafe']; 
    const CLUSTER_COLORS = [ 
      [124,92,252],[0,212,255],[0,229,160],[255,92,122],[255,180,68],[255,120,0] 
    ]; 
 
    const clusters = Array.from({ length: k }, (_, ci) => { 
      const clusterPts = points.filter(p => p.cluster === ci); 
      const cx = clusterPts.reduce((s, p) => s + p.x, 0) / clusterPts.length; 
      const cy = clusterPts.reduce((s, p) => s + p.y, 0) / clusterPts.length; 
      return { 
        id:     ci, 
        label:  CLUSTER_NAMES[ci], 
        col:    CLUSTER_COLORS[ci], 
        cx:     parseFloat(cx.toFixed(3)), 
        cy:     parseFloat(cy.toFixed(3)), 
        n:      clusterPts.length, 
        spread: 0.08 
      }; 
    }); 
 
    res.json({ clusters, points }); 
 
  } catch (err) { 
    console.error('Cluster error:', err); 
    res.status(500).json({ error: err.message }); 
  } 
}); 
 
module.exports = router; 