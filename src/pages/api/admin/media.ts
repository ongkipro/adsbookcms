import type { APIRoute } from "astro";
import { jsonError, jsonOk } from "../../../lib/api";
import { getRuntimeEnv } from "../../../lib/env";
import { buildStorefrontMediaKey } from "../../../lib/storefront-media";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const bucket = getRuntimeEnv(locals)?.ASSET_BUCKET;
  if (!bucket || typeof bucket !== "object") {
    return jsonError("Penyimpanan media tenant belum tersedia.", 503);
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("File gambar wajib dipilih.", 400);
    const key = buildStorefrontMediaKey(file);
    await (bucket as R2Bucket).put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        uploadedBy: locals.admin?.username || "unknown",
        originalName: file.name.slice(0, 180),
      },
    });
    return jsonOk(
      {
        message: "Media tenant berhasil diunggah.",
        data: { key, url: `/media/${key}` },
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload media gagal.";
    const status = /Format gambar|File gambar|Ukuran gambar/.test(message) ? 422 : 500;
    if (status === 500) console.error("admin-media-post", error);
    return jsonError(message, status);
  }
};
