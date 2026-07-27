import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import { describeApiError } from '@/services/errorMessages'

function axiosErrorWith(status: number, data?: unknown): AxiosError {
    const error = new AxiosError('Request failed')
    error.response = { status, data, statusText: '', headers: {}, config: {} as any }
    return error
}

describe('describeApiError', () => {
    it('describes a 413 as the subject being too large', () => {
        expect(describeApiError(axiosErrorWith(413), 'video.mp4')).toBe('video.mp4 is too large to upload.')
    })

    it('surfaces the first validation error from a 422', () => {
        const error = axiosErrorWith(422, { errors: { file: ['The file must not be greater than 1000 kilobytes.'] } })

        expect(describeApiError(error, 'video.mp4')).toBe('The file must not be greater than 1000 kilobytes.')
    })

    it('falls back to the 422 message when there are no field errors', () => {
        const error = axiosErrorWith(422, { message: 'Validation failed.' })

        expect(describeApiError(error, 'video.mp4')).toBe('Validation failed.')
    })

    it('falls back to a generic 422 message when the response has neither', () => {
        expect(describeApiError(axiosErrorWith(422), 'video.mp4')).toBe('video.mp4 was rejected by the server.')
    })

    it('describes a 403 as a permission error', () => {
        expect(describeApiError(axiosErrorWith(403), 'Your message')).toBe("You don't have permission to do that.")
    })

    it('describes a network error (no response) distinctly', () => {
        const error = new AxiosError('Network Error')
        expect(describeApiError(error, 'Your message')).toBe("Couldn't reach the server. Check your connection and try again.")
    })

    it('falls back to a generic message for other statuses', () => {
        expect(describeApiError(axiosErrorWith(500), 'Your message')).toBe('Your message failed. Try again.')
    })

    it('falls back to a generic message for a non-axios error', () => {
        expect(describeApiError(new Error('boom'), 'Your message')).toBe('Your message failed. Try again.')
    })
})
