<?php

namespace Database\Factories;

use App\Models\Role;
use Illuminate\Database\Eloquent\Factories\Factory;

class RoleRoomChannelCategoryCeilingFactory extends Factory
{
    public function definition(): array
    {
        return [
            'role_id'  => Role::factory(),
            'category' => 'standard',
        ];
    }
}
