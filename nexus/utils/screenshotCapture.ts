/**
 * Screenshot capture utilities
 * Background-side helpers for capturing visible tab screenshots
 * and area cropping from data URLs.
 */

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelRatio: number;
}

/**
 * Capture the visible area of the active tab.
 * Must be called from the background service worker.
 */
export async function captureVisibleTab(windowId?: number): Promise<string> {
  let wid = windowId;
  if (!wid) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.windowId) {
      throw new Error('No active tab found');
    }
    wid = tabs[0].windowId;
  }
  const dataUrl = await chrome.tabs.captureVisibleTab(wid, { format: 'png' });
  return dataUrl;
}

/**
 * Crop a rectangular area from a screenshot data URL using OffscreenCanvas.
 * Accounts for devicePixelRatio.
 */
export async function cropScreenshotArea(
  dataUrl: string,
  area: CropArea,
): Promise<string> {
  const image = await loadImage(dataUrl);
  const { x, y, width, height, pixelRatio } = area;

  const cropX = Math.round(x * pixelRatio);
  const cropY = Math.round(y * pixelRatio);
  const cropW = Math.round(width * pixelRatio);
  const cropH = Math.round(height * pixelRatio);

  const canvas = new OffscreenCanvas(cropW, cropH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create OffscreenCanvas context');

  ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(dataUrl: string): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) => createImageBitmap(blob))
      .then(resolve)
      .catch(reject);
  });
}
