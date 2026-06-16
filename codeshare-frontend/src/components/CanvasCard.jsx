import { useRef } from 'react'

export default function CanvasCard({
  id,
  type,
  title,
  x,
  y,
  w,
  h,
  scale,
  onUpdate,
  onDelete,
  children
}) {
  const cardRef = useRef(null)
  
  // Drag Handler using Pointer Events for unified mouse/touch support
  const handleHeaderPointerDown = (e) => {
    if (e.button !== 0) return // Only left-click drags
    e.preventDefault()
    
    const startX = e.clientX
    const startY = e.clientY
    const startCardX = x
    const startCardY = y
    
    const handlePointerMove = (moveEvent) => {
      // Divide offset by viewport scale to sync pointer tracking at any zoom level
      const deltaX = (moveEvent.clientX - startX) / scale
      const deltaY = (moveEvent.clientY - startY) / scale
      
      onUpdate(id, {
        x: Math.round(startCardX + deltaX),
        y: Math.round(startCardY + deltaY)
      })
    }
    
    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
    
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  }

  // Resize Handler
  const handleResizePointerDown = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation() // Don't drag parent card while resizing
    
    const startX = e.clientX
    const startY = e.clientY
    const startW = w
    const startH = h
    
    const handlePointerMove = (moveEvent) => {
      const deltaW = (moveEvent.clientX - startX) / scale
      const deltaH = (moveEvent.clientY - startY) / scale
      
      onUpdate(id, {
        w: Math.max(320, Math.round(startW + deltaW)), // Minimum width: 320px
        h: Math.max(220, Math.round(startH + deltaH))  // Minimum height: 220px
      })
    }
    
    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
    
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div
      ref={cardRef}
      className={`canvas-card card-type-${type} fade-in`}
      style={{
        transform: `translate(${x}px, ${y}px)`,
        width: `${w}px`,
        height: `${h}px`
      }}
    >
      <div 
        className="card-header"
        onPointerDown={handleHeaderPointerDown}
        title="Drag to move card"
      >
        <div className="card-header-left">
          <span className="card-type-dot" />
          <span className="card-title-text">{title}</span>
        </div>
        <div className="card-header-actions" onPointerDown={e => e.stopPropagation()}>
          {onDelete && (
            <button className="card-close-btn" onClick={() => onDelete(id)} title="Delete Card">
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="card-body">
        {children}
      </div>
      <div 
        className="card-resize-handle"
        onPointerDown={handleResizePointerDown}
        title="Drag to resize card"
      />
    </div>
  )
}
