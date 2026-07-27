<?php

namespace Database\Factories;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\User;
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

    public function configure(): static
    {
        // Every user needs at least one (global) role — mirrors
        // AuthController::register/DatabaseSeeder and RoomFactory's own
        // afterCreating role-seeding — so a factory-created user behaves
        // like a real registered one (e.g. holds SendDirectMessages by
        // default) without every test having to wire this up itself.
        return $this->afterCreating(
            fn (User $user) => RoleAssignment::firstOrCreate(['role_id' => Role::seedGlobalDefaults()->id, 'user_id' => $user->id])
        );
    }
}
