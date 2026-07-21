<?php

namespace Database\Factories;

use App\Models\Room;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class ChannelFactory extends Factory
{
    public function definition(): array
    {
        return [
            'room_id'   => Room::factory(),
            'name'      => Str::lower($this->faker->unique()->word()),
            'type'      => 'text',
            'position'  => 0,
        ];
    }
}
