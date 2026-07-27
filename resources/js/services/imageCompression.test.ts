import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressImageFile } from '@/services/imageCompression'

const bigContent = () => new Uint8Array(400 * 1024) // 400 KB, above the 300 KB skip threshold

function mockCanvas(outputBlob: Blob | null) {
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as any)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: any) {
        cb(outputBlob)
    })
    return { drawImage }
}

function mockBitmap(width: number, height: number) {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }))
    return { close }
}

describe('compressImageFile', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('leaves non-image files untouched', async () => {
        const file = new File([bigContent()], 'doc.pdf', { type: 'application/pdf' })

        const result = await compressImageFile(file)

        expect(result).toBe(file)
    })

    it('leaves small images untouched (not worth compressing)', async () => {
        const file = new File(['tiny'], 'icon.png', { type: 'image/png' })

        const result = await compressImageFile(file)

        expect(result).toBe(file)
    })

    it('leaves animated GIFs untouched to avoid flattening them to one frame', async () => {
        const file = new File([bigContent()], 'anim.gif', { type: 'image/gif' })

        const result = await compressImageFile(file)

        expect(result).toBe(file)
    })

    it('leaves SVGs untouched since they are vector, not raster', async () => {
        const file = new File([bigContent()], 'logo.svg', { type: 'image/svg+xml' })

        const result = await compressImageFile(file)

        expect(result).toBe(file)
    })

    it('downscales and re-encodes a large JPEG smaller than the original', async () => {
        mockBitmap(4000, 3000)
        const smallerBlob = new Blob([new Uint8Array(1024)], { type: 'image/jpeg' })
        const { drawImage } = mockCanvas(smallerBlob)
        const file = new File([bigContent()], 'photo.jpg', { type: 'image/jpeg' })

        const result = await compressImageFile(file)

        expect(result).not.toBe(file)
        expect(result.name).toBe('photo.jpg')
        expect(result.type).toBe('image/jpeg')
        expect(result.size).toBe(smallerBlob.size)
        // Downscaled proportionally to fit the 1920px max dimension.
        expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1920, 1440)
    })

    it('re-encodes a large PNG losslessly (same mime type, no quality loss)', async () => {
        mockBitmap(3000, 3000)
        const smallerBlob = new Blob([new Uint8Array(2048)], { type: 'image/png' })
        mockCanvas(smallerBlob)
        const file = new File([bigContent()], 'screenshot.png', { type: 'image/png' })

        const result = await compressImageFile(file)

        expect(result.type).toBe('image/png')
        expect(result.size).toBe(smallerBlob.size)
    })

    it('falls back to the original file if the compressed result is not smaller', async () => {
        mockBitmap(4000, 3000)
        const largerBlob = new Blob([bigContent(), new Uint8Array(100)], { type: 'image/jpeg' })
        mockCanvas(largerBlob)
        const file = new File([bigContent()], 'photo.jpg', { type: 'image/jpeg' })

        const result = await compressImageFile(file)

        expect(result).toBe(file)
    })

    it('falls back to the original file when canvas 2D context is unavailable', async () => {
        mockBitmap(4000, 3000)
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
        const file = new File([bigContent()], 'photo.jpg', { type: 'image/jpeg' })

        const result = await compressImageFile(file)

        expect(result).toBe(file)
    })

    it('falls back to the original file when decoding throws', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')))
        const file = new File([bigContent()], 'photo.jpg', { type: 'image/jpeg' })

        const result = await compressImageFile(file)

        expect(result).toBe(file)
    })
})
