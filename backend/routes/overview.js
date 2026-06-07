const express = require('express'); 
const router  = express.Router(); 
const prisma  = require('../db'); 
 
// GET /api/overview — returns all dashboard summary data 
router.get('/', async (req, res) => { 
  try { 
    // Get latest analysis 
    const latest = await prisma.driftAnalysis.findFirst({ 
      orderBy: { createdAt: 'desc' } 
    }); 
 
    // Get total runs count 
    const totalRuns = await prisma.benchmarkRun.count(); 
 
    // Get all analyses for drift timeline (last 30) 
    const timeline = await prisma.driftAnalysis.findMany({ 
      orderBy: { createdAt: 'asc' }, 
      take: 30, 
      select: { driftScore: true, createdAt: true } 
    }); 
 
    // Get all prompt versions 
    const versions = await prisma.promptVersion.findMany({ 
      orderBy: { createdAt: 'asc' } 
    }); 
 
    // Get recent safety alerts 
    const alerts = await prisma.safetyAlert.findMany({ 
      orderBy: { createdAt: 'desc' }, 
      take: 3 
    }); 
 
    res.json({ 
      latestDrift:  latest?.driftScore ?? 0, 
      safetyScore:  latest ? (1 - latest.toxicity / 100) * 100 : 100, 
      similarity:   latest?.similarity ?? 1, 
      totalRuns, 
      timeline:     timeline.map(t => t.driftScore), 
      versions, 
      alerts 
    }); 
 
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  } 
}); 
 
module.exports = router;