<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class ServerInviteFactory extends Factory
{
    public function definition(): array
    {
        return [
            'email'         => $this->faker->safeEmail(),
            'invited_by_id' => User::factory(),
        ];
    }
}
