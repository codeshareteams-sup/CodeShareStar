import { useState, useEffect } from 'react'
import { BACKEND_URL } from '../context/AuthContext'
import './WorkspaceSidebar.css'

export default function WorkspaceSidebar({ 
  currentRoomId, 
  onSelectRoom, 
  onCreateRoom, 
  userToken, 
  userId,
  username
}) {
  const [workspaces, setWorkspaces] = useState([])
  const [selectedWorkspace, setSelectedWorkspace] = useState(null)
  const [rooms, setRooms] = useState([])
  const [members, setMembers] = useState([])
  
  // Modals
  const [showCreateWs, setShowCreateWs] = useState(false)
  const [showJoinWs, setShowJoinWs] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [joinWsId, setJoinWsId] = useState('')

  // Load user's workspaces
  useEffect(() => {
    if (!userToken) return
    fetchWorkspaces()
  }, [userToken])

  // Fetch workspaces list
  async function fetchWorkspaces() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/workspaces`, {
        headers: { Authorization: `Bearer ${userToken}` }
      })
      const data = await res.json()
      if (res.ok) {
        setWorkspaces(data)
        if (data.length > 0 && !selectedWorkspace) {
          setSelectedWorkspace(data[0])
        }
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err)
    }
  }

  // Load rooms and members for the selected workspace
  useEffect(() => {
    if (!selectedWorkspace || !userToken) {
      setRooms([])
      setMembers([])
      return
    }
    fetchWorkspaceData(selectedWorkspace.id)
  }, [selectedWorkspace, userToken])

  async function fetchWorkspaceData(wsId) {
    try {
      // 1. Fetch members
      const membersRes = await fetch(`${BACKEND_URL}/api/workspaces/${wsId}/members`, {
        headers: { Authorization: `Bearer ${userToken}` }
      })
      if (membersRes.ok) {
        const membersData = await membersRes.json()
        setMembers(membersData)
      }

      // 2. Fetch rooms mapped to this workspace
      // For Option 3, since rooms are transient or created via REST, 
      // we can fetch from a mock room list associated with this workspace 
      // or query Supabase. Let's do a mock room fetch or default rooms
      // for this workspace to keep it simple, or query standard rooms.
      // We will provide a simple list of mock rooms for the workspace.
      setRooms([
        { id: `ws_${wsId.slice(0, 4)}_general`, name: '💬 general-chat' },
        { id: `ws_${wsId.slice(0, 4)}_editor`, name: '📝 main-editor' },
        { id: `ws_${wsId.slice(0, 4)}_debug`, name: '🐛 debugging' }
      ])
    } catch (err) {
      console.error('Failed to load workspace detail:', err)
    }
  }

  const handleCreateWorkspace = async (e) => {
    e.preventDefault()
    if (!newWsName.trim()) return
    try {
      const res = await fetch(`${BACKEND_URL}/api/workspaces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`
        },
        body: JSON.stringify({ name: newWsName })
      })
      const data = await res.json()
      if (res.ok) {
        setWorkspaces(prev => [...prev, data.workspace])
        setSelectedWorkspace(data.workspace)
        setNewWsName('')
        setShowCreateWs(false)
      }
    } catch (err) {
      console.error('Failed to create workspace:', err)
    }
  }

  const handleJoinWorkspace = async (e) => {
    e.preventDefault()
    if (!joinWsId.trim()) return
    try {
      const res = await fetch(`${BACKEND_URL}/api/workspaces/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`
        },
        body: JSON.stringify({ workspaceId: joinWsId })
      })
      const data = await res.json()
      if (res.ok) {
        setWorkspaces(prev => [...prev, data.workspace])
        setSelectedWorkspace(data.workspace)
        setJoinWsId('')
        setShowJoinWs(false)
      } else {
        alert(data.error || 'Failed to join workspace')
      }
    } catch (err) {
      console.error('Failed to join workspace:', err)
    }
  }

  return (
    <div className="workspace-container">
      {/* Far-left Discord-style icon sidebar */}
      <div className="workspace-icons-bar">
        {workspaces.map(ws => (
          <button 
            key={ws.id} 
            className={`ws-icon-btn ${selectedWorkspace?.id === ws.id ? 'active' : ''}`}
            onClick={() => setSelectedWorkspace(ws)}
            title={ws.name}
          >
            {ws.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
        <button 
          className="ws-action-btn add-btn" 
          onClick={() => setShowCreateWs(true)} 
          title="Create Workspace"
        >
          ＋
        </button>
        <button 
          className="ws-action-btn join-btn" 
          onClick={() => setShowJoinWs(true)} 
          title="Join Workspace"
        >
          🔗
        </button>
      </div>

      {/* Main sidebar column listing channels and members */}
      <div className="workspace-sidebar">
        <div className="ws-header">
          <h3>{selectedWorkspace ? selectedWorkspace.name : 'No Workspace'}</h3>
        </div>

        {selectedWorkspace && (
          <div className="ws-content">
            <div className="section-title">CHANNELS</div>
            <div className="channel-list">
              {rooms.map(room => (
                <button
                  key={room.id}
                  className={`channel-btn ${currentRoomId === room.id ? 'active' : ''}`}
                  onClick={() => onSelectRoom(room.id)}
                >
                  {room.name}
                </button>
              ))}
              <button className="create-room-btn" onClick={() => onCreateRoom(selectedWorkspace.id)}>
                ＋ Create Room
              </button>
            </div>

            <div className="section-title" style={{ marginTop: '20px' }}>MEMBERS</div>
            <div className="member-list">
              {members.map(member => (
                <div key={member.id} className="member-item">
                  <span className="member-status-dot online" />
                  <span className="member-name">{member.username}</span>
                  {member.role === 'owner' && <span className="owner-badge">host</span>}
                </div>
              ))}
            </div>

            <div className="ws-id-share">
              <span className="ws-id-label">Workspace ID:</span>
              <code className="ws-id-code" onClick={() => navigator.clipboard.writeText(selectedWorkspace.id)}>
                {selectedWorkspace.id.slice(0, 8)}... (Copy)
              </code>
            </div>
          </div>
        )}

        {!selectedWorkspace && (
          <div className="no-ws-fallback">
            <p>Create or join a workspace to begin collaborating with your team.</p>
          </div>
        )}
      </div>

      {/* Modal: Create Workspace */}
      {showCreateWs && (
        <div className="ws-modal-overlay">
          <div className="ws-modal">
            <h4>Create a New Workspace</h4>
            <form onSubmit={handleCreateWorkspace}>
              <input 
                type="text" 
                placeholder="Workspace Name" 
                value={newWsName} 
                onChange={e => setNewWsName(e.target.value)}
                required
              />
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowCreateWs(false)}>Cancel</button>
                <button type="submit" className="btn-confirm">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Join Workspace */}
      {showJoinWs && (
        <div className="ws-modal-overlay">
          <div className="ws-modal">
            <h4>Join an Existing Workspace</h4>
            <form onSubmit={handleJoinWorkspace}>
              <input 
                type="text" 
                placeholder="Paste Workspace ID" 
                value={joinWsId} 
                onChange={e => setJoinWsId(e.target.value)}
                required
              />
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowJoinWs(false)}>Cancel</button>
                <button type="submit" className="btn-confirm">Join</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
