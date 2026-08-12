"use client";

// Getting a photographed invoice ready to send to the extraction model.
//
// Staff do nothing for this. They take the picture the way they always have, on whatever
// phone is in their pocket, and this shrinks the COPY that goes to the model. Nobody is
// asked to resize anything, because "ask the seasonal employee to compress a photo" is not
// a workflow that survives a Saturday in August.
//
// THE ORIGINAL IS NEVER TOUCHED. What goes to Supabase Storage is the file the staff member
// picked, at full resolution. That upload is the store's record of the invoice and has to be
// kept for six years under Canadian rules, so it must stay legible for a human reading it
// back in 2032. Only the model's copy is reduced.
//
// Two limits make this necessary, and they are different limits:
//   1. Vercel caps a function request body at 4.5 MB, and /api/extract carries the image as
//      base64 inside JSON. Base64 inflates by about a third, so a photo over roughly 3.3 MB
//      fails the request before any of our code runs. A modern phone clears that easily.
//   2. Claude Sonnet 5 reads images at a maximum of 2576 pixels on the long edge and
//      downsamples anything larger itself. Pixels above that are paid for in upload time and
//      thrown away at the other end.
//
// If anything here fails, we fall back to sending the original bytes. A capture that works
// slowly is better than a capture that does not happen, and this helper must never be the
// reason an invoice cannot be recorded.

// Sonnet 5's high-resolution cap. Above this the model downsamples anyway.
const MAX_EDGE = 2576;

// Leaves room for base64 inflation (4/3) plus the JSON wrapper under Vercel's 4.5 MB body
// limit. 3.2 MB of image becomes about 4.3 MB of body.
const MAX_BYTES = 3_200_000;

// Step down the JPEG quality if the first encode is still too big. Stops well above the
// point where invoice digits start to smear.
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55];

export type PreparedImage = {
  base64: string;
  mediaType: string;
  /** True when the copy sent to the model differs from the file on disk. */
  reduced: boolean;
  originalBytes: number;
  sentBytes: number;
};

function toBase64(blobOrFile: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(new Error("could not read file"));
    r.readAsDataURL(blobOrFile);
  });
}

// Decode with the EXIF rotation applied. A phone held sideways writes an orientation flag
// rather than rotating the pixels, and a canvas that ignores it hands the model a sideways
// invoice, which reads far worse than a smaller upright one.
async function decode(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", quality));
}

/**
 * Returns the bytes to send to /api/extract, shrinking a photo only when it is worth it.
 *
 * PDFs pass through untouched: they cannot be drawn to a canvas, and a scanned PDF is
 * usually already small. A PDF too large to send is reported in plain words rather than
 * failing as an opaque network error, because the person holding it can act on that
 * ("photograph the pages instead") and cannot act on a 413.
 */
export async function prepareForExtraction(file: File): Promise<PreparedImage> {
  const originalBytes = file.size;

  if (file.type === "application/pdf") {
    if (originalBytes > MAX_BYTES) {
      throw new Error(
        "This PDF is too large to read (over 3 MB). Photograph the invoice pages instead, or save the PDF at a smaller size."
      );
    }
    return {
      base64: await toBase64(file),
      mediaType: file.type,
      reduced: false,
      originalBytes,
      sentBytes: originalBytes
    };
  }

  // Small enough already and within the model's resolution: send it exactly as it is.
  // Checking bytes first avoids decoding an image we were never going to change.
  if (originalBytes <= MAX_BYTES) {
    try {
      const probe = await decode(file);
      const longEdge = Math.max(probe.width, probe.height);
      probe.close?.();
      if (longEdge <= MAX_EDGE) {
        return {
          base64: await toBase64(file),
          mediaType: file.type,
          reduced: false,
          originalBytes,
          sentBytes: originalBytes
        };
      }
    } catch {
      // Could not decode to measure it. It is under the size limit, so send it unchanged
      // rather than blocking the capture.
      return {
        base64: await toBase64(file),
        mediaType: file.type,
        reduced: false,
        originalBytes,
        sentBytes: originalBytes
      };
    }
  }

  try {
    const bitmap = await decode(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    // White behind the image: a transparent PNG flattened to JPEG would otherwise go black
    // wherever the scan had no ink, which is most of an invoice.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    for (const q of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, q);
      if (!blob) break;
      if (blob.size <= MAX_BYTES) {
        return {
          base64: await toBase64(blob),
          mediaType: "image/jpeg",
          reduced: true,
          originalBytes,
          sentBytes: blob.size
        };
      }
    }

    // Every quality step was still too big, which means an unusually large document photo.
    // Take the smallest encode we can produce rather than giving up on the capture.
    const last = await canvasToBlob(canvas, QUALITY_STEPS[QUALITY_STEPS.length - 1]);
    if (last) {
      return {
        base64: await toBase64(last),
        mediaType: "image/jpeg",
        reduced: true,
        originalBytes,
        sentBytes: last.size
      };
    }
    throw new Error("could not encode");
  } catch {
    // Canvas is unavailable or the image would not decode. Send the original and let the
    // route answer: an oversized request fails with a message, which is no worse than the
    // behaviour before this helper existed.
    return {
      base64: await toBase64(file),
      mediaType: file.type,
      reduced: false,
      originalBytes,
      sentBytes: originalBytes
    };
  }
}

/** "4.2 MB" / "870 KB", for telling somebody what happened without jargon. */
export function readableSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}
