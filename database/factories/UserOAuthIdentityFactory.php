<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class UserOAuthIdentityFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id'          => User::factory(),
            'provider'         => 'authentik',
            'provider_user_id' => (string) Str::uuid(),
            'email'            => $this->faker->safeEmail(),
        ];
    }
}
