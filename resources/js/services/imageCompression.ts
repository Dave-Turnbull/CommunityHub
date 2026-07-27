// Client-side compression applied before an image ever reaches uploadFile
// (see services/api.ts) — keeps upload size down without a server round trip.
// Fails open: any missing browser API, decode error, or a compressed result
// that isn't actually smaller falls back to returning the original file
// untouched, so a browser/format quirk never blocks the upload itself.

const MAX_DIMENSION = 1920
const JPEG_QUALITY = 0.82

// Recompressing already loses the point (nothing to gain) or actively
// breaks the file: GIF animation and SVG vector data don't survive a
// canvas round trip, and a small file is already cheap to upload as-is.
const SKIP_MIME_TYPES = new Set(['image/gif', 'image/svg+xml'])
const MIN_SIZE_TO_COMPRESS = 300 * 1024

// Re-encoded losslessly to preserve transparency (PNG) or passed through as
// their own format (JPEG/WebP, which already support a quality param);
// anything else (bmp, tiff, ...) is re-encoded as JPEG.
const LOSSLESS_TYPE = 'image/png'
const NATIVE_LOSSY_TYPES = new Set(['image/jpeg', 'image/webp'])

export async function compressImageFile(file: File): Promise<File> {
    if (!file.type.startsWith('image/') || SKIP_MIME_TYPES.has(file.type)) return file
    if (file.size <= MIN_SIZE_TO_COMPRESS) return file

    try {
        const bitmap = await createImageBitmap(file)
        const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
        const width = Math.round(bitmap.width * scale)
        const height = Math.round(bitmap.height * scale)

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return file

        ctx.drawImage(bitmap, 0, 0, width, height)
        bitmap.close()

        const outputType = file.type === LOSSLESS_TYPE || NATIVE_LOSSY_TYPES.has(file.type)
            ? file.type
            : 'image/jpeg'

        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, outputType, JPEG_QUALITY)
        )
        if (!blob || blob.size >= file.size) return file

        return new File([blob], file.name, { type: outputType, lastModified: file.lastModified })
    } catch {
        return file
    }
}
