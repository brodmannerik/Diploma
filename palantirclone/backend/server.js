// Lightweight backend for Raspberry Pi
// Phase 1: Receive actors and conversations

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { classifyConversation, calculateActorRisk } = require('./classifier');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins for now (restrict later)
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage (lightweight for Raspberry Pi)
let actors = [];
let conversations = [];
let actorMemory = {}; // { [name]: { flagged: boolean, clusters: Set<string> } }

// Conversation log file (plain text)
const conversationLogPath = path.join(__dirname, 'conversation.txt');

// Helper: Load persistent actor memory from conversation log
function loadMemoryFromConversationLog() {
  if (!fs.existsSync(conversationLogPath)) {
    return;
  }

  try {
    const logContent = fs.readFileSync(conversationLogPath, 'utf8');
    const lines = logContent.split('\n').filter(Boolean);

    lines.forEach((line) => {
      const parts = line.split('\t');
      if (parts.length < 3) return;

      const speaker = parts[1];
      const message = parts.slice(2).join('\t').trim();
      if (!speaker || !message) return;

      const classification = classifyConversation(message);
      if (!actorMemory[speaker]) {
        actorMemory[speaker] = {
          flagged: false,
          clusters: new Set()
        };
      }

      if (classification.flagged) {
        actorMemory[speaker].flagged = true;
      }
      classification.clusters.forEach(c => actorMemory[speaker].clusters.add(c));
    });

    console.log(`[MEMORY] Loaded persistent actor memory from conversation log (${lines.length} lines).`);
  } catch (err) {
    console.error('[MEMORY] Failed to load conversation log:', err.message);
  }
}

// Helper: Update persistent actor memory based on a new classification
function updateActorMemory(actorName, classification) {
  if (!actorMemory[actorName]) {
    actorMemory[actorName] = {
      flagged: false,
      clusters: new Set()
    };
  }

  if (classification.flagged) {
    actorMemory[actorName].flagged = true;
  }
  classification.clusters.forEach(c => actorMemory[actorName].clusters.add(c));
}

// Helper: Update actor risk scores based on conversations
function updateActorRiskScores() {
  const actorRisks = conversations.length > 0 ? calculateActorRisk(conversations) : {};

  // Update actors with risk data
  actors = actors.map(actor => {
    const risk = actorRisks[actor.name];
    const memory = actorMemory[actor.name];
    const combinedClusters = new Set([...(risk?.clusters || []), ...(memory?.clusters || [])]);

    return {
      ...actor,
      flagged: Boolean(risk?.flagged || memory?.flagged || actor.flagged),
      clusters: Array.from(combinedClusters),
      riskScore: risk?.riskScore ?? actor.riskScore,
      conversationCount: risk?.conversationCount ?? actor.conversationCount
    };
  });

  // Broadcast updated actors
  io.emit('actors-update', actors);
}

// Load memory on startup
loadMemoryFromConversationLog();

// ===== PHASE 1: RECEIVE ACTORS =====

// Endpoint: Initialize or update actors list
// Accepts simple string array: { "actors": ["Peter", "Christine", "John"] }
app.post('/api/actors', (req, res) => {
  const { actors: newActors } = req.body;
  
  if (!newActors || !Array.isArray(newActors)) {
    return res.status(400).json({ error: 'Invalid actors data' });
  }

  // Preserve existing risk data if actor already exists
  const existingActorsMap = new Map(actors.map(a => [a.name, a]));
  
  // Convert string array to actor objects with index-based IDs
  actors = newActors.map((actorName, index) => {
    // Handle both string format ("Peter") and object format for backwards compatibility
    const name = typeof actorName === 'string' ? actorName : actorName.name;
    const existing = existingActorsMap.get(name);
    return {
      id: `[${index}]`, // Index-based ID: [0], [1], [2]...
      name: name,
      index: index,
      timestamp: existing?.timestamp || Date.now(),
      flagged: existing?.flagged || false,
      clusters: existing?.clusters || [],
      riskScore: existing?.riskScore || 0,
      conversationCount: existing?.conversationCount || 0
    };
  });

  console.log(`[ACTORS] Received ${actors.length} actors:`, actors.map(a => `${a.id} ${a.name}`).join(', '));

  // Apply persistent memory/risk merge and broadcast
  updateActorRiskScores();
  
  res.json({ 
    success: true, 
    count: actors.length,
    actors: actors
  });
});

// Get current actors list
app.get('/api/actors', (req, res) => {
  res.json({ actors });
});

// ===== PHASE 2: RECEIVE CONVERSATIONS =====

// Endpoint: Receive conversation - SUPER SIMPLE FORMAT
// Send: {"conversations": ["Hello"]} = Actor[0] says "Hello"
// Send: {"conversations": ["", "Hi"]} = Actor[1] says "Hi"  
// Send: {"conversations": ["", "", "Hey"]} = Actor[2] says "Hey"
app.post('/api/conversation', (req, res) => {
  console.log('[DEBUG] Received body:', JSON.stringify(req.body));
  const { conversations: data } = req.body;

  if (!data || !Array.isArray(data)) {
    console.log('[DEBUG] Invalid - data:', data, 'isArray:', Array.isArray(data));
    return res.status(400).json({ error: 'Invalid conversations data' });
  }

  // Find which index has a message
  let speakerIndex = -1;
  let message = "";
  
  for (let i = 0; i < data.length; i++) {
    if (data[i] && data[i].trim() !== "") {
      speakerIndex = i;
      message = data[i];
      break;
    }
  }

  if (speakerIndex === -1 || !actors[speakerIndex]) {
    return res.status(400).json({ error: 'No valid message or actor found' });
  }

  const speaker = actors[speakerIndex].name;
  const listener = "broadcast";

  // Classify the conversation
  const classification = classifyConversation(message);

  const conversation = {
    id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    speaker,
    listener,
    message,
    timestamp: Date.now(),
    classification: classification
  };

  // Persist conversation to a text file for later access
  const logLine = `${new Date(conversation.timestamp).toISOString()}\t${speaker}\t${message.replace(/\s+/g, ' ').trim()}\n`;
  fs.appendFile(conversationLogPath, logLine, (err) => {
    if (err) {
      console.error('[LOG] Failed to write conversation log:', err.message);
    }
  });

  conversations.push(conversation);
  
  // Keep only last 100 conversations to save memory
  if (conversations.length > 100) {
    conversations = conversations.slice(-100);
  }

  console.log(`[CONVERSATION] [${speakerIndex}] ${speaker}: "${message}"`);
  console.log(`  📊 Classification:`, {
    flagged: classification.flagged,
    riskScore: classification.riskScore,
    clusters: classification.clusters
  });
  if (classification.flagged) {
    console.log(`  ⚠️  FLAGGED - Risk: ${classification.riskScore}, Clusters: ${classification.clusters.join(', ')}`);
  }

  // Update persistent memory before risk aggregation
  updateActorMemory(speaker, classification);

  // Update actor risk scores
  updateActorRiskScores();
  console.log(`  👥 Updated actors:`, actors.map(a => `${a.name}(${a.flagged ? '⚠️' : '✓'}, risk:${a.riskScore || 0})` ).join(', '));
  
  // Broadcast to connected clients
  io.emit('new-conversation', conversation);
  
  res.json({ 
    success: true, 
    conversation,
    classification
  });
});

// Get recent conversations
app.get('/api/conversations', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ 
    conversations: conversations.slice(-limit),
    total: conversations.length
  });
});

// ===== WEBSOCKET CONNECTION =====

io.on('connection', (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);
  
  // Send current state to new client
  socket.emit('actors-update', actors);
  socket.emit('conversations-history', conversations.slice(-20));

  socket.on('disconnect', () => {
    console.log(`[SOCKET] Client disconnected: ${socket.id}`);
  });
});

// ===== HEALTH CHECK =====

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    uptime: process.uptime(),
    actors: actors.length,
    conversations: conversations.length,
    timestamp: Date.now()
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Backend running on port ${PORT}`);
  console.log(`📡 Listening on all interfaces (0.0.0.0)`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /api/actors         - Register actors`);
  console.log(`  GET  /api/actors         - Get actors list`);
  console.log(`  POST /api/conversation   - Send conversation`);
  console.log(`  GET  /api/conversations  - Get recent conversations`);
  console.log(`  GET  /health             - Health check`);
  console.log(`\n💡 Ready to receive data from Unreal Engine!\n`);
});
