// Zone list component showing all detected zones

import { useEffect, useState } from 'react';
import { RotateCw, Maximize2, Trash2, RefreshCw, Undo, Trash } from 'lucide-react';
import type { Zone } from '../types';

interface ZoneListProps {
  zones: Zone[];
  selectedZoneId: string | null;
  onZoneSelect: (zoneId: string) => void;
  onZoneDelete: (zoneId: string) => void;
  onZoneUndo?: (zoneId: string) => void;
  onClearAll?: () => void;
  onZoneReOcr?: (zoneId: string) => void;
  onZoneFit?: (zoneId: string) => void;
  onZoneRotate?: (zoneId: string) => void;
  onTextEdit?: (zoneId: string, newText: string) => void;
  onToleranceEdit?: (zoneId: string, minTol: number, maxTol: number) => void;
  imageSrc?: string;
}

export function ZoneList({
  zones,
  selectedZoneId,
  onZoneSelect,
  onZoneDelete,
  onZoneUndo,
  onClearAll,
  onZoneReOcr,
  onZoneFit,
  onZoneRotate,
  onTextEdit,
  onToleranceEdit,
  imageSrc,
}: ZoneListProps) {
  const [zoneThumbnails, setZoneThumbnails] = useState<Record<string, string>>({});
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [editingTolerances, setEditingTolerances] = useState<{ zoneId: string, min: string, max: string } | null>(null);

  useEffect(() => {
    if (!imageSrc) return;

    // Use saved thumbnails from zones, or generate them if missing
    const thumbs: Record<string, string> = {};
    let needsGeneration = false;
    
    zones.forEach((zone) => {
      if (zone.croppedImage) {
        // Use saved thumbnail
        thumbs[zone.id] = zone.croppedImage;
      } else {
        // Mark that we need to generate thumbnails
        needsGeneration = true;
      }
    });
    
    // If all zones have saved thumbnails, use them
    if (!needsGeneration && Object.keys(thumbs).length > 0) {
      setZoneThumbnails(thumbs);
      return;
    }
    
    // Otherwise, generate thumbnails for zones that don't have them
    if (needsGeneration) {
      const img = new Image();
      img.onload = () => {
        zones.forEach((zone) => {
          if (!zone.croppedImage) {
            // Generate thumbnail for this zone
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const { x1, y1, x2, y2 } = zone.bbox;
            const width = x2 - x1;
            const height = y2 - y1;
            
            // Get rotation angle
            const angle = zone.text_orientation || zone.rotation || 0;
            
            // Set canvas size based on rotation
            if (Math.abs(angle) === 90 || Math.abs(angle) === 270) {
              canvas.width = height;
              canvas.height = width;
            } else {
              canvas.width = width;
              canvas.height = height;
            }

            // Apply rotation if needed
            if (Math.abs(angle) > 0) {
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.rotate((angle * Math.PI) / 180);
              ctx.translate(-width / 2, -height / 2);
            }

            // Draw cropped zone and save as JPG
            ctx.drawImage(img, x1, y1, width, height, 0, 0, width, height);
            thumbs[zone.id] = canvas.toDataURL('image/jpeg', 0.92);
          }
        });

        setZoneThumbnails(thumbs);
      };
      img.src = imageSrc;
    }
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
      <div className="zone-list-header">
        <h3>Detected Zones ({zones.length})</h3>
        {onClearAll && zones.length > 0 && (
          <button
            className="clear-all-btn"
            onClick={onClearAll}
            title="Delete all zones"
          >
            <Trash size={16} />
            Clear All
          </button>
        )}
      </div>
      
      <div className="zone-items">
        {zones.map((zone, index) => {
          const isSelected = zone.id === selectedZoneId;
          const confidence = Math.round(zone.confidence * 100);
          const thumbnail = zoneThumbnails[zone.id];

          // Check if this is an empty zone
          const isEmpty = zone.is_empty || zone.text === '[No Text]' || zone.confidence === 0;
          
          return (
            <div
              key={zone.id}
              className={`zone-item-compact ${isSelected ? 'selected' : ''} ${isEmpty ? 'empty-zone' : ''}`}
              onClick={() => onZoneSelect(zone.id)}
            >
              {/* Left: Badge + Thumbnail */}
              <div className="zone-badge-small">#{index + 1}</div>
              
              {thumbnail && (
                <div className="zone-thumbnail-small">
                  <img src={thumbnail} alt={zone.text} />
                </div>
              )}
              
              {/* Center: Editable text + tolerances */}
              <div className="zone-info">
                {editingZoneId === zone.id ? (
                  <input
                    type="text"
                    className="zone-text-input"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={() => {
                      if (onTextEdit && editingText !== zone.text) {
                        onTextEdit(zone.id, editingText);
                      }
                      setEditingZoneId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (onTextEdit && editingText !== zone.text) {
                          onTextEdit(zone.id, editingText);
                        }
                        setEditingZoneId(null);
                      }
                      if (e.key === 'Escape') {
                        setEditingZoneId(null);
                      }
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div 
                    className="zone-text-medium"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingZoneId(zone.id);
                      setEditingText(zone.text);
                    }}
                    title="Double-click to edit"
                  >
                    {zone.text}
                  </div>
                )}
                
                {/* Editable tolerance fields */}
                <div className="zone-tol-line">
                  {editingTolerances?.zoneId === zone.id ? (
                    <div className="tol-edit-group" onClick={(e) => e.stopPropagation()}>
                      <input type="number" step="0.001" className="tol-input" placeholder="Min" value={editingTolerances.min} onChange={(e) => setEditingTolerances({ ...editingTolerances, min: e.target.value })} />
                      <input type="number" step="0.001" className="tol-input" placeholder="Max" value={editingTolerances.max} onChange={(e) => setEditingTolerances({ ...editingTolerances, max: e.target.value })} />
                      <button className="tol-save-btn" onClick={(e) => { e.stopPropagation(); if (onToleranceEdit) onToleranceEdit(zone.id, parseFloat(editingTolerances.min) || 0, parseFloat(editingTolerances.max) || 0); setEditingTolerances(null); }}>✓</button>
                      <button className="tol-cancel-btn" onClick={(e) => { e.stopPropagation(); setEditingTolerances(null); }}>✕</button>
                    </div>
                  ) : (
                    <>
                      {zone.tolerance_info?.min_tolerance !== undefined && zone.tolerance_info?.max_tolerance !== undefined ? (
                        <>
                          <span className="tol-mini editable" onClick={(e) => { e.stopPropagation(); setEditingTolerances({ zoneId: zone.id, min: zone.tolerance_info.min_tolerance?.toString() || '0', max: zone.tolerance_info.max_tolerance?.toString() || '0' }); }} title="Click to edit">
                            Min:{zone.tolerance_info.min_tolerance} Max:{zone.tolerance_info.max_tolerance}
                          </span>
                          {zone.tolerance_info.middle_value !== undefined && (
                            <span className="tol-mini middle" title="Calculated middle value">
                              Mid:{zone.tolerance_info.middle_value.toFixed(3)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="tol-mini add-tol" onClick={(e) => { e.stopPropagation(); setEditingTolerances({ zoneId: zone.id, min: '0', max: '0' }); }} title="Add tolerance">+ Tol</span>
                      )}
                      {zone.tolerance_info?.tolerance_type === '±' && (
                        <span className="tol-mini">± {zone.tolerance_info.tolerance_plus || zone.tolerance_info.tolerance_minus}</span>
                      )}
                      {zone.tolerance_info?.tolerance_type === 'thread' && zone.tolerance_info.tolerance_class && (
                        <span className="tol-mini thread">{zone.tolerance_info.tolerance_class}</span>
                      )}
                      {zone.tolerance_info?.tolerance_type === 'ISO' && zone.tolerance_info.tolerance_class && (
                        <span className="tol-mini iso">{zone.tolerance_info.tolerance_class}</span>
                      )}
                      {zone.tolerance_info?.is_diameter && (
                        <span className="tol-mini diameter">Ø</span>
                      )}
                      {zone.text_orientation && Math.abs(zone.text_orientation) > 5 && (
                        <span className="tol-mini rotation">↻{Math.round(zone.text_orientation)}°</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              {/* Right: Action buttons */}
              <div className="zone-actions-compact">
                {onZoneReOcr && (
                  <button className="zone-btn" onClick={(e) => { e.stopPropagation(); onZoneReOcr(zone.id); }} title="Re-OCR">
                    <RefreshCw size={14} />
                  </button>
                )}
                {onZoneFit && (
                  <button className="zone-btn" onClick={(e) => { e.stopPropagation(); onZoneFit(zone.id); }} title="Re-fit">
                    <Maximize2 size={14} />
                  </button>
                )}
                {onZoneRotate && (
                  <button className="zone-btn" onClick={(e) => { e.stopPropagation(); onZoneRotate(zone.id); }} title="Rotate 45°">
                    <RotateCw size={14} />
                  </button>
                )}
                {onZoneUndo && (
                  <button className="zone-btn undo" onClick={(e) => { e.stopPropagation(); onZoneUndo(zone.id); }} title="Undo">
                    <Undo size={14} />
                  </button>
                )}
                <button className="zone-btn delete" onClick={(e) => { e.stopPropagation(); onZoneDelete(zone.id); }} title="Delete">
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

