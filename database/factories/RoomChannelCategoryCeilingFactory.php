<?php

namespace Database\Factories;

use App\Models\Room;
use Illuminate\Database\Eloquent\Factories\Factory;

class RoomChannelCategoryCeilingFactory extends Factory
{
    public function definition(): array
    {
        return [
            'room_id'  => Room::factory(),
            'category' => 'standard',
        ];
    }
}
