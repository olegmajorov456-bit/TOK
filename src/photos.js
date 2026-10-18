export const MAX_PHOTOS = 6;
export const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

// Все фотографии анкеты по порядку: сначала массив photos, затем (для старых анкет) avatar_url.
export function getPhotos(profile) {
  const list = Array.isArray(profile?.photos) ? profile.photos.filter(Boolean) : [];
  if (list.length) return list.slice(0, MAX_PHOTOS);
  return profile?.avatar_url ? [profile.avatar_url] : [];
}

// Сжимает фотографию до 1280px по длинной стороне (JPEG), чтобы загрузка была быстрой.
// Если браузер не смог — возвращает исходный файл.
export async function compressImage(file, maxSide = 1280, quality = 0.86) {
  try {
    if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size < file.size) return new File([blob], "photo.jpg", { type: "image/jpeg" });
    return file;
  } catch {
    return file;
  }
}