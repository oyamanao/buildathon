const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const port = process.env.PORT || 3000;

// In-memory database with file persistence
let db = null;
const dbFilePath = './echo_blade.db';

async function initDb() {
  const SQL = await initSqlJs();
  
  // Load existing DB or create new
  let data = null;
  if (fs.existsSync(dbFilePath)) {
    data = fs.readFileSync(dbFilePath);
  }
  
  db = data ? new SQL.Database(data) : new SQL.Database();
  
  // Create table if not exists
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS game_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        gloveState TEXT,
        voiceWord TEXT,
        combo TEXT,
        sensor1 INTEGER,
        sensor2 INTEGER,
        action TEXT
      )
    `);
  } catch (e) {
    console.log('Table may already exist:', e.message);
  }
  
  saveDb();
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbFilePath, buffer);
  } catch (e) {
    console.error('Error saving DB:', e);
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function resolveCombo(glove, voice) {
  if (glove === 'GRASP' && voice === 'Strike') return 'PHYSICAL_ATTACK';
  if (glove === 'CHANNEL' && voice === 'Ignis') return 'FIRE_SPELL';
  if (glove === 'GUARD') return 'DEFEND_STATE';
  return 'NONE';
}

app.post('/api/game/status', (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    
    const { gloveState, voiceWord, sensor1, sensor2, action } = req.body;
    const combo = resolveCombo(gloveState, voiceWord);

    db.run(
      `INSERT INTO game_events (gloveState, voiceWord, combo, sensor1, sensor2, action)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [gloveState, voiceWord, combo, sensor1 || 0, sensor2 || 0, action || 'IDLE']
    );
    
    saveDb();

    res.json({ 
      combo, 
      effect: combo !== 'NONE',
      stored: true 
    });
  } catch (err) {
    console.error('Error saving event:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/game/history', (req, res) => {
  try {
    if (!db) return res.json([]);
    
    const stmt = db.prepare('SELECT * FROM game_events ORDER BY timestamp DESC LIMIT 50');
    stmt.bind();
    const events = [];
    while (stmt.step()) {
      events.push(stmt.getAsObject());
    }
    stmt.free();
    
    res.json(events);
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/game/latest', (req, res) => {
  try {
    if (!db) return res.json({});
    
    const stmt = db.prepare('SELECT * FROM game_events ORDER BY timestamp DESC LIMIT 1');
    stmt.bind();
    let latest = {};
    if (stmt.step()) {
      latest = stmt.getAsObject();
    }
    stmt.free();
    
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize DB and start server
initDb().then(() => {
  app.listen(port, () => {
    console.log(`Echo-Blade web server running at http://localhost:${port}`);
    console.log(`Database: ./echo_blade.db (sql.js - pure JavaScript SQLite)`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

