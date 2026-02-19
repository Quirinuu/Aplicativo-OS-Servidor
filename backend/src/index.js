// backend/src/index.js — COM BANCO DE DADOS SQLITE REAL (better-sqlite3)

const net = require('net');
const path = require('path');
const fs = require('fs');

// ============== AMBIENTE ==============
if (process.env.NODE_ENV !== 'production') {
  console.log('🔧 Modo desenvolvimento - carregando .env');
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

// ============== IP LOCAL ==============
function getLocalIpAddress() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`🌐 IP Local: ${iface.address} (${name})`);
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ============== PORTA ==============
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => { s.close(); resolve(false); });
    s.once('listening', () => { s.close(); resolve(true); });
    s.listen(port, '0.0.0.0');
  });
}

async function findAvailablePort() {
  for (const port of [5000, 5001, 5002, 5003, 5004, 5005]) {
    if (await isPortAvailable(port)) {
      console.log(`✅ Porta ${port} disponível`);
      return port;
    }
    console.log(`⏭️  Porta ${port} ocupada`);
  }
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '0.0.0.0', () => {
      const p = s.address().port;
      s.close();
      resolve(p);
    });
  });
}

// ============== BANCO DE DADOS ==============
function initDatabase() {
  const Database = require('better-sqlite3');

  // Aceita DATABASE_URL como "file:/caminho/do/arquivo.db" ou só o caminho
  let dbPath = process.env.DATABASE_URL || '';
  if (dbPath.startsWith('file:')) {
    dbPath = dbPath.slice(5); // remove "file:"
  }
  if (!dbPath) {
    dbPath = path.join(__dirname, '..', 'osmanager.db');
  }

  // Garante que o diretório existe
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  console.log(`🗄️  Banco de dados: ${dbPath}`);

  const db = new Database(dbPath);

  // Performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ── Criação das tabelas ──────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT    NOT NULL UNIQUE,
      fullName    TEXT    NOT NULL,
      email       TEXT    NOT NULL UNIQUE,
      role        TEXT    NOT NULL DEFAULT 'technician',
      password    TEXT    NOT NULL,
      createdAt   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      osNumber                  TEXT    NOT NULL,
      clientName                TEXT    NOT NULL,
      equipmentName             TEXT    NOT NULL,
      equipmentClass            TEXT,
      serialNumber              TEXT,
      accessories               TEXT,
      hasPreviousDefect         INTEGER NOT NULL DEFAULT 0,
      previousDefectDescription TEXT,
      optionalDescription       TEXT,
      priority                  TEXT    NOT NULL DEFAULT 'MEDIUM',
      currentStatus             TEXT    NOT NULL DEFAULT 'RECEIVED',
      assignedToUserId          INTEGER REFERENCES users(id),
      createdById               INTEGER REFERENCES users(id),
      createdAt                 TEXT    NOT NULL DEFAULT (datetime('now')),
      updatedAt                 TEXT    NOT NULL DEFAULT (datetime('now')),
      completedAt               TEXT
    );

    CREATE TABLE IF NOT EXISTS comments (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      osId      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      userId    INTEGER REFERENCES users(id),
      comment   TEXT    NOT NULL,
      createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Seed: usuários padrão se a tabela estiver vazia ─────────────
  const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  if (userCount === 0) {
    console.log('🌱 Criando usuários padrão...');
    const insert = db.prepare(`
      INSERT INTO users (username, fullName, email, role, password)
      VALUES (?, ?, ?, ?, ?)
    `);
    insert.run('admin',   'Administrador', 'admin@osmanager.local',   'admin',      'admin123');
    insert.run('tecnico', 'Técnico João',  'tecnico@osmanager.local', 'technician', 'tecnico123');
    console.log('✅ Usuários padrão criados (admin / tecnico)');
  }

  return db;
}

// ============== HELPERS DB ==============
function getOrderWithRelations(db, id) {
  const order = db.prepare(`
    SELECT o.*,
           u1.fullName  AS assignedFullName,
           u1.id        AS assignedId,
           u1.username  AS assignedUsername,
           u2.fullName  AS createdFullName,
           u2.id        AS createdId
    FROM orders o
    LEFT JOIN users u1 ON u1.id = o.assignedToUserId
    LEFT JOIN users u2 ON u2.id = o.createdById
    WHERE o.id = ?
  `).get(id);

  if (!order) return null;

  const comments = db.prepare(`
    SELECT c.*, u.fullName AS userFullName, u.username AS userUsername
    FROM comments c
    LEFT JOIN users u ON u.id = c.userId
    WHERE c.osId = ?
    ORDER BY c.createdAt ASC
  `).all(id);

  return formatOrder(order, comments);
}

function formatOrder(row, comments = []) {
  return {
    id: row.id,
    osNumber: row.osNumber,
    clientName: row.clientName,
    equipmentName: row.equipmentName,
    equipmentClass: row.equipmentClass,
    serialNumber: row.serialNumber,
    accessories: row.accessories,
    hasPreviousDefect: !!row.hasPreviousDefect,
    previousDefectDescription: row.previousDefectDescription,
    optionalDescription: row.optionalDescription,
    priority: row.priority,
    currentStatus: row.currentStatus,
    assignedToUserId: row.assignedToUserId,
    assignedToUser: row.assignedId ? {
      id: row.assignedId,
      fullName: row.assignedFullName,
      username: row.assignedUsername,
    } : null,
    createdById: row.createdById,
    createdByUser: row.createdId ? {
      id: row.createdId,
      fullName: row.createdFullName,
    } : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    comments: comments.map(c => ({
      id: c.id,
      osId: c.osId,
      userId: c.userId,
      comment: c.comment,
      createdAt: c.createdAt,
      user: c.userId ? { fullName: c.userFullName, username: c.userUsername } : null,
    })),
  };
}

function getAllOrders(db, filters = {}) {
  let sql = `
    SELECT o.*,
           u1.fullName AS assignedFullName, u1.id AS assignedId, u1.username AS assignedUsername,
           u2.fullName AS createdFullName,  u2.id AS createdId
    FROM orders o
    LEFT JOIN users u1 ON u1.id = o.assignedToUserId
    LEFT JOIN users u2 ON u2.id = o.createdById
    WHERE 1=1
  `;
  const params = [];

  if (filters.status && filters.status !== 'all') {
    sql += ' AND o.currentStatus = ?'; params.push(filters.status);
  }
  if (filters.priority && filters.priority !== 'all') {
    sql += ' AND o.priority = ?'; params.push(filters.priority);
  }
  if (filters.clientName) {
    sql += ' AND o.clientName LIKE ?'; params.push(`%${filters.clientName}%`);
  }
  if (filters.equipmentName) {
    sql += ' AND o.equipmentName LIKE ?'; params.push(`%${filters.equipmentName}%`);
  }
  if (filters.excludeCompleted) {
    sql += ' AND o.currentStatus != ?'; params.push('COMPLETED');
  }
  if (filters.onlyCompleted) {
    sql += ' AND o.currentStatus = ?'; params.push('COMPLETED');
  }
  if (filters.startDate) {
    sql += ' AND o.createdAt >= ?'; params.push(filters.startDate);
  }
  if (filters.endDate) {
    sql += ' AND o.createdAt <= ?'; params.push(filters.endDate);
  }

  sql += ' ORDER BY o.createdAt ASC';

  const rows = db.prepare(sql).all(...params);

  // Busca comments em batch
  const ids = rows.map(r => r.id);
  let commentsMap = {};
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const allComments = db.prepare(`
      SELECT c.*, u.fullName AS userFullName, u.username AS userUsername
      FROM comments c
      LEFT JOIN users u ON u.id = c.userId
      WHERE c.osId IN (${placeholders})
      ORDER BY c.createdAt ASC
    `).all(...ids);

    allComments.forEach(c => {
      if (!commentsMap[c.osId]) commentsMap[c.osId] = [];
      commentsMap[c.osId].push(c);
    });
  }

  return rows.map(r => formatOrder(r, commentsMap[r.id] || []));
}

// ============== INICIALIZAÇÃO ==============
const LOCAL_IP = getLocalIpAddress();

console.log('✅ Módulos verificados');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Inicializa o banco
const db = initDatabase();

// ============== CORS ==============
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isLocal = !origin ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    /\b(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+\b/.test(origin);

  if (isLocal) res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`📡 ${req.method} ${req.path} — ${ip}`);
  next();
});

// ============== SOCKET.IO ==============
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const ok = origin.includes('localhost') || origin.includes('127.0.0.1') ||
        /\b(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+\b/.test(origin);
      ok ? cb(null, true) : cb(new Error('CORS bloqueado'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id, '—', socket.handshake.address);
  socket.emit('server:info', { serverIp: LOCAL_IP, message: 'Conectado ao OS Manager' });

  socket.on('os:subscribe',   (id) => { socket.join(`os:${id}`);  console.log(`📡 Inscrito OS ${id}`); });
  socket.on('os:unsubscribe', (id) => { socket.leave(`os:${id}`); });
  socket.on('ping', () => socket.emit('pong'));
  socket.on('disconnect', () => console.log('❌ Desconectado:', socket.id));
});

// ============== MIDDLEWARE AUTH ==============
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  if (!token || token === 'null') return res.status(401).json({ error: 'Não autorizado' });

  // Token simples: "token-{userId}-{timestamp}"
  const match = token.match(/^token-(\d+)-\d+$/);
  if (!match) return res.status(401).json({ error: 'Token inválido' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(parseInt(match[1]));
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });

  req.userId = user.id;
  req.user = user;
  next();
}

// ============== STATIC FRONTEND ==============
const frontendPath = process.env.FRONTEND_PATH || path.join(__dirname, '../../frontend/dist');
console.log('📁 Servindo frontend de:', frontendPath);
app.use(express.static(frontendPath));

// ============== ROTAS AUTH ==============

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  console.log('🔐 Login:', username);

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const { password: _, ...safe } = user;
  res.json({
    success: true,
    token: `token-${user.id}-${Date.now()}`,
    user: safe,
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const { password: _, ...safe } = req.user;
  res.json({ user: safe });
});

// ============== ROTAS USUÁRIOS ==============

app.get('/api/users', authMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, fullName, email, role, createdAt FROM users').all();
  res.json({ users });
});

app.get('/api/users/:id', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, fullName, email, role, createdAt FROM users WHERE id = ?').get(parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ user });
});

app.post('/api/users', authMiddleware, (req, res) => {
  const { username, fullName, email, role, password } = req.body;
  try {
    const result = db.prepare(
      'INSERT INTO users (username, fullName, email, role, password) VALUES (?, ?, ?, ?, ?)'
    ).run(username, fullName, email, role || 'technician', password);

    const user = db.prepare('SELECT id, username, fullName, email, role, createdAt FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ user });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username ou email já existe' });
    throw err;
  }
});

app.put('/api/users/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const { username, fullName, email, role, password } = req.body;
  
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'Usuário não encontrado' });

  db.prepare(`
    UPDATE users SET
      username  = COALESCE(?, username),
      fullName  = COALESCE(?, fullName),
      email     = COALESCE(?, email),
      role      = COALESCE(?, role),
      password  = COALESCE(?, password)
    WHERE id = ?
  `).run(username || null, fullName || null, email || null, role || null, password || null, id);

  const user = db.prepare('SELECT id, username, fullName, email, role, createdAt FROM users WHERE id = ?').get(id);
  res.json({ user });
});

app.delete('/api/users/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ message: 'Usuário deletado' });
});

// ============== ROTAS OS ==============

app.get('/api/os', authMiddleware, (req, res) => {
  const orders = getAllOrders(db, {
    status:        req.query.status,
    priority:      req.query.priority,
    clientName:    req.query.clientName,
    equipmentName: req.query.equipmentName,
  });
  res.json({ orders });
});

app.get('/api/os/history', authMiddleware, (req, res) => {
  const orders = getAllOrders(db, {
    onlyCompleted: true,
    startDate:     req.query.startDate,
    endDate:       req.query.endDate,
    clientName:    req.query.clientName,
    equipmentName: req.query.equipmentName,
  });
  res.json({ orders });
});

app.get('/api/os/:id', authMiddleware, (req, res) => {
  const order = getOrderWithRelations(db, parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: 'OS não encontrada' });
  res.json({ order });
});

app.post('/api/os', authMiddleware, (req, res) => {
  const {
    osNumber, clientName, equipmentName, equipmentClass,
    serialNumber, accessories, hasPreviousDefect, previousDefectDescription,
    optionalDescription, priority, currentStatus, assignedToUserId,
  } = req.body;

  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO orders (
      osNumber, clientName, equipmentName, equipmentClass,
      serialNumber, accessories, hasPreviousDefect, previousDefectDescription,
      optionalDescription, priority, currentStatus, assignedToUserId, createdById,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    osNumber, clientName, equipmentName, equipmentClass || null,
    serialNumber || null, accessories || null, hasPreviousDefect ? 1 : 0,
    previousDefectDescription || null, optionalDescription || null,
    priority || 'MEDIUM', currentStatus || 'RECEIVED',
    assignedToUserId || null, req.userId,
    now, now
  );

  const order = getOrderWithRelations(db, result.lastInsertRowid);
  console.log('✅ OS criada:', order.id, order.osNumber);

  io.emit('os:created', { order });
  res.json({ order });
});

app.put('/api/os/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const current = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'OS não encontrada' });

  const {
    osNumber, clientName, equipmentName, equipmentClass,
    serialNumber, accessories, hasPreviousDefect, previousDefectDescription,
    optionalDescription, priority, currentStatus, assignedToUserId, completedAt,
  } = req.body;

  const now = new Date().toISOString();

  // Se está sendo marcada como concluída agora, registra completedAt
  let resolvedCompletedAt = completedAt !== undefined ? completedAt : current.completedAt;
  if (currentStatus === 'COMPLETED' && !resolvedCompletedAt) {
    resolvedCompletedAt = now;
  }

  db.prepare(`
    UPDATE orders SET
      osNumber                  = COALESCE(?, osNumber),
      clientName                = COALESCE(?, clientName),
      equipmentName             = COALESCE(?, equipmentName),
      equipmentClass            = COALESCE(?, equipmentClass),
      serialNumber              = COALESCE(?, serialNumber),
      accessories               = COALESCE(?, accessories),
      hasPreviousDefect         = COALESCE(?, hasPreviousDefect),
      previousDefectDescription = COALESCE(?, previousDefectDescription),
      optionalDescription       = COALESCE(?, optionalDescription),
      priority                  = COALESCE(?, priority),
      currentStatus             = COALESCE(?, currentStatus),
      assignedToUserId          = ?,
      completedAt               = ?,
      updatedAt                 = ?
    WHERE id = ?
  `).run(
    osNumber       || null,
    clientName     || null,
    equipmentName  || null,
    equipmentClass !== undefined ? (equipmentClass || null) : null,
    serialNumber   !== undefined ? (serialNumber   || null) : null,
    accessories    !== undefined ? (accessories    || null) : null,
    hasPreviousDefect !== undefined ? (hasPreviousDefect ? 1 : 0) : null,
    previousDefectDescription !== undefined ? (previousDefectDescription || null) : null,
    optionalDescription       !== undefined ? (optionalDescription       || null) : null,
    priority       || null,
    currentStatus  || null,
    assignedToUserId !== undefined ? (assignedToUserId || null) : current.assignedToUserId,
    resolvedCompletedAt || null,
    now,
    id
  );

  const order = getOrderWithRelations(db, id);
  console.log('✏️ OS atualizada:', id);

  io.emit('os:updated', { order });
  res.json({ order });
});

app.delete('/api/os/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const result = db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'OS não encontrada' });

  console.log('🗑️ OS deletada:', id);
  io.emit('os:deleted', { orderId: id });
  res.json({ message: 'OS deletada' });
});

app.post('/api/os/:id/comments', authMiddleware, (req, res) => {
  const osId = parseInt(req.params.id);
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(osId);
  if (!order) return res.status(404).json({ error: 'OS não encontrada' });

  const now = new Date().toISOString();
  const result = db.prepare(
    'INSERT INTO comments (osId, userId, comment, createdAt) VALUES (?, ?, ?, ?)'
  ).run(osId, req.userId, req.body.comment, now);

  db.prepare('UPDATE orders SET updatedAt = ? WHERE id = ?').run(now, osId);

  const comment = db.prepare(`
    SELECT c.*, u.fullName AS userFullName, u.username AS userUsername
    FROM comments c LEFT JOIN users u ON u.id = c.userId
    WHERE c.id = ?
  `).get(result.lastInsertRowid);

  const formatted = {
    id: comment.id,
    osId: comment.osId,
    userId: comment.userId,
    comment: comment.comment,
    createdAt: comment.createdAt,
    user: comment.userId ? { fullName: comment.userFullName, username: comment.userUsername } : null,
  };

  io.emit('os:comment', { osId, comment: formatted });
  res.json({ comment: formatted });
});

// ============== ROTAS AUXILIARES ==============

app.get('/api/network/info', (req, res) => {
  res.json({ serverIp: LOCAL_IP, port: currentPort, hostname: require('os').hostname() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend funcionando', timestamp: new Date().toISOString(), ip: LOCAL_IP, port: currentPort });
});

app.get('/', (req, res) => {
  res.json({ message: 'OS Manager Backend', version: '3.0.0', serverIp: LOCAL_IP });
});

// SPA catch-all
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path === '/health') {
    return next();
  }
  const fp = process.env.FRONTEND_PATH || path.join(__dirname, '../../frontend/dist');
  res.sendFile(path.join(fp, 'index.html'), (err) => {
    if (err) res.status(500).json({ error: 'Erro ao carregar frontend' });
  });
});

// ============== INICIAR SERVIDOR ==============

let currentPort;

async function startServer() {
  currentPort = parseInt(process.env.PORT) || await findAvailablePort();

  server.listen(currentPort, '0.0.0.0', () => {
    const ip = LOCAL_IP;
    const p  = currentPort;
    console.log(`
╔════════════════════════════════════════════════╗
║     🚀 OS Manager Backend - REDE LOCAL        ║
╠════════════════════════════════════════════════╣
║  Local:    http://localhost:${String(p).padEnd(19)}║
║  Rede:     http://${ip}:${String(p).padEnd(19)}║
║  WebSocket: ws://${ip}:${String(p).padEnd(19)}║
╠════════════════════════════════════════════════╣
║  ✅ Dados persistidos em SQLite               ║
║  🔌 Sincronização em tempo real ativada       ║
╚════════════════════════════════════════════════╝
    `);
    console.log(`📱 Conectar outros dispositivos: http://${ip}:${p}\n`);
  });
}

process.on('uncaughtException', (err) => {
  console.error('💥 Exceção não tratada:', err.message);
  if (err.code === 'EADDRINUSE') console.error('   Porta em uso! Tente reiniciar.');
});

startServer();