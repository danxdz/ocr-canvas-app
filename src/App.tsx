import { useState, useRef } from 'react';
import { Upload, RotateCcw, Download, Send, Eye, EyeOff, Hash, Sliders, FileText } from 'lucide-react';
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
  const [status, setStatus] = useState<string>('Ready - v1.2.3 (Hard refresh if no changes visible)');
  const [showOverlay, setShowOverlay] = useState(false); // Toggle for white box overlay
  const [showBalloons, setShowBalloons] = useState(true); // Toggle for number balloons
  const [showImageControls, setShowImageControls] = useState(false); // Toggle for image adjustment panel
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [sharpness, setSharpness] = useState(100);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Validate file before processing
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('File too large. Maximum size is 10MB.');
      }
      
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/tiff', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error(`Unsupported file type. Allowed types: ${allowedTypes.join(', ')}`);
      }

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
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setStatus(`Error: ${errorMessage}`);
      setImageSrc('');
      setZones([]);
    }
  };

  const autoDetectZones = async (file: File) => {
    try {
      setLoading(true);
      setStatus('🔍 Auto-detecting zones...');
      
      // First scan: Get zones with orientations (no rotation)
      console.log('🚀 Client: Starting auto-detection OCR processing...');
      const result = await ocrAPI.processImage(file, 'hardcore', 0);
      console.log('🚀 Client: Received auto-detection response:', result);
      
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setStatus(`❌ Error: ${errorMessage}`);
      setZones([]); // Clear zones on error
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

  const handleCanvasClick = async (x: number, y: number, rectangleData?: { rectangleBounds: { x1: number, y1: number, x2: number, y2: number }, width: number, height: number }) => {
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
      let zone;
      if (rectangleData) {
        setStatus(`Finding text in rectangle (${Math.round(rectangleData.rectangleBounds.x1)}, ${Math.round(rectangleData.rectangleBounds.y1)}) to (${Math.round(rectangleData.rectangleBounds.x2)}, ${Math.round(rectangleData.rectangleBounds.y2)})...`);
        console.log('📐 Client: Sending rectangle OCR request:', rectangleData.rectangleBounds);
        zone = await ocrAPI.findTextInRectangle(imageSrc, rectangleData.rectangleBounds);
        console.log('📐 Client: Received rectangle OCR response:', zone);
      } else {
        setStatus(`Finding text at (${Math.round(x)}, ${Math.round(y)})...`);
        console.log('🎯 Client: Sending point OCR request:', { x, y });
        zone = await ocrAPI.findTextAtPoint(imageSrc, x, y);
        console.log('🎯 Client: Received point OCR response:', zone);
      }
      
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
    console.log('🔄 handleZoneUpdate called for zone:', zoneId, 'updates:', updates);
    
    setZones(zones.map(zone => {
      if (zone.id === zoneId) {
        const updatedZone = { ...zone, ...updates };
        
        // If bbox was updated, ensure width and height are recalculated
        if (updates.bbox) {
          const { x1, y1, x2, y2 } = updatedZone.bbox;
          const newWidth = x2 - x1;
          const newHeight = y2 - y1;
          
          console.log('📏 Bbox update - old:', zone.bbox, 'new:', { x1, y1, x2, y2, width: newWidth, height: newHeight });
          
          updatedZone.bbox = {
            ...updatedZone.bbox,
            width: newWidth,
            height: newHeight
          };
        }
        
        return updatedZone;
      }
      return zone;
    }));
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

      // Use the current resized bounding box for rectangle OCR
      const { x1, y1, x2, y2 } = zone.bbox;
      const rectangleBounds = { x1, y1, x2, y2 };

      console.log('🔄 Re-OCR: Using rectangle bounds:', rectangleBounds);

      // Re-run OCR on this rectangle area with hardcore mode
      const result = await ocrAPI.findTextInRectangle(imageSrc, rectangleBounds, zone.rotation || 0);

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

  const handleTextEdit = (zoneId: string, newText: string) => {
    setZones(zones.map(z =>
      z.id === zoneId ? { ...z, text: newText } : z
    ));
  };

  const handleZoneRotate = async (zoneId: string) => {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone || !imageSrc) return;

    setLoading(true);
    setStatus('Rotating and re-OCRing zone...');

    try {
      // Rotate the zone 90 degrees clockwise
      const newRotation = ((zone.rotation || 0) + 90) % 360;
      
      // Use the current resized bounding box for rectangle OCR
      const { x1, y1, x2, y2 } = zone.bbox;
      const rectangleBounds = { x1, y1, x2, y2 };

      console.log('🔄 Rotate: Using rectangle bounds:', rectangleBounds, 'with rotation:', newRotation);
      
      // Re-OCR the zone with the new rotation using rectangle mode
      const result = await ocrAPI.findTextInRectangle(imageSrc, rectangleBounds, newRotation);

      if (result) {
        setZones(zones.map(z =>
          z.id === zoneId
            ? {
                ...z,
                // Only update text, confidence, and rotation - keep original bounding box
                text: result.text || z.text,
                confidence: result.confidence || z.confidence,
                rotation: newRotation,
                text_orientation: newRotation,
                id: zoneId // Keep the same ID
              }
            : z
        ));
        setStatus(`Zone rotated to ${newRotation}° and re-OCRed (box size preserved)`);
      } else {
        setStatus('No text found after rotation');
      }
    } catch (error) {
      console.error('Rotate error:', error);
      setStatus('Failed to rotate and re-OCR zone');
    } finally {
      setLoading(false);
    }
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
      
      // Clear memory after export
      setTimeout(() => {
        if ((window as any).gc) {
          (window as any).gc();
        }
      }, 1000);
    } catch (error) {
      console.error('Export error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setStatus(`❌ Export failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (zones.length === 0 || !image) {
      alert('No zones to export or no image loaded');
      return;
    }
    
    try {
      setLoading(true);
      setStatus('📄 Generating PDF report...');
      
      // Get part number from user (default to Part 1)
      const partNumber = prompt('Enter part number (e.g., Part 1, Part 2):', 'Part 1') || 'Part 1';
      const title = `OCR Measurement Report - ${partNumber}`;
      
      // Export PDF using the API
      const pdfBlob = await ocrAPI.exportPDF(image, zones, title, partNumber);
      
      // Create download link
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${partNumber.replace(/\s+/g, '_')}_measurement_report.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setStatus('✅ PDF report downloaded successfully!');
      
      // Clear status after 3 seconds
      setTimeout(() => setStatus(''), 3000);
      
    } catch (error) {
      console.error('PDF export error:', error);
      setStatus(`❌ PDF export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Clear status after 5 seconds
      setTimeout(() => setStatus(''), 5000);
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
              <Upload size={20} />
              Upload Technical Drawing
            </button>
          </div>
        ) : (
          <>
            <div className="canvas-section">
              {showImageControls && (
                <div className="image-controls-panel">
                  <div className="control-slider">
                    <label>Brightness: {brightness}%</label>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                    />
                  </div>
                  <div className="control-slider">
                    <label>Contrast: {contrast}%</label>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                    />
                  </div>
                  <div className="control-slider">
                    <label>Sharpness: {sharpness}%</label>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={sharpness}
                      onChange={(e) => setSharpness(Number(e.target.value))}
                    />
                  </div>
                  <button
                    onClick={() => {
                      setBrightness(100);
                      setContrast(100);
                      setSharpness(100);
                    }}
                    className="reset-button"
                  >
                    Reset
                  </button>
                </div>
              )}
              <div 
                className="canvas-wrapper"
                style={{
                  filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                  imageRendering: sharpness > 100 ? 'crisp-edges' : 'auto'
                }}
              >
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
                  onTextEdit={handleTextEdit}
                  showBalloons={showBalloons}
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
                    <Upload size={18} />
                    New Image
                  </button>
                  
                  <button
                    onClick={() => image && autoDetectZones(image)}
                    disabled={!image || loading}
                    title="Re-run auto-detection with OCR improvement"
                  >
                    <RotateCcw size={18} />
                    Re-detect
                  </button>
                </div>

                <div className="control-group">
                  <button
                    onClick={() => setShowOverlay(!showOverlay)}
                    disabled={zones.length === 0}
                    title={showOverlay ? "Hide OCR overlay" : "Show OCR text as white overlay"}
                    className={showOverlay ? 'active' : ''}
                  >
                    {showOverlay ? <><EyeOff size={18} /> Hide Overlay</> : <><Eye size={18} /> Show Overlay</>}
                  </button>
                  
                  <button
                    onClick={() => setShowBalloons(!showBalloons)}
                    title={showBalloons ? "Hide zone numbers" : "Show zone numbers"}
                    className={showBalloons ? 'active' : ''}
                  >
                    <Hash size={18} />
                    {showBalloons ? 'Hide Numbers' : 'Show Numbers'}
                  </button>
                  
                  <button
                    onClick={() => setShowImageControls(!showImageControls)}
                    disabled={!image}
                    title="Image adjustments for better OCR"
                    className={showImageControls ? 'active' : ''}
                  >
                    <Sliders size={18} />
                    Adjust
                  </button>
                </div>

                <div className="control-group">
                  <button
                    onClick={handleExportJSON}
                    disabled={zones.length === 0 || loading}
                  >
                    <Download size={18} />
                    Export JSON
                  </button>
                  
                  <button
                    onClick={handleExportPDF}
                    disabled={zones.length === 0 || loading}
                    title="Export PDF with image, bubbles, and tolerance grid"
                  >
                    <FileText size={18} />
                    Export PDF
                  </button>
                  
                  <button
                    onClick={handleSendToTelegram}
                    disabled={zones.length === 0 || loading}
                  >
                    <Send size={18} />
                    Send to Telegram
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
              onZoneRotate={handleZoneRotate}
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

