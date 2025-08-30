import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Server as IOServer } from 'socket.io';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB setup in user data directory-like path
const dbPath = path.join(__dirname, 'db', 'shared-trips.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Schema
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  password TEXT
);
CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  lat REAL,
  lng REAL
);
CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  driverName TEXT,
  fromCity TEXT,
  toCity TEXT,
  date TEXT,
  time TEXT,
  seatsTotal INTEGER,
  seatsTaken INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  tripId TEXT,
  userId TEXT,
  status TEXT DEFAULT 'PENDING'
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  tripId TEXT,
  userId TEXT,
  userName TEXT,
  text TEXT,
  createdAt TEXT
);
`);

// Seed cities if empty
const cityCount = db.prepare('SELECT COUNT(*) as c FROM cities').get().c;
if (cityCount === 0) {
  const cities = [
    { name: 'Sofia', lat: 42.6977, lng: 23.3219 },
    { name: 'Plovdiv', lat: 42.1354, lng: 24.7453 },
    { name: 'Varna', lat: 43.2141, lng: 27.9147 },
    { name: 'Burgas', lat: 42.5048, lng: 27.4626 },
  ];
  const ins = db.prepare('INSERT INTO cities(name,lat,lng) VALUES (?,?,?)');
  const tx = db.transaction((arr)=>{ for (const c of arr) ins.run(c.name,c.lat,c.lng); });
  tx(cities);
}

const app = express();
app.use(express.json());
app.use(helmet());
app.use(cors());

// Simple auth-less demo (name/email only kept client-side)
function uuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
  return v.toString(16);
}); }

// Cities
app.get('/api/cities', (req,res)=>{
  const rows = db.prepare('SELECT name, lat, lng FROM cities ORDER BY name').all();
  res.json(rows);
});

// Trips
app.get('/api/trips', (req,res)=>{
  const { from, to, date } = req.query;
  let sql = 'SELECT * FROM trips WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND fromCity = ?'; params.push(from); }
  if (to) { sql += ' AND toCity = ?'; params.push(to); }
  if (date) { sql += ' AND date = ?'; params.push(date); }
  sql += ' ORDER BY date, time';
  const trips = db.prepare(sql).all(params);
  const reqs = db.prepare('SELECT id, tripId, userId, status FROM requests WHERE tripId = ?').all;
  const out = trips.map(t => ({
    id: t.id,
    from: t.fromCity,
    to: t.toCity,
    date: t.date,
    time: t.time,
    driver: t.driverName,
    seatsTotal: t.seatsTotal,
    seatsTaken: t.seatsTaken,
    requests: db.prepare('SELECT id, userId, status FROM requests WHERE tripId = ?').all(t.id)
  }));
  res.json(out);
});

app.post('/api/trips', (req,res)=>{
  const { from, to, date, time, seatsTotal, driver } = req.body;
  if (!from || !to || !date || !time || !seatsTotal || !driver) return res.status(400).json({ error: 'Missing fields' });
  const id = uuid();
  db.prepare('INSERT INTO trips(id, driverName, fromCity, toCity, date, time, seatsTotal) VALUES (?,?,?,?,?,?,?)')
    .run(id, driver, from, to, date, time, seatsTotal);
  res.json({ id });
});

app.post('/api/trips/:tripId/request', (req,res)=>{
  const { tripId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  const existing = db.prepare('SELECT 1 FROM requests WHERE tripId=? AND userId=?').get(tripId, userId);
  if (existing) return res.status(409).json({ error: 'Already requested' });
  const id = uuid();
  db.prepare('INSERT INTO requests(id, tripId, userId, status) VALUES (?,?,?,?)').run(id, tripId, userId, 'PENDING');
  res.json({ requestId: id, status: 'PENDING' });
});

app.post('/api/trips/:tripId/requests/:requestId/:action', (req,res)=>{
  const { requestId, action } = req.params;
  if (action === 'approve') {
    db.prepare('UPDATE requests SET status=? WHERE id=?').run('APPROVED', requestId);
  } else {
    db.prepare('UPDATE requests SET status=? WHERE id=?').run('DECLINED', requestId);
  }
  res.json({ ok: true });
});

// Chat
app.get('/api/trips/:tripId/chat', (req,res)=>{
  const { tripId } = req.params;
  const rows = db.prepare('SELECT id, userId, userName, text, createdAt FROM messages WHERE tripId=? ORDER BY createdAt ASC').all(tripId);
  res.json(rows);
});
app.post('/api/trips/:tripId/chat', (req,res)=>{
  const { tripId } = req.params;
  const { userId, userName, text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });
  const id = uuid();
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO messages(id, tripId, userId, userName, text, createdAt) VALUES (?,?,?,?,?,?)')
    .run(id, tripId, userId||'', userName||'User', text, createdAt);
  io.to('trip:'+tripId).emit('chat:new', { id, userId, userName, text, createdAt });
  res.json({ id });
});

const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: '*' } });
io.on('connection', (socket)=>{
  socket.on('chat:join', (tripId)=> socket.join('trip:'+tripId));
  socket.on('chat:leave', (tripId)=> socket.leave('trip:'+tripId));
});

const PORT = Number(process.env.PORT || 4777);
server.listen(PORT, ()=> console.log('Local API on http://localhost:'+PORT));
