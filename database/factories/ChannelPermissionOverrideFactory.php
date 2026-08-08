<?php

namespace Database\Factories;

use App\Models\Channel;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Database\Eloquent\Factories\Factory;

class ChannelPermissionOverrideFactory extends Factory
{
    public function definition(): array
    {
        return [
            'channel_id' => Channel::factory(),
            'role_id'    => Role::factory(),
            'permission' => Permission::SendMessages->value,
            'allowed'    => true,
        ];
    }
}
