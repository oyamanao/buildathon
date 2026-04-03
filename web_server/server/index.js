import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Database setup
const db = new Database(join(__dirname, 'echo_blade.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    level INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(cors());
app.use(express.json());

// ─── Auth Routes ──────────────────────────────────────

app.post('/api/auth/register', (req, res) => {
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

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);

    res.json({
      id: result.lastInsertRowid,
      username,
      level: 1
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

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

app.get('/api/user/progress/:userId', (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, level FROM users WHERE id = ?').get(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Progress fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/user/progress', (req, res) => {
  try {
    const { userId, level } = req.body;

    if (!userId || level === undefined) {
      return res.status(400).json({ error: 'userId and level are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only save if new level is higher (don't allow going back)
    const newLevel = Math.max(user.level, level);
    db.prepare('UPDATE users SET level = ? WHERE id = ?').run(newLevel, userId);

    res.json({ id: userId, level: newLevel });
  } catch (err) {
    console.error('Progress save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`⚔️  Echo-Blade server running at http://localhost:${port}`);
});
