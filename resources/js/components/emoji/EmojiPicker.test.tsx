import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('EmojiPicker', () => {
    afterEach(() => {
        vi.doUnmock('emoji-picker-react')
        vi.resetModules()
    })

    it('opens the picker on trigger click and forwards a selected emoji', async () => {
        vi.doMock('emoji-picker-react', () => ({
            default: ({ onEmojiClick }: any) => (
                <button onClick={() => onEmojiClick({ emoji: '😀' })}>fake-picker</button>
            ),
        }))
        const { EmojiPicker } = await import('@/components/emoji/EmojiPicker')
        const onSelect = vi.fn()

        render(
            <EmojiPicker onSelect={onSelect}>
                <button>Open</button>
            </EmojiPicker>
        )

        await userEvent.click(screen.getByText('Open'))
        const fakePicker = await screen.findByText('fake-picker')
        await userEvent.click(fakePicker)

        expect(onSelect).toHaveBeenCalledWith('😀')
    })

    it('falls back gracefully and calls onError if the picker fails to load', async () => {
        vi.doMock('emoji-picker-react', () => ({
            default: () => { throw new Error('chunk load failed') },
        }))
        const { EmojiPicker } = await import('@/components/emoji/EmojiPicker')
        const onError = vi.fn()
        const onSelect = vi.fn()

        render(
            <EmojiPicker onSelect={onSelect} onError={onError}>
                <button>Open</button>
            </EmojiPicker>
        )

        await userEvent.click(screen.getByText('Open'))

        expect(await screen.findByText("Couldn't load the emoji picker.")).toBeInTheDocument()
        expect(onError).toHaveBeenCalled()
        expect(onSelect).not.toHaveBeenCalled()
    })

    it('does not blow up when onError is omitted', async () => {
        vi.doMock('emoji-picker-react', () => ({
            default: () => { throw new Error('chunk load failed') },
        }))
        const { EmojiPicker } = await import('@/components/emoji/EmojiPicker')

        render(
            <EmojiPicker onSelect={vi.fn()}>
                <button>Open</button>
            </EmojiPicker>
        )

        await userEvent.click(screen.getByText('Open'))

        expect(await screen.findByText("Couldn't load the emoji picker.")).toBeInTheDocument()
    })
})
