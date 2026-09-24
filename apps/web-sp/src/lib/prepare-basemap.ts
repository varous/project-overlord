/**
 * Client-side prepare for base-map upload.
 * Images: keep as-is. PDFs: rasterise page 1 (PRD F3.2); note page count.
 *
 * pdf.js is imported only inside the PDF branch. A JPEG/PNG/WebP upload must
 * not fetch the ~129 KiB gzip library or the worker.
 */
export const MAX_BASEMAP_BYTES = 25 * 1024 * 1024;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PrepareOk = {
  ok: true;
  blob: Blob;
  mimeType: string;
  widthPx: number;
  heightPx: number;
  pageCount: number | null;
  sourcePage: number;
};

export type PrepareErr = {
  ok: false;
  code: "wrong_type" | "too_large" | "failed";
  message: string;
};

export async function prepareBasemapFile(file: File): Promise<PrepareOk | PrepareErr> {
  if (file.size > MAX_BASEMAP_BYTES) {
    return { ok: false, code: "too_large", message: "File must be 25 MB or smaller" };
  }

  if (IMAGE_TYPES.has(file.type)) {
    try {
      const dims = await imageDims(file);
      return {
        ok: true,
        blob: file,
        mimeType: file.type,
        widthPx: dims.width,
        heightPx: dims.height,
        pageCount: null,
        sourcePage: 1,
      };
    } catch {
      return { ok: false, code: "failed", message: "Could not read that image" };
    }
  }

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return rasterisePdfPage1(file);
  }

  return {
    ok: false,
    code: "wrong_type",
    message: "Upload JPG, PNG, WebP, or PDF only",
  };
}

async function rasterisePdfPage1(file: File): Promise<PrepareOk | PrepareErr> {
  try {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data }).promise;
    const pageCount = pdf.numPages;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { ok: false, code: "failed", message: "Could not rasterise PDF" };
    }
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) {
      return { ok: false, code: "failed", message: "Could not rasterise PDF" };
    }
    if (blob.size > MAX_BASEMAP_BYTES) {
      return {
        ok: false,
        code: "too_large",
        message: "Rasterised page exceeds 25 MB — try a lower-resolution PDF",
      };
    }
    return {
      ok: true,
      blob,
      mimeType: "image/png",
      widthPx: canvas.width,
      heightPx: canvas.height,
      pageCount,
      sourcePage: 1,
    };
  } catch {
    return { ok: false, code: "failed", message: "Could not read that PDF" };
  }
}

function imageDims(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}
