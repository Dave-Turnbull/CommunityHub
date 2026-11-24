<?php

namespace Tests\Feature\Rooms;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

abstract class RoomSettingsTestCase extends TestCase
{
    use RefreshDatabase;

    protected function roomWithOwner(): array
    {
        $owner = User::factory()->create();
        $room = Room::factory()->create(['owner_id' => $owner->id]);
        $room->addMember($owner, asOwner: true);

        return [$room, $owner];
    }

    protected function plainMember(Room $room): User
    {
        $user = User::factory()->create();
        $room->addMember($user);

        return $user;
    }

    protected function manageRoomMember(Room $room): User
    {
        $user = $this->plainMember($room);
        $role = Role::factory()->for($room)->create(['position' => 50]);
        $role->grant(Permission::ManageRoom);
        RoleAssignment::factory()->for($role)->for($user)->create();

        return $user;
    }
}
