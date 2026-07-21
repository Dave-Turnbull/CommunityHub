<?php

namespace Database\Factories;

use App\Models\Channel;
use App\Models\Conversation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class MessageFactory extends Factory
{
    public function definition(): array
    {
        return [
            'channel_id'      => Channel::factory(),
            'conversation_id' => null,
            'author_id'       => User::factory(),
            'content'         => $this->faker->sentence(),
            'type'            => 'text',
            'is_edited'       => false,
            'is_pinned'       => false,
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
