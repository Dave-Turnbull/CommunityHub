<?php

namespace Database\Factories;

use App\Models\Message;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class NotificationMuteFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id'    => User::factory(),
            'message_id' => Message::factory(),
        ];
    }
}
