// Turns any thrown error into a JSON response the frontend can display
function sendError(res, err) {
  let status  = Number.isInteger(err.status) ? err.status : 500;
  let message = err.message || 'Unexpected error';

  // Prisma can't reach the database (P1001/P1003, or failed to initialise)
  if (err.name === 'PrismaClientInitializationError' || /^P100\d$/.test(err.code || '')) {
    status  = 503;
    message = 'Database unreachable. Check that PostgreSQL is running and DATABASE_URL in backend/.env is correct.';
  } else if (err.code === 'P2021') {
    status  = 503;
    message = 'Database tables are missing. Run "npx prisma db push" in the backend folder.';
  } else if ((err.name || '').startsWith('PrismaClient')) {
    // Prisma messages include a multi-line source excerpt; the last line is the actual cause
    message = 'Database error: ' + message.trim().split('\n').pop().trim();
  }

  res.status(status).json({ error: message });
}

// Display name for an analysis: the saved prompt version it tested, else its run number
function analysisLabel(a) {
  return a.version?.versionId ?? `run #${a.id}`;
}

module.exports = { sendError, analysisLabel };
