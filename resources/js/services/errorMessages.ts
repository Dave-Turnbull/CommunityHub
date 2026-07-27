import axios from 'axios'

/**
 * Turns a thrown error from an axios call (upload, send, ...) into a short,
 * user-facing sentence. `subject` names the thing that failed (a filename,
 * "Your message", ...) so the same helper reads naturally for both a failed
 * file upload and a failed message send.
 */
export function describeApiError(error: unknown, subject: string): string {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status

        if (status === 413) {
            return `${subject} is too large to upload.`
        }
        if (status === 422) {
            const data = error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined
            const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
            return firstFieldError ?? data?.message ?? `${subject} was rejected by the server.`
        }
        if (status === 403) {
            return `You don't have permission to do that.`
        }
        if (!error.response) {
            return `Couldn't reach the server. Check your connection and try again.`
        }
    }

    return `${subject} failed. Try again.`
}
