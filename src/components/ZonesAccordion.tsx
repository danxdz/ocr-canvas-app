import React, { useState } from 'react';
import { RefreshCw, RotateCcw, Move, Trash2, Download, ChevronRight, ChevronLeft } from 'lucide-react';
import type { Zone } from '../types';

interface ZonesAccordionProps {
  zones: Zone[];
  selectedZoneId: string | null;
  onZoneSelect: (zoneId: string | null) => void;
  onZoneDelete: (zoneId: string) => void;
  onZoneReOcr: (zoneId: string) => void;
  onZoneRotate: (zoneId: string) => void;
  onZoneFit: (zoneId: string) => void;
  onTextEdit: (zoneId: string, newText: string) => void;
  onToleranceEdit: (zoneId: string, tolerance: { min_tolerance?: number; max_tolerance?: number }) => void;
  onClearAll: () => void;
  onExportPDF: () => void;
}

const ZonesAccordion: React.FC<ZonesAccordionProps> = ({
  zones,
  selectedZoneId,
  onZoneSelect,
  onZoneDelete,
  onZoneReOcr,
  onZoneRotate,
  onZoneFit,
  onTextEdit,
  onToleranceEdit,
  onClearAll,
  onExportPDF
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleTextChange = (zoneId: string, newText: string) => {
    onTextEdit(zoneId, newText);
  };

  const handleToleranceChange = (zoneId: string, field: 'min_tolerance' | 'max_tolerance', value: number) => {
    onToleranceEdit(zoneId, { [field]: value });
  };

  const isSelected = (zoneId: string) => selectedZoneId === zoneId;

  return (
    <div className={`zones-accordion ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="zones-accordion-header">
        <h3>Detected Zones ({zones.length})</h3>
        <div className="header-actions">
          <button 
            onClick={onExportPDF}
            className="btn-icon"
            title="Export PDF"
          >
            <Download size={16} />
          </button>
          <button 
            onClick={onClearAll}
            className="btn-icon danger"
            title="Clear All"
          >
            <Trash2 size={16} />
          </button>
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="btn-icon"
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
      </div>

      {/* Scrollable Zones List */}
      <div className="zones-accordion-content">
        {zones.length === 0 ? (
          <div className="no-zones">
            <p>No zones detected</p>
            <p className="help-text">Upload an image to start</p>
          </div>
        ) : (
          zones.map((zone, index) => (
            <div key={zone.id} className={`zone-list-item ${isSelected(zone.id) ? 'selected' : ''}`}>
              {/* Zone Header - Click to select */}
              <div 
                className="zone-list-header"
                onClick={() => onZoneSelect(zone.id)}
              >
                <span className="zone-badge">#{index + 1}</span>
                {zone.croppedImage && (
                  <img 
                    src={zone.croppedImage} 
                    alt={`Zone ${index + 1}`}
                    className="zone-thumbnail"
                  />
                )}
                <span className="zone-text-preview">{zone.text}</span>
                <span className={`confidence-badge ${zone.confidence > 0.8 ? 'high' : zone.confidence > 0.6 ? 'medium' : 'low'}`}>
                  {Math.round(zone.confidence * 100)}%
                </span>
              </div>

              {/* Zone Content - Compact inline layout */}
              <div className="zone-list-content-inline">
                {/* Text Field - Inline */}
                <input
                  type="text"
                  value={zone.text}
                  onChange={(e) => handleTextChange(zone.id, e.target.value)}
                  onBlur={(e) => handleTextChange(zone.id, e.target.value.trim())}
                  className="zone-input-inline"
                  placeholder="Text..."
                />

                {/* Tolerance Fields - Inline */}
                <div className="tolerance-inline">
                  <input
                    type="number"
                    step="0.005"
                    value={zone.tolerance_info?.min_tolerance !== undefined ? zone.tolerance_info.min_tolerance : ''}
                    onChange={(e) => handleToleranceChange(zone.id, 'min_tolerance', parseFloat(e.target.value) || 0)}
                    className="tolerance-input-inline"
                    placeholder="Min"
                  />
                  <input
                    type="number"
                    step="0.005"
                    value={zone.tolerance_info?.max_tolerance !== undefined ? zone.tolerance_info.max_tolerance : ''}
                    onChange={(e) => handleToleranceChange(zone.id, 'max_tolerance', parseFloat(e.target.value) || 0)}
                    className="tolerance-input-inline"
                    placeholder="Max"
                  />
                  <span className="tolerance-mid-inline">
                    {zone.tolerance_info?.middle_value !== undefined ? zone.tolerance_info.middle_value.toFixed(3) : '0.000'}
                  </span>
                  {/* Show tolerance type indicators */}
                  {zone.tolerance_info?.tolerance_type && (
                    <span className="tolerance-type-indicator">
                      {zone.tolerance_info.tolerance_type.includes('±') && '±'}
                      {zone.tolerance_info.tolerance_type.includes('thread') && 'T'}
                      {zone.tolerance_info.tolerance_type.includes('ISO') && 'ISO'}
                      {zone.tolerance_info.is_diameter && 'Ø'}
                    </span>
                  )}
                </div>

                {/* Action Buttons - Inline */}
                <div className="zone-actions-inline">
                  <button 
                    onClick={() => onZoneReOcr(zone.id)}
                    className="btn-action-inline"
                    title="Re-OCR"
                  >
                    <RefreshCw size={12} />
                  </button>
                  <button 
                    onClick={() => onZoneRotate(zone.id)}
                    className="btn-action-inline"
                    title="Rotate & OCR"
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button 
                    onClick={() => onZoneFit(zone.id)}
                    className="btn-action-inline"
                    title="Auto-fit"
                  >
                    <Move size={12} />
                  </button>
                  <button 
                    onClick={() => onZoneDelete(zone.id)}
                    className="btn-action-inline danger"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};

export default ZonesAccordion;
