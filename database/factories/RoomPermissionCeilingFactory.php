<?php

namespace Database\Factories;

use App\Models\Room;
use App\Support\Permission;
use Illuminate\Database\Eloquent\Factories\Factory;

class RoomPermissionCeilingFactory extends Factory
{
    public function definition(): array
    {
        return [
            'room_id'    => Room::factory(),
            'permission' => Permission::ManageChannels->value,
        ];
    }
}
