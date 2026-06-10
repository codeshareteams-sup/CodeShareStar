import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import Editor from '@monaco-editor/react'
import Sidebar from './Sidebar'
import ChatPanel from './ChatPanel'
import WorkspaceSidebar from './WorkspaceSidebar'
import { useAuth, BACKEND_URL } from '../context/AuthContext'
import DEFAULT_SAMPLES from './defaultSamples'
import './EditorPage.css'

const BACKEND = BACKEND_URL

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'sql', label: 'SQL' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
]

const EXECUTABLE = ['javascript', 'typescript', 'python', 'java', 'cpp', 'csharp', 'go', 'rust']

const PLAN_META = {
  GUEST:   { label: 'Guest',   color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  FREE:    { label: 'Free',    color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  PRO:     { label: 'Pro',     color: '#6c63ff', bg: 'rgba(108,99,255,0.15)' },
  PREMIUM: { label: 'Premium', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
}

// Check if code is a known default sample
const sampleValues = new Set(Object.values(DEFAULT_SAMPLES))
function isDefaultCode(code) {
  if (!code || code.trim() === '' || code === '// Start coding here...\n') return true
  return sampleValues.has(code)
}

export default function EditorPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, token, isAuthenticated } = useAuth()

  const plan = user?.plan || 'GUEST'
  const username = user?.username || sessionStorage.getItem('cs_username') || 'Anonymous'
  const isProOrPremium = ['PRO', 'PREMIUM'].includes(plan)
  const showAds = !isProOrPremium  // GUEST and FREE see ads

  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [users, setUsers] = useState([])
  const [chatMessages, setChatMessages] = useState([])
  const [notifications, setNotifications] = useState([])
  const [chatOpen, setChatOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [connected, setConnected] = useState(false)
  const [copied, setCopied] = useState(false)
  const [viewOnly, setViewOnly] = useState(false)
  const [adDismissed, setAdDismissed] = useState(false)
  const [collabLimitInfo, setCollabLimitInfo] = useState(null)
  const [toggling, setToggling] = useState(false)
  const [isOwner, setIsOwner] = useState(false)

  // ── Options 3 States & Refs ──
  const [cursors, setCursors] = useState({})
  const [activeTab, setActiveTab] = useState('chat') // 'chat' | 'screenshots'
  const [sharedFiles, setSharedFiles] = useState([])
  const [typingUsers, setTypingUsers] = useState({})
  const [p2pChatOpen, setP2pChatOpen] = useState(false)
  const [p2pTargetUser, setP2pTargetUser] = useState(null)
  const [p2pMessages, setP2pMessages] = useState([])
  const [p2pStatus, setP2pStatus] = useState('Offline') // Offline, Connecting, Connected
  const [p2pIncomingFile, setP2pIncomingFile] = useState(null)
  const [p2pProgress, setP2pProgress] = useState(0)
  const [workspaceId, setWorkspaceId] = useState(null)
  const [workspaceRole, setWorkspaceRole] = useState('member')
  const [triggerUpload, setTriggerUpload] = useState(false)

  const isLocalTyping = useRef(false)
  const typingTimeout = useRef(null)
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const decorationsRef = useRef([])
  const peerConnectionRef = useRef(null)
  const dataChannelRef = useRef(null)
  const fileBufferRef = useRef([])
  const fileMetaRef = useRef(null)

  // ── Run state ──────────────────────────────────────────────────────────
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const [outputError, setOutputError] = useState(false)

  const socketRef = useRef(null)
  const isRemoteChange = useRef(false)
  const notifId = useRef(0)

  const pushNotif = useCallback((msg, type = 'info') => {
    const id = ++notifId.current
    setNotifications(n => [...n, { id, msg, type }])
    setTimeout(() => setNotifications(n => n.filter(x => x.id !== id)), 3500)
  }, [])

  // ── WebRTC Configuration & Methods ──
  const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  const setupDataChannel = useCallback((channel) => {
    channel.onopen = () => {
      console.log('[RTC] Data channel open');
      setP2pStatus('Connected');
      pushNotif('P2P Direct Connection Established!', 'info');
    };

    channel.onclose = () => {
      console.log('[RTC] Data channel closed');
      setP2pStatus('Offline');
      pushNotif('P2P Direct Connection Closed', 'leave');
    };

    channel.onerror = (err) => {
      console.error('[RTC] Data channel error:', err);
      setP2pStatus('Offline');
    };

    channel.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.type === 'file-meta') {
            fileMetaRef.current = parsed;
            fileBufferRef.current = [];
            setP2pIncomingFile({ name: parsed.name, size: parsed.size });
            setP2pProgress(0);
          } else if (parsed.type === 'text') {
            setP2pMessages(prev => [...prev, {
              sender: 'Remote Peer',
              text: parsed.text,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);
            pushNotif('New direct message received', 'info');
          }
        } catch {
          setP2pMessages(prev => [...prev, {
            sender: 'Remote Peer',
            text: e.data,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }]);
        }
      } else {
        // Handle binary file transfer chunk
        fileBufferRef.current.push(e.data);
        const receivedSize = fileBufferRef.current.reduce((acc, val) => acc + val.byteLength, 0);
        const meta = fileMetaRef.current;
        if (meta) {
          const progress = Math.round((receivedSize / meta.size) * 100);
          setP2pProgress(progress);
          
          if (receivedSize >= meta.size) {
            const blob = new Blob(fileBufferRef.current, { type: meta.mimeType });
            const blobUrl = URL.createObjectURL(blob);
            setP2pMessages(prev => [...prev, {
              sender: 'Remote Peer',
              text: `Shared screenshot: ${meta.name}`,
              fileUrl: blobUrl,
              fileName: meta.name,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);
            setP2pIncomingFile(null);
            setP2pProgress(0);
            pushNotif(`Direct screenshot received: ${meta.name}`, 'info');
          }
        }
      }
    };
  }, [pushNotif]);

  const initWebRTCPeer = useCallback((targetSocketId) => {
    console.log('[RTC] Creating offer to peer:', targetSocketId);
    setP2pStatus('Connecting');

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = pc;

    const dc = pc.createDataChannel('p2p-chat');
    dataChannelRef.current = dc;
    setupDataChannel(dc);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current?.emit('webrtc-ice-candidate', {
          targetSocketId,
          candidate: e.candidate
        });
      }
    };

    pc.createOffer().then(offer => {
      return pc.setLocalDescription(offer).then(() => {
        socketRef.current?.emit('webrtc-offer', {
          targetSocketId,
          offer
        });
      });
    }).catch(err => console.error('Failed to create RTC offer:', err));
  }, [setupDataChannel]);

  const handleReceiveOffer = useCallback(async (senderSocketId, offer) => {
    console.log('[RTC] Answering offer from peer:', senderSocketId);
    setP2pStatus('Connecting');

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current?.emit('webrtc-ice-candidate', {
          targetSocketId: senderSocketId,
          candidate: e.candidate
        });
      }
    };

    pc.ondatachannel = (e) => {
      dataChannelRef.current = e.channel;
      setupDataChannel(e.channel);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socketRef.current?.emit('webrtc-answer', {
      targetSocketId: senderSocketId,
      answer
    });
  }, [setupDataChannel]);

  // ── Socket setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(BACKEND)
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      const ownerToken = localStorage.getItem(`cs_owner_${roomId}`)
      socket.emit('join-room', { roomId, username, plan, ownerToken })
    })
    socket.on('disconnect', () => setConnected(false))

    socket.on('init-code', ({ code: c, language: lang, viewOnlyMode, isOwner: ownerStatus, workspaceId }) => {
      isRemoteChange.current = true
      setCode(c)
      setLanguage(lang)
      setViewOnly(!!viewOnlyMode)
      setIsOwner(!!ownerStatus)
      setWorkspaceId(workspaceId)
    })
    socket.on('code-update', ({ code: c }) => {
      isRemoteChange.current = true
      setCode(c)
    })
    socket.on('language-update', ({ language: lang }) => setLanguage(lang))
    socket.on('users-update', userList => setUsers(userList))
    socket.on('user-joined', ({ name }) => pushNotif(`${name} joined the room`, 'join'))
    socket.on('user-left', ({ name }) => pushNotif(`${name} left the room`, 'leave'))
    socket.on('chat-history', msgs => setChatMessages(msgs))
    socket.on('chat-message', msg => {
      setChatMessages(prev => [...prev, msg])
      if (!chatOpen) setUnreadCount(n => n + 1)
    })
    socket.on('view-only-update', ({ enabled }) => setViewOnly(enabled))
    socket.on('collab-limit-reached', (info) => setCollabLimitInfo(info))

    // ── Option 3 socket event integrations ──
    socket.on('cursor-update', ({ socketId, position, name, color }) => {
      setCursors(prev => ({
        ...prev,
        [socketId]: { position, name, color }
      }));
    });

    socket.on('typing-update', ({ socketId, username: name, isTyping }) => {
      setTypingUsers(prev => ({
        ...prev,
        [socketId]: isTyping ? name : null
      }));
    });

    socket.on('webrtc-offer', async ({ senderSocketId, offer }) => {
      await handleReceiveOffer(senderSocketId, offer);
    });

    socket.on('webrtc-answer', async ({ answer }) => {
      await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('webrtc-ice-candidate', async ({ candidate }) => {
      if (candidate) {
        await peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on('file-shared', (file) => {
      setSharedFiles(prev => [...prev, file])
      pushNotif(`New screenshot shared by ${file.uploaderName || 'someone'}!`, 'info')
    })

    socket.on('file-deleted', ({ fileId }) => {
      setSharedFiles(prev => prev.filter(f => f.id !== fileId))
      pushNotif('A screenshot was deleted from the gallery.', 'info')
    })

    socket.on('message-read-update', ({ messageId, userId }) => {
      setChatMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          const readBy = msg.readBy || []
          if (!readBy.includes(userId)) {
            return { ...msg, readBy: [...readBy, userId] }
          }
        }
        return msg
      }))
    })

    return () => socket.disconnect()
  }, [roomId, username, plan, chatOpen, pushNotif, handleReceiveOffer])

  // Emit read receipt when chat is active and new messages arrive
  useEffect(() => {
    if (chatOpen && activeTab === 'chat' && chatMessages.length > 0 && socketRef.current?.id) {
      const myId = socketRef.current.id;
      chatMessages.forEach(msg => {
        if (!msg.readBy || !msg.readBy.includes(myId)) {
          socketRef.current.emit('message-read', {
            roomId,
            messageId: msg.id,
            userId: myId
          });
        }
      });
    }
  }, [chatOpen, activeTab, chatMessages, roomId]);

  // ── Code change ───────────────────────────────────────────────────────────
  const handleCodeChange = useCallback((value) => {
    if (isRemoteChange.current) { isRemoteChange.current = false; return }
    if (viewOnly && !isOwner) return
    setCode(value)
    socketRef.current?.emit('code-change', { roomId, code: value })
  }, [roomId, viewOnly, isOwner])

  const handleLanguageChange = useCallback((lang) => {
    // If code is a default sample or empty, load sample for new lang
    if (isDefaultCode(code)) {
      const sample = DEFAULT_SAMPLES[lang] || ''
      setCode(sample)
      socketRef.current?.emit('code-change', { roomId, code: sample })
    }
    setLanguage(lang)
    socketRef.current?.emit('language-change', { roomId, language: lang })
  }, [roomId, code])

  const handleSendChat = useCallback((text) => {
    socketRef.current?.emit('chat-message', { roomId, message: text })
    if (isLocalTyping.current) {
      isLocalTyping.current = false
      socketRef.current?.emit('typing-stop', { roomId })
    }
  }, [roomId])

  // ── Monaco Remote Cursor Presence ──
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return
    const editor = editorRef.current
    const monaco = monacoRef.current

    const newDecorations = []
    Object.entries(cursors).forEach(([socketId, data]) => {
      const { position, name, color } = data
      if (!position) return

      newDecorations.push({
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column + 1),
        options: {
          className: `remote-cursor-${socketId}`,
          beforeContentClassName: `remote-cursor-hover-${socketId}`,
          hoverMessage: { value: name }
        }
      })
    })

    // Dynamic style generation for cursors
    const styleId = 'monaco-remote-cursors-styles'
    let styleEl = document.getElementById(styleId)
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }

    let styles = ''
    Object.entries(cursors).forEach(([socketId, data]) => {
      const { color, name } = data
      styles += `
        .remote-cursor-${socketId} {
          background-color: ${color};
          width: 2px !important;
        }
        .remote-cursor-hover-${socketId}::after {
          content: "${name}";
          background-color: ${color};
          color: #000;
          font-size: 10px;
          position: absolute;
          top: -14px;
          left: 0;
          padding: 1px 3px;
          border-radius: 2px;
          white-space: nowrap;
          z-index: 10;
        }
      `
    })
    styleEl.innerHTML = styles

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current || [], newDecorations)
  }, [cursors])

  // ── Local Typing detection ──
  const handleLocalTyping = () => {
    if (!isLocalTyping.current) {
      isLocalTyping.current = true
      socketRef.current?.emit('typing-start', { roomId })
    }
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => {
      isLocalTyping.current = false
      socketRef.current?.emit('typing-stop', { roomId })
    }, 1500)
  }

  // ── Screenshot Upload & Gallery Fetches ──
  const fetchSharedFiles = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/rooms/${roomId}/files`)
      if (res.ok) {
        const data = await res.json()
        setSharedFiles(data)
      }
    } catch (err) {
      console.error('Failed to load shared files:', err)
    }
  }, [roomId])

  useEffect(() => {
    fetchSharedFiles()
  }, [fetchSharedFiles])

  // Fetch workspace user role
  useEffect(() => {
    if (!workspaceId || !token) return
    const fetchRole = async () => {
      try {
        const res = await fetch(`${BACKEND}/api/workspaces/${workspaceId}/members`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const members = await res.json()
          const myMember = members.find(m => m.id === user?.id)
          if (myMember) {
            setWorkspaceRole(myMember.role)
          }
        }
      } catch (err) {
        console.error(err)
      }
    }
    fetchRole()
  }, [workspaceId, token, user])

  const uploadScreenshot = (file, caption, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('file', file)
      if (caption) {
        formData.append('caption', caption)
      }

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100)
          if (onProgress) onProgress(percent)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText)
            setSharedFiles(prev => [...prev, data])
            pushNotif('Screenshot shared to gallery!', 'info')
            socketRef.current?.emit('file-shared', { roomId, file: data })
            resolve(data)
          } catch {
            reject(new Error('Invalid response format'))
          }
        } else {
          let errMsg = 'Upload failed'
          try {
            const data = JSON.parse(xhr.responseText)
            errMsg = data.error || errMsg
          } catch {}
          pushNotif(errMsg, 'error')
          reject(new Error(errMsg))
        }
      })

      xhr.addEventListener('error', () => {
        pushNotif('Upload failed', 'error')
        reject(new Error('Network error'))
      })

      xhr.open('POST', `${BACKEND}/api/rooms/${roomId}/files`)
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      }
      xhr.send(formData)
    })
  }

  const deleteScreenshot = async (fileId) => {
    try {
      const res = await fetch(`${BACKEND}/api/rooms/${roomId}/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-owner-token': localStorage.getItem(`cs_owner_${roomId}`) || ''
        }
      })
      const data = await res.json()
      if (res.ok) {
        setSharedFiles(prev => prev.filter(f => f.id !== fileId))
        pushNotif('Screenshot deleted', 'info')
        socketRef.current?.emit('file-deleted', { roomId, fileId })
      } else {
        pushNotif(data.error || 'Failed to delete', 'error')
      }
    } catch (err) {
      console.error(err)
      pushNotif('Delete failed', 'error')
    }
  }

  // ── Workspace Creation helper ──
  const handleCreateRoomInWorkspace = async (workspaceId) => {
    try {
      const res = await fetch(`${BACKEND}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ workspaceId })
      })
      const data = await res.json()
      if (res.ok) {
        navigate(`/room/${data.roomId}`)
      }
    } catch (err) {
      console.error(err)
    }
  }

  // ── P2P sending helper methods ──
  const sendP2PMessage = (text) => {
    if (dataChannelRef.current?.readyState !== 'open') return
    dataChannelRef.current.send(JSON.stringify({ type: 'text', text }))
    setP2pMessages(prev => [...prev, {
      sender: 'Me',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }])
  }

  const sendP2PFile = (file) => {
    if (dataChannelRef.current?.readyState !== 'open') return
    dataChannelRef.current.send(JSON.stringify({
      type: 'file-meta',
      name: file.name,
      size: file.size,
      mimeType: file.type
    }))

    const chunkSize = 16384
    const reader = new FileReader()
    let offset = 0

    reader.onload = (e) => {
      const buffer = e.target.result
      dataChannelRef.current.send(buffer)
      offset += buffer.byteLength
      setP2pProgress(Math.round((offset / file.size) * 100))
      if (offset < file.size) {
        readNextChunk()
      } else {
        pushNotif(`Sent direct file: ${file.name}`, 'info')
        const blobUrl = URL.createObjectURL(file)
        setP2pMessages(prev => [...prev, {
          sender: 'Me',
          text: `Sent screenshot: ${file.name}`,
          fileUrl: blobUrl,
          fileName: file.name,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }])
        setP2pProgress(0)
      }
    }

    const readNextChunk = () => {
      const slice = file.slice(offset, offset + chunkSize)
      reader.readAsArrayBuffer(slice)
    }

    readNextChunk()
  }

  const handleOpenP2PChat = (targetUser) => {
    if (!connected || targetUser.name === username) return
    setP2pTargetUser(targetUser)
    setP2pMessages([])
    setP2pChatOpen(true)
  }

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openChat = () => { setChatOpen(true); setUnreadCount(0) }

  // ── Run code ───────────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (running) return
    setRunning(true)
    setShowOutput(true)
    setOutput('⏳ Running code...')
    setOutputError(false)
    try {
      const res = await fetch(`${BACKEND}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, code }),
      })
      const data = await res.json()
      setOutput(data.output || '(No output)')
      setOutputError(!!data.error)
    } catch {
      setOutput('❌ Could not connect to server. Make sure the backend is running.')
      setOutputError(true)
    } finally {
      setRunning(false)
    }
  }, [language, code, running])

  // ── Toggle view-only mode (PRO/PREMIUM only) ───────────────────────────────
  const toggleViewOnly = async () => {
    if (!isProOrPremium) return
    setToggling(true)
    try {
      const res = await fetch(`${BACKEND}/api/rooms/${roomId}/view-only`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: !viewOnly, ownerToken: localStorage.getItem(`cs_owner_${roomId}`) }),
      })
      const data = await res.json()
      if (res.ok) setViewOnly(data.viewOnlyMode)
    } catch (e) {
      console.error('Toggle view-only failed:', e)
    } finally {
      setToggling(false)
    }
  }

  const planMeta = PLAN_META[plan] || PLAN_META.GUEST
  const canExecute = EXECUTABLE.includes(language)

  return (
    <div className="editor-layout">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="editor-header">
        <div className="header-left">
          <button className="btn btn-ghost btn-icon" id="back-btn" onClick={() => navigate('/')} title="Back to home">
            <IconArrowLeft />
          </button>
          <div className="logo-sm">
            <IconCode />
            <span>CodeShare</span>
          </div>
          <div className="room-id-pill">
            <span className="pulse" />
            <code>{roomId}</code>
          </div>
          <span className={`conn-badge ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? 'Live' : 'Reconnecting…'}
          </span>
        </div>

        <div className="header-center">
          <select
            id="language-select"
            className="select"
            value={language}
            onChange={e => handleLanguageChange(e.target.value)}
            disabled={viewOnly && !isOwner}
          >
            {LANGUAGES.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>

          {/* ── Run button in header ── */}
          <button
            id="run-code-btn"
            className={`btn btn-sm btn-run ${running ? 'running' : ''}`}
            onClick={handleRun}
            disabled={running}
            title="Run code"
          >
            {running ? <Spinner /> : <IconPlay />}
            {running ? 'Running…' : 'Run'}
          </button>
        </div>

        <div className="header-right">
          {/* Plan badge */}
          <span
            className="editor-plan-badge"
            style={{ '--badge-color': planMeta.color }}
            title={`You are on the ${planMeta.label} plan`}
          >
            {plan === 'PREMIUM' ? '🌟' : plan === 'PRO' ? '🟣' : ''}
            {planMeta.label}
          </span>

          {/* View-only toggle — ONLY owner who is PRO/PREMIUM */}
          {isOwner && isProOrPremium && (
            <button
              id="view-only-btn"
              className={`btn btn-sm ${viewOnly ? 'btn-danger' : 'btn-ghost'}`}
              onClick={toggleViewOnly}
              disabled={toggling}
              title={viewOnly ? 'Disable view-only mode' : 'Enable view-only mode'}
            >
              {viewOnly ? <IconEyeOff /> : <IconEye />}
              {viewOnly ? 'View-Only ON' : 'View-Only'}
            </button>
          )}
          {isOwner && !isProOrPremium && (
            <button
              id="view-only-locked-btn"
              className="btn btn-sm btn-ghost"
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
              title="View-only mode requires PRO or PREMIUM plan"
              onClick={() => navigate('/pricing')}
            >
              <IconLock /> View-Only
            </button>
          )}

          {/* Prominent blue Upload Screenshot button in header */}
          <button 
            id="header-upload-btn" 
            className="btn btn-sm btn-primary" 
            style={{ 
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', 
              color: '#fff',
              border: 'none',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: '700'
            }}
            onClick={() => {
              setChatOpen(true)
              setActiveTab('files')
              setTriggerUpload(true)
            }}
            title="Upload Screenshot"
          >
            <IconUploadHeader />
            <span>Upload Screenshot</span>
          </button>

          <button id="chat-btn" className="btn btn-ghost btn-sm" onClick={openChat} title="Open chat">
            <IconChat />
            Chat
            {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
          </button>
          <button
            id="copy-link-btn"
            className={`btn btn-sm ${copied ? 'btn-success-flash' : 'btn-secondary'}`}
            onClick={copyLink}
          >
            {copied ? <IconCheck /> : <IconLink />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </header>

      {/* ── View-only banner ─────────────────────────────────────── */}
      {viewOnly && (
        <div className={`view-only-banner ${isOwner ? 'host-notice' : ''}`}>
          <IconEyeOff /> 
          {isOwner 
            ? <span>Room is in <strong>view-only mode</strong> — only you (the host) can edit.</span>
            : <span>This room is in <strong>view-only mode</strong> — editing is disabled for all users.</span>
          }
        </div>
      )}

      {/* ── Collaborator limit warning ───────────────────────────── */}
      {collabLimitInfo && (
        <div className="collab-limit-banner">
          <span>⚠️ {collabLimitInfo.message}</span>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/pricing')}>Upgrade</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setCollabLimitInfo(null)}>✕</button>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="editor-body">
        {isAuthenticated && (
          <WorkspaceSidebar
            currentRoomId={roomId}
            onSelectRoom={(rId) => navigate(`/room/${rId}`)}
            onCreateRoom={handleCreateRoomInWorkspace}
            userToken={token}
            userId={user?.id}
            username={username}
          />
        )}

        <Sidebar
          users={users}
          roomId={roomId}
          onCopyLink={copyLink}
          copied={copied}
          plan={plan}
          onRun={handleRun}
          running={running}
          canExecute={canExecute}
          language={language}
          onSelectUser={handleOpenP2PChat}
        />

        <div className="editor-and-output">
          <main className="editor-main" style={{ position: 'relative' }}>
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={handleCodeChange}
              theme="vs-dark"
              onMount={(editor, monaco) => {
                editorRef.current = editor
                monacoRef.current = monaco
                editor.onDidChangeCursorPosition(e => {
                  socketRef.current?.emit('cursor-move', { roomId, position: e.position })
                })
              }}
              options={{
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures: true,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 16, bottom: 16 },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                renderLineHighlight: 'line',
                lineNumbers: 'on',
                glyphMargin: false,
                folding: true,
                automaticLayout: true,
                readOnly: viewOnly && !isOwner,
              }}
            />
            {/* View-only overlay (only for non-owners) */}
            {viewOnly && !isOwner && (
              <div className="view-only-overlay">
                <div className="view-only-overlay-badge">
                  <IconEye /> View Only
                </div>
              </div>
            )}
          </main>

          {/* ── Output Panel ─────────────────────────────────────── */}
          {showOutput && (
            <div className={`output-panel ${outputError ? 'output-error' : ''}`}>
              <div className="output-header">
                <div className="output-header-left">
                  <IconTerminal />
                  <span className="output-title">Output</span>
                  {running && <span className="output-running-indicator" />}
                  {!running && !outputError && output && output !== '⏳ Running code...' && (
                    <span className="output-success-badge">✓ Done</span>
                  )}
                </div>
                <div className="output-header-right">
                  <button className="btn btn-ghost btn-sm" onClick={handleRun} disabled={running}>
                    {running ? <Spinner /> : <IconPlay />}
                    Re-run
                  </button>
                  <button className="output-close" onClick={() => setShowOutput(false)} title="Close output">
                    ✕
                  </button>
                </div>
              </div>
              <pre className="output-content">{output}</pre>
            </div>
          )}
        </div>
      </div>

      {/* ── Chat panel ───────────────────────────────────────────── */}
      {chatOpen && (
        <ChatPanel
          messages={chatMessages}
          username={username}
          onSend={handleSendChat}
          onClose={() => setChatOpen(false)}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          sharedFiles={sharedFiles}
          onUploadFile={uploadScreenshot}
          onDeleteFile={deleteScreenshot}
          typingUsers={typingUsers}
          p2pMessages={p2pMessages}
          onSendP2PMessage={sendP2PMessage}
          onSendP2PFile={sendP2PFile}
          p2pTargetUser={p2pTargetUser}
          setP2pTargetUser={setP2pTargetUser}
          p2pStatus={p2pStatus}
          p2pProgress={p2pProgress}
          p2pIncomingFile={p2pIncomingFile}
          users={users}
          onStartP2P={initWebRTCPeer}
          socketId={socketRef.current?.id}
          roomUsers={users}
          onTyping={handleLocalTyping}
          triggerUpload={triggerUpload}
          onResetTriggerUpload={() => setTriggerUpload(false)}
          isHost={isOwner}
          userId={user?.id}
          userWorkspaceRole={workspaceRole}
        />
      )}

      {/* ── Toast notifications ──────────────────────────────────── */}
      <div className="notif-stack">
        {notifications.map(n => (
          <div key={n.id} className={`notif notif-${n.type}`}>
            {n.type === 'join' ? '👋' : n.type === 'leave' ? '👋' : 'ℹ️'} {n.msg}
          </div>
        ))}
      </div>

      {/* ── Ad banner (GUEST & FREE only) ────────────────────────── */}
      {showAds && !adDismissed && (
        <div className="ad-banner">
          <span className="ad-label">AD</span>
          <span className="ad-text">
            🚀 <strong>Upgrade to PRO</strong> — remove ads, unlock unlimited rooms & view-only mode.
          </span>
          <button className="btn btn-primary btn-sm" id="ad-upgrade-btn" onClick={() => navigate('/login')}>
            {isAuthenticated ? 'Upgrade' : 'Sign In'}
          </button>
          <button className="ad-dismiss" onClick={() => setAdDismissed(true)} title="Dismiss">✕</button>
        </div>
      )}
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconArrowLeft() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg> }
function IconCode() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> }
function IconLink() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> }
function IconCheck() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> }
function IconChat() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> }
function IconEye() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> }
function IconEyeOff() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> }
function IconLock() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> }
function IconPlay() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> }
function IconTerminal() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg> }
function IconUploadHeader() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> }
function Spinner() { return <span className="spinner" aria-hidden /> }
