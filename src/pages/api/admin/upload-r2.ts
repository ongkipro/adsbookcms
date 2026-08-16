import type { APIRoute } from "astro";
import { jsonError, jsonOk } from "../../../lib/api";
import { getRuntimeEnv } from "../../../lib/env";

export const prerender = false;

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 64 * 1024;
const MAX_UPLOADS_PER_HOUR = 20;
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function matchesSignature(type: string, bytes: Uint8Array) {
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));
  if (type === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png")
    return (
      bytes.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (value, index) => bytes[index] === value,
      )
    );
  if (type === "image/gif")
    return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
  if (type === "image/webp")
    return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
  if (type === "image/avif")
    return ascii(4, 4) === "ftyp" && ["avif", "avis"].includes(ascii(8, 4));
  return false;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = getRuntimeEnv(locals);
    const bucket = env?.ASSET_BUCKET as R2Bucket | undefined;
    const sessions = env?.SESSION as KVNamespace | undefined;
    if (!bucket || !sessions) {
      return jsonError("Asset storage belum tersedia.", 503);
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
      return jsonError("Ukuran file maksimal 2 MB.", 413);
    }

    const clientIp = request.headers.get("cf-connecting-ip")?.trim() || "local";
    const uploadKey = `admin-upload-count:${clientIp}:${Math.floor(Date.now() / 3_600_000)}`;
    const uploadCount = Number(await sessions.get(uploadKey)) || 0;
    if (uploadCount >= MAX_UPLOADS_PER_HOUR) {
      return jsonError("Batas 20 upload per jam telah tercapai.", 429);
    }

    const formData = await request.formData();
    const fileInput = formData.get("file");
    const file = fileInput instanceof File ? fileInput : null;

    if (!file) {
      return jsonError("File upload is required", 400);
    }
    if (!(file.type in EXTENSION_BY_TYPE)) {
      return jsonError(
        "Tipe file tidak didukung. Gunakan JPG, PNG, WEBP, GIF, atau AVIF.",
        415,
      );
    }
    if (file.size <= 0) {
      return jsonError("File upload tidak boleh kosong.", 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return jsonError("Ukuran file maksimal 2 MB.", 413);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesSignature(file.type, bytes)) {
      return jsonError(
        "Isi file tidak sesuai dengan tipe gambar yang dipilih.",
        415,
      );
    }

    const extension = EXTENSION_BY_TYPE[file.type];
    const fileName = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
    await bucket.put(fileName, bytes, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "public, max-age=31536000, immutable",
        contentDisposition: "inline",
      },
    });
    await sessions.put(uploadKey, String(uploadCount + 1), {
      expirationTtl: 60 * 60,
    });

    return jsonOk({
      url: `/assets/${fileName}`,
      fileName,
    });
  } catch (error) {
    console.error("admin-upload-r2-post", error);
    return jsonError("Gagal mengunggah berkas.", 500);
  }
};
