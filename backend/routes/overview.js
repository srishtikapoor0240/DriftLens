const express = require('express');
const router  = express.Router();
const prisma  = require('../db');
const { sendError } = require('../lib/errors');

// GET /api/overview — returns all dashboard summary data
router.get('/', async (req, res) => {
  try {
    // Get the 30 most recent analyses for the drift timeline (newest first)
    const recent = await prisma.driftAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { driftScore: true, similarity: true, toxicity: true, createdAt: true }
    });
    const latest   = recent[0];
    const previous = recent[1];

    const [totalRuns, totalAnalyses, versions, alerts] = await Promise.all([
      prisma.benchmarkRun.count(),
      prisma.driftAnalysis.count(),
      prisma.promptVersion.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.safetyAlert.findMany({ orderBy: { createdAt: 'desc' }, take: 3 })
    ]);

    res.json({
      latestDrift:   latest?.driftScore ?? 0,
      previousDrift: previous?.driftScore ?? null,
      safetyScore:   latest ? (1 - latest.toxicity / 100) * 100 : 100,
      similarity:    latest?.similarity ?? 1,
      previousSimilarity: previous?.similarity ?? null,
      totalRuns,
      totalAnalyses,
      lastRunAt:     latest?.createdAt ?? null,
      timeline:      recent.map(t => t.driftScore).reverse(),
      versions,
      alerts
    });

  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
