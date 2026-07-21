<?php

namespace Database\Factories;

use App\Models\Room;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class RoomInviteFactory extends Factory
{
    public function definition(): array
    {
        return [
            'room_id'       => Room::factory(),
            'email'         => $this->faker->safeEmail(),
            'invited_by_id' => User::factory(),
        ];
    }
}
