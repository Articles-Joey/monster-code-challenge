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
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const browserDistFolder = join(import.meta.dirname, '../browser');
const COOKIE_SECRET = process.env['COOKIE_SECRET'] || 'change-this-secret-in-production';

// ── Firebase Admin ──────────────────────────────────────────────
if (!getApps().length) {
  const keyPath = join(import.meta.dirname, '../../../serviceAccountKey.json');
  if (existsSync(keyPath)) {
    // Local dev: use service account key file
    const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));
    initializeApp({ credential: cert(serviceAccount) });
  } else {
    // Production (Firebase App Hosting): use Application Default Credentials
    initializeApp();
  }
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

    await snapshot.docs[0].ref.update({ last_login: FieldValue.serverTimestamp() });

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

// ── Helper: get username from signed cookie ─────────────────────
function getSessionUser(req: express.Request): string | null {
  return (req as unknown as { signedCookies: Record<string, string> }).signedCookies['session'] || null;
}

/** GET /api/flight-info – fetch existing flight info for the authenticated user */
app.get('/api/flight-info', async (req, res) => {
  const username = getSessionUser(req);
  if (!username) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const snapshot = await db.collection('users').where('username', '==', username).limit(1).get();
    if (snapshot.empty) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const userData = snapshot.docs[0].data();
    if (!userData['flightInfo']) {
      res.json({ exists: false });
      return;
    }
    res.json({ exists: true, data: userData['flightInfo'] });
  } catch (error) {
    console.error('Fetch flight info error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/flight-info – proxy to challenge API, save to Firestore on success */
app.post('/api/flight-info', async (req, res) => {
  const username = getSessionUser(req);
  if (!username) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const payload = req.body;

  try {
    // Forward to the external challenge API
    const externalRes = await fetch(
      'https://us-central1-crm-sdk.cloudfunctions.net/flightInfoChallenge',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: 'WW91IG11c3QgYmUgdGhlIGN1cmlvdXMgdHlwZS4gIEJyaW5nIHRoaXMgdXAgYXQgdGhlIGludGVydmlldyBmb3IgYm9udXMgcG9pbnRzICEh',
          candidate: 'Joey G',
        },
        body: JSON.stringify(payload),
      },
    );

    console.log('External API status:', externalRes.status);
    const responseText = await externalRes.text();
    console.log('External API body:', responseText);

    if (!externalRes.ok) {
      res.status(externalRes.status).json({ error: responseText || 'External API error' });
      return;
    }

    // Save to the user's document in the users collection
    const snapshot = await db.collection('users').where('username', '==', username).limit(1).get();
    if (snapshot.empty) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    await snapshot.docs[0].ref.update({
      flightInfo: { ...payload, submittedAt: new Date().toISOString() },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Submit flight info error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** DELETE /api/flight-info – remove flight info for the authenticated user */
app.delete('/api/flight-info', async (req, res) => {
  const username = getSessionUser(req);
  if (!username) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const snapshot = await db.collection('users').where('username', '==', username).limit(1).get();
    if (snapshot.empty) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const { FieldValue: FV } = await import('firebase-admin/firestore');
    await snapshot.docs[0].ref.update({ flightInfo: FV.delete() });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete flight info error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
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
