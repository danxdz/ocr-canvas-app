// API service for OCR backend communication

import type { OCRResponse, Zone } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const ocrAPI = {
  /**
   * Auto-detect all zones in an image
   */
  async processImage(imageFile: File, mode: 'fast' | 'accurate' | 'hardcore' = 'fast', rotation: number = 0): Promise<OCRResponse> {
    const formData = new FormData();
    formData.append('file', imageFile);

    const url = new URL(`${API_URL}/ocr/process`);
    url.searchParams.set('mode', mode);
    if (rotation !== 0) {
      url.searchParams.set('rotation', rotation.toString());
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OCR processing failed: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Find text at a specific point (click to find)
   */
  async findTextAtPoint(imageDataUrl: string, x: number, y: number): Promise<Zone | null> {
    const response = await fetch(`${API_URL}/ocr/process-center`, {
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
      throw new Error(`Failed to find text at point: ${response.statusText}`);
    }

    const result = await response.json();
    return result.zone || null;
  },

  /**
   * Send corrections to Telegram
   */
  async sendToTelegram(data: any): Promise<boolean> {
    const response = await fetch(`${API_URL}/corrections/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    return response.ok;
  },

  /**
   * Health check
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/`);
      return response.ok;
    } catch {
      return false;
    }
  },
};

