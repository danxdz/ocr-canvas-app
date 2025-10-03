// Interactive canvas component for zone selection

import { useRef, useState, useEffect } from 'react';
import type { Zone } from '../types';

interface ZoneCanvasProps {
  imageSrc: string;
  zones: Zone[];
  selectedZoneId: string | null;
  onZoneSelect: (zoneId: string | null) => void;
  onZoneUpdate: (zoneId: string, updates: Partial<Zone>) => void;
  onZoneDelete: (zoneId: string) => void;
  onCanvasClick: (x: number, y: number) => void;
  onZoneResize?: (zoneId: string) => void;
  showOverlay?: boolean;
}

export function ZoneCanvas({
  imageSrc,
  zones,
  selectedZoneId,
  onZoneSelect,
  onZoneUpdate,
  onZoneDelete,
  onCanvasClick,
  onZoneResize,
  showOverlay = false,
}: ZoneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [cursor, setCursor] = useState('crosshair');
  const [draggingBubble, setDraggingBubble] = useState<string | null>(null);

  // Load and draw image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
      drawCanvas();
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Redraw when zones change
  useEffect(() => {
    if (imageLoaded) {
      drawCanvas();
    }
  }, [zones, selectedZoneId, imageLoaded, hoveredZoneId, mousePos, showOverlay]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match image
    canvas.width = img.width;
    canvas.height = img.height;

    // Draw image
    ctx.drawImage(img, 0, 0);

    // Draw zones
    zones.forEach((zone, index) => {
      const { x1, y1, x2, y2 } = zone.bbox;
      const isSelected = zone.id === selectedZoneId;
      const isHovered = zone.id === hoveredZoneId;

      if (showOverlay) {
        // OVERLAY MODE: Draw white opaque boxes with black OCR text
        // Draw white background with proper orientation
        ctx.fillStyle = 'white';
        
        if (zone.polygon && zone.polygon.length >= 4) {
          // Use polygon for rotated boxes
          ctx.beginPath();
          ctx.moveTo(zone.polygon[0][0], zone.polygon[0][1]);
          for (let i = 1; i < zone.polygon.length; i++) {
            ctx.lineTo(zone.polygon[i][0], zone.polygon[i][1]);
          }
          ctx.closePath();
          ctx.fill();
        } else if (zone.text_orientation || zone.rotation) {
          // If no polygon but has rotation, draw rotated rectangle
          const rotationDeg = zone.text_orientation || zone.rotation || 0;
          const rotationRad = (rotationDeg * Math.PI) / 180;
          const centerX = (x1 + x2) / 2;
          const centerY = (y1 + y2) / 2;
          const width = x2 - x1;
          const height = y2 - y1;
          
          ctx.save();
          ctx.translate(centerX, centerY);
          ctx.rotate(rotationRad);
          ctx.fillRect(-width / 2, -height / 2, width, height);
          ctx.restore();
        } else {
          // Standard axis-aligned rectangle
          ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        }
        
        // Draw OCR text on white background with proper size and rotation
        ctx.save(); // Save current context state
        
        // Calculate font size based on zone height (80% of height)
        const zoneHeight = y2 - y1;
        const fontSize = Math.max(10, Math.min(zoneHeight * 0.8, 72)); // Between 10px and 72px
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.fillStyle = 'black';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        // Get rotation angle (in degrees)
        const rotationDeg = zone.text_orientation || zone.rotation || 0;
        const rotationRad = (rotationDeg * Math.PI) / 180;
        
        // Calculate center of zone for rotation
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;
        
        // Translate to center, rotate, then translate back
        ctx.translate(centerX, centerY);
        ctx.rotate(rotationRad);
        
        // Calculate text position (relative to rotated coordinates)
        const zoneWidth = x2 - x1;
        const textX = -zoneWidth / 2 + 5; // Left padding
        const textY = 0; // Center vertically
        
        ctx.fillText(zone.text, textX, textY);
        
        ctx.restore(); // Restore context state
        
        // Draw thin border
        ctx.strokeStyle = isSelected ? '#00FF00' : '#999';
        ctx.lineWidth = isSelected ? 2 : 1;
        if (zone.polygon && zone.polygon.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(zone.polygon[0][0], zone.polygon[0][1]);
          for (let i = 1; i < zone.polygon.length; i++) {
            ctx.lineTo(zone.polygon[i][0], zone.polygon[i][1]);
          }
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        }
      } else {
        // NORMAL MODE: Draw transparent boxes with labels
        ctx.strokeStyle = isSelected ? '#00FF00' : isHovered ? '#00AAFF' : '#0088FF';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.fillStyle = isSelected ? 'rgba(0, 255, 0, 0.1)' : 'rgba(0, 136, 255, 0.05)';

        if (zone.polygon && zone.polygon.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(zone.polygon[0][0], zone.polygon[0][1]);
          for (let i = 1; i < zone.polygon.length; i++) {
            ctx.lineTo(zone.polygon[i][0], zone.polygon[i][1]);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.fill();
        } else {
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
          ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        }

        // Draw label above box
        ctx.fillStyle = isSelected ? '#00FF00' : '#0088FF';
        ctx.font = '14px Arial';
        ctx.fillText(`${zone.text.substring(0, 15)}...`, x1, y1 - 5);
        
        // Draw number bubble
        const bubbleOffset = zone.bubbleOffset || { x: -30, y: -30 };
        const bubbleX = x1 + bubbleOffset.x;
        const bubbleY = y1 + bubbleOffset.y;
        const bubbleRadius = 15;
        
        // Bubble circle
        ctx.fillStyle = '#0088FF';
        ctx.beginPath();
        ctx.arc(bubbleX, bubbleY, bubbleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Bubble number
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${index + 1}`, bubbleX, bubbleY);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }

      // Draw resize handles for selected zone
      if (isSelected) {
        const handleSize = 8;
        ctx.fillStyle = '#00FF00';
        
        // Corners
        ctx.fillRect(x1 - handleSize/2, y1 - handleSize/2, handleSize, handleSize);
        ctx.fillRect(x2 - handleSize/2, y1 - handleSize/2, handleSize, handleSize);
        ctx.fillRect(x1 - handleSize/2, y2 - handleSize/2, handleSize, handleSize);
        ctx.fillRect(x2 - handleSize/2, y2 - handleSize/2, handleSize, handleSize);
        
        // Edges
        ctx.fillRect((x1 + x2)/2 - handleSize/2, y1 - handleSize/2, handleSize, handleSize);
        ctx.fillRect((x1 + x2)/2 - handleSize/2, y2 - handleSize/2, handleSize, handleSize);
        ctx.fillRect(x1 - handleSize/2, (y1 + y2)/2 - handleSize/2, handleSize, handleSize);
        ctx.fillRect(x2 - handleSize/2, (y1 + y2)/2 - handleSize/2, handleSize, handleSize);
      }

      // Draw delete button on hover
      if (isHovered && mousePos) {
        const btnSize = 18;
        const btnX = x2 - btnSize - 3;
        const btnY = y1 + 3;
        
        // Button background
        ctx.fillStyle = 'rgba(255, 68, 68, 0.9)';
        ctx.fillRect(btnX, btnY, btnSize, btnSize);
        
        // X icon
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(btnX + 4, btnY + 4);
        ctx.lineTo(btnX + btnSize - 4, btnY + btnSize - 4);
        ctx.moveTo(btnX + btnSize - 4, btnY + 4);
        ctx.lineTo(btnX + 4, btnY + btnSize - 4);
        ctx.stroke();
      }
    });
  };

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const isPointInPolygon = (x: number, y: number, polygon: number[][]): boolean => {
    // Ray casting algorithm for point-in-polygon test
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const findZoneAtPoint = (x: number, y: number): Zone | null => {
    // Check zones in reverse order (last drawn = top)
    for (let i = zones.length - 1; i >= 0; i--) {
      const zone = zones[i];
      
      // Check polygon if available (for rotated boxes)
      if (zone.polygon && zone.polygon.length >= 4) {
        if (isPointInPolygon(x, y, zone.polygon)) {
          return zone;
        }
      } else {
        // Check axis-aligned bounding box
        const { x1, y1, x2, y2 } = zone.bbox;
        if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
          return zone;
        }
      }
    }
    return null;
  };

  const getResizeHandle = (x: number, y: number, zone: Zone): string | null => {
    const { x1, y1, x2, y2 } = zone.bbox;
    const handleSize = 8;
    const tolerance = handleSize;

    // Check corners first
    if (Math.abs(x - x1) <= tolerance && Math.abs(y - y1) <= tolerance) return 'nw';
    if (Math.abs(x - x2) <= tolerance && Math.abs(y - y1) <= tolerance) return 'ne';
    if (Math.abs(x - x1) <= tolerance && Math.abs(y - y2) <= tolerance) return 'sw';
    if (Math.abs(x - x2) <= tolerance && Math.abs(y - y2) <= tolerance) return 'se';

    // Check edges
    if (Math.abs(x - (x1 + x2) / 2) <= tolerance && Math.abs(y - y1) <= tolerance) return 'n';
    if (Math.abs(x - (x1 + x2) / 2) <= tolerance && Math.abs(y - y2) <= tolerance) return 's';
    if (Math.abs(x - x1) <= tolerance && Math.abs(y - (y1 + y2) / 2) <= tolerance) return 'w';
    if (Math.abs(x - x2) <= tolerance && Math.abs(y - (y1 + y2) / 2) <= tolerance) return 'e';

    return null;
  };

  const isDeleteButtonClicked = (x: number, y: number, zone: Zone): boolean => {
    // For rotated boxes, use the bounding box's top-right for button position
    const { x2, y1 } = zone.bbox;
    const btnSize = 18;
    const btnX = x2 - btnSize - 3;
    const btnY = y1 + 3;
    
    return x >= btnX && x <= btnX + btnSize && y >= btnY && y <= btnY + btnSize;
  };

  const isBubbleClicked = (x: number, y: number, zone: Zone): boolean => {
    const { x1, y1 } = zone.bbox;
    const bubbleOffset = zone.bubbleOffset || { x: -30, y: -30 };
    const bubbleX = x1 + bubbleOffset.x;
    const bubbleY = y1 + bubbleOffset.y;
    const bubbleRadius = 15;
    
    const distance = Math.sqrt((x - bubbleX) ** 2 + (y - bubbleY) ** 2);
    return distance <= bubbleRadius;
  };

  const getCursorForHandle = (handle: string | null): string => {
    if (!handle) return 'crosshair';
    const cursors: Record<string, string> = {
      'nw': 'nw-resize',
      'ne': 'ne-resize',
      'sw': 'sw-resize',
      'se': 'se-resize',
      'n': 'n-resize',
      's': 's-resize',
      'e': 'e-resize',
      'w': 'w-resize',
    };
    return cursors[handle] || 'move';
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoordinates(e);
    
    // Check all zones for bubble clicks first (bubbles are outside zone bounds)
    for (const zone of zones) {
      if (isBubbleClicked(x, y, zone)) {
        setDraggingBubble(zone.id);
        setDragStart({ x, y });
        setIsDrawing(true);
        onZoneSelect(zone.id);
        return;
      }
    }

    // Find zone at click point
    const clickedZone = findZoneAtPoint(x, y);
    
    if (clickedZone) {
      // Check if delete button was clicked
      if (isDeleteButtonClicked(x, y, clickedZone)) {
        onZoneDelete(clickedZone.id);
        return;
      }

      onZoneSelect(clickedZone.id);
      
      // Check if a resize handle was clicked
      const handle = getResizeHandle(x, y, clickedZone);
      if (handle) {
        setResizeHandle(handle);
      }
    } else {
      onZoneSelect(null);
      // Click on empty space - trigger find text at point
      onCanvasClick(x, y);
    }
    
    setDragStart({ x, y });
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoordinates(e);
    setMousePos({ x, y });

    // Check if hovering over any bubble
    let hoveringBubble = false;
    for (const zone of zones) {
      if (isBubbleClicked(x, y, zone)) {
        hoveringBubble = true;
        break;
      }
    }

    // Update hover state
    const hoveredZone = findZoneAtPoint(x, y);
    setHoveredZoneId(hoveredZone?.id || null);

    // Update cursor based on what's under the mouse
    if (hoveringBubble) {
      setCursor('grab');
    } else if (hoveredZone && hoveredZone.id === selectedZoneId) {
      const handle = getResizeHandle(x, y, hoveredZone);
      if (handle) {
        setCursor(getCursorForHandle(handle));
      } else if (isDeleteButtonClicked(x, y, hoveredZone)) {
        setCursor('pointer');
      } else {
        setCursor('move');
      }
    } else if (hoveredZone) {
      setCursor('pointer');
    } else {
      setCursor('crosshair');
    }

    if (!isDrawing || !dragStart) return;

    const dx = x - dragStart.x;
    const dy = y - dragStart.y;

    // If dragging a bubble, update its offset
    if (draggingBubble) {
      const zone = zones.find(z => z.id === draggingBubble);
      if (zone) {
        const currentOffset = zone.bubbleOffset || { x: -30, y: -30 };
        onZoneUpdate(draggingBubble, {
          bubbleOffset: {
            x: currentOffset.x + dx,
            y: currentOffset.y + dy
          }
        });
        setDragStart({ x, y });
      }
      return;
    }

    // If a zone is selected, resize or move it
    if (selectedZoneId) {
      const selectedZone = zones.find(z => z.id === selectedZoneId);
      if (selectedZone) {
        let { x1, y1, x2, y2 } = selectedZone.bbox;

        if (resizeHandle) {
          // Resize based on handle
          if (resizeHandle.includes('n')) y1 += dy;
          if (resizeHandle.includes('s')) y2 += dy;
          if (resizeHandle.includes('w')) x1 += dx;
          if (resizeHandle.includes('e')) x2 += dx;

          // Ensure min size
          if (x2 - x1 < 10) {
            if (resizeHandle.includes('w')) x1 = x2 - 10;
            if (resizeHandle.includes('e')) x2 = x1 + 10;
          }
          if (y2 - y1 < 10) {
            if (resizeHandle.includes('n')) y1 = y2 - 10;
            if (resizeHandle.includes('s')) y2 = y1 + 10;
          }
        } else {
          // Move
          x1 += dx;
          y1 += dy;
          x2 += dx;
          y2 += dy;
        }

        onZoneUpdate(selectedZoneId, {
          bbox: {
            ...selectedZone.bbox,
            x1,
            y1,
            x2,
            y2,
            width: x2 - x1,
            height: y2 - y1,
          },
        });
      }
      setDragStart({ x, y });
    }
  };

  const handleMouseUp = () => {
    // If we were resizing, trigger re-OCR
    if (resizeHandle && selectedZoneId && onZoneResize) {
      onZoneResize(selectedZoneId);
    }
    
    setIsDrawing(false);
    setDragStart(null);
    setResizeHandle(null);
    setDraggingBubble(null);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Delete selected zone with Delete or Backspace key
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedZoneId) {
      onZoneDelete(selectedZoneId);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedZoneId]);

  return (
    <div className="zone-canvas-container">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          border: '1px solid #ccc',
          cursor: isDrawing ? (draggingBubble ? 'grabbing' : resizeHandle ? cursor : 'grabbing') : cursor,
          maxWidth: '100%',
          height: 'auto',
        }}
      />
      
      {!imageLoaded && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          Loading image...
        </div>
      )}
    </div>
  );
}

