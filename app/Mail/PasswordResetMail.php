<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class PasswordResetMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(public User $user, public string $token)
    {
    }

    public function build(): self
    {
        return $this->subject('Reset your ' . config('app.name') . ' password')
            ->view('emails.password-reset', [
                'user'         => $this->user,
                'resetUrl'     => route('password.reset', ['token' => $this->token, 'email' => $this->user->email]),
                'expireMinutes' => config('auth.passwords.users.expire'),
            ]);
    }
}
