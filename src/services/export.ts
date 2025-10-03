// Export service for saving zones and images

import type { Zone, ExportData } from '../types';

export const exportService = {
  /**
   * Crop zone from image and convert to base64
   */
  cropZone(image: HTMLImageElement, zone: Zone): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('Canvas context not available');

    const { x1, y1, x2, y2 } = zone.bbox;
    const width = x2 - x1;
    const height = y2 - y1;

    canvas.width = width;
    canvas.height = height;

    // Draw cropped portion
    ctx.drawImage(
      image,
      x1, y1, width, height,  // Source rectangle
      0, 0, width, height      // Destination rectangle
    );

    return canvas.toDataURL('image/png');
  },

  /**
   * Export all zones with cropped images to JSON
   */
  async exportToJSON(
    zones: Zone[],
    image: HTMLImageElement,
    imageName: string
  ): Promise<string> {
    // Crop all zones
    const zonesWithImages = zones.map(zone => ({
      ...zone,
      croppedImage: this.cropZone(image, zone),
    }));

    const exportData: ExportData = {
      timestamp: new Date().toISOString(),
      image_name: imageName,
      zones: zonesWithImages,
      total_zones: zones.length,
    };

    return JSON.stringify(exportData, null, 2);
  },

  /**
   * Download JSON file
   */
  downloadJSON(jsonString: string, filename: string): void {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Convert image file to data URL
   */
  imageToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
};

