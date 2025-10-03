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
}

export interface OCRResponse {
  zones: Zone[];
  stats: {
    total_zones: number;
    avg_confidence: number;
    processing_time: number;
  };
}

export interface ExportData {
  timestamp: string;
  image_name: string;
  zones: Zone[];
  total_zones: number;
}

