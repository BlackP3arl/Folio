import { AnnotationEditorType } from "pdfjs-dist";
import type { PDFDocumentProxy } from "./pdf";
import type { PDFViewer } from "./viewer";

export interface SignatureImage { url: string; width: number; height: number }
export interface SignatureTarget { id: string; label: string; rect: number[]; kind: "field" | "label" }
export interface SignaturePlacement { pageNumber: number; rect: number[] }
const cache = new WeakMap<PDFDocumentProxy, Map<number, Promise<SignatureTarget[]>>>();

export function detectSignatureTargets(pdf: PDFDocumentProxy, pageNumber: number) {
  let pages = cache.get(pdf);
  if (!pages) cache.set(pdf, pages = new Map());
  let result = pages.get(pageNumber);
  if (!result) {
    result = (async () => {
      const page = await pdf.getPage(pageNumber);
      const annotations = await page.getAnnotations();
      const signedFields = await pdf.getSignatures();
      if (signedFields?.length) return [];
      const fields: SignatureTarget[] = annotations.filter(annotation => annotation.subtype === "Widget"
        && annotation.fieldType === "Sig" && !annotation.fieldValue && !(annotation.fieldFlags & 1)
        && !(annotation.annotationFlags & 35) && annotation.rect.length === 4 && annotation.rect.every(Number.isFinite))
        .map((annotation): SignatureTarget => ({ id: annotation.id, label: annotation.alternativeText || annotation.fieldName || "Signature field",
          rect: [Math.max(page.view[0], annotation.rect[0]), Math.max(page.view[1], annotation.rect[1]),
            Math.min(page.view[2], annotation.rect[2]), Math.min(page.view[3], annotation.rect[3])], kind: "field" }))
        .filter(target => target.rect[2] - target.rect[0] > 4 && target.rect[3] - target.rect[1] > 4);
      if (fields.length) return fields;
      const text = await page.getTextContent();
      return text.items.flatMap((item, index): SignatureTarget[] => {
        if (!("str" in item) || !/\b(signature|sign here|signed by)\b/i.test(item.str)
          || /digital|electronic|verified|invalid/i.test(item.str)) return [];
        const [left, bottom, right, top] = page.view;
        const positionX = Math.max(left, Math.min(item.transform[4], right - Math.min(180, right - left)));
        const positionY = Math.max(bottom, Math.min(item.transform[5] + Math.max(item.height, 10) + 3, top - 42));
        return [{ id: "label-" + index, label: item.str.trim().slice(0, 80) + " (suggested)",
          rect: [positionX, positionY, Math.min(right, positionX + 180), Math.min(top, positionY + 42)], kind: "label" }];
      }).slice(0, 12);
    })();
    pages.set(pageNumber, result);
    result.catch(() => pages!.delete(pageNumber));
  }
  return result;
}

export function fitSignature(signature: SignatureImage, bounds: number[]) {
  const width = bounds[2] - bounds[0];
  const height = bounds[3] - bounds[1];
  const factor = Math.min(width / signature.width, height / signature.height);
  const fittedWidth = signature.width * factor;
  const fittedHeight = signature.height * factor;
  const positionX = bounds[0] + (width - fittedWidth) / 2;
  const positionY = bounds[1] + (height - fittedHeight) / 2;
  return [positionX, positionY, positionX + fittedWidth, positionY + fittedHeight];
}

export function mapRectToPage(rect: number[], sourceView: number[], targetView: number[]) {
  const sourceWidth = sourceView[2] - sourceView[0];
  const sourceHeight = sourceView[3] - sourceView[1];
  const targetWidth = targetView[2] - targetView[0];
  const targetHeight = targetView[3] - targetView[1];
  const mapX = (value: number) => targetView[0] + (value - sourceView[0]) / sourceWidth * targetWidth;
  const mapY = (value: number) => targetView[1] + (value - sourceView[1]) / sourceHeight * targetHeight;
  return [mapX(rect[0]), mapY(rect[1]), mapX(rect[2]), mapY(rect[3])];
}

async function addSignature(viewer: PDFViewer, pdf: PDFDocumentProxy, placement: SignaturePlacement, signature: SignatureImage) {
  viewer.currentPageNumber = placement.pageNumber;
  let layer;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (viewer.pdfDocument !== pdf) throw new Error("The document changed.");
    layer = viewer.getPageView(placement.pageNumber - 1)?.annotationEditorLayer?.annotationEditorLayer;
    if (layer) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  if (!layer) throw new Error(`Page ${placement.pageNumber} isn't ready for signatures. Please try again.`);
  const { pageX, pageY } = layer.viewport.rawDims;
  const localRect = placement.rect.map((coordinate, index) => coordinate - (index % 2 === 0 ? pageX : pageY));
  const editor = await layer.deserialize({ annotationType: AnnotationEditorType.STAMP, pageIndex: placement.pageNumber - 1,
    rect: localRect, rotation: 0, bitmapUrl: signature.url, isSvg: false,
    accessibilityData: { decorative: false, altText: "Handwritten signature" } });
  if (!editor || viewer.pdfDocument !== pdf) throw new Error(`Couldn't add the signature to page ${placement.pageNumber}.`);
  layer.add(editor);
  for (let attempt = 0; attempt < 120; attempt++) {
    if (editor.div?.querySelector("canvas")) return editor;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  editor.remove();
  throw new Error(`Couldn't load the signature image on page ${placement.pageNumber}. Please try again.`);
}

export async function signaturePlacements(pdf: PDFDocumentProxy, pageNumber: number, signature: SignatureImage, bounds: number[], allPages: boolean) {
  if (!allPages) return [{ pageNumber, rect: fitSignature(signature, bounds) }];
  const source = await pdf.getPage(pageNumber);
  const placements: SignaturePlacement[] = [];
  for (let targetPage = 1; targetPage <= pdf.numPages; targetPage++) {
    const target = targetPage === pageNumber ? source : await pdf.getPage(targetPage);
    placements.push({ pageNumber: targetPage, rect: fitSignature(signature, mapRectToPage(bounds, source.view, target.view)) });
  }
  return placements;
}

export async function placeSignatures(viewer: PDFViewer, pdf: PDFDocumentProxy, signature: SignatureImage, placements: SignaturePlacement[]) {
  if (viewer.pdfDocument !== pdf) throw new Error("The document changed. Open Sign again.");
  const originalPage = viewer.currentPageNumber;
  const added: { remove(): void }[] = [];
  viewer.annotationEditorMode = { mode: AnnotationEditorType.STAMP };
  try {
    for (const placement of placements) added.push(await addSignature(viewer, pdf, placement, signature));
  } catch (reason) {
    for (const editor of added.reverse()) editor.remove();
    throw reason;
  } finally {
    if (viewer.pdfDocument === pdf) {
      viewer.annotationEditorMode = { mode: AnnotationEditorType.NONE };
      viewer.currentPageNumber = originalPage;
    }
  }
}

export async function placeSignature(viewer: PDFViewer, pdf: PDFDocumentProxy, pageNumber: number, signature: SignatureImage, rect: number[]) {
  await placeSignatures(viewer, pdf, signature, [{ pageNumber, rect }]);
}

export function cleanSignature(source: HTMLCanvasElement, crop: number[], threshold: number): SignatureImage {
  const canvas = document.createElement("canvas");
  const factor = Math.min(1, 1200 / crop[2], 600 / crop[3]);
  canvas.width = Math.max(1, Math.round(crop[2] * factor));
  canvas.height = Math.max(1, Math.round(crop[3] * factor));
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, ...crop as [number, number, number, number], 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const brightness = Math.min(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
    const opacity = image.data[offset + 3] / 255 * Math.min(255, Math.max(0, (threshold - brightness) * 4));
    image.data[offset] = image.data[offset + 1] = image.data[offset + 2] = 25;
    image.data[offset + 3] = opacity;
    if (opacity > 40) {
      const pixelX = offset / 4 % canvas.width, pixelY = Math.floor(offset / 4 / canvas.width);
      left = Math.min(left, pixelX); right = Math.max(right, pixelX); top = Math.min(top, pixelY); bottom = Math.max(bottom, pixelY);
    }
  }
  if (right - left < 8 || bottom - top < 3) throw new Error("No signature found. Crop closer or increase ink sensitivity.");
  context.putImageData(image, 0, 0);
  const trimmed = document.createElement("canvas");
  trimmed.width = right - left + 9; trimmed.height = bottom - top + 9;
  trimmed.getContext("2d")!.drawImage(canvas, left, top, right - left + 1, bottom - top + 1, 4, 4, right - left + 1, bottom - top + 1);
  return { url: trimmed.toDataURL("image/png"), width: trimmed.width, height: trimmed.height };
}

export function readSignature(): SignatureImage | null {
  try {
    const value = JSON.parse(localStorage.getItem("folio:signature") || "null");
    return value && typeof value.url === "string" && value.url.startsWith("data:image/png;base64,")
      && value.url.length < 4000000 && Number.isFinite(value.width) && Number.isFinite(value.height)
      && value.width > 0 && value.height > 0 ? value : null;
  } catch { return null; }
}
