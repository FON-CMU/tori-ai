/**
 * pdf.js (ผ่าน pdf-parse) อ้างอิง DOMMatrix ซึ่งไม่มีใน Node/Vercel runtime
 * สตับพอสำหรับเส้นทาง extract text
 */
export function ensurePdfJsDomPolyfills() {
  const g = globalThis as Record<string, unknown>;

  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class DOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      constructor(_init?: string | number[]) {}
      multiplySelf() {
        return this;
      }
      invertSelf() {
        return this;
      }
      translateSelf() {
        return this;
      }
      scaleSelf() {
        return this;
      }
    };
  }

  if (typeof g.Path2D === "undefined") {
    g.Path2D = class Path2D {};
  }

  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageData {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    };
  }
}
