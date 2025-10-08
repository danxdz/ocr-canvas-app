import { useState, useRef } from 'react';
import { Upload, RotateCcw, Download, Send, Eye, EyeOff, Hash, Sliders, FileText } from 'lucide-react';
import { ZoneCanvas } from './components/ZoneCanvas';
import { ZoneList } from './components/ZoneList';
import ZonesAccordion from './components/ZonesAccordion';
import { ocrAPI } from './services/api';
import { exportService } from './services/export';
import type { Zone } from './types';
import './App.css';

function App() {
  const [image, setImage] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string>('');
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneHistory, setZoneHistory] = useState<Zone[][]>([]); // Undo history
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('Ready - v1.2.3 (Hard refresh if no changes visible)');
  const [showOverlay, setShowOverlay] = useState(false); // Toggle for white box overlay
  const [showBalloons, setShowBalloons] = useState(true); // Toggle for number balloons
  const [showImageControls, setShowImageControls] = useState(false); // Toggle for image adjustment panel
  const [showZoneList, setShowZoneList] = useState(true); // Toggle for zone list panel
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
          // Auto-detect zones with the image source
          autoDetectZones(file, reader.result as string);
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

  const autoDetectZones = async (file: File, imageSource?: string) => {
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
        tolerance_info: zone.tolerance_info,
        is_empty: zone.is_empty,
      }));
      
      // Generate thumbnails and calculate tolerances for all detected zones
      setStatus('📸 Generating thumbnails...');
      for (let i = 0; i < detectedZones.length; i++) {
        try {
          // Calculate tolerances
          detectedZones[i] = calculateTolerancesForZone(detectedZones[i]);
          
          // Generate thumbnail
          const thumbnail = await generateZoneThumbnail(detectedZones[i], undefined, imageSource);
          detectedZones[i].croppedImage = thumbnail;
        } catch (error) {
          console.warn(`Thumbnail generation failed for zone ${detectedZones[i].id}, continuing without thumbnail`);
        }
      }
      
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

  // Helper function to calculate and add min/max/middle tolerances if they exist
  const calculateTolerancesForZone = (zone: Zone): Zone => {
    if (!zone.tolerance_info) return zone;
    
    // If already has min/max calculated, return as is
    if (zone.tolerance_info.min_tolerance !== undefined && zone.tolerance_info.max_tolerance !== undefined) {
      return zone;
    }
    
    // Calculate from tolerance_plus/minus if available
    if (zone.tolerance_info.tolerance_plus !== undefined || zone.tolerance_info.tolerance_minus !== undefined) {
      // Use the base value from server's tolerance_info if available, otherwise extract from text
      let baseValue = zone.tolerance_info.value;
      if (baseValue === undefined) {
        // Fallback: Extract base value from text (e.g., "34" from "34H7" or "Ø34H7")
        const baseMatch = zone.text.match(/(\d+\.?\d*)/);
        baseValue = baseMatch ? parseFloat(baseMatch[1]) : 0;
      }
      
      // Get tolerance values from server (already calculated)
      const tolerancePlus = zone.tolerance_info.tolerance_plus || 0;
      const toleranceMinus = zone.tolerance_info.tolerance_minus || 0;
      
      // Calculate actual min/max values
      const minValue = baseValue + toleranceMinus;  // e.g., 2 + (-0.05) = 1.95
      const maxValue = baseValue + tolerancePlus;   // e.g., 2 + 0.05 = 2.05
      const middleValue = (minValue + maxValue) / 2; // e.g., (1.95 + 2.05) / 2 = 2.0
      
      // Debug logging removed for cleaner console
      
      return {
        ...zone,
        tolerance_info: {
          ...zone.tolerance_info,
          min_tolerance: toleranceMinus,  // Keep the tolerance values (e.g., -0.025)
          max_tolerance: tolerancePlus,   // Keep the tolerance values (e.g., 0.025)
          middle_value: Math.round(middleValue * 1000) / 1000  // Round to 3 decimal places (e.g., 34.000)
        }
      };
    }
    
    return zone;
  };

  // Helper function to generate and save zone thumbnail
  const generateZoneThumbnail = async (zone: Zone, rotation?: number, imageSource?: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const source = imageSource || imageSrc;
      if (!source) {
        reject(new Error('No image source available'));
        return;
      }
      
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to create canvas context'));
            return;
          }

          const { x1, y1, x2, y2 } = zone.bbox;
          const width = x2 - x1;
          const height = y2 - y1;
          
          // Validate bbox dimensions
          if (width <= 0 || height <= 0 || x1 < 0 || y1 < 0 || x2 > img.width || y2 > img.height) {
            reject(new Error(`Invalid bbox dimensions: ${JSON.stringify(zone.bbox)}`));
            return;
          }
          
          // Use provided rotation or zone's current rotation
          const angle = rotation !== undefined ? rotation : (zone.rotation || zone.text_orientation || 0);
          
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

          // Draw cropped zone
          ctx.drawImage(img, x1, y1, width, height, 0, 0, width, height);
          
          // Save as JPG with good quality
          const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.92);
          resolve(thumbnailDataUrl);
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = source;
    });
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
          tolerance_info: zone.tolerance_info,
          is_empty: zone.is_empty,
        };
        
        // Calculate tolerances and generate thumbnail immediately
        try {
          // Calculate tolerances first
          const zoneWithTolerances = calculateTolerancesForZone(newZone);
          
          // Generate thumbnail
          const thumbnail = await generateZoneThumbnail(zoneWithTolerances);
          zoneWithTolerances.croppedImage = thumbnail;
          
          setZones([...zones, zoneWithTolerances]);
        } catch (error) {
          console.warn(`Failed to process zone ${zone.id}, continuing without thumbnail`);
          setZones([...zones, newZone]); // Add zone without thumbnail on error
        }
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
    // Use functional update to get latest state
    setZones(currentZones => {
      // Check if zone still exists (might have been deleted)
      const zoneExists = currentZones.some(z => z.id === zoneId);
      if (!zoneExists) {
        return currentZones;
      }
      
      return currentZones.map(zone => {
        if (zone.id === zoneId) {
          const updatedZone = { ...zone, ...updates };
          
          // If bbox was updated, ensure width and height are recalculated
          if (updates.bbox) {
            const { x1, y1, x2, y2 } = updatedZone.bbox;
            const newWidth = x2 - x1;
            const newHeight = y2 - y1;
            
            updatedZone.bbox = {
              ...updatedZone.bbox,
              width: newWidth,
              height: newHeight
            };
            
            // Don't regenerate thumbnail during resize - it will be done when resize completes
            // The thumbnail will be regenerated by the canvas component's handleMouseUp
          }
          
          return updatedZone;
        }
        return zone;
      });
    });
  };

  const handleZoneResizeComplete = async (zoneId: string) => {
    // Regenerate thumbnail after resize is complete
    const zone = zones.find(z => z.id === zoneId);
    if (zone) {
      try {
        const thumbnail = await generateZoneThumbnail(zone);
        if (thumbnail) {
          setZones(currentZones => 
            currentZones.map(z => 
              z.id === zoneId ? { ...z, croppedImage: thumbnail } : z
            )
          );
        }
      } catch (error) {
        console.warn(`Failed to regenerate thumbnail for zone ${zoneId}:`, error);
      }
    }
  };

  const handleZoneDelete = (zoneId: string) => {
    // Save current state to history before deleting
    setZoneHistory([...zoneHistory, zones]);
    
    setZones(zones.filter(zone => zone.id !== zoneId));
    if (selectedZoneId === zoneId) {
      setSelectedZoneId(null);
    }
  };

  const handleZoneUndo = (zoneId: string) => {
    if (zoneHistory.length === 0) return;
    
    // Get the last state from history
    const previousState = zoneHistory[zoneHistory.length - 1];
    const previousZone = previousState.find(z => z.id === zoneId);
    
    if (previousZone) {
      // Restore the previous zone state
      setZones(zones.map(z => z.id === zoneId ? previousZone : z));
      
      // Remove the last state from history
      setZoneHistory(zoneHistory.slice(0, -1));
      
      setStatus('✅ Undone');
      setTimeout(() => setStatus(''), 2000);
    }
  };

  const handleClearAll = () => {
    if (zones.length === 0) return;
    
    if (confirm(`Are you sure you want to delete all ${zones.length} zones?`)) {
      // Save current state to history before clearing
      setZoneHistory([...zoneHistory, zones]);
      
      setZones([]);
      setSelectedZoneId(null);
      setStatus('✅ All zones cleared');
      setTimeout(() => setStatus(''), 2000);
    }
  };

  const handleZoneReOcr = async (zoneId: string) => {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone || !imageSrc) return;

    try {
      setLoading(true);
      setStatus(`Re-OCR zone: "${zone.text}"...`);

      // Use saved thumbnail if available, otherwise generate it
      let thumbnailDataUrl = zone.croppedImage;
      
      if (!thumbnailDataUrl) {
        console.log('🔄 No saved thumbnail, generating new one...');
        thumbnailDataUrl = await generateZoneThumbnail(zone);
        
        // Save the generated thumbnail for future use
        setZones(zones.map(z =>
          z.id === zoneId ? { ...z, croppedImage: thumbnailDataUrl } : z
        ));
      } else {
        console.log('🔄 Re-OCR: Using saved thumbnail with rotation:', zone.rotation || 0);
      }

      // Send thumbnail directly to OCR (no rectangle bounds needed)
      const result = await ocrAPI.processOCRDirect(thumbnailDataUrl, zone.rotation || 0);

      if (result && result.text && result.text !== '[No Text]') {
        // Update ONLY text and confidence - keep the same bounding box
        setZones(zones.map(z =>
          z.id === zoneId
            ? {
                ...z,
                text: result.text,
                confidence: result.confidence || z.confidence,
                // Keep the same bbox, rotation, and other properties
              }
            : z
        ));
        setStatus(`✅ Re-OCR: "${zone.text}" → "${result.text}"`);
        
        // Clear status after 3 seconds
        setTimeout(() => setStatus(''), 3000);
      } else {
        setStatus(`⚠️ Re-OCR found no text - keeping original text "${zone.text}"`);
        
        // Clear status after 3 seconds
        setTimeout(() => setStatus(''), 3000);
      }
    } catch (error) {
      console.error('Re-OCR error:', error);
      setStatus(`❌ Re-OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Clear status after 3 seconds
      setTimeout(() => setStatus(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleZoneFit = async (zoneId: string) => {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone || !imageSrc) return;

    try {
      setLoading(true);
      setStatus(`Re-fitting zone: "${zone.text}"...`);

      // Use the current bounding box for rectangle OCR
      const { x1, y1, x2, y2 } = zone.bbox;
      const rectangleBounds = { x1, y1, x2, y2 };

      console.log('🔄 Re-Fit: Using rectangle bounds:', rectangleBounds, 'rotation:', zone.rotation || 0);

      // Re-run OCR on this rectangle area
      const result = await ocrAPI.findTextInRectangle(imageSrc, rectangleBounds, zone.rotation || 0);

      if (result && result.text) {
        // Update text, confidence, AND bbox to fit tightly around the text
        setZones(zones.map(z =>
          z.id === zoneId
            ? {
                ...z,
                text: result.text,
                confidence: result.confidence || z.confidence,
                bbox: {
                  x1: result.bbox?.x1 || z.bbox.x1,
                  y1: result.bbox?.y1 || z.bbox.y1,
                  x2: result.bbox?.x2 || z.bbox.x2,
                  y2: result.bbox?.y2 || z.bbox.y2,
                  width: (result.bbox?.x2 || z.bbox.x2) - (result.bbox?.x1 || z.bbox.x1),
                  height: (result.bbox?.y2 || z.bbox.y2) - (result.bbox?.y1 || z.bbox.y1),
                },
                polygon: result.polygon || z.polygon,
                text_orientation: result.text_orientation !== undefined ? result.text_orientation : z.text_orientation,
                rotation: result.rotation !== undefined ? result.rotation : z.rotation,
              }
            : z
        ));
        setStatus(`✅ Re-fit: "${zone.text}" → "${result.text}" (box adjusted)`);
        
        // Clear status after 3 seconds
        setTimeout(() => setStatus(''), 3000);
      } else {
        setStatus(`⚠️ Re-fit found no text at this location`);
        
        // Clear status after 3 seconds
        setTimeout(() => setStatus(''), 3000);
      }
    } catch (error) {
      console.error('Re-fit error:', error);
      setStatus(`❌ Re-fit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Clear status after 3 seconds
      setTimeout(() => setStatus(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleTextEdit = (zoneId: string, newText: string) => {
    setZones(zones.map(z =>
      z.id === zoneId ? { ...z, text: newText } : z
    ));
  };

  const handleToleranceEdit = (zoneId: string, tolerance: { min_tolerance?: number; max_tolerance?: number }) => {
    setZones(zones.map(z => {
      if (z.id === zoneId) {
        const minTol = tolerance.min_tolerance || 0;
        const maxTol = tolerance.max_tolerance || 0;
        
        // Use the base value from tolerance_info if available, otherwise extract from text
        const baseValue = z.tolerance_info?.value || (() => {
          const match = z.text.match(/(\d+\.?\d*)/);
          return match ? parseFloat(match[1]) : 0;
        })();
        
        // Calculate middle value: (base + min + base + max) / 2
        const middleValue = (baseValue + minTol + baseValue + maxTol) / 2;
        
        return {
          ...z,
          tolerance_info: {
            ...z.tolerance_info,
            min_tolerance: minTol,
            max_tolerance: maxTol,
            middle_value: middleValue
          }
        };
      }
      return z;
    }));
  };

  const handleZoneRotate = async (zoneId: string) => {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone || !imageSrc) return;

    setLoading(true);
    setStatus('Rotating thumbnail...');

    try {
      // Rotate the zone 45 degrees clockwise
      const newRotation = ((zone.rotation || 0) + 45) % 360;
      
      console.log('🔄 Rotating thumbnail 45° clockwise, new rotation:', newRotation);
      
      // Generate and save the rotated thumbnail
      const rotatedThumbnail = await generateZoneThumbnail(zone, newRotation);
      
      // Update zone with new rotation AND saved thumbnail
      setZones(zones.map(z =>
        z.id === zoneId
          ? {
              ...z,
              rotation: newRotation,
              text_orientation: newRotation,
              croppedImage: rotatedThumbnail, // Save the rotated thumbnail
              id: zoneId // Keep the same ID
            }
          : z
      ));
      
      setStatus(`✅ Thumbnail rotated to ${newRotation}° and saved`);
      
      // Clear status after 2 seconds
      setTimeout(() => setStatus(''), 2000);
      
    } catch (error) {
      console.error('Rotate error:', error);
      setStatus('❌ Failed to rotate thumbnail');
      
      // Clear status after 3 seconds
      setTimeout(() => setStatus(''), 3000);
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
                  onZoneResizeComplete={handleZoneResizeComplete}
                  showOverlay={showOverlay}
                  onTextEdit={handleTextEdit}
                  showBalloons={showBalloons}
                />
              </div>
            </div>

            <div className="zones-section">
              <ZonesAccordion
                zones={zones}
                selectedZoneId={selectedZoneId}
                onZoneSelect={setSelectedZoneId}
                onZoneDelete={handleZoneDelete}
                onZoneReOcr={handleZoneReOcr}
                onZoneRotate={handleZoneRotate}
                onZoneFit={handleZoneFit}
                onTextEdit={handleTextEdit}
                onToleranceEdit={handleToleranceEdit}
                onClearAll={handleClearAll}
                onExportPDF={handleExportPDF}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;

