require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { nanoid } = require('nanoid');
const path = require('path');
const supabase = require('./utils/supabase');

// ── Routes & Middleware ───────────────────────────────────────────────────────
const authRouter = require('./routes/auth');
const workspacesRouter = require('./routes/workspaces');
const filesRouter = require('./routes/files');
const { optionalToken, checkPlanLimits, PLAN_LIMITS } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

// ── Supabase Connection Check ────────────────────────────────────────────────
async function checkSupabase() {
  try {
    const { data, error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    if (error) throw error;
    console.log('✅ Connected to Supabase');
  } catch (err) {
    console.error('❌ Supabase connection error:', err.message);
    console.warn('⚠️ Make sure your .env has correct SUPABASE_URL and SUPABASE_ANON_KEY');
  }
}

checkSupabase();

// ── Auth, Workspaces and Files routes ─────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/rooms', filesRouter); // Handles GET /api/rooms/:roomId/files and POST /api/rooms/:roomId/files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ── Code Execution (Local child_process) ─────────────────────────────────────
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');

const NON_EXECUTABLE = ['html', 'css', 'sql', 'json', 'markdown'];

// Write code to a temp file, run command, return { stdout, stderr }
function runInSandbox(cmd, args, input, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let stdout = '', stderr = '', done = false;
    // On Windows, npx/javac might require shell: true, but node/python don't.
    // We'll use shell: true but we know we're not passing unsanitized user input in args directly as flags (only file paths).
    const child = spawn(cmd, args, { timeout: timeoutMs, shell: process.platform === 'win32' });
    if (input) { child.stdin.write(input); child.stdin.end(); }
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', (code) => {
      if (done) return; done = true;
      resolve({ stdout, stderr, code });
    });
    child.on('error', (e) => {
      if (done) return; done = true;
      resolve({ stdout, stderr: e.message, code: 1 });
    });
    setTimeout(() => {
      if (done) return; done = true;
      try { child.kill(); } catch {}
      resolve({ stdout, stderr: '⏰ Execution timed out (12s limit).', code: 124 });
    }, timeoutMs);
  });
}

function tmpFile(ext) {
  return path.join(os.tmpdir(), `cs_run_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
}

async function executeCode(language, code) {
  let file, result;
  switch (language) {
    case 'javascript': {
      file = tmpFile('.js');
      fs.writeFileSync(file, code);
      result = await runInSandbox('node', [file]);
      break;
    }
    case 'typescript': {
      file = tmpFile('.ts');
      fs.writeFileSync(file, code);
      // Try ts-node, fallback to compiling with tsc then running
      result = await runInSandbox('npx', ['--yes', 'ts-node', '--skipProject', file]);
      break;
    }
    case 'python': {
      file = tmpFile('.py');
      fs.writeFileSync(file, code);
      // Try python3 then python
      result = await runInSandbox('python', [file]);
      if (result.stderr && result.stderr.includes('is not recognized')) {
        result = await runInSandbox('python3', [file]);
      }
      break;
    }
    case 'java': {
      // Java needs class name = file name
      const className = (code.match(/public\s+class\s+(\w+)/) || [])[1] || 'Main';
      const dir = path.join(os.tmpdir(), `cs_java_${Date.now()}`);
      fs.mkdirSync(dir, { recursive: true });
      file = path.join(dir, `${className}.java`);
      fs.writeFileSync(file, code);
      const compile = await runInSandbox('javac', [file]);
      if (compile.code !== 0) {
        result = { stdout: '', stderr: compile.stderr || compile.stdout };
      } else {
        result = await runInSandbox('java', ['-cp', dir, className]);
      }
      try { fs.rmSync(dir, { recursive: true }); } catch {}
      break;
    }
    case 'cpp': {
      file = tmpFile('.cpp');
      const outFile = tmpFile('.exe');
      fs.writeFileSync(file, code);
      const compile = await runInSandbox('g++', [file, '-o', outFile, '-std=c++17']);
      if (compile.code !== 0) {
        result = { stdout: '', stderr: compile.stderr || compile.stdout };
      } else {
        result = await runInSandbox(outFile, []);
      }
      try { fs.unlinkSync(outFile); } catch {}
      break;
    }
    case 'csharp': {
      // Use dotnet-script or csc
      file = tmpFile('.cs');
      fs.writeFileSync(file, code);
      result = await runInSandbox('dotnet-script', [file]);
      if (result.stderr && result.stderr.includes('is not recognized')) {
        result = { stdout: '', stderr: '⚠️ C# requires dotnet-script.\nInstall: npm install -g dotnet-script' };
      }
      break;
    }
    case 'go': {
      file = tmpFile('.go');
      fs.writeFileSync(file, code);
      result = await runInSandbox('go', ['run', file]);
      break;
    }
    case 'rust': {
      file = tmpFile('.rs');
      const outFile = tmpFile('');
      fs.writeFileSync(file, code);
      const compile = await runInSandbox('rustc', [file, '-o', outFile]);
      if (compile.code !== 0) {
        result = { stdout: '', stderr: compile.stderr || compile.stdout };
      } else {
        result = await runInSandbox(outFile, []);
      }
      try { fs.unlinkSync(outFile); } catch {}
      break;
    }
    default:
      return { output: `⚠️ "${language}" cannot be executed here.`, error: false };
  }
  // Cleanup temp file
  if (file) { try { fs.unlinkSync(file); } catch {} }
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const hasError = !!stderr && result.code !== 0;
  const output = stdout + (stderr ? (stdout ? '\n' : '') + '⚠️ ' + stderr : '');
  return { output: output.trim() || '(No output)', error: hasError };
}

app.post('/api/run', async (req, res) => {
  const { language, code } = req.body;
  if (!language || !code) return res.status(400).json({ output: 'Missing language or code.', error: true });
  if (NON_EXECUTABLE.includes(language)) {
    const names = { html: 'HTML', css: 'CSS', sql: 'SQL', json: 'JSON', markdown: 'Markdown' };
    return res.json({
      output: `ℹ️ ${names[language] || language} is a markup/data language — it cannot be "run".\n\nSwitch to JavaScript, Python, Java, C++, C#, Go, Rust, or TypeScript to execute code.`,
      error: false,
    });
  }
  try {
    console.log(`[RUN] ${language} (${code.length} chars)`);
    const result = await executeCode(language, code);
    console.log(`[RUN] done — error=${result.error}`);
    res.json(result);
  } catch (err) {
    console.error('[RUN] Unexpected error:', err);
    res.json({ output: '❌ Server error: ' + err.message, error: true });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── In-memory room store (for transient data like users & chat) ───────────────
const rooms = {};

const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9',
];

async function getRoom(roomId) {
  if (!rooms[roomId]) {
    const { data: dbRoom } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (dbRoom) {
      rooms[roomId] = {
        code: dbRoom.code,
        language: dbRoom.language,
        users: {},
        chat: [],
        viewOnlyMode: dbRoom.view_only_mode,
        ownerToken: dbRoom.owner_token,
        ownerId: dbRoom.owner_id,
        workspaceId: dbRoom.workspace_id,
      };
    } else {
      // Default fallback if not in DB yet (e.g. just created)
      rooms[roomId] = {
        code: '// Start coding here...\n',
        language: 'javascript',
        users: {},
        chat: [],
        viewOnlyMode: false,
      };
    }
  }
  return rooms[roomId];
}

// ── REST: Create a room ───────────────────────────────────────────────────────
app.post('/api/rooms', optionalToken, checkPlanLimits, async (req, res) => {
  const roomId = nanoid(8);
  const ownerToken = nanoid(16);
  const ownerId = req.userId || null;

  // 1. Create in Supabase
  const { error: insertError } = await supabase.from('rooms').insert({
    id: roomId,
    owner_id: ownerId,
    owner_token: ownerToken,
    code: '// Start coding here...\n',
    language: 'javascript',
    view_only_mode: false
  });

  if (insertError) {
    console.error('Failed to create room in Supabase:', insertError);
    return res.status(500).json({ error: 'Failed to create room.' });
  }

  // 2. Initialize in memory
  rooms[roomId] = {
    code: '// Start coding here...\n',
    language: 'javascript',
    users: {},
    chat: [],
    viewOnlyMode: false,
    ownerToken,
    ownerId
  };

  // 3. Increment user's codeshare count if logged in
  if (req.dbUser) {
    try {
      await supabase
        .from('users')
        .update({ codeshare_count: (req.dbUser.codeshare_count || 0) + 1 })
        .eq('id', req.userId);
    } catch (e) {
      console.warn('Could not increment codeshare count:', e.message);
    }
  }

  res.json({ roomId, plan: req.userPlan || 'GUEST', ownerToken });
});

// ── REST: Get room info ───────────────────────────────────────────────────────
app.get('/api/rooms/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const room = await getRoom(roomId);
  if (room) {
    res.json({
      exists: true,
      userCount: Object.keys(room.users).length,
      language: room.language,
      viewOnlyMode: room.viewOnlyMode,
      workspaceId: room.workspaceId || null
    });
  } else {
    res.json({ exists: false });
  }
});

// ── REST: Toggle view-only mode (PRO/PREMIUM only) ────────────────────────────
app.post('/api/rooms/:roomId/view-only', optionalToken, async (req, res) => {
  const { roomId } = req.params;
  const { enabled, ownerToken } = req.body;

  const room = await getRoom(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  if (!req.userId) return res.status(403).json({ error: 'Login required', code: 'AUTH_REQUIRED' });

  const isOwner = (ownerToken && room.ownerToken === ownerToken) || (req.userId && room.ownerId === req.userId);
  if (!isOwner) return res.status(403).json({ error: 'Only the room creator can toggle view mode', code: 'NOT_OWNER' });

  // Check plan
  const { data: user } = await supabase.from('users').select('plan').eq('id', req.userId).single();
  if (!user || !['PRO', 'PREMIUM'].includes(user.plan)) {
    return res.status(403).json({ error: 'PRO or PREMIUM plan required', code: 'PLAN_REQUIRED' });
  }

  room.viewOnlyMode = !!enabled;
  
  // Update Supabase
  await supabase.from('rooms').update({ view_only_mode: room.viewOnlyMode }).eq('id', roomId);

  io.to(roomId).emit('view-only-update', { enabled: room.viewOnlyMode });
  res.json({ viewOnlyMode: room.viewOnlyMode });
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  socket.on('join-room', async ({ roomId, username, plan = 'GUEST', ownerToken }) => {
    const room = await getRoom(roomId);
    if (!room) return;

    const currentCount = Object.keys(room.users).length;
    const limit = PLAN_LIMITS[plan] || PLAN_LIMITS['GUEST'];

    if (limit.maxCollaborators !== Infinity && currentCount >= limit.maxCollaborators) {
      socket.emit('collab-limit-reached', {
        plan,
        limit: limit.maxCollaborators,
        message: `This room is full for your plan (${plan}: max ${limit.maxCollaborators} users). Upgrade for unlimited collaborators.`,
      });
    }

    const colorIndex = currentCount % USER_COLORS.length;
    const color = USER_COLORS[colorIndex];

    room.users[socket.id] = { socketId: socket.id, name: username || 'Anonymous', color, plan };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userPlan = plan;

    const isOwner = !!(ownerToken && room.ownerToken === ownerToken);
    socket.emit('init-code', {
      code: room.code,
      language: room.language,
      viewOnlyMode: room.viewOnlyMode,
      isOwner,
      workspaceId: room.workspaceId || null
    });

    const userList = Object.values(room.users);
    io.to(roomId).emit('users-update', userList);

    socket.to(roomId).emit('user-joined', { name: room.users[socket.id].name, color });
    socket.emit('chat-history', room.chat);

    socket.isOwner = isOwner;

    console.log(`  User "${room.users[socket.id].name}" [${plan}] joined room ${roomId}. Total: ${userList.length}`);
  });

  socket.on('code-change', async ({ roomId, code }) => {
    if (!rooms[roomId]) return;
    if (rooms[roomId].viewOnlyMode && !socket.isOwner) return;
    
    rooms[roomId].code = code;
    socket.to(roomId).emit('code-update', { code });

    // Persist to Supabase
    await supabase.from('rooms').update({ code }).eq('id', roomId);
  });

  socket.on('language-change', async ({ roomId, language }) => {
    if (!rooms[roomId]) return;
    if (rooms[roomId].viewOnlyMode && !socket.isOwner) return;

    rooms[roomId].language = language;
    io.to(roomId).emit('language-update', { language });

    // Persist to Supabase
    await supabase.from('rooms').update({ language }).eq('id', roomId);
  });

  socket.on('chat-message', ({ roomId, message }) => {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];
    const sender = room.users[socket.id];
    if (!sender) return;

    const msg = {
      id: nanoid(6),
      name: sender.name,
      color: sender.color,
      text: message,
      readBy: [socket.id],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    room.chat.push(msg);
    if (room.chat.length > 100) room.chat.shift();
    io.to(roomId).emit('chat-message', msg);
  });

  // ── Monaco Presence/Cursor Sync ───────────────────────────────────────────
  socket.on('cursor-move', ({ roomId, position }) => {
    if (!rooms[roomId]) return;
    socket.to(roomId).emit('cursor-update', {
      socketId: socket.id,
      position,
      name: rooms[roomId].users[socket.id]?.name || 'Collaborator',
      color: rooms[roomId].users[socket.id]?.color || '#ffffff'
    });
  });

  // ── Typing Indicators ──────────────────────────────────────────────────────
  socket.on('typing-start', ({ roomId }) => {
    if (!rooms[roomId]) return;
    socket.to(roomId).emit('typing-update', {
      socketId: socket.id,
      username: rooms[roomId].users[socket.id]?.name || 'Someone',
      isTyping: true
    });
  });

  socket.on('typing-stop', ({ roomId }) => {
    if (!rooms[roomId]) return;
    socket.to(roomId).emit('typing-update', {
      socketId: socket.id,
      username: rooms[roomId].users[socket.id]?.name || 'Someone',
      isTyping: false
    });
  });

  // ── Read Receipts ──────────────────────────────────────────────────────────
  socket.on('message-read', ({ roomId, messageId, userId }) => {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];
    const msg = room.chat.find(m => m.id === messageId);
    if (msg) {
      if (!msg.readBy) msg.readBy = [];
      if (!msg.readBy.includes(userId)) {
        msg.readBy.push(userId);
      }
    }
    io.to(roomId).emit('message-read-update', { messageId, userId });
  });

  // ── File Upload Sync ───────────────────────────────────────────────────────
  socket.on('file-shared', ({ roomId, file }) => {
    socket.to(roomId).emit('file-shared', file);
  });

  socket.on('file-deleted', ({ roomId, fileId }) => {
    socket.to(roomId).emit('file-deleted', { fileId });
  });

  // ── WebRTC P2P Signaling ───────────────────────────────────────────────────
  socket.on('webrtc-offer', ({ targetSocketId, offer }) => {
    io.to(targetSocketId).emit('webrtc-offer', {
      senderSocketId: socket.id,
      offer
    });
  });

  socket.on('webrtc-answer', ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit('webrtc-answer', {
      senderSocketId: socket.id,
      answer
    });
  });

  socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('webrtc-ice-candidate', {
      senderSocketId: socket.id,
      candidate
    });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      const user = room.users[socket.id];
      delete room.users[socket.id];

      const userList = Object.values(room.users);
      io.to(roomId).emit('users-update', userList);

      if (user) {
        socket.to(roomId).emit('user-left', { name: user.name });
        console.log(`  User "${user.name}" left room ${roomId}. Total: ${userList.length}`);
      }

      if (userList.length === 0) {
        setTimeout(() => {
          if (rooms[roomId] && Object.keys(rooms[roomId].users).length === 0) {
            delete rooms[roomId];
            console.log(`  Room ${roomId} cleaned up (memory only).`);
          }
        }, 10 * 60 * 1000);
      }
    }
    console.log(`[-] Socket disconnected: ${socket.id}`);
  });
});

// ── Serve Frontend Static Assets (Unified Option 1) ─────────────────────────
const frontendDistPath = path.join(__dirname, '../codeshare-frontend/dist');
app.use(express.static(frontendDistPath));

app.get('*', (req, res) => {
  // Avoid intercepting API routes (if not defined, return 404 naturally)
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }

  const indexPath = path.join(frontendDistPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend build folder not found. Run the build command first.');
  }
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`\n🚀 CodeShare backend running on port ${PORT}\n`);
});
