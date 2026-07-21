<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class RoomFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name'     => $this->faker->company(),
            'icon_url' => null,
            'owner_id' => User::factory(),
        ];
    }
}
