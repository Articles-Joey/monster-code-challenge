import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const browserDistFolder = join(import.meta.dirname, '../browser');
const COOKIE_SECRET = process.env['COOKIE_SECRET'] || 'change-this-secret-in-production';

// ── Firebase Admin ──────────────────────────────────────────────
if (!getApps().length) {
  const keyPath = join(import.meta.dirname, '../../../serviceAccountKey.json');
  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

// ── Express app ─────────────────────────────────────────────────
const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json());
app.use(cookieParser(COOKIE_SECRET));

// ── API routes ──────────────────────────────────────────────────

/** POST /api/login – hash password, compare against Firestore `users` collection */
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const hashedPassword = createHash('sha256').update(password).digest('hex');

    const snapshot = await db
      .collection('users')
      .where('username', '==', username)
      .limit(1)
      .get();

    if (snapshot.empty) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const userData = snapshot.docs[0].data();

    if (userData['passwordHash'] !== hashedPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    res.cookie('session', username, {
      signed: true,
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/logout – clear session cookie */
app.post('/api/logout', (_req, res) => {
  res.clearCookie('session');
  res.json({ success: true });
});

/** GET /api/check-session – return current auth status */
app.get('/api/check-session', (req, res) => {
  const session = (req as unknown as { signedCookies: Record<string, string> }).signedCookies['session'];
  res.json({ authenticated: !!session, username: session || null });
});

// ── Server-side route protection ────────────────────────────────

/** Redirect unauthenticated users away from /details */
app.get('/details', (req, res, next) => {
  const session = (req as unknown as { signedCookies: Record<string, string> }).signedCookies['session'];
  if (!session) {
    res.redirect('/');
    return;
  }
  next();
});

/** Redirect authenticated users away from the login page */
app.get('/', (req, res, next) => {
  const session = (req as unknown as { signedCookies: Record<string, string> }).signedCookies['session'];
  if (session) {
    res.redirect('/details');
    return;
  }
  next();
});

// ── Static files ────────────────────────────────────────────────
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

// ── Angular SSR ─────────────────────────────────────────────────
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
