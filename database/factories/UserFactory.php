<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserFactory extends Factory
{
    public function definition(): array
    {
        return [
            'username'      => Str::lower($this->faker->unique()->userName()),
            'display_name'  => $this->faker->name(),
            'email'         => $this->faker->unique()->safeEmail(),
            'password'      => Hash::make('password'),
            'avatar_url'    => null,
            'banner_url'    => null,
            'bio'           => null,
            'status'        => 'offline',
            'custom_status' => null,
        ];
    }

    public function online(): static
    {
        return $this->state(fn () => ['status' => 'online']);
    }
}
