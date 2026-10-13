const express = require('express');
const router  = express.Router();
const prisma  = require('../db');
const { sendError } = require('../lib/errors');

const TAGS = ['baseline', 'stable', 'warning', 'alert'];

// GET /api/versions — list all prompt versions, each with its latest analysis (if any)
router.get('/', async (req, res) => {
  try {
    const versions = await prisma.promptVersion.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { runs: true, analyses: true } },
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true, driftScore: true, similarity: true, verbosity: true,
            confidence: true, creativity: true, refusalRate: true, toxicity: true
          }
        }
      }
    });
    res.json(versions.map(({ analyses, ...v }) => ({ ...v, latest: analyses[0] ?? null })));
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/versions — save a new version
router.post('/', async (req, res) => {
  const body = req.body || {};
  const versionId  = String(body.versionId  ?? '').trim();
  const promptText = String(body.promptText ?? '').trim();

  if (!versionId || !promptText) {
    return res.status(400).json({ error: 'versionId and promptText are required' });
  }

  const tag = String(body.tag ?? '').trim().toLowerCase();

  try {
    const version = await prisma.promptVersion.create({
      data: {
        versionId,
        promptText,
        slug:   String(body.slug   ?? '').trim() || 'untitled',
        model:  String(body.model  ?? '').trim() || 'unspecified',
        author: String(body.author ?? '').trim() || 'unknown',
        tag:    TAGS.includes(tag) ? tag : 'stable'
      }
    });
    res.json({ success: true, version });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: `Version "${versionId}" already exists` });
    }
    sendError(res, err);
  }
});

// DELETE /api/versions/:id — delete a version
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid version id' });

  try {
    // Keep the version's analyses and runs, just detach them
    await prisma.$transaction([
      prisma.benchmarkRun.updateMany({ where: { versionId: id }, data: { versionId: null } }),
      prisma.driftAnalysis.updateMany({ where: { versionId: id }, data: { versionId: null } }),
      prisma.promptVersion.delete({ where: { id } })
    ]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Version not found' });
    sendError(res, err);
  }
});

module.exports = router;
