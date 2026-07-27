<?php

namespace App\Policies;

use App\Models\Attachment;
use App\Models\User;

/**
 * An attachment is exactly as visible as the message it's on (see
 * MessagePolicy) — never independently reachable by a bare URL regardless of
 * channel/room membership or bans, see CLAUDE.md's "Attachment visibility".
 * Before it's attached to a sent message (the brief window between POST
 * /api/upload and the message actually going out — message_id still null),
 * there's no message to check yet, so only the uploader may view it.
 */
class AttachmentPolicy
{
    public function view(User $user, Attachment $attachment): bool
    {
        if (! $attachment->message_id) {
            return $attachment->uploader_id === $user->id;
        }

        return (new MessagePolicy)->view($user, $attachment->message);
    }
}
