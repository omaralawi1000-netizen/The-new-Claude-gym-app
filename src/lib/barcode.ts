/**
 * Barcode reader that works on every browser: the native BarcodeDetector (Chrome/Android) when present,
 * otherwise a WebAssembly ZXing reader bundled with the app (iPhone Safari, Firefox, desktop).
 * The wasm is served from our own origin — no CDN — and only loaded the first time you scan.
 */
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

export interface Reader { detect: (source: HTMLVideoElement) => Promise<string | null>; kind: 'native' | 'wasm' }
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'] as const;

export async function createReader(): Promise<Reader> {
  const W = window as any;
  if ('BarcodeDetector' in W) {
    try {
      const supported: string[] = await W.BarcodeDetector.getSupportedFormats?.() ?? [];
      const formats = FORMATS.filter((f) => !supported.length || supported.includes(f));
      const det = new W.BarcodeDetector({ formats });
      return { kind: 'native', detect: async (v) => (await det.detect(v))[0]?.rawValue ?? null };
    } catch { /* fall through to wasm */ }
  }
  // use the ponyfill's own prepare hook so the override reaches the exact module instance it will run
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) }, fireImmediately: true });
  const det = new BarcodeDetector({ formats: [...FORMATS] });
  return { kind: 'wasm', detect: async (v) => (await det.detect(v))[0]?.rawValue ?? null };
}

/** A scanned value → a product number. Plain EAN/UPC digits, or digits inside a QR payload / product URL. */
export function extractCode(raw: string): string | null {
  const m = raw.match(/\d{8,14}/);
  return m ? m[0] : null;
}
