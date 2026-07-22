<?php

namespace Database\Factories;

use App\Models\Role;
use App\Support\Permission;
use Illuminate\Database\Eloquent\Factories\Factory;

class RolePermissionFactory extends Factory
{
    public function definition(): array
    {
        return [
            'role_id'    => Role::factory(),
            'permission' => Permission::ManageChannels->value,
        ];
    }
}
