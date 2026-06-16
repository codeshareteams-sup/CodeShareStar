import { useState, useRef, useEffect } from 'react'
import CanvasCard from './CanvasCard'
import './CanvasBoard.css'

export default function CanvasBoard({
  cards,
  onUpdateCard,
  onDeleteCard,
  onAddCodeCard,
  onOpenChatCard,
  onUploadTrigger,
  children
}) {
  const containerRef = useRef(null)
  
  // Viewport transformation states
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [scale, setScale] = useState(0.85) // Zoom scale starts at 85% for a nice layout view
  const [isPanning, setIsPanning] = useState(false)

  // Drag-to-Pan Mouse Event Listeners
  const handlePointerDown = (e) => {
    // Pan only on left click over the dotted grid or middle click
    const isBackground = e.target.classList.contains('canvas-board-container') || 
                         e.target.classList.contains('canvas-grid-layer')
    const isMiddleClick = e.button === 1
    
    if (!isBackground && !isMiddleClick) return
    e.preventDefault()
    setIsPanning(true)
    
    const startX = e.clientX
    const startY = e.clientY
    const startPanX = panX
    const startPanY = panY
    
    const handlePointerMove = (moveEvent) => {
      setPanX(startPanX + (moveEvent.clientX - startX))
      setPanY(startPanY + (moveEvent.clientY - startY))
    }
    
    const handlePointerUp = () => {
      setIsPanning(false)
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
    
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  }

  // Zoom to cursor logic
  const handleWheel = (e) => {
    const zoomFactor = 1.08
    let newScale = scale
    if (e.deltaY < 0) {
      newScale = Math.min(2.5, scale * zoomFactor) // Max zoom 250%
    } else {
      newScale = Math.max(0.15, scale / zoomFactor) // Min zoom 15%
    }

    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Keep coordinates under cursor locked in screen position during zoom
    const boardX = (mouseX - panX) / scale
    const boardY = (mouseY - panY) / scale

    setPanX(mouseX - boardX * newScale)
    setPanY(mouseY - boardY * newScale)
    setScale(newScale)
  }

  // Register wheel listener as non-passive to allow e.preventDefault()
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    const handleWheelListener = (e) => {
      e.preventDefault()
      handleWheel(e)
    }
    
    container.addEventListener('wheel', handleWheelListener, { passive: false })
    return () => container.removeEventListener('wheel', handleWheelListener)
  }, [scale, panX, panY])

  // Center view on workspace
  const handleResetView = () => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    // Center at coordinates (0, 0)
    setPanX(rect.width / 2 - 400)
    setPanY(rect.height / 2 - 250)
    setScale(0.85)
  }



  return (
    <div
      ref={containerRef}
      className="canvas-board-container"
      onPointerDown={handlePointerDown}
      tabIndex={0}
    >
      {/* Infinite Dotted Grid Canvas Layer */}
      <div 
        className="canvas-grid-layer"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${scale})`
        }}
      />

      {/* Floating Canvas Workspace Cards wrapper */}
      <div
        className="canvas-board-content"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${scale})`
        }}
      >
        {cards.map(card => (
          <CanvasCard
            key={card.id}
            id={card.id}
            type={card.type}
            title={card.title}
            x={card.x}
            y={card.y}
            w={card.w}
            h={card.h}
            scale={scale}
            onUpdate={onUpdateCard}
            onDelete={onDeleteCard}
          >
            {children(card)}
          </CanvasCard>
        ))}
      </div>

      {/* HUD: ZOOM INDICATOR */}
      <div className="canvas-zoom-hud">
        {Math.round(scale * 100)}%
      </div>



      {/* HUD: FLOATING ACTIONS TOOLBAR */}
      <div className="canvas-toolbar">
        <button className="toolbar-btn btn-primary" onClick={onAddCodeCard}>
          ➕ Add Code Card
        </button>
        <button className="toolbar-btn" onClick={onOpenChatCard}>
          💬 Open Chat Card
        </button>
        <button className="toolbar-btn" onClick={onUploadTrigger}>
          📸 Upload Screenshot
        </button>
        <div className="toolbar-divider" />
        <button className="toolbar-btn" onClick={handleResetView} title="Center Workspace view">
          🗺️ Reset View
        </button>
      </div>
    </div>
  )
}
