<?php

namespace App\Mail;

use App\Models\ServerInvite;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class ServerInviteMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(public ServerInvite $invite)
    {
    }

    public function build(): self
    {
        $inviter = $this->invite->invitedBy;

        return $this->subject("{$inviter->display_name} invited you to join " . config('app.name'))
            ->view('emails.server-invite', [
                'inviter'    => $inviter,
                'acceptUrl'  => url("/register?invite={$this->invite->token}"),
                'expiresAt'  => $this->invite->expires_at,
            ]);
    }
}
