// Type definitions for OCR Canvas App

export interface Zone {
  id: string;
  text: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width: number;
    height: number;
  };
  polygon?: number[][];
  rotation?: number;
  text_orientation?: number;
  orientation?: string;
  croppedImage?: string; // base64 data URL
  bubbleOffset?: { x: number; y: number }; // Draggable bubble position offset from top-left
  is_empty?: boolean; // Flag for zones with no text detected
  tolerance_info?: {
    value?: number;
    min_tolerance?: number;
    max_tolerance?: number;
    tolerance_plus?: number;
    tolerance_minus?: number;
    tolerance_type?: string;
    tolerance_class?: string;
    is_diameter?: boolean;
    middle_value?: number;
  };
}

export interface OCRResponse {
  zones: Zone[];
  metadata?: {
    total_zones: number;
    original_zones_detected?: number;
    zones_merged?: number;
    overlay_path?: string;
    detected_angle?: number;
    post_processing?: {
      total_corrected: number;
      total_processed: number;
    };
    error?: string;
  };
}

export interface ExportData {
  timestamp: string;
  image_name: string;
  zones: Zone[];
  total_zones: number;
}

// API Error types
export interface APIError {
  message: string;
  status?: number;
  code?: string;
}

// Validation helpers
export const isValidZone = (zone: any): zone is Zone => {
  return (
    zone &&
    typeof zone === 'object' &&
    typeof zone.id === 'string' &&
    typeof zone.text === 'string' &&
    typeof zone.confidence === 'number' &&
    zone.bbox &&
    typeof zone.bbox.x1 === 'number' &&
    typeof zone.bbox.y1 === 'number' &&
    typeof zone.bbox.x2 === 'number' &&
    typeof zone.bbox.y2 === 'number' &&
    typeof zone.bbox.width === 'number' &&
    typeof zone.bbox.height === 'number'
  );
};

export const isValidOCRResponse = (response: any): response is OCRResponse => {
  return (
    response &&
    typeof response === 'object' &&
    Array.isArray(response.zones) &&
    response.zones.every(isValidZone)
  );
};

