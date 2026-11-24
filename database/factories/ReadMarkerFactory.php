<?php

namespace Database\Factories;

use App\Models\Channel;
use App\Models\Conversation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class ReadMarkerFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id'         => User::factory(),
            'channel_id'      => Channel::factory(),
            'conversation_id' => null,
            'last_read_at'    => now(),
        ];
    }

    public function inConversation(): static
    {
        return $this->state(fn () => [
            'channel_id'      => null,
            'conversation_id' => Conversation::factory(),
        ]);
    }
}
