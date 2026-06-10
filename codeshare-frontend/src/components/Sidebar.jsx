import './Sidebar.css'

export default function Sidebar({ users, roomId, onCopyLink, copied, onRun, running, canExecute, language, onSelectUser }) {
  const roomUrl = `${window.location.origin}/room/${roomId}`

  return (
    <aside className="sidebar">
      {/* Room Info */}
      <div className="sidebar-section">
        <h3 className="sidebar-heading">
          <IconRoom />
          Room
        </h3>
        <div className="room-info-box">
          <div className="room-id-display">
            <span className="ri-label">Room ID</span>
            <code className="ri-value">{roomId}</code>
          </div>
          <button
            id="sidebar-copy-btn"
            className={`btn btn-sm ${copied ? 'btn-success-flash' : 'btn-primary'}`}
            onClick={onCopyLink}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {copied ? <IconCheck /> : <IconShare />}
            {copied ? 'Link Copied!' : 'Share Room Link'}
          </button>
          <p className="share-hint">
            Share this link with teammates to let them join instantly.
          </p>
        </div>
      </div>

      <div className="divider" />

      {/* ── Run Code Button ─────────────────────────── */}
      <div className="sidebar-section">
        <h3 className="sidebar-heading">
          <IconTerminal />
          Execute
        </h3>
        <button
          id="sidebar-run-btn"
          className={`btn sidebar-run-btn ${running ? 'running' : ''}`}
          onClick={onRun}
          disabled={running}
          title={`Run ${language} code`}
        >
          <span className="run-btn-icon">
            {running ? <Spinner /> : <IconPlay />}
          </span>
          <span className="run-btn-text">
            {running ? 'Running…' : 'Run'}
          </span>
        </button>
        <p className="run-hint">
          ▶ Click to execute your {language} code and see the output below the editor.
        </p>
      </div>

      <div className="divider" />

      {/* Connected Users */}
      <div className="sidebar-section">
        <h3 className="sidebar-heading">
          <IconUsers />
          Users <span className="user-count">{users.length}</span>
        </h3>
        <div className="users-list">
          {users.length === 0 ? (
            <p className="no-users">No users connected</p>
          ) : (
            users.map((u, i) => (
              <div 
                key={i} 
                className="user-item clickable" 
                onClick={() => onSelectUser && onSelectUser(u)}
                style={{ cursor: onSelectUser ? 'pointer' : 'default' }}
                title={onSelectUser ? `Click to start P2P Private Chat with ${u.name}` : ''}
              >
                <div className="user-avatar" style={{ background: u.color }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <span className="user-name">{u.name}</span>
                <span className="user-dot" style={{ background: u.color }} title="Online" />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="divider" />

      {/* Tips */}
      <div className="sidebar-section tips-section">
        <h3 className="sidebar-heading">
          <IconTip />
          Tips
        </h3>
        <ul className="tips-list">
          <li>Click <strong>Run</strong> to execute code</li>
          <li>Change language to load samples</li>
          <li>Changes sync instantly to all users</li>
          <li>Use the chat button to chat live</li>
          <li>Press Ctrl+/ to toggle comments</li>
        </ul>
      </div>
    </aside>
  )
}

function IconRoom() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function IconUsers() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
function IconShare() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
}
function IconCheck() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function IconTip() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
}
function IconPlay() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
}
function IconTerminal() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
}
function Spinner() { return <span className="spinner" aria-hidden /> }
