const STORAGE_KEY = 'voice_client_id'

/**
 * A persistent id representing "this browser on this machine" — mic/speaker
 * device preference is scoped by (user, client_id), not just user, since the
 * same user picks different devices on their laptop vs their desktop.
 */
export function getClientId(): string {
    let id = localStorage.getItem(STORAGE_KEY)

    if (!id) {
        id = crypto.randomUUID()
        localStorage.setItem(STORAGE_KEY, id)
    }

    return id
}
