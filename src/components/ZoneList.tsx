// Zone list component showing all detected zones

import { useEffect, useState } from 'react';
import type { Zone } from '../types';

interface ZoneListProps {
  zones: Zone[];
  selectedZoneId: string | null;
  onZoneSelect: (zoneId: string) => void;
  onZoneDelete: (zoneId: string) => void;
  onZoneReOcr?: (zoneId: string) => void;
  onZoneFit?: (zoneId: string) => void;
  imageSrc?: string;
}

export function ZoneList({
  zones,
  selectedZoneId,
  onZoneSelect,
  onZoneDelete,
  onZoneReOcr,
  onZoneFit,
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

        canvas.width = width;
        canvas.height = height;

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
              
              {thumbnail && (() => {
                // Get rotation angle (prefer text_orientation, fallback to rotation)
                const angle = zone.text_orientation || zone.rotation || 0;
                // Round to nearest 30 degrees
                const roundedAngle = Math.round(angle / 30) * 30;
                
                return (
                  <div 
                    className="zone-thumbnail"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onZoneReOcr) {
                        onZoneReOcr(zone.id);
                      }
                    }}
                    title="Click to re-OCR this zone with better accuracy"
                  >
                    <img 
                      src={thumbnail} 
                      alt={zone.text}
                      style={{
                        transform: roundedAngle !== 0 ? `rotate(${roundedAngle}deg)` : undefined
                      }}
                    />
                    <div className="thumbnail-overlay">🔄</div>
                  </div>
                );
              })()}
              
              <div className="zone-content">
                <div className="zone-text">{zone.text}</div>
                <div className="zone-meta">
                  <span className="zone-confidence">{confidence}% conf</span>
                  {zone.rotation && Math.abs(zone.rotation) > 5 && (
                    <span className="zone-rotation" title="Text rotation angle">
                      🔄 {Math.round(zone.rotation)}°
                    </span>
                  )}
                  {zone.text_orientation && Math.abs(zone.text_orientation) > 5 && (
                    <span className="zone-rotation" title="Text orientation">
                      ↻ {Math.round(zone.text_orientation)}°
                    </span>
                  )}
                </div>
              </div>
              
              <div className="zone-actions">
                {onZoneFit && (
                  <button
                    className="zone-fit"
                    onClick={(e) => {
                      e.stopPropagation();
                      onZoneFit(zone.id);
                    }}
                    title="Fit box tightly to text"
                  >
                    📐
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
                  🗑️
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

