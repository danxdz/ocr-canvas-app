import { useState, useRef } from 'react';
import { ZoneCanvas } from './components/ZoneCanvas';
import { ZoneList } from './components/ZoneList';
import { ocrAPI } from './services/api';
import { exportService } from './services/export';
import type { Zone } from './types';
import './App.css';

function App() {
  const [image, setImage] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string>('');
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [showOverlay, setShowOverlay] = useState(false); // Toggle for white box overlay
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImage(file);
    setStatus('Loading image...');
    
    // Display image
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      
      // Load image element for cropping later
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        // Auto-detect zones
        autoDetectZones(file);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const autoDetectZones = async (file: File) => {
    try {
      setLoading(true);
      setStatus('🔍 Auto-detecting zones...');
      
      // First scan: Get zones with orientations (no rotation)
      const result = await ocrAPI.processImage(file, 'hardcore', 0);
      
      // Convert zones to our format
      const detectedZones: Zone[] = result.zones.map((zone, idx) => ({
        id: `zone_${Date.now()}_${idx}`,
        text: zone.text || 'Unknown',
        confidence: zone.confidence || 0,
        bbox: {
          x1: zone.bbox?.x1 || 0,
          y1: zone.bbox?.y1 || 0,
          x2: zone.bbox?.x2 || 0,
          y2: zone.bbox?.y2 || 0,
          width: (zone.bbox?.x2 || 0) - (zone.bbox?.x1 || 0),
          height: (zone.bbox?.y2 || 0) - (zone.bbox?.y1 || 0),
        },
        polygon: zone.polygon,
        rotation: zone.rotation,
        text_orientation: zone.text_orientation,
        orientation: zone.orientation,
      }));
      
      setZones(detectedZones);
      setStatus(`✅ Found ${detectedZones.length} zones!`);
      
      // AUTO-IMPROVE: Re-OCR rotated zones with their thumbnails
      const rotatedZones = detectedZones.filter(z => 
        z.text_orientation && Math.abs(z.text_orientation) > 15
      );
      
      if (rotatedZones.length > 0) {
        setStatus(`🔄 Found ${rotatedZones.length} rotated zones. Improving OCR...`);
        await improveRotatedZones(rotatedZones);
      }
      
    } catch (error) {
      console.error('Auto-detect error:', error);
      setStatus(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const improveRotatedZones = async (rotatedZones: Zone[]) => {
    if (!imageSrc || !imageRef.current) return;
    
    let improved = 0;
    for (const zone of rotatedZones) {
      try {
        const { x1, y1, x2, y2 } = zone.bbox;
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;
        
        // Re-OCR this zone (server will handle rotation internally)
        const result = await ocrAPI.findTextAtPoint(imageSrc, centerX, centerY);
        
        if (result && result.text && result.text !== zone.text) {
          // Update zone with better text
          setZones(prevZones => prevZones.map(z =>
            z.id === zone.id
              ? {
                  ...z,
                  text: result.text || z.text,
                  confidence: result.confidence || z.confidence,
                  bbox: result.bbox ? {
                    x1: result.bbox.x1,
                    y1: result.bbox.y1,
                    x2: result.bbox.x2,
                    y2: result.bbox.y2,
                    width: result.bbox.x2 - result.bbox.x1,
                    height: result.bbox.y2 - result.bbox.y1,
                  } : z.bbox,
                  polygon: result.polygon || z.polygon,
                }
              : z
          ));
          improved++;
        }
      } catch (error) {
        console.error(`Failed to improve zone ${zone.id}:`, error);
      }
    }
    
    if (improved > 0) {
      setStatus(`✅ Improved ${improved}/${rotatedZones.length} rotated zones!`);
    }
  };

  const handleCanvasClick = async (x: number, y: number) => {
    if (!imageSrc || loading) return;

    // Check if click is inside an existing zone
    const clickedZone = zones.find(z => {
      const { x1, y1, x2, y2 } = z.bbox;
      return x >= x1 && x <= x2 && y >= y1 && y <= y2;
    });

    if (clickedZone) {
      // Just select the zone if clicked
      setSelectedZoneId(clickedZone.id);
      setStatus(`Selected zone: "${clickedZone.text}" (Delete key to remove, or drag to move)`);
      return;
    }

    // Normal click-to-find on empty area
    try {
      setLoading(true);
      setStatus(`Finding text at (${Math.round(x)}, ${Math.round(y)})...`);
      
      const zone = await ocrAPI.findTextAtPoint(imageSrc, x, y);
      
      if (zone) {
        const newZone: Zone = {
          id: `zone_${Date.now()}`,
          text: zone.text || 'Unknown',
          confidence: zone.confidence || 0,
          bbox: {
            x1: zone.bbox?.x1 || 0,
            y1: zone.bbox?.y1 || 0,
            x2: zone.bbox?.x2 || 0,
            y2: zone.bbox?.y2 || 0,
            width: (zone.bbox?.x2 || 0) - (zone.bbox?.x1 || 0),
            height: (zone.bbox?.y2 || 0) - (zone.bbox?.y1 || 0),
          },
          polygon: zone.polygon,
          rotation: zone.rotation,
          text_orientation: zone.text_orientation,
          orientation: zone.orientation,
        };
        
        setZones([...zones, newZone]);
        setStatus(`✅ Found: "${zone.text}"`);
      } else {
        setStatus('⚠️ No text found at this location');
      }
    } catch (error) {
      console.error('Click detection error:', error);
      setStatus(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleZoneUpdate = (zoneId: string, updates: Partial<Zone>) => {
    setZones(zones.map(zone => 
      zone.id === zoneId ? { ...zone, ...updates } : zone
    ));
  };

  const handleZoneDelete = (zoneId: string) => {
    setZones(zones.filter(zone => zone.id !== zoneId));
    if (selectedZoneId === zoneId) {
      setSelectedZoneId(null);
    }
  };

  const handleZoneReOcr = async (zoneId: string) => {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone || !imageSrc) return;

    try {
      setLoading(true);
      setStatus(`Re-OCR zone: "${zone.text}"...`);

      // Calculate center of zone
      const { x1, y1, x2, y2 } = zone.bbox;
      const centerX = (x1 + x2) / 2;
      const centerY = (y1 + y2) / 2;

      // Re-run OCR on this area with hardcore mode
      const result = await ocrAPI.findTextAtPoint(imageSrc, centerX, centerY);

      if (result) {
        // Update the zone with new OCR result
        setZones(zones.map(z =>
          z.id === zoneId
            ? {
                ...z,
                text: result.text || z.text,
                confidence: result.confidence || z.confidence,
                bbox: {
                  x1: result.bbox?.x1 || z.bbox.x1,
                  y1: result.bbox?.y1 || z.bbox.y1,
                  x2: result.bbox?.x2 || z.bbox.x2,
                  y2: result.bbox?.y2 || z.bbox.y2,
                  width: (result.bbox?.x2 || z.bbox.x2) - (result.bbox?.x1 || z.bbox.x1),
                  height: (result.bbox?.y2 || z.bbox.y2) - (result.bbox?.y1 || z.bbox.y1),
                },
                polygon: result.polygon || z.polygon, // Keep polygon for rotated text
                text_orientation: result.text_orientation !== undefined ? result.text_orientation : z.text_orientation,
                rotation: result.rotation !== undefined ? result.rotation : z.rotation,
                orientation: result.orientation || z.orientation,
              }
            : z
        ));
        setStatus(`✅ Re-OCR: "${zone.text}" → "${result.text}"`);
      } else {
        setStatus(`⚠️ Re-OCR found no text at this location`);
      }
    } catch (error) {
      console.error('Re-OCR error:', error);
      setStatus(`❌ Re-OCR failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleZoneFit = async (zoneId: string) => {
    // Fit = Re-OCR with tight bounding box
    await handleZoneReOcr(zoneId);
  };

  const handleExportJSON = async () => {
    if (!imageRef.current || zones.length === 0) {
      alert('No zones to export');
      return;
    }

    try {
      setLoading(true);
      setStatus('Exporting to JSON...');
      
      const jsonString = await exportService.exportToJSON(
        zones,
        imageRef.current,
        image?.name || 'image.jpg'
      );
      
      exportService.downloadJSON(
        jsonString,
        `ocr_zones_${Date.now()}.json`
      );
      
      setStatus('✅ Exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      setStatus(`❌ Export failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendToTelegram = async () => {
    if (zones.length === 0) {
      alert('No zones to send');
      return;
    }

    try {
      setLoading(true);
      setStatus('Sending to Telegram...');
      
      const success = await ocrAPI.sendToTelegram({
        image_id: `img_${Date.now()}`,
        timestamp: new Date().toISOString(),
        zones,
      });
      
      if (success) {
        setStatus('✅ Sent to Telegram!');
      } else {
        setStatus('❌ Failed to send to Telegram');
      }
    } catch (error) {
      console.error('Telegram error:', error);
      setStatus(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎨 SPaCial AI OCR Canvas</h1>
        <p>Upload → Auto-detect → Click to find more → Export</p>
      </header>

      <div className="app-content">
        {!imageSrc ? (
          <div className="upload-area">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <button
              className="upload-button"
              onClick={() => fileInputRef.current?.click()}
            >
              📤 Upload Technical Drawing
            </button>
          </div>
        ) : (
          <>
            <div className="canvas-section">
              <div className="canvas-wrapper">
                <ZoneCanvas
                  imageSrc={imageSrc}
                  zones={zones}
                  selectedZoneId={selectedZoneId}
                  onZoneSelect={setSelectedZoneId}
                  onZoneUpdate={handleZoneUpdate}
                  onZoneDelete={handleZoneDelete}
                  onCanvasClick={handleCanvasClick}
                  onZoneResize={handleZoneReOcr}
                  showOverlay={showOverlay}
                />
              </div>

              <div className="controls">
                <div className="control-group">
                  <button onClick={() => {
                    // Reset everything
                    setImageSrc('');
                    setZones([]);
                    setSelectedZoneId(null);
                    setImage(null);
                    setStatus('');
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}>
                    📤 New Image
                  </button>
                  
                  <button
                    onClick={() => image && autoDetectZones(image)}
                    disabled={!image || loading}
                    title="Re-run auto-detection with OCR improvement"
                  >
                    🔍 Re-detect
                  </button>
                </div>

                <div className="control-group">
                  <button
                    onClick={() => setShowOverlay(!showOverlay)}
                    disabled={zones.length === 0}
                    title={showOverlay ? "Hide OCR overlay" : "Show OCR text as white overlay"}
                    className={showOverlay ? 'active' : ''}
                  >
                    {showOverlay ? '👁️ Hide Overlay' : '👁️‍🗨️ Show Overlay'}
                  </button>
                </div>

                <div className="control-group">
                  <button
                    onClick={handleExportJSON}
                    disabled={zones.length === 0 || loading}
                  >
                    📥 Export JSON
                  </button>
                  <button
                    onClick={handleSendToTelegram}
                    disabled={zones.length === 0 || loading}
                  >
                    📤 Send to Telegram
                  </button>
                </div>
              </div>

              {status && (
                <div className="status">
                  {loading && <span className="spinner">⏳</span>}
                  {status}
                </div>
              )}
            </div>

            <div className="zones-section">
              <ZoneList
                zones={zones}
                selectedZoneId={selectedZoneId}
                onZoneSelect={setSelectedZoneId}
                onZoneDelete={handleZoneDelete}
                onZoneReOcr={handleZoneReOcr}
                onZoneFit={handleZoneFit}
                imageSrc={imageSrc}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;

