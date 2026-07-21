<?php

namespace App\Mail;

use App\Models\RoomInvite;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class RoomInviteMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(public RoomInvite $invite)
    {
    }

    public function build(): self
    {
        $room    = $this->invite->room;
        $inviter = $this->invite->invitedBy;

        return $this->subject("{$inviter->display_name} invited you to join {$room->name} on " . config('app.name'))
            ->view('emails.room-invite', [
                'room'       => $room,
                'inviter'    => $inviter,
                'acceptUrl'  => url("/invite/{$this->invite->token}"),
                'expiresAt'  => $this->invite->expires_at,
            ]);
    }
}
