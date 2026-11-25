import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ParticipantVolumeControl } from '@/components/voice/ParticipantVolumeControl'
import { useVoiceVolume } from '@/stores'

const participant = { userId: 'peer-1', displayName: 'Bob', avatarUrl: null, muted: false }

describe('ParticipantVolumeControl', () => {
    beforeEach(() => {
        useVoiceVolume.setState({ volumes: {} })
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('opening the popover shows a volume slider defaulted to 100', async () => {
        const user = userEvent.setup()
        render(<ParticipantVolumeControl participant={participant} size="sm" />)

        await user.click(screen.getByLabelText('Volume for Bob'))

        expect(screen.getByLabelText(/Bob's volume/)).toHaveValue('100')
    })

    it('moving the slider updates useVoiceVolume for that participant only', async () => {
        const user = userEvent.setup()
        render(<ParticipantVolumeControl participant={participant} size="sm" />)
        await user.click(screen.getByLabelText('Volume for Bob'))

        fireEvent.change(screen.getByLabelText(/Bob's volume/), { target: { value: '30' } })

        expect(useVoiceVolume.getState().volumes['peer-1']).toBeCloseTo(0.3)
    })

    it('reflects an existing stored volume rather than always defaulting to 100', async () => {
        useVoiceVolume.getState().setVolume('peer-1', 0.6)
        const user = userEvent.setup()
        render(<ParticipantVolumeControl participant={participant} size="sm" />)

        await user.click(screen.getByLabelText('Volume for Bob'))

        expect(screen.getByLabelText(/Bob's volume/)).toHaveValue('60')
    })

    it('does not render an audio element itself — playback belongs to VoiceAudioHost', () => {
        const { container } = render(<ParticipantVolumeControl participant={participant} size="sm" />)

        expect(container.querySelector('audio')).not.toBeInTheDocument()
    })

    it('shows a gray dot for unknown connection quality by default', () => {
        render(<ParticipantVolumeControl participant={participant} size="sm" />)

        expect(screen.getByTitle('Connection quality unknown')).toBeInTheDocument()
    })

    it('shows a colored dot matching the reported connection quality tier', () => {
        render(<ParticipantVolumeControl participant={{ ...participant, quality: 'poor' }} size="sm" />)

        const dot = screen.getByTitle('Poor connection')
        expect(dot.className).toMatch(/bg-danger/)
    })

    it('shows a green dot for good connection quality', () => {
        render(<ParticipantVolumeControl participant={{ ...participant, quality: 'good' }} size="sm" />)

        expect(screen.getByTitle('Good connection').className).toMatch(/bg-success/)
    })
})
