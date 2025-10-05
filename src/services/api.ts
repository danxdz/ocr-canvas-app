// API service for OCR backend communication

import type { OCRResponse, Zone } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Validate API URL format
const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

if (!isValidUrl(API_URL)) {
  console.error('Invalid API_URL:', API_URL);
}

// Enhanced fetch with timeout and retry logic
const fetchWithRetry = async (
  url: string, 
  options: RequestInit, 
  retries: number = MAX_RETRIES
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${REQUEST_TIMEOUT}ms`);
    }
    
    if (retries > 0) {
      console.warn(`Request failed, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, options, retries - 1);
    }
    
    throw error;
  }
};

// Parse error response from server
const parseErrorResponse = async (response: Response): Promise<string> => {
  try {
    const errorData = await response.json();
    return errorData.detail || errorData.message || response.statusText;
  } catch {
    return response.statusText;
  }
};

export const ocrAPI = {
  /**
   * Auto-detect all zones in an image
   */
  async processImage(imageFile: File, mode: 'fast' | 'accurate' | 'hardcore' = 'fast', rotation: number = 0): Promise<OCRResponse> {
    // Validate file
    if (!imageFile || imageFile.size === 0) {
      throw new Error('Invalid file: file is empty or null');
    }
    
    if (imageFile.size > 10 * 1024 * 1024) { // 10MB limit
      throw new Error('File too large: maximum size is 10MB');
    }

    const formData = new FormData();
    formData.append('file', imageFile);

    const url = new URL(`${API_URL}/ocr/process`);
    url.searchParams.set('mode', mode);
    if (rotation !== 0) {
      url.searchParams.set('rotation', rotation.toString());
    }

    try {
      const response = await fetchWithRetry(url.toString(), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorMessage = await parseErrorResponse(response);
        throw new Error(`OCR processing failed: ${errorMessage}`);
      }

      const result = await response.json();
      
      // Validate response structure
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response format from server');
      }
      
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown error occurred during OCR processing');
    }
  },

  /**
   * Find text at a specific point (click to find)
   */
  async findTextAtPoint(imageDataUrl: string, x: number, y: number): Promise<Zone | null> {
    // Validate inputs
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      throw new Error('Invalid image data URL');
    }
    
    if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
      throw new Error('Invalid coordinates: x and y must be valid numbers');
    }

    try {
      const response = await fetchWithRetry(`${API_URL}/ocr/process-center`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageDataUrl,
          center_point: { x, y },
        }),
      });

      if (!response.ok) {
        const errorMessage = await parseErrorResponse(response);
        throw new Error(`Failed to find text at point: ${errorMessage}`);
      }

      const result = await response.json();
      
      // Validate response
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response format from server');
      }
      
      return result.zone || null;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown error occurred while finding text at point');
    }
  },

  /**
   * Find text within a rectangle area (drag to find)
   */
  async findTextInRectangle(imageDataUrl: string, rectangleBounds: { x1: number, y1: number, x2: number, y2: number }, rotation: number = 0): Promise<Zone | null> {
    // Validate inputs
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      throw new Error('Invalid image data URL');
    }
    
    if (!rectangleBounds || typeof rectangleBounds !== 'object') {
      throw new Error('Invalid rectangle bounds');
    }
    
    const { x1, y1, x2, y2 } = rectangleBounds;
    if (typeof x1 !== 'number' || typeof y1 !== 'number' || typeof x2 !== 'number' || typeof y2 !== 'number' ||
        isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
      throw new Error('Invalid rectangle coordinates: all values must be valid numbers');
    }
    
    if (x1 >= x2 || y1 >= y2) {
      throw new Error('Invalid rectangle: x1 must be less than x2 and y1 must be less than y2');
    }

    try {
      const response = await fetchWithRetry(`${API_URL}/ocr/process-center`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageDataUrl,
          center_point: { 
            x: (x1 + x2) / 2, 
            y: (y1 + y2) / 2 
          },
          rectangle_bounds: rectangleBounds,
          use_rectangle: true,
          rotation: rotation,
        }),
      });

      if (!response.ok) {
        const errorMessage = await parseErrorResponse(response);
        throw new Error(`Failed to find text in rectangle: ${errorMessage}`);
      }

      const result = await response.json();
      
      // Validate response
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response format from server');
      }
      
      return result.zone || null;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown error occurred while finding text in rectangle');
    }
  },

  /**
   * Send corrections to Telegram
   */
  async sendToTelegram(data: Record<string, unknown>): Promise<boolean> {
    // Validate input
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data: must be a valid object');
    }

    try {
      const response = await fetchWithRetry(`${API_URL}/corrections/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorMessage = await parseErrorResponse(response);
        console.error('Failed to send to Telegram:', errorMessage);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error sending to Telegram:', error);
      return false;
    }
  },

  /**
   * Health check
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetchWithRetry(`${API_URL}/`, {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  },
};

