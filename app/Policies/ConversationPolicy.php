<?php

namespace App\Policies;

use App\Models\Conversation;
use App\Models\User;

class ConversationPolicy
{
    /** Only group conversations support adding people after creation. */
    public function addParticipants(User $user, Conversation $conversation): bool
    {
        return $conversation->type === 'group' && $conversation->hasParticipant($user->id);
    }
}
