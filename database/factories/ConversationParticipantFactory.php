<?php

namespace Database\Factories;

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class ConversationParticipantFactory extends Factory
{
    public function definition(): array
    {
        return [
            'conversation_id' => Conversation::factory(),
            'user_id'         => User::factory(),
        ];
    }
}
