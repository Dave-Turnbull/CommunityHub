<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class NotificationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'type'    => 'direct_message',
            'data'    => [
                'conversation_id' => fake()->uuid(),
                'message_id'      => fake()->uuid(),
                'sender_id'       => fake()->uuid(),
                'sender_name'     => fake()->firstName(),
                'preview'         => fake()->sentence(),
            ],
            'read_at' => null,
        ];
    }

    public function read(): static
    {
        return $this->state(fn () => ['read_at' => now()]);
    }
}
