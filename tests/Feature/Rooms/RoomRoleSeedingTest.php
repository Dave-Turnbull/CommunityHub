<?php

namespace Tests\Feature\Rooms;

use App\Models\Room;
use App\Models\RoomInvite;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoomRoleSeedingTest extends TestCase
{
    use RefreshDatabase;

    public function test_creating_a_room_seeds_owner_member_and_moderator_roles_and_assigns_the_creator_owner(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->post('/rooms', ['name' => 'My Cool Room']);

        $room = Room::where('name', 'My Cool Room')->firstOrFail();

        $this->assertSame(3, $room->roles()->count());
        $this->assertTrue($room->roles()->where('name', 'Owner')->where('is_system', true)->exists());
        $this->assertTrue($room->roles()->where('name', 'Member')->where('is_default', true)->exists());
        $this->assertTrue($room->roles()->where('name', 'Moderator')->where('is_system', false)->where('is_default', false)->exists());

        $this->assertTrue(PermissionChecker::can($user, Permission::ManageChannels, $room));
        $this->assertTrue(PermissionChecker::can($user, Permission::ManageRoles, $room));
    }

    public function test_the_moderator_role_is_pre_granted_moderation_permissions_but_assigned_to_no_one(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->post('/rooms', ['name' => 'My Cool Room']);

        $room      = Room::where('name', 'My Cool Room')->firstOrFail();
        $moderator = $room->roles()->where('name', 'Moderator')->firstOrFail();

        $this->assertEqualsCanonicalizing(
            ['manage_channels', 'manage_channel_visibility', 'invite_members', 'manage_members', 'ban_members', 'post_announcements'],
            $moderator->rolePermissions->pluck('permission')->map(fn ($p) => $p->value)->all()
        );
        $this->assertCount(0, $moderator->assignments);
    }

    public function test_the_moderator_role_can_be_deleted_since_it_is_not_a_system_role(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->post('/rooms', ['name' => 'My Cool Room']);
        $room      = Room::where('name', 'My Cool Room')->firstOrFail();
        $moderator = $room->roles()->where('name', 'Moderator')->firstOrFail();

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$moderator->id}");

        $response->assertOk();
        $this->assertDatabaseMissing('roles', ['id' => $moderator->id]);
    }

    public function test_the_creator_holds_only_the_owner_role_not_member_too(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->post('/rooms', ['name' => 'My Cool Room']);

        $room  = Room::where('name', 'My Cool Room')->firstOrFail();
        $owner = $room->roles()->where('is_system', true)->where('is_default', false)->firstOrFail();
        $default = $room->roles()->where('is_default', true)->firstOrFail();

        $this->assertTrue($owner->users->contains($user));
        $this->assertFalse($default->users->contains($user));
    }

    public function test_joining_via_invite_code_assigns_the_default_member_role(): void
    {
        $owner = User::factory()->create();
        $this->actingAs($owner)->post('/rooms', ['name' => 'My Cool Room']);
        $room = Room::where('name', 'My Cool Room')->firstOrFail();

        $joiner = User::factory()->create();
        $this->actingAs($joiner)->get("/join/{$room->invite_code}");

        $this->assertFalse(PermissionChecker::can($joiner, Permission::ManageChannels, $room));
        $this->assertTrue($room->roles()->where('is_default', true)->first()->users->contains($joiner));
    }

    public function test_accepting_a_room_invite_assigns_the_default_member_role(): void
    {
        $owner = User::factory()->create();
        $this->actingAs($owner)->post('/rooms', ['name' => 'My Cool Room']);
        $room = Room::where('name', 'My Cool Room')->firstOrFail();

        $invite = RoomInvite::factory()->for($room)->create(['email' => 'joiner@example.com']);
        $joiner = User::factory()->create(['email' => 'joiner@example.com']);

        $invite->accept($joiner);

        $this->assertTrue($room->hasMember($joiner->id));
        $this->assertFalse(PermissionChecker::can($joiner, Permission::ManageChannels, $room));
    }
}
