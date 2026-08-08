<?php

namespace Database\Factories;

use App\Models\Role;
use App\Models\Room;
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

    public function configure(): static
    {
        // Structure only (Owner + Member roles), not membership — mirrors
        // this factory's existing behavior of not creating a RoomMember for
        // owner_id either; see RoomShowTest for a test that creates its own.
        return $this->afterCreating(function (Room $room) {
            $room->snapshotPermissionCeiling($room->owner);
            Role::seedDefaultsForRoom($room);
        });
    }
}
