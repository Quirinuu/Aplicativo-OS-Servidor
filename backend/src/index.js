// VERIFICAÇÃO DE MÓDULOS PARA PRODUÇÃO

// ============== CONFIGURAÇÃO DE AMBIENTE ==============
// CARREGA VARIÁVEIS DE AMBIENTE PARA DESENVOLVIMENTO
if (process.env.NODE_ENV !== 'production') {
  console.log('🔧 Modo desenvolvimento - carregando .env');
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
}

// LOG DE CONFIGURAÇÃO INICIAL
console.log('🔍 Configuração do Ambiente:');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('   PORT:', process.env.PORT || '3001 (padrão)');
console.log('   DATABASE_URL:', process.env.DATABASE_URL || 'Não definido');
console.log('   Diretório atual:', __dirname);

// Verificação de módulos ESSENCIAIS


process.on('uncaughtException', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Porta ${process.env.PORT || 3001} já está em uso!`);
    console.error('   Tentando outra porta automaticamente...');
    // Não fazer nada, deixar o main.js reiniciar com nova porta
  } else {
    console.error('💥 Erro não tratado:', err);
  }
});


try {
  require('cors');
  console.log('✅ cors carregado');
} catch (error) {
  console.error('❌ ERRO: cors não encontrado');
  process.exit(1);
}

try {
  require('socket.io');
  console.log('✅ socket.io carregado');
} catch (error) {
  console.error('❌ ERRO: socket.io não encontrado');
  process.exit(1);
}

console.log('✅ Todos os módulos necessários foram carregados');
console.log('   NODE_ENV:', process.env.NODE_ENV);
console.log('   PORT:', process.env.PORT);
console.log('   DATABASE_URL:', process.env.DATABASE_URL);

const express = require("express");
const cors = require("cors");
const path = require('path');  
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const frontendPath = process.env.FRONTEND_PATH || path.join(__dirname, '../../frontend/dist');
console.log('📁 Servindo frontend de:', frontendPath);
app.use(express.static(frontendPath));

// Configuração CORS mais permissiva
app.use(cors({
  origin: '/*',
  credentials: true
}));

app.use(express.json());

// Log de todas as requisições
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path}`);
  next();
});

// Socket.IO com CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Dados mock em memória
let mockUsers = [
  {
    id: 1,
    username: "admin",
    fullName: "Administrador",
    email: "admin@example.com",
    role: "admin",
    password: "admin123" // Em produção, isso seria hasheado
  },
  {
    id: 2,
    username: "tecnico",
    fullName: "Técnico João",
    email: "tecnico@example.com",
    role: "technician",
    password: "tecnico123"
  }
];

let mockOrders = [
  {
    id: 1,
    clientName: "Maria Silva",
    clientPhone: "(11) 98765-4321",
    equipmentName: "Notebook Dell",
    equipmentSerial: "DL123456",
    defect: "Não liga",
    status: "pending",
    priority: "high",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assignedToId: 2,
    createdById: 1,
    comments: []
  },
  {
    id: 2,
    clientName: "João Santos",
    clientPhone: "(11) 91234-5678",
    equipmentName: "Desktop HP",
    equipmentSerial: "HP987654",
    defect: "Tela azul",
    status: "in_progress",
    priority: "medium",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    assignedToId: 2,
    createdById: 1,
    comments: [
      {
        id: 1,
        osId: 2,
        userId: 2,
        comment: "Iniciando diagnóstico",
        createdAt: new Date().toISOString()
      }
    ]
  },
  {
    id: 3,
    clientName: "Ana Costa",
    clientPhone: "(11) 95555-1234",
    equipmentName: "Impressora Canon",
    equipmentSerial: "CN456789",
    defect: "Não imprime",
    status: "completed",
    priority: "low",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    completedAt: new Date(Date.now() - 86400000).toISOString(),
    assignedToId: 2,
    createdById: 1,
    comments: []
  }
];

// Middleware simples de autenticação
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || token === 'null') {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  
  // Em produção, você validaria o JWT aqui
  // Por enquanto, vamos apenas verificar se existe token
  req.userId = 1; // Simula usuário logado
  next();
}

// ============== ROTAS DE AUTENTICAÇÃO ==============

// Login
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  
  console.log("🔐 Tentativa de login:", username);
  
  const user = mockUsers.find(u => u.username === username);
  
  if (!user || user.password !== password) {
    return res.status(401).json({ 
      error: "Credenciais inválidas" 
    });
  }
  
  // Remove senha do retorno
  const { password: _, ...userWithoutPassword } = user;
  
  res.json({
    success: true,
    token: `token-${user.id}-${Date.now()}`,
    user: userWithoutPassword
  });
});

// Me - Obter usuário atual
app.get("/api/auth/me", authMiddleware, (req, res) => {
  console.log("👤 Obtendo usuário atual");
  
  const user = mockUsers.find(u => u.id === req.userId);
  
  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }
  
  const { password: _, ...userWithoutPassword } = user;
  
  res.json({
    user: userWithoutPassword
  });
});

// ============== ROTAS DE USUÁRIOS ==============

// Listar usuários
app.get("/api/users", authMiddleware, (req, res) => {
  console.log("👥 Listando usuários");
  
  const usersWithoutPassword = mockUsers.map(({ password, ...user }) => user);
  
  res.json({
    users: usersWithoutPassword
  });
});

// Obter usuário por ID
app.get("/api/users/:id", authMiddleware, (req, res) => {
  const userId = parseInt(req.params.id);
  const user = mockUsers.find(u => u.id === userId);
  
  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }
  
  const { password: _, ...userWithoutPassword } = user;
  
  res.json({
    user: userWithoutPassword
  });
});

// Criar usuário
app.post("/api/users", authMiddleware, (req, res) => {
  const { username, fullName, email, role, password } = req.body;
  
  const newUser = {
    id: mockUsers.length + 1,
    username,
    fullName,
    email,
    role,
    password
  };
  
  mockUsers.push(newUser);
  
  const { password: _, ...userWithoutPassword } = newUser;
  
  console.log("✅ Usuário criado:", username);
  
  res.json({
    user: userWithoutPassword
  });
});

// Atualizar usuário
app.put("/api/users/:id", authMiddleware, (req, res) => {
  const userId = parseInt(req.params.id);
  const userIndex = mockUsers.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }
  
  mockUsers[userIndex] = {
    ...mockUsers[userIndex],
    ...req.body,
    id: userId
  };
  
  const { password: _, ...userWithoutPassword } = mockUsers[userIndex];
  
  console.log("✏️ Usuário atualizado:", userId);
  
  res.json({
    user: userWithoutPassword
  });
});

// Deletar usuário
app.delete("/api/users/:id", authMiddleware, (req, res) => {
  const userId = parseInt(req.params.id);
  const userIndex = mockUsers.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }
  
  mockUsers.splice(userIndex, 1);
  
  console.log("🗑️ Usuário deletado:", userId);
  
  res.json({
    message: "Usuário deletado com sucesso"
  });
});

// ============== ROTAS DE ORDENS DE SERVIÇO ==============

// Listar OS (com filtros)
app.get("/api/os", authMiddleware, (req, res) => {
  console.log("📋 Listando OS");
  
  let filtered = [...mockOrders];
  
  // Aplicar filtros
  if (req.query.status && req.query.status !== 'all') {
    filtered = filtered.filter(o => o.status === req.query.status);
  }
  
  if (req.query.priority && req.query.priority !== 'all') {
    filtered = filtered.filter(o => o.priority === req.query.priority);
  }
  
  if (req.query.clientName) {
    filtered = filtered.filter(o => 
      o.clientName.toLowerCase().includes(req.query.clientName.toLowerCase())
    );
  }
  
  if (req.query.equipmentName) {
    filtered = filtered.filter(o => 
      o.equipmentName.toLowerCase().includes(req.query.equipmentName.toLowerCase())
    );
  }
  
  res.json({
    orders: filtered
  });
});

// Histórico de OS (DEVE VIR ANTES DE /api/os/:id)
app.get("/api/os/history", authMiddleware, (req, res) => {
  console.log("📜 Obtendo histórico");
  
  let filtered = mockOrders.filter(o => 
    o.status === 'completed' || o.status === 'cancelled'
  );
  
  // Aplicar filtros de data
  if (req.query.startDate) {
    filtered = filtered.filter(o => 
      new Date(o.createdAt) >= new Date(req.query.startDate)
    );
  }
  
  if (req.query.endDate) {
    filtered = filtered.filter(o => 
      new Date(o.createdAt) <= new Date(req.query.endDate)
    );
  }
  
  res.json({
    orders: filtered
  });
});

// Obter OS por ID (DEVE VIR DEPOIS DE /api/os/history)
app.get("/api/os/:id", authMiddleware, (req, res) => {
  const osId = parseInt(req.params.id);
  const order = mockOrders.find(o => o.id === osId);
  
  if (!order) {
    return res.status(404).json({ error: "OS não encontrada" });
  }
  
  res.json({
    order
  });
});

// Criar OS
app.post("/api/os", authMiddleware, (req, res) => {
  const newOrder = {
    id: mockOrders.length + 1,
    ...req.body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdById: req.userId,
    comments: []
  };
  
  mockOrders.push(newOrder);
  
  console.log("✅ OS criada:", newOrder.id);
  
  // Emitir evento via WebSocket
  io.emit('os:created', newOrder);
  
  res.json({
    order: newOrder
  });
});

// Atualizar OS
app.put("/api/os/:id", authMiddleware, (req, res) => {
  const osId = parseInt(req.params.id);
  const orderIndex = mockOrders.findIndex(o => o.id === osId);
  
  if (orderIndex === -1) {
    return res.status(404).json({ error: "OS não encontrada" });
  }
  
  mockOrders[orderIndex] = {
    ...mockOrders[orderIndex],
    ...req.body,
    id: osId,
    updatedAt: new Date().toISOString()
  };
  
  console.log("✏️ OS atualizada:", osId);
  
  // Emitir evento via WebSocket
  io.emit('os:updated', mockOrders[orderIndex]);
  
  res.json({
    order: mockOrders[orderIndex]
  });
});

// Deletar OS
app.delete("/api/os/:id", authMiddleware, (req, res) => {
  const osId = parseInt(req.params.id);
  const orderIndex = mockOrders.findIndex(o => o.id === osId);
  
  if (orderIndex === -1) {
    return res.status(404).json({ error: "OS não encontrada" });
  }
  
  mockOrders.splice(orderIndex, 1);
  
  console.log("🗑️ OS deletada:", osId);
  
  // Emitir evento via WebSocket
  io.emit('os:deleted', osId);
  
  res.json({
    message: "OS deletada com sucesso"
  });
});

// Adicionar comentário
app.post("/api/os/:id/comments", authMiddleware, (req, res) => {
  const osId = parseInt(req.params.id);
  const order = mockOrders.find(o => o.id === osId);
  
  if (!order) {
    return res.status(404).json({ error: "OS não encontrada" });
  }
  
  const newComment = {
    id: order.comments.length + 1,
    osId,
    userId: req.userId,
    comment: req.body.comment,
    createdAt: new Date().toISOString()
  };
  
  order.comments.push(newComment);
  order.updatedAt = new Date().toISOString();
  
  console.log("💬 Comentário adicionado à OS:", osId);
  
  // Emitir evento via WebSocket
  io.emit('os:comment', { osId, comment: newComment });
  
  res.json({
    comment: newComment
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Backend funcionando",
    timestamp: new Date().toISOString()
  });
});

// Rota raiz
app.get("/", (req, res) => {
  res.json({ 
    message: "OS Manager Backend API",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      auth: "/api/auth/:action",      // Usando parâmetro nomeado
  users: "/api/users/:id?",       // Parâmetro opcional
  os: "/api/os/:id?"   
    }
  });
});

// ============== WEBSOCKET ==============

io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('❌ Cliente desconectado:', socket.id);
  });
  
  socket.on('os:subscribe', (osId) => {
    socket.join(`os:${osId}`);
    console.log(`📡 Cliente inscrito na OS ${osId}`);
  });
  
  socket.on('os:unsubscribe', (osId) => {
    socket.leave(`os:${osId}`);
    console.log(`📡 Cliente desinscrito da OS ${osId}`);
  });
});


// ============== INICIAR SERVIDOR ==============

const PORT = parseInt(process.env.PORT) || 5000;

// ============== INICIAR SERVIDOR ==============
server.listen(PORT, '127.0.0.1', () => {
  console.log(`
╔════════════════════════════════════════════════╗
║     🚀 OS Manager Backend - RODANDO           ║
╠════════════════════════════════════════════════╣
║  Servidor: http://localhost:${PORT.toString().padEnd(23)}║
║  WebSocket: ws://localhost:${PORT.toString().padEnd(22)}║
╚════════════════════════════════════════════════╝
  `);
});


// ============== MIDDLEWARE CATCH-ALL PARA SPA ==============
// DEVE SER A ÚLTIMA COISA ANTES DE INICIAR O SERVIDOR
app.use((req, res, next) => {
  // Não interceptar rotas de API ou socket.io
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path === '/health') {
    return next();
  }
  
  // Servir index.html para todas as outras rotas (SPA routing)
  const frontendPath = process.env.FRONTEND_PATH || path.join(__dirname, '../../frontend/dist');
  res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
    if (err) {
      console.error('Erro ao servir index.html:', err);
      res.status(500).json({ error: 'Erro ao carregar aplicação' });
    }
  });
});
