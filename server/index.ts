import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import path from 'node:path';
import { ZodError } from 'zod';
import { attachUser } from './auth.js';
import { db } from './db.js';
import { sendDueReminders } from './booking-service.js';
import { ApiError } from './utils.js';
import { rateLimit, securityHeaders } from './security.js';
import { seedDatabase } from './seed.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { customerRouter } from './routes/customer.js';
import { ownerRouter } from './routes/owner.js';
import { messagesRouter } from './routes/messages.js';

await seedDatabase(db);

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT || 4200);
const isProd = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
app.set('trust proxy', 1); // Railway sits in front; needed so rate limits see the real client IP
app.use(securityHeaders(isProd));
// Cross-origin PWA (GitHub Pages) -> this API. Set CORS_ORIGIN to the Pages origin, e.g. https://keleba-ops.github.io
const corsOrigin = process.env.CORS_ORIGIN;
if (corsOrigin) {
  app.use((req, res, next) => {
    if (req.headers.origin === corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}
app.use(express.json({ limit: '100kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, max: 300, message: 'Too many requests. Please slow down and try again shortly.' }));
app.use(
  ['/api/auth/login', '/api/auth/register'],
  rateLimit({ windowMs: 15 * 60_000, max: 20, message: 'Too many attempts. Please wait a few minutes and try again.' }),
);
app.use(cookieParser());
app.use(attachUser(db));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'tempo', time: new Date().toISOString() });
});
app.use('/api', authRouter(db));
app.use('/api/owner', ownerRouter(db));
app.use('/api', messagesRouter(db));
app.use('/api', customerRouter(db));
app.use('/api', publicRouter(db));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'That API route does not exist.' });
});

if (isProd) {
  const dist = path.resolve(process.cwd(), 'dist');
  app.get('/sw.js', (_req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Service-Worker-Allowed', '/');
    res.sendFile(path.join(dist, 'sw.js'));
  });
  app.get('/manifest.webmanifest', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('application/manifest+json');
    res.sendFile(path.join(dist, 'manifest.webmanifest'));
  });
  app.use(
    express.static(dist, {
      maxAge: '1h',
      etag: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      ws: { server },
      watch: { ignored: ['**/data/**', '**/dist/**'] },
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.use((err: Error & { status?: number; type?: string }, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message || 'Invalid request.', details: err.issues });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body could not be read.' });
  }
  const status = err.status || 500;
  if (status >= 500) {
    console.error(`[tempo] ${req.method} ${req.path}`, err);
  }
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our end. Please try again.' : err.message });
});

server.listen(port, () => {
  console.log(`\n  Tempo is running at http://localhost:${port}`);
  if (!isProd) {
    console.log('  Customer demo: alex@tempo.demo / demo1234');
    console.log('  Owner demo:    maya@tempo.demo / demo1234\n');
  }

  setTimeout(() => {
    sendDueReminders(db)
      .then((count) => {
        if (count > 0) console.log(`[tempo] Sent ${count} appointment reminder${count === 1 ? '' : 's'}.`);
      })
      .catch((error) => console.error('[tempo] Reminder scan failed', error));
  }, 2000);

  const timer = setInterval(() => {
    sendDueReminders(db).catch((error) => console.error('[tempo] Reminder scan failed', error));
  }, 60_000);
  timer.unref();
});
