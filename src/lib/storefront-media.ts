const MEDIA_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

export const MAX_STOREFRONT_MEDIA_BYTES = 5 * 1024 * 1024;

export function validateStorefrontMedia(file: {
  name: string;
  type: string;
  size: number;
}) {
  const extension = MEDIA_TYPES.get(file.type.toLowerCase());
  if (!extension) {
    throw new Error("Format gambar harus JPEG, PNG, WebP, GIF, atau AVIF.");
  }
  if (!Number.isFinite(file.size) || file.size < 1) {
    throw new Error("File gambar kosong.");
  }
  if (file.size > MAX_STOREFRONT_MEDIA_BYTES) {
    throw new Error("Ukuran gambar maksimal 5 MB.");
  }
  const base = file.name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
  return { extension, base };
}

export function buildStorefrontMediaKey(
  file: { name: string; type: string; size: number },
  id: string = crypto.randomUUID(),
  date = new Date(),
) {
  const { extension, base } = validateStorefrontMedia(file);
  const month = date.toISOString().slice(0, 7);
  return `content/${month}/${id}-${base}.${extension}`;
}
