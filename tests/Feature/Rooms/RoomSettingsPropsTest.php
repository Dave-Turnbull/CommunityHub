<?php

namespace Tests\Feature\Rooms;

use App\Models\Channel;
use Inertia\Testing\AssertableInertia as Assert;

class RoomSettingsPropsTest extends RoomSettingsTestCase
{
    private function props(\App\Models\User $user, Channel $channel, bool $manage, bool $delete): void
    {
        $this->actingAs($user)->get("/channels/{$channel->id}")
            ->assertInertia(fn (Assert $page) => $page
                ->where('can_manage_room', $manage)
                ->where('can_delete_room', $delete));
    }

    public function test_the_owner_can_manage_and_delete(): void
    {
        [$room, $owner] = $this->roomWithOwner();
        $channel = Channel::factory()->for($room)->create();

        $this->props($owner, $channel, true, true);
    }

    public function test_a_manage_room_holder_can_manage_but_not_delete(): void
    {
        [$room] = $this->roomWithOwner();
        $channel = Channel::factory()->for($room)->create();

        $this->props($this->manageRoomMember($room), $channel, true, false);
    }

    public function test_a_plain_member_can_do_neither(): void
    {
        [$room] = $this->roomWithOwner();
        $channel = Channel::factory()->for($room)->create();

        $this->props($this->plainMember($room), $channel, false, false);
    }
}
