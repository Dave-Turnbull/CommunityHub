<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class RecentCustomStatusFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'text'    => $this->faker->sentence(3),
            'color'   => $this->faker->hexColor(),
        ];
    }
}
