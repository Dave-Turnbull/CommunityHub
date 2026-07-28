<?php

namespace App\Policies;

use App\Models\Message;
use App\Models\User;

/**
 * "Can this user see this message" — the same two-branch check
 * TextMessageService::assertMember applies when listing/sending against a
 * Channel/Conversation directly, expressed here starting from a Message row
 * instead (what Web\MessageController's direct-link resolver and
 * AttachmentPolicy both need). Channel branch mirrors Channel::isVisibleTo's
 * room-membership + role-visibility rules; conversation branch is
 * participant-only.
 */
class MessagePolicy
{
    public function view(User $user, Message $message): bool
    {
        if ($message->parent_message_id) {
            return $message->isVisibleTo($user);
        }

        if ($message->channel_id) {
            $channel = $message->channel;

            return $channel->room->hasMember($user->id) && $channel->isVisibleTo($user);
        }

        return $message->conversation->hasParticipant($user->id);
    }
}
