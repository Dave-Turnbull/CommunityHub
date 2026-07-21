<?php

namespace Database\Factories;

use App\Models\Room;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class RoomMemberFactory extends Factory
{
    public function definition(): array
    {
        return [
            'room_id'   => Room::factory(),
            'user_id'   => User::factory(),
            'nickname'  => null,
            'joined_at' => now(),
        ];
    }
}
