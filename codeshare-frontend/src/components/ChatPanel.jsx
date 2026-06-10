import { useState, useRef, useEffect } from 'react'
import './ChatPanel.css'

export default function ChatPanel({
  messages,
  username,
  onSend,
  onClose,
  activeTab,
  setActiveTab,
  sharedFiles,
  onUploadFile,
  onDeleteFile,
  typingUsers,
  p2pMessages,
  onSendP2PMessage,
  onSendP2PFile,
  p2pTargetUser,
  setP2pTargetUser,
  p2pStatus,
  p2pProgress,
  p2pIncomingFile,
  users,
  onStartP2P,
  socketId,
  roomUsers,
  onTyping,
  triggerUpload,
  onResetTriggerUpload,
  isHost,
  userId,
  userWorkspaceRole
}) {
  const [text, setText] = useState('')
  const [p2pText, setP2pText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  
  // New States for Screenshot Upload Modal and Lightbox
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [lightboxImage, setLightboxImage] = useState(null) // holds file object when open

  const bottomRef = useRef(null)
  const p2pBottomRef = useRef(null)
  const fileInputRef = useRef(null)
  const p2pFileRef = useRef(null)

  // Listen to header click trigger
  useEffect(() => {
    if (triggerUpload) {
      fileInputRef.current?.click()
      if (onResetTriggerUpload) onResetTriggerUpload()
    }
  }, [triggerUpload, onResetTriggerUpload])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (activeTab === 'chat') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, activeTab])

  useEffect(() => {
    if (activeTab === 'p2p') {
      p2pBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [p2pMessages, activeTab])

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSendP2P() {
    const trimmed = p2pText.trim()
    if (!trimmed) return
    onSendP2PMessage(trimmed)
    setP2pText('')
  }

  function handleP2PKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendP2P()
    }
  }

  // File selection & Drag/Drop
  function initiateUploadFlow(file) {
    if (file.size > 2 * 1024 * 1024) {
      alert('File size exceeds 2 MB limit! Please upload a smaller image.')
      return
    }
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setCaption('')
    setUploadPercent(0)
  }

  function handleDragOver(e) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e) {
    e.preventDefault()
    setDragOver(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (file.type.startsWith('image/')) {
        initiateUploadFlow(file)
      } else {
        alert('Only image files (jpg, jpeg, png, webp) are supported in the gallery!')
      }
    }
  }

  function handleFileSelect(e) {
    const files = e.target.files
    if (files.length > 0) {
      initiateUploadFlow(files[0])
    }
  }

  function handleP2PFileSelect(e) {
    const files = e.target.files
    if (files.length > 0) {
      onSendP2PFile(files[0])
    }
  }

  const handleUploadSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFile) return
    
    setUploading(true)
    try {
      await onUploadFile(selectedFile, caption, (percent) => {
        setUploadPercent(percent)
      })
      // Reset after success
      setSelectedFile(null)
      setPreviewUrl(null)
      setCaption('')
    } catch (err) {
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  // Deletion permission check
  function canDelete(file) {
    if (!userId) return isHost // For guests, let host decide or only room owner
    if (file.uploader_id === userId) return true
    if (isHost) return true
    if (userWorkspaceRole === 'owner' || userWorkspaceRole === 'admin') return true
    return false
  }

  function formatTime(isoString) {
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString()
    } catch {
      return ''
    }
  }

  // Calculate read receipts for a message
  function getReadReceipts(msg) {
    if (!msg.readBy || !roomUsers) return ''
    const readList = msg.readBy
      .filter(sid => sid !== msg.readBy[0] && sid !== socketId) // exclude sender & current user
      .map(sid => {
        const u = roomUsers.find(user => user.socketId === sid)
        return u ? u.name : null
      })
      .filter(Boolean)

    if (readList.length === 0) return ''
    return `✓ Read by: ${readList.join(', ')}`
  }

  const otherUsers = roomUsers ? roomUsers.filter(u => u.socketId !== socketId) : []
  const activeTyping = Object.values(typingUsers).filter(Boolean)

  return (
    <div className="chat-panel fade-in">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-tabs">
          <button 
            className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button 
            className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            Gallery
          </button>
          <button 
            className={`tab-btn ${activeTab === 'p2p' ? 'active' : ''}`}
            onClick={() => setActiveTab('p2p')}
          >
            P2P Direct
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button 
            className="btn btn-primary btn-sm btn-icon"
            onClick={() => {
              setActiveTab('files')
              setTimeout(() => {
                fileInputRef.current?.click()
              }, 50)
            }}
            title="Upload Screenshot"
            style={{
              padding: '6px',
              background: '#3b82f6',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(59, 130, 246, 0.2)'
            }}
          >
            <IconImage />
          </button>
          <button id="close-chat-btn" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} title="Close">
            <IconX />
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="panel-content">
        
        {/* TAB 1: LIVE CHAT */}
        {activeTab === 'chat' && (
          <div className="tab-pane chat-pane">
            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="chat-empty">
                  <span>💬</span>
                  <p>No messages yet.<br />Say hello!</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`chat-msg ${msg.name === username ? 'own' : ''}`}>
                    {msg.name !== username && (
                      <div className="msg-avatar" style={{ background: msg.color }}>
                        {msg.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="msg-bubble-wrap">
                      {msg.name !== username && (
                        <span className="msg-name" style={{ color: msg.color }}>{msg.name}</span>
                      )}
                      <div className="msg-bubble">
                        <span className="msg-text">{msg.text}</span>
                        <span className="msg-time">{msg.time}</span>
                      </div>
                      {getReadReceipts(msg) && (
                        <span className="msg-read-receipt" title={getReadReceipts(msg)}>
                          {getReadReceipts(msg)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
              {activeTyping.length > 0 && (
                <div className="typing-indicator">
                  <span className="typing-dots">
                    <span></span><span></span><span></span>
                  </span>
                  <span className="typing-text">
                    {activeTyping.join(', ')} {activeTyping.length === 1 ? 'is' : 'are'} typing...
                  </span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="chat-input-row">
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => {
                  setActiveTab('files')
                  setTimeout(() => {
                    fileInputRef.current?.click()
                  }, 50)
                }}
                title="Upload Screenshot"
                style={{ fontSize: '16px', border: 'none', background: 'none', cursor: 'pointer', padding: '6px' }}
              >
                📸
              </button>
              <textarea
                id="chat-input"
                className="chat-textarea"
                placeholder="Type a message… (Enter to send)"
                value={text}
                onChange={e => {
                  setText(e.target.value)
                  if (onTyping) onTyping()
                }}
                onKeyDown={handleKey}
                rows={1}
                maxLength={500}
              />
              <button
                id="send-chat-btn"
                className="btn btn-primary btn-icon"
                onClick={handleSend}
                disabled={!text.trim()}
                title="Send"
              >
                <IconSend />
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: FILES & SCREENSHOTS GALLERY */}
        {activeTab === 'files' && (
          <div className="tab-pane files-pane">
            
            {/* Prominent blue upload button */}
            <button 
              className="btn btn-primary upload-btn-blue"
              onClick={() => fileInputRef.current?.click()}
            >
              <IconImage /> Upload Screenshot
            </button>

            <div 
              className={`dropzone ${dragOver ? 'dragover' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                accept="image/jpeg,image/jpg,image/png,image/webp" 
                style={{ display: 'none' }} 
              />
              <span>📸</span>
              <p>Drag & drop screenshot here<br />or click to browse</p>
              <span className="max-size-hint">Max size: 2 MB (.jpg, .jpeg, .png, .webp)</span>
            </div>

            <div className="gallery-header">
              <span>Shared Gallery</span>
              <span className="gallery-count">{sharedFiles.length} images</span>
            </div>

            <div className="gallery-grid">
              {sharedFiles.length === 0 ? (
                <p className="gallery-empty">No screenshots shared in this room yet.</p>
              ) : (
                sharedFiles.map(file => (
                  <div key={file.id} className="gallery-card">
                    <div className="gallery-thumbnail-container" onClick={() => setLightboxImage(file)}>
                      <img src={file.file_url} alt={file.file_name} className="gallery-thumb" />
                      <div className="gallery-hover-overlay">
                        <IconEyeOpen />
                      </div>
                    </div>
                    
                    <div className="gallery-card-info">
                      {file.caption ? (
                        <p className="file-caption" title={file.caption}>"{file.caption}"</p>
                      ) : (
                        <p className="file-caption-empty">No caption</p>
                      )}
                      
                      <div className="file-meta-row">
                        <span className="file-uploader">By {file.uploaderName || 'Guest'}</span>
                        <span className="file-time">{formatTime(file.created_at)}</span>
                      </div>

                      <div className="file-actions">
                        <a 
                          href={file.file_url} 
                          download={file.file_name} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="action-link"
                          title="Download Image"
                        >
                          <IconDownload />
                        </a>
                        {canDelete(file) && (
                          <button 
                            className="btn-delete-file" 
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm('Are you sure you want to delete this screenshot?')) {
                                onDeleteFile(file.id)
                              }
                            }}
                            title="Delete Image"
                          >
                            <IconTrash />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: P2P DIRECT CHAT (WEBRTC) */}
        {activeTab === 'p2p' && (
          <div className="tab-pane p2p-pane">
            {!p2pTargetUser ? (
              <div className="p2p-setup">
                <span>⚡</span>
                <h4>Peer-to-Peer Direct Chat</h4>
                <p>Establish a direct, encrypted, serverless connection to share files and chat securely.</p>
                <div className="user-select-box">
                  <label>Select a peer online:</label>
                  {otherUsers.length === 0 ? (
                    <p className="no-users-hint">No other users online right now.</p>
                  ) : (
                    <div className="p2p-user-list">
                      {otherUsers.map(u => (
                        <button 
                          key={u.socketId}
                          className="p2p-user-btn"
                          onClick={() => {
                            setP2pTargetUser(u)
                            onStartP2P(u)
                          }}
                        >
                          <span className="user-avatar" style={{ background: u.color }}>
                            {u.name.charAt(0).toUpperCase()}
                          </span>
                          <span>{u.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p2p-active-session">
                <div className="p2p-session-header">
                  <button className="back-btn" onClick={() => setP2pTargetUser(null)}>← Back</button>
                  <div className="peer-info">
                    <span className="peer-name">{p2pTargetUser.name}</span>
                    <span className={`p2p-status-badge ${p2pStatus.toLowerCase()}`}>{p2pStatus}</span>
                  </div>
                </div>

                {p2pStatus === 'Connecting' && (
                  <div className="p2p-connecting-fallback">
                    <div className="p2p-spinner" />
                    <p>Establishing secure Peer-to-Peer channel...</p>
                  </div>
                )}

                {p2pStatus === 'Offline' && (
                  <div className="p2p-offline-fallback">
                    <p>Direct Connection Offline</p>
                    <button className="btn btn-primary" onClick={() => onStartP2P(p2pTargetUser)}>
                      Reconnect
                    </button>
                  </div>
                )}

                {p2pStatus === 'Connected' && (
                  <div className="p2p-connected-chat">
                    <div className="p2p-messages">
                      {p2pMessages.length === 0 ? (
                        <div className="p2p-empty">
                          <p>Connection established.<br />Messages sent here travel directly between your browsers and bypass the server.</p>
                        </div>
                      ) : (
                        p2pMessages.map((msg, idx) => (
                          <div key={idx} className={`p2p-msg ${msg.sender === 'Me' ? 'own' : ''}`}>
                            <div className="msg-bubble">
                              {msg.fileUrl ? (
                                <div className="p2p-image-attachment">
                                  <a href={msg.fileUrl} download={msg.fileName}>
                                    <img src={msg.fileUrl} alt={msg.fileName} />
                                    <span>Download Attachment</span>
                                  </a>
                                </div>
                              ) : (
                                <span className="msg-text">{msg.text}</span>
                              )}
                              <span className="msg-time">{msg.time}</span>
                            </div>
                          </div>
                        ))
                      )}
                      {p2pIncomingFile && (
                        <div className="p2p-incoming-file-alert">
                          <span>📥 Receiving file: {p2pIncomingFile.name}</span>
                          <div className="progress-bar-container">
                            <div className="progress-bar" style={{ width: `${p2pProgress}%` }} />
                          </div>
                          <span className="progress-label">{p2pProgress}%</span>
                        </div>
                      )}
                      <div ref={p2pBottomRef} />
                    </div>

                    {p2pProgress > 0 && !p2pIncomingFile && (
                      <div className="p2p-upload-progress">
                        <span>📤 Sending file: {p2pProgress}%</span>
                        <div className="progress-bar-container">
                          <div className="progress-bar" style={{ width: `${p2pProgress}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="p2p-input-row">
                      <button 
                        className="btn btn-ghost btn-icon" 
                        onClick={() => p2pFileRef.current?.click()}
                        title="Send Direct File"
                      >
                        📎
                      </button>
                      <input 
                        type="file" 
                        ref={p2pFileRef} 
                        onChange={handleP2PFileSelect} 
                        style={{ display: 'none' }} 
                        accept="image/*"
                      />
                      <textarea
                        className="p2p-textarea"
                        placeholder="Direct message…"
                        value={p2pText}
                        onChange={e => setP2pText(e.target.value)}
                        onKeyDown={handleP2PKey}
                        rows={1}
                      />
                      <button
                        className="btn btn-primary btn-icon"
                        onClick={handleSendP2P}
                        disabled={!p2pText.trim()}
                      >
                        <IconSend />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── SCREENSHOT UPLOAD MODAL (CAPTION & PROGRESS) ── */}
      {selectedFile && (
        <div className="ws-modal-overlay">
          <div className="ws-modal screenshot-upload-modal">
            <h4>Upload Screenshot</h4>
            <form onSubmit={handleUploadSubmit}>
              <div className="modal-preview-container">
                <img src={previewUrl} alt="Upload Preview" className="upload-preview-image" />
              </div>
              
              <div className="modal-input-group">
                <label>Caption (Optional)</label>
                <input 
                  type="text" 
                  placeholder="Describe this screenshot..." 
                  value={caption} 
                  onChange={e => setCaption(e.target.value)}
                  disabled={uploading}
                />
              </div>

              {uploading && (
                <div className="upload-progress-container">
                  <div className="progress-bar-container">
                    <div className="progress-bar" style={{ width: `${uploadPercent}%` }} />
                  </div>
                  <span className="upload-progress-text">Uploading: {uploadPercent}%</span>
                </div>
              )}

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-cancel" 
                  onClick={() => {
                    setSelectedFile(null)
                    setPreviewUrl(null)
                  }}
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-confirm upload-confirm-btn"
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── FULL SCREEN LIGHTBOX PREVIEW MODAL ── */}
      {lightboxImage && (
        <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <button className="lightbox-close" onClick={() => setLightboxImage(null)}>✕</button>
          
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxImage.file_url} alt={lightboxImage.file_name} className="lightbox-image" />
            
            <div className="lightbox-metadata">
              <div className="lightbox-meta-left">
                {lightboxImage.caption && <h4 className="lightbox-caption">"{lightboxImage.caption}"</h4>}
                <p className="lightbox-sub">Uploaded by <strong>{lightboxImage.uploaderName || 'Guest'}</strong> on {formatTime(lightboxImage.created_at)}</p>
              </div>
              <div className="lightbox-meta-right">
                <a 
                  href={lightboxImage.file_url} 
                  download={lightboxImage.file_name} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn btn-primary lightbox-download-btn"
                >
                  <IconDownload /> Download
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Icons ──
function IconX() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}
function IconSend() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
}
function IconImage() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
}
function IconEyeOpen() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
}
function IconDownload() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
}
function IconTrash() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
}
