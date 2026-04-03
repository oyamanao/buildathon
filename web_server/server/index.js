import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const app = express();
const port = process.env.PORT || 3000;

// ─── Database setup (Neon PostgreSQL) ─────────────────
const sql = neon(process.env.DATABASE_URL);

// Create tables on first run
async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log('✅ Database tables ready');
}

initDb().catch(err => console.error('DB init error:', err));

// ─── Middleware ────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.json());

// ─── Auth Routes ──────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = await sql`
      INSERT INTO users (username, password_hash)
      VALUES (${username}, ${hash})
      RETURNING id, username, level
    `;

    res.json(result[0]);
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const rows = await sql`SELECT * FROM users WHERE username = ${username}`;
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      id: user.id,
      username: user.username,
      level: user.level
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Progress Routes ──────────────────────────────────

app.get('/api/user/progress/:userId', async (req, res) => {
  try {
    const rows = await sql`
      SELECT id, username, level FROM users WHERE id = ${req.params.userId}
    `;
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Progress fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/user/progress', async (req, res) => {
  try {
    const { userId, level } = req.body;

    if (!userId || level === undefined) {
      return res.status(400).json({ error: 'userId and level are required' });
    }

    const rows = await sql`SELECT * FROM users WHERE id = ${userId}`;
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only save if new level is higher (don't allow going back)
    const newLevel = Math.max(rows[0].level, level);
    await sql`UPDATE users SET level = ${newLevel} WHERE id = ${userId}`;

    res.json({ id: Number(userId), level: newLevel });
  } catch (err) {
    console.error('Progress save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch-all for unknown API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ─── Start server (local dev) / Export for Vercel ─────
app.listen(port, () => {
  console.log(`⚔️  Echo-Blade server running at port ${port}`);
});

export default app;
