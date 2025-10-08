// Interactive canvas component for zone selection

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type { Zone } from '../types';

interface ZoneCanvasProps {
  imageSrc: string;
  zones: Zone[];
  selectedZoneId: string | null;
  onZoneSelect: (zoneId: string | null) => void;
  onZoneUpdate: (zoneId: string, updates: Partial<Zone>) => void;
  onZoneDelete: (zoneId: string) => void;
  onCanvasClick: (x: number, y: number, rectangleData?: { rectangleBounds: { x1: number, y1: number, x2: number, y2: number }, width: number, height: number }) => void;
  onZoneResize?: (zoneId: string) => void;
  onZoneResizeComplete?: (zoneId: string) => void;
  showOverlay?: boolean;
  onTextEdit?: (zoneId: string, newText: string) => void;
  showBalloons?: boolean;
}

// Debounce utility
const useDebounce = (value: any, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

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
  onTextEdit,
  showBalloons = true,
}: ZoneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const hideDeleteButtonTimeoutRef = useRef<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState('crosshair');
  const [draggingBubble, setDraggingBubble] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [localZoneUpdates, setLocalZoneUpdates] = useState<Record<string, Partial<Zone>>>({});
  const [hoveredZoneForCard, setHoveredZoneForCard] = useState<Zone | null>(null);
  const [cardPosition, setCardPosition] = useState<{ x: number; y: number } | null>(null);
  const [isHoveringCard, setIsHoveringCard] = useState(false);
  const [isDraggingZone, setIsDraggingZone] = useState(false);
  const [isDrawingRectangle, setIsDrawingRectangle] = useState(false);
  const [rectangleStart, setRectangleStart] = useState<{ x: number; y: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const hideCardTimeoutRef = useRef<number | null>(null);

  // Debounce mouse position to reduce redraws
  const debouncedMousePos = useDebounce(mousePos, 16); // ~60fps

  // Memoize expensive calculations
  const memoizedZones = useMemo(() => zones, [zones]);
  const memoizedSelectedZoneId = useMemo(() => selectedZoneId, [selectedZoneId]);
  const memoizedHoveredZoneId = useMemo(() => hoveredZoneId, [hoveredZoneId]);

  // Calculate middle tolerance value and update zone
  const updateToleranceCalculation = (zone: Zone) => {
    const minInput = document.getElementById(`min-${zone.id}`) as HTMLInputElement;
    const maxInput = document.getElementById(`max-${zone.id}`) as HTMLInputElement;
    const calcInput = document.getElementById(`calc-${zone.id}`) as HTMLInputElement;
    
    if (minInput && maxInput && calcInput && zone) {
      const minVal = parseFloat(minInput.value) || 0;
      const maxVal = parseFloat(maxInput.value) || 0;
      
      // Extract base value from the specific zone's OCR text
      const match = zone.text.match(/(\d+\.?\d*)/);
      const baseValue = match ? parseFloat(match[1]) : 0;
      
      // Calculate: (OCR value + tol min) + (OCR val + tol max) / 2
      const calculated = (baseValue + minVal + baseValue + maxVal) / 2;
      calcInput.value = calculated.toFixed(3);
      
      // Update the zone with new tolerance info
      const updatedToleranceInfo = {
        ...zone.tolerance_info,
        min_tolerance: minVal,
        max_tolerance: maxVal,
        middle_value: calculated
      };
      onZoneUpdate(zone.id, { tolerance_info: updatedToleranceInfo });
    }
  };

  // ISO 2786 tolerance calculation function
  const getISOTolerance = (type: 'min' | 'max', text: string): string => {
    // Extract numeric value from text
    const match = text.match(/(\d+\.?\d*)/);
    if (!match) return '';
    
    const value = parseFloat(match[1]);
    
    // ISO 2786 tolerance calculation (IT grades 6-16)
    // For basic dimensions, use IT7 tolerance
    const it7Tolerances: { [key: number]: { min: number; max: number } } = {
      0.1: { min: -0.010, max: 0.010 },
      0.2: { min: -0.012, max: 0.012 },
      0.3: { min: -0.015, max: 0.015 },
      0.5: { min: -0.018, max: 0.018 },
      0.8: { min: -0.022, max: 0.022 },
      1.0: { min: -0.025, max: 0.025 },
      1.2: { min: -0.028, max: 0.028 },
      1.5: { min: -0.032, max: 0.032 },
      2.0: { min: -0.038, max: 0.038 },
      2.5: { min: -0.045, max: 0.045 },
      3.0: { min: -0.052, max: 0.052 },
      4.0: { min: -0.062, max: 0.062 },
      5.0: { min: -0.075, max: 0.075 },
      6.0: { min: -0.090, max: 0.090 },
      8.0: { min: -0.110, max: 0.110 },
      10.0: { min: -0.130, max: 0.130 },
      12.0: { min: -0.150, max: 0.150 },
      16.0: { min: -0.180, max: 0.180 },
      20.0: { min: -0.210, max: 0.210 },
      25.0: { min: -0.250, max: 0.250 },
      30.0: { min: -0.300, max: 0.300 },
      40.0: { min: -0.350, max: 0.350 },
      50.0: { min: -0.400, max: 0.400 },
      60.0: { min: -0.460, max: 0.460 },
      80.0: { min: -0.540, max: 0.540 },
      100.0: { min: -0.630, max: 0.630 }
    };
    
    // Find closest tolerance range
    let closestKey = 0;
    let minDiff = Infinity;
    for (const key of Object.keys(it7Tolerances).map(Number)) {
      const diff = Math.abs(value - key);
      if (diff < minDiff) {
        minDiff = diff;
        closestKey = key;
      }
    }
    
    const tolerance = it7Tolerances[closestKey];
    return type === 'min' ? tolerance.min.toString() : tolerance.max.toString();
  };

  // Load and draw image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    // Canvas redraw

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match image
    canvas.width = img.width;
    canvas.height = img.height;

    // Draw image
    ctx.drawImage(img, 0, 0);

    // Draw zones using memoized values with local updates
    memoizedZones.forEach((zone, index) => {
      // Apply local updates if they exist (for immediate visual feedback)
      const localUpdate = localZoneUpdates[zone.id];
      const effectiveZone = localUpdate ? { ...zone, ...localUpdate } : zone;
      
      // Use effective zone coordinates for drawing
      
      const { x1, y1, x2, y2 } = effectiveZone.bbox;
      const isSelected = effectiveZone.id === memoizedSelectedZoneId;
      const isHovered = effectiveZone.id === memoizedHoveredZoneId;

      // Apply small adjustment to better align with visual text
      const textAlignmentOffset = 2; // Small upward adjustment to align with visual text
      const adjustedY1 = y1 - textAlignmentOffset;
      const adjustedY2 = y2 - textAlignmentOffset;

      if (showOverlay) {
        // OVERLAY MODE: Draw white opaque boxes with black OCR text
        // Draw white background with proper orientation
        ctx.fillStyle = 'white';
        
        if (zone.polygon && zone.polygon.length >= 4) {
          // Use polygon for rotated boxes
          ctx.beginPath();
          ctx.moveTo(zone.polygon[0][0], zone.polygon[0][1] - textAlignmentOffset);
          for (let i = 1; i < zone.polygon.length; i++) {
            ctx.lineTo(zone.polygon[i][0], zone.polygon[i][1] - textAlignmentOffset);
          }
          ctx.closePath();
          ctx.fill();
        } else if (zone.text_orientation || zone.rotation) {
          // If no polygon but has rotation, draw rotated rectangle
          const rotationDeg = zone.text_orientation || zone.rotation || 0;
          const rotationRad = (rotationDeg * Math.PI) / 180;
          const centerX = (x1 + x2) / 2;
          const centerY = (adjustedY1 + adjustedY2) / 2;
          const width = x2 - x1;
          const height = adjustedY2 - adjustedY1;
          
          ctx.save();
          ctx.translate(centerX, centerY);
          ctx.rotate(rotationRad);
          ctx.fillRect(-width / 2, -height / 2, width, height);
          ctx.restore();
        } else {
          // Standard axis-aligned rectangle with alignment adjustment
          ctx.fillRect(x1, adjustedY1, x2 - x1, adjustedY2 - adjustedY1);
        }
        
        // Draw OCR text on white background with proper size and rotation
        ctx.save(); // Save current context state
        
        // Use consistent font size for all overlay text
        const fontSize = 13; // Same as bubble numbers
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.fillStyle = 'black';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        // Get rotation angle (in degrees)
        const rotationDeg = zone.text_orientation || zone.rotation || 0;
        const rotationRad = (rotationDeg * Math.PI) / 180;
        
        // Calculate center of zone for rotation
        const centerX = (x1 + x2) / 2;
        const centerY = (adjustedY1 + adjustedY2) / 2;
        
        // Translate to center, rotate, then translate back
        ctx.translate(centerX, centerY);
        ctx.rotate(rotationRad);
        
        // Calculate text position (relative to rotated coordinates)
        const zoneWidth = x2 - x1;
        const textX = -zoneWidth / 2 + 5; // Left padding
        const textY = 0; // Center vertically
        
        ctx.fillText(zone.text, textX, textY);
        
        ctx.restore(); // Restore context state
        
        // Draw thin border with adjusted coordinates
        ctx.strokeStyle = isSelected ? '#00FF00' : '#999';
        ctx.lineWidth = isSelected ? 2 : 1;
        if (zone.polygon && zone.polygon.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(zone.polygon[0][0], zone.polygon[0][1] - textAlignmentOffset);
          for (let i = 1; i < zone.polygon.length; i++) {
            ctx.lineTo(zone.polygon[i][0], zone.polygon[i][1] - textAlignmentOffset);
          }
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.strokeRect(x1, adjustedY1, x2 - x1, adjustedY2 - adjustedY1);
        }
      } else {
        // NORMAL MODE: Draw transparent boxes with labels
        ctx.strokeStyle = isSelected ? '#00FF00' : isHovered ? '#00AAFF' : '#0088FF';
        ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 2; // Thicker on hover
        ctx.fillStyle = isSelected ? 'rgba(0, 255, 0, 0.1)' : isHovered ? 'rgba(0, 170, 255, 0.08)' : 'rgba(0, 136, 255, 0.05)';

        if (zone.polygon && zone.polygon.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(zone.polygon[0][0], zone.polygon[0][1] - textAlignmentOffset);
          for (let i = 1; i < zone.polygon.length; i++) {
            ctx.lineTo(zone.polygon[i][0], zone.polygon[i][1] - textAlignmentOffset);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.fill();
        } else {
          ctx.strokeRect(x1, adjustedY1, x2 - x1, adjustedY2 - adjustedY1);
          ctx.fillRect(x1, adjustedY1, x2 - x1, adjustedY2 - adjustedY1);
        }

        // Draw number bubble (no text labels - keep boxes clean)
        if (showBalloons && !isDraggingZone) {
          // Use stored bubble position or smart default positioning
          const bubbleRadius = 15;
          
          // Smart default positioning - very close to box corner
          let defaultOffset = { x: -bubbleRadius + 5, y: -bubbleRadius + 5 }; // Overlapping slightly with box
          
          // Get stored position or use smart default
          const bubbleOffset = zone.bubbleOffset || defaultOffset;
          let bubbleX = x1 + bubbleOffset.x;
          let bubbleY = adjustedY1 + bubbleOffset.y; // Use adjusted Y position
          
          // Ensure bubble stays within canvas bounds with smart repositioning
          if (bubbleX < bubbleRadius + 5) {
            bubbleX = x2 + bubbleRadius + 2; // Move to right side
          }
          if (bubbleY < bubbleRadius + 5) {
            bubbleY = adjustedY2 + bubbleRadius + 2; // Move to bottom side
          }
          if (bubbleX > canvas.width - bubbleRadius - 5) {
            bubbleX = x1 - bubbleRadius - 2; // Move to left side
          }
          if (bubbleY > canvas.height - bubbleRadius - 5) {
            bubbleY = adjustedY1 - bubbleRadius - 2; // Move to top side
          }
          
          // Store the adjusted position back to the zone
          if (!zone.bubbleOffset) {
            zone.bubbleOffset = { x: bubbleX - x1, y: bubbleY - adjustedY1 };
          }
          
          // Bubble circle with translucent background
          ctx.fillStyle = 'rgba(0, 136, 255, 0.7)'; // 70% opacity
          ctx.beginPath();
          ctx.arc(bubbleX, bubbleY, bubbleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // Bubble number with dark text
          ctx.fillStyle = '#1a1a1a'; // Dark gray, almost black
          ctx.font = 'bold 13px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${index + 1}`, bubbleX, bubbleY);
          ctx.textAlign = 'start';
          ctx.textBaseline = 'alphabetic';
        }
      }

      // Draw delete button aligned to right border, outside top border
      if (isHovered && debouncedMousePos && !showOverlay) {
        const btnSize = 16;
        const offset = 4;
        const btnX = x2 - btnSize; // Aligned to right border (inside)
        const btnY = adjustedY1 - offset - btnSize; // Outside top border (using adjusted position)
        
        // Draw square button background
        ctx.fillStyle = 'rgba(255, 59, 48, 0.95)';
        ctx.fillRect(btnX, btnY, btnSize, btnSize);
        
        // Draw white border
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(btnX, btnY, btnSize, btnSize);
        
        // Draw X icon
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(btnX + 4, btnY + 4);
        ctx.lineTo(btnX + btnSize - 4, btnY + btnSize - 4);
        ctx.moveTo(btnX + btnSize - 4, btnY + 4);
        ctx.lineTo(btnX + 4, btnY + btnSize - 4);
        ctx.stroke();
      }
      
      // Hover card will be rendered as HTML component (see below)
    });

    // Draw rectangle being drawn for annotation
    if (isDrawingRectangle && rectangleStart && debouncedMousePos) {
      const { x: startX, y: startY } = rectangleStart;
      const { x: endX, y: endY } = debouncedMousePos;
      
      const x1 = Math.min(startX, endX);
      const y1 = Math.min(startY, endY);
      const x2 = Math.max(startX, endX);
      const y2 = Math.max(startY, endY);
      
      // Draw rectangle outline
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.setLineDash([]);
    }
  }, [memoizedZones, memoizedSelectedZoneId, memoizedHoveredZoneId, debouncedMousePos, showOverlay, showBalloons, isDraggingZone, isDrawingRectangle, rectangleStart, localZoneUpdates]);

  // Optimized redraw with proper dependencies
  useEffect(() => {
    if (imageLoaded) {
      drawCanvas();
    }
  }, [imageLoaded, memoizedZones, memoizedSelectedZoneId, memoizedHoveredZoneId, debouncedMousePos, showOverlay, drawCanvas, localZoneUpdates]);

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
      
      // Always check axis-aligned bounding box first (more reliable)
      const { x1, y1, x2, y2 } = zone.bbox;
      const inBbox = x >= x1 && x <= x2 && y >= y1 && y <= y2;
      
      if (inBbox) {
        // If polygon exists and is valid, do additional polygon check
        if (zone.polygon && zone.polygon.length >= 4 && zone.polygon.every(p => p.length >= 2)) {
          if (isPointInPolygon(x, y, zone.polygon)) {
            return zone;
          }
        } else {
          // No polygon or invalid polygon, use bounding box
          return zone;
        }
      }
    }
    return null;
  };


  const isDeleteButtonClicked = (x: number, y: number, zone: Zone): boolean => {
    // Delete button aligned to right border, outside top border
    const { x2, y1 } = zone.bbox;
    const btnSize = 16;
    const offset = 4;
    const btnX = x2 - btnSize; // Aligned to right border
    const btnY = y1 - offset - btnSize; // Outside top border
    
    const clicked = x >= btnX && x <= btnX + btnSize && y >= btnY && y <= btnY + btnSize;
    return clicked;
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
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    // Check all zones for delete button clicks (delete buttons are outside zone bounds)
    for (const zone of zones) {
      if (isDeleteButtonClicked(x, y, zone)) {
        onZoneDelete(zone.id);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    // Find zone at click point
    const clickedZone = findZoneAtPoint(x, y);
    
    if (clickedZone) {
      onZoneSelect(clickedZone.id);
      
      // Check if we're starting a resize operation
      const { x1, y1, x2, y2 } = clickedZone.bbox;
      const edgeThreshold = 15;
      const textAlignmentOffset = 2;
      const adjustedY1 = y1 - textAlignmentOffset;
      const adjustedY2 = y2 - textAlignmentOffset;
      
      const nearLeft = Math.abs(x - x1) < edgeThreshold;
      const nearRight = Math.abs(x - x2) < edgeThreshold;
      const nearTop = Math.abs(y - adjustedY1) < edgeThreshold;
      const nearBottom = Math.abs(y - adjustedY2) < edgeThreshold;
      
      const isResizingOperation = nearLeft || nearRight || nearTop || nearBottom;
      setIsResizing(isResizingOperation);
      
      // Start dragging the zone
      setIsDraggingZone(true);
      setIsDrawing(true);
      setDragStart({ x, y });
    } else {
      // Click on empty space - start drawing rectangle for annotation
      onZoneSelect(null);
      setDragStart({ x, y });
      setIsDrawing(true);
      setIsDrawingRectangle(true);
      setRectangleStart({ x, y });
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoordinates(e);
    
    // Double-click on empty space - trigger find text at point
    const clickedZone = findZoneAtPoint(x, y);
    if (!clickedZone) {
      // Check if we're not too close to an existing zone
      const tooCloseToExisting = zones.some(zone => {
        const margin = 20; // Minimum distance from existing zones
        const x1 = zone.bbox.x1 - margin;
        const y1 = zone.bbox.y1 - margin;
        const x2 = zone.bbox.x2 + margin;
        const y2 = zone.bbox.y2 + margin;
        return x >= x1 && x <= x2 && y >= y1 && y <= y2;
      });
      
      if (!tooCloseToExisting) {
        onCanvasClick(x, y);
      }
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoordinates(e);
    setMousePos({ x, y });

    // Check if hovering over any bubble
    let hoveringBubble = false;
    for (const zone of memoizedZones) {
      if (isBubbleClicked(x, y, zone)) {
        hoveringBubble = true;
        break;
      }
    }

    // Update hover state with timeout for delete button
    let hoveredZone = findZoneAtPoint(x, y);
    
    // If no zone found at point, check if mouse is over delete button of any hovered zone
    if (!hoveredZone && hoveredZoneId) {
      const currentHoveredZone = zones.find(z => z.id === hoveredZoneId);
      if (currentHoveredZone && isDeleteButtonClicked(x, y, currentHoveredZone)) {
        // Mouse is over delete button, keep the zone hovered
        hoveredZone = currentHoveredZone;
      }
    }
    
    if (hoveredZone) {
      // Clear any existing timeout
      if (hideDeleteButtonTimeoutRef.current) {
        clearTimeout(hideDeleteButtonTimeoutRef.current);
        hideDeleteButtonTimeoutRef.current = null;
      }
      setHoveredZoneId(hoveredZone.id);
    } else {
      // Set timeout to hide delete button after delay
      if (hideDeleteButtonTimeoutRef.current) {
        clearTimeout(hideDeleteButtonTimeoutRef.current);
      }
      hideDeleteButtonTimeoutRef.current = setTimeout(() => {
        setHoveredZoneId(null);
      }, 300); // 300ms delay before hiding delete button
    }
    
    // Update hover card position and zone (allow cards even with overlay)
    if (hoveredZone) {
      // Clear any pending hide timeout
      if (hideCardTimeoutRef.current) {
        clearTimeout(hideCardTimeoutRef.current);
        hideCardTimeoutRef.current = null;
      }
      
      // Only update card position if the hovered zone changed
      if (hoveredZoneForCard?.id !== hoveredZone.id) {
        setHoveredZoneForCard(hoveredZone);
        const canvas = canvasRef.current;
        const rect = canvas?.getBoundingClientRect();
        if (rect && canvas) {
          // Calculate proper scaling between canvas internal size and display size
          const scaleX = rect.width / canvas.width;
          const scaleY = rect.height / canvas.height;
          
          // Convert zone coordinates to screen coordinates
          const screenX = rect.left + (hoveredZone.bbox.x2 * scaleX); // Use right edge (x2)
          const boxTop = rect.top + (hoveredZone.bbox.y1 * scaleY); // Box top edge
          const boxBottom = rect.top + (hoveredZone.bbox.y2 * scaleY); // Box bottom edge
          const boxCenterY = (boxTop + boxBottom) / 2; // Center of the box
          
          // Set initial position with better card height estimate
          const estimatedCardHeight = 120; // Reduced height estimate
          const cardX = screenX + 10; // Start 10px to the right of right border (outside)
          const cardY = boxTop; // Position card exactly at top border of zone box
          
          // Check viewport bounds - only adjust if really necessary
          const viewportHeight = window.innerHeight;
          let finalY = cardY;
          
          // Only push card up if it would go off the bottom of the screen
          if (finalY + estimatedCardHeight > viewportHeight - 20) {
            finalY = Math.max(10, viewportHeight - estimatedCardHeight - 20);
          }
          
          // Ensure card doesn't go above the viewport
          if (finalY < 10) {
            finalY = 10;
          }
          
          setCardPosition({
            x: cardX,
            y: finalY
          });
        }
        // Set editing text to the specific zone's text
        setEditingText(hoveredZone.text);
        
        // Calculate initial middle tolerance value
        setTimeout(() => {
          updateToleranceCalculation(hoveredZone);
        }, 100); // Small delay to ensure inputs are rendered
      }
    } else if (!isHoveringCard) {
      // Only hide card if not hovering over the card itself
      if (hideCardTimeoutRef.current) {
        clearTimeout(hideCardTimeoutRef.current);
      }
      hideCardTimeoutRef.current = setTimeout(() => {
        setHoveredZoneForCard(null);
        setCardPosition(null);
      }, 300); // 300ms delay before hiding
    }

    // Update cursor based on what's under the mouse
    if (hoveringBubble) {
      setCursor('grab');
    } else if (hoveredZone && hoveredZone.id === selectedZoneId) {
      if (isDeleteButtonClicked(x, y, hoveredZone)) {
        setCursor('pointer');
      } else {
        // Check for resize cursors when near edges
        const { x1, y1, x2, y2 } = hoveredZone.bbox;
        const edgeThreshold = 15;
        
        // Apply same alignment offset as drawing
        const textAlignmentOffset = 2;
        const adjustedY1 = y1 - textAlignmentOffset;
        const adjustedY2 = y2 - textAlignmentOffset;
        
        const nearLeft = Math.abs(x - x1) < edgeThreshold;
        const nearRight = Math.abs(x - x2) < edgeThreshold;
        const nearTop = Math.abs(y - adjustedY1) < edgeThreshold;
        const nearBottom = Math.abs(y - adjustedY2) < edgeThreshold;
        
        if (nearLeft && nearTop) {
          setCursor('nw-resize');
        } else if (nearRight && nearTop) {
          setCursor('ne-resize');
        } else if (nearLeft && nearBottom) {
          setCursor('sw-resize');
        } else if (nearRight && nearBottom) {
          setCursor('se-resize');
        } else if (nearLeft || nearRight) {
          setCursor('ew-resize');
        } else if (nearTop || nearBottom) {
          setCursor('ns-resize');
        } else {
          setCursor('move');
        }
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
      const zone = memoizedZones.find(z => z.id === draggingBubble);
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

    // If drawing a rectangle for annotation
    if (isDrawingRectangle && rectangleStart && dragStart) {
      // Update rectangle end position
      setMousePos({ x, y });
      return;
    }

    // If a zone is selected and we're dragging it (not drawing rectangle), resize or move it
    if (memoizedSelectedZoneId && isDrawing && !isDrawingRectangle) {
      const selectedZone = memoizedZones.find(z => z.id === memoizedSelectedZoneId);
      if (selectedZone) {
        if (!dragStart) {
          setDragStart({ x, y });
          return;
        }
        
        let { x1, y1, x2, y2 } = selectedZone.bbox;
        
        if (isResizing) {
          // Resize the zone based on initial click position
          const edgeThreshold = 15;
          const textAlignmentOffset = 2;
          const adjustedY1 = y1 - textAlignmentOffset;
          const adjustedY2 = y2 - textAlignmentOffset;
          
          // Check which edge was clicked initially (we need to store this)
          const nearLeft = Math.abs(dragStart.x - x1) < edgeThreshold;
          const nearRight = Math.abs(dragStart.x - x2) < edgeThreshold;
          const nearTop = Math.abs(dragStart.y - adjustedY1) < edgeThreshold;
          const nearBottom = Math.abs(dragStart.y - adjustedY2) < edgeThreshold;
          
          // Resize based on which edge was clicked
          if (nearLeft) x1 += dx;
          if (nearRight) x2 += dx;
          if (nearTop) y1 += dy;
          if (nearBottom) y2 += dy;
          
          // Ensure minimum size
          const minSize = 10;
          if (x2 - x1 < minSize) {
            if (nearLeft) x1 = x2 - minSize;
            else x2 = x1 + minSize;
          }
          if (y2 - y1 < minSize) {
            if (nearTop) y1 = y2 - minSize;
            else y2 = y1 + minSize;
          }
        } else {
          // Move the zone
          x1 += dx;
          y1 += dy;
          x2 += dx;
          y2 += dy;
        }

        // Store updates during drag - use local updates to prevent conflicts
        setLocalZoneUpdates({
          ...localZoneUpdates,
          [memoizedSelectedZoneId]: {
            bbox: {
              ...selectedZone.bbox,
              x1, y1, x2, y2,
              width: x2 - x1,
              height: y2 - y1,
            }
          }
        });
        
        // Update drag start position for next iteration
        setDragStart({ x, y });
      }
    }
  }, [memoizedZones, memoizedSelectedZoneId, isDrawing, dragStart, draggingBubble, isDrawingRectangle, rectangleStart, onZoneUpdate, imageLoaded, localZoneUpdates, isResizing]);

  const handleMouseUp = () => {
    // Apply local updates to actual zones before clearing
    Object.entries(localZoneUpdates).forEach(([zoneId, updates]) => {
      onZoneUpdate(zoneId, updates);
    });
    
    // Clear local updates when mouse is released
    setLocalZoneUpdates({});
    
    // If we were drawing a rectangle, finish it
    if (isDrawingRectangle && rectangleStart && dragStart && mousePos) {
      const { x: startX, y: startY } = rectangleStart;
      const { x: endX, y: endY } = mousePos;
      
      // Create rectangle bounds
      const x1 = Math.min(startX, endX);
      const y1 = Math.min(startY, endY);
      const x2 = Math.max(startX, endX);
      const y2 = Math.max(startY, endY);
      
      // Only create rectangle if it has minimum size
      if (x2 - x1 > 10 && y2 - y1 > 10) {
        // Send the entire rectangle bounds to the server for better OCR detection
        // This will help with rotated text like "11.5" at 90°
        onCanvasClick((x1 + x2) / 2, (y1 + y2) / 2, { 
          rectangleBounds: { x1, y1, x2, y2 },
          width: x2 - x1,
          height: y2 - y1
        });
      }
    }
    
    setIsDrawing(false);
    setDragStart(null);
    setDraggingBubble(null);
    setIsDraggingZone(false);
    setIsDrawingRectangle(false);
    setRectangleStart(null);
    setIsResizing(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Check if user is typing in an input field
    const target = e.target as HTMLElement;
    const isEditingText = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    
    // Only delete zone if NOT editing text
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedZoneId && !isEditingText) {
      e.preventDefault(); // Prevent browser back navigation on Backspace
      onZoneDelete(selectedZoneId);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // Cleanup all timeouts
      if (hideDeleteButtonTimeoutRef.current) {
        clearTimeout(hideDeleteButtonTimeoutRef.current);
      }
      if (hideCardTimeoutRef.current) {
        clearTimeout(hideCardTimeoutRef.current);
      }
    };
  }, [selectedZoneId]);


  return (
    <div className="zone-canvas-container">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        style={{
          border: '1px solid #ccc',
          cursor: isDrawing ? (draggingBubble ? 'grabbing' : 'grabbing') : cursor,
          maxWidth: '100%',
          height: 'auto',
        }}
      />
      
      {!imageLoaded && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          Loading image...
        </div>
      )}
      
      {/* Professional Hover Card */}
      {hoveredZoneForCard && cardPosition && !isDraggingZone && (
        <div
          className="zone-hover-card"
          style={{
            position: 'fixed',
            left: `${cardPosition.x}px`,
            top: `${cardPosition.y}px`,
            pointerEvents: 'auto',
            zIndex: 9999,
          }}
          onMouseEnter={() => {
            setIsHoveringCard(true);
            if (hideCardTimeoutRef.current) {
              clearTimeout(hideCardTimeoutRef.current);
              hideCardTimeoutRef.current = null;
            }
          }}
          onMouseLeave={() => {
            setIsHoveringCard(false);
            hideCardTimeoutRef.current = setTimeout(() => {
              setHoveredZoneForCard(null);
              setCardPosition(null);
            }, 300);
          }}
        >
          <div className="hover-card-compact">
            <input
              type="text"
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              onBlur={() => {
                if (onTextEdit && editingText !== hoveredZoneForCard.text) {
                  onTextEdit(hoveredZoneForCard.id, editingText);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (onTextEdit && editingText !== hoveredZoneForCard.text) {
                    onTextEdit(hoveredZoneForCard.id, editingText);
                  }
                  e.currentTarget.blur();
                }
              }}
              className="hover-input-main"
              placeholder="OCR"
            />
            
            <div className="hover-input-row">
              <div className="tolerance-input-group">
                <button 
                  className="tolerance-toggle-btn"
                  onClick={() => {
                    const minInput = document.getElementById(`min-${hoveredZoneForCard.id}`) as HTMLInputElement;
                    if (minInput) {
                      const currentVal = parseFloat(minInput.value.replace(/[+-]/g, '')) || 0;
                      const isPositive = !minInput.value.startsWith('-');
                      minInput.value = (isPositive ? '-' : '+') + currentVal.toFixed(3);
                      updateToleranceCalculation(hoveredZoneForCard);
                    }
                  }}
                  title="Toggle min tolerance sign (+/-)"
                >
                  {(() => {
                    const minVal = hoveredZoneForCard.tolerance_info?.min_tolerance || getISOTolerance('min', hoveredZoneForCard.text);
                    return parseFloat(minVal.toString()) >= 0 ? '+' : '-';
                  })()}
                </button>
                <input
                  type="text"
                  className="hover-input-tol"
                  placeholder="Min"
                  id={`min-${hoveredZoneForCard.id}`}
                  defaultValue={hoveredZoneForCard.tolerance_info?.min_tolerance || getISOTolerance('min', hoveredZoneForCard.text)}
                  onChange={() => updateToleranceCalculation(hoveredZoneForCard)}
                  onBlur={() => updateToleranceCalculation(hoveredZoneForCard)}
                />
              </div>
              <div className="tolerance-input-group">
                <button 
                  className="tolerance-toggle-btn"
                  onClick={() => {
                    const maxInput = document.getElementById(`max-${hoveredZoneForCard.id}`) as HTMLInputElement;
                    if (maxInput) {
                      const currentVal = parseFloat(maxInput.value.replace(/[+-]/g, '')) || 0;
                      const isPositive = !maxInput.value.startsWith('-');
                      maxInput.value = (isPositive ? '-' : '+') + currentVal.toFixed(3);
                      updateToleranceCalculation(hoveredZoneForCard);
                    }
                  }}
                  title="Toggle max tolerance sign (+/-)"
                >
                  {(() => {
                    const maxVal = hoveredZoneForCard.tolerance_info?.max_tolerance || getISOTolerance('max', hoveredZoneForCard.text);
                    return parseFloat(maxVal.toString()) >= 0 ? '+' : '-';
                  })()}
                </button>
                <input
                  type="text"
                  className="hover-input-tol"
                  placeholder="Max"
                  id={`max-${hoveredZoneForCard.id}`}
                  defaultValue={hoveredZoneForCard.tolerance_info?.max_tolerance || getISOTolerance('max', hoveredZoneForCard.text)}
                  onChange={() => updateToleranceCalculation(hoveredZoneForCard)}
                  onBlur={() => updateToleranceCalculation(hoveredZoneForCard)}
                />
              </div>
            </div>
            
            <input
              type="text"
              className="hover-input-calc"
              id={`calc-${hoveredZoneForCard.id}`}
              defaultValue={hoveredZoneForCard.tolerance_info?.value || ''}
              readOnly
              placeholder="Middle Value"
            />
          </div>
        </div>
      )}
    </div>
  );
}
