<?php

namespace Database\Factories;

use App\Models\Room;
use Illuminate\Database\Eloquent\Factories\Factory;

class RoleFactory extends Factory
{
    public function definition(): array
    {
        return [
            'room_id'    => Room::factory(),
            'name'       => $this->faker->unique()->word(),
            'position'   => 0,
            'is_default' => false,
            'is_system'  => false,
        ];
    }

    public function global(): static
    {
        return $this->state(['room_id' => null]);
    }

    public function default(): static
    {
        return $this->state(['is_default' => true]);
    }
}
