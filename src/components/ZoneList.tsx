// Zone list component showing all detected zones

import { useEffect, useState } from 'react';
import { RotateCw, Maximize2, Trash2, RefreshCw } from 'lucide-react';
import type { Zone } from '../types';

interface ZoneListProps {
  zones: Zone[];
  selectedZoneId: string | null;
  onZoneSelect: (zoneId: string) => void;
  onZoneDelete: (zoneId: string) => void;
  onZoneReOcr?: (zoneId: string) => void;
  onZoneFit?: (zoneId: string) => void;
  onZoneRotate?: (zoneId: string) => void;
  imageSrc?: string;
}

export function ZoneList({
  zones,
  selectedZoneId,
  onZoneSelect,
  onZoneDelete,
  onZoneReOcr,
  onZoneFit,
  onZoneRotate,
  imageSrc,
}: ZoneListProps) {
  const [zoneThumbnails, setZoneThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!imageSrc) return;

    // Create thumbnails for all zones
    const img = new Image();
    img.onload = () => {
      const thumbs: Record<string, string> = {};
      
      zones.forEach((zone) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { x1, y1, x2, y2 } = zone.bbox;
        const width = x2 - x1;
        const height = y2 - y1;
        
        // Get rotation angle (prefer text_orientation, fallback to rotation)
        const angle = zone.text_orientation || zone.rotation || 0;
        const roundedAngle = Math.round(angle / 90) * 90; // Round to nearest 90 degrees
        
        // Set canvas size based on rotation
        if (Math.abs(roundedAngle) === 90 || Math.abs(roundedAngle) === 270) {
          // For 90° and 270° rotation, swap width and height
          canvas.width = height;
          canvas.height = width;
        } else {
          canvas.width = width;
          canvas.height = height;
        }

        // Apply rotation if needed
        if (Math.abs(roundedAngle) > 0) {
          // Move to center of canvas
          ctx.translate(canvas.width / 2, canvas.height / 2);
          // Rotate
          ctx.rotate((roundedAngle * Math.PI) / 180);
          // Move back to draw the image
          ctx.translate(-width / 2, -height / 2);
        }

        // Draw cropped zone
        ctx.drawImage(img, x1, y1, width, height, 0, 0, width, height);
        thumbs[zone.id] = canvas.toDataURL('image/png');
      });

      setZoneThumbnails(thumbs);
    };
    img.src = imageSrc;
  }, [zones, imageSrc]);

  if (zones.length === 0) {
    return (
      <div className="zone-list-empty">
        <p>No zones detected yet.</p>
        <p className="hint">Upload an image to auto-detect zones, or click on the canvas to find text.</p>
      </div>
    );
  }

  return (
    <div className="zone-list">
      <h3>Detected Zones ({zones.length})</h3>
      
      <div className="zone-items">
        {zones.map((zone, index) => {
          const isSelected = zone.id === selectedZoneId;
          const confidence = Math.round(zone.confidence * 100);
          const thumbnail = zoneThumbnails[zone.id];

          return (
            <div
              key={zone.id}
              className={`zone-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onZoneSelect(zone.id)}
            >
              <div className="zone-badge">#{index + 1}</div>
              
              {thumbnail && (
                <div 
                  className="zone-thumbnail"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onZoneRotate) {
                      onZoneRotate(zone.id);
                    }
                  }}
                  title="Click to rotate thumbnail and re-OCR with better accuracy"
                >
                  <img 
                    src={thumbnail} 
                    alt={zone.text}
                  />
                  <div className="thumbnail-overlay"><RotateCw size={14} /></div>
                </div>
              )}
              
              <div className="zone-content">
                <div className="zone-text">{zone.text}</div>
                <div className="zone-meta">
                  <span className="zone-confidence">{confidence}% conf</span>
                  {zone.text_orientation && Math.abs(zone.text_orientation) > 5 && (
                    <span className="zone-rotation" title="Text orientation">
                      ↻ {Math.round(zone.text_orientation)}°
                    </span>
                  )}
                </div>
              </div>
              
              <div className="zone-actions">
                {onZoneReOcr && (
                  <button
                    className="zone-re-ocr"
                    onClick={(e) => {
                      e.stopPropagation();
                      onZoneReOcr(zone.id);
                    }}
                    title="Re-OCR this zone"
                  >
                    <RefreshCw size={14} />
                  </button>
                )}
                {onZoneFit && (
                  <button
                    className="zone-fit"
                    onClick={(e) => {
                      e.stopPropagation();
                      onZoneFit(zone.id);
                    }}
                    title="Re-fit box tightly to text"
                  >
                    <Maximize2 size={14} />
                  </button>
                )}
                {onZoneRotate && (
                  <button
                    className="zone-rotate"
                    onClick={(e) => {
                      e.stopPropagation();
                      onZoneRotate(zone.id);
                    }}
                    title="Rotate and re-OCR this zone"
                  >
                    <RotateCw size={14} />
                  </button>
                )}
                <button
                  className="zone-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onZoneDelete(zone.id);
                  }}
                  title="Delete zone"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

