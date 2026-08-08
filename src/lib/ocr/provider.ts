export type OcrInput = { bytes: Uint8Array; mimeType: string; pageNumber?: number };
export type OcrResult = { pages: Array<{ pageNumber: number; text: string; confidence: number }> };
export interface OcrProvider { extract(input: OcrInput): Promise<OcrResult>; }
export class MockOcrProvider implements OcrProvider { async extract(): Promise<OcrResult> { throw new Error("OCR_REQUIRED: No real OCR provider is configured; document remains pending"); } }
