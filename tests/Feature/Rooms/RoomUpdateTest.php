<?php

namespace Tests\Feature\Rooms;

class RoomUpdateTest extends RoomSettingsTestCase
{
    public function test_a_manage_room_holder_can_rename_and_set_the_icon(): void
    {
        [$room] = $this->roomWithOwner();
        $mod = $this->manageRoomMember($room);

        $response = $this->actingAs($mod)->patchJson("/api/rooms/{$room->id}", [
            'name'     => 'Renamed',
            'icon_url' => 'https://example.com/icon.png',
        ]);

        $response->assertOk()->assertJson([
            'id'       => $room->id,
            'name'     => 'Renamed',
            'icon_url' => 'https://example.com/icon.png',
        ]);
        $this->assertDatabaseHas('rooms', ['id' => $room->id, 'name' => 'Renamed', 'icon_url' => 'https://example.com/icon.png']);
    }

    public function test_the_owner_can_rename_the_room(): void
    {
        [$room, $owner] = $this->roomWithOwner();

        $this->actingAs($owner)->patchJson("/api/rooms/{$room->id}", ['name' => 'Owner Renamed'])->assertOk();

        $this->assertSame('Owner Renamed', $room->fresh()->name);
    }

    public function test_the_icon_can_be_cleared(): void
    {
        [$room, $owner] = $this->roomWithOwner();
        $room->update(['icon_url' => 'https://example.com/icon.png']);

        $this->actingAs($owner)->patchJson("/api/rooms/{$room->id}", ['icon_url' => null])->assertOk();

        $this->assertNull($room->fresh()->icon_url);
    }

    public function test_omitting_icon_url_leaves_it_untouched(): void
    {
        [$room, $owner] = $this->roomWithOwner();
        $room->update(['icon_url' => 'https://example.com/icon.png']);

        $this->actingAs($owner)->patchJson("/api/rooms/{$room->id}", ['name' => 'Still Iconed'])->assertOk();

        $this->assertSame('https://example.com/icon.png', $room->fresh()->icon_url);
    }

    public function test_a_plain_member_cannot_edit_the_room(): void
    {
        [$room] = $this->roomWithOwner();
        $member = $this->plainMember($room);
        $original = $room->name;

        $this->actingAs($member)->patchJson("/api/rooms/{$room->id}", ['name' => 'Nope'])->assertForbidden();

        $this->assertSame($original, $room->fresh()->name);
    }

    public function test_a_non_member_cannot_edit_the_room(): void
    {
        [$room] = $this->roomWithOwner();
        $stranger = \App\Models\User::factory()->create();

        $this->actingAs($stranger)->patchJson("/api/rooms/{$room->id}", ['name' => 'Nope'])->assertForbidden();
    }

    public function test_validation_rejects_a_blank_name_an_overlong_name_and_a_bad_url(): void
    {
        [$room, $owner] = $this->roomWithOwner();

        $this->actingAs($owner)->patchJson("/api/rooms/{$room->id}", ['name' => ''])
            ->assertStatus(422)->assertJsonValidationErrors('name');
        $this->actingAs($owner)->patchJson("/api/rooms/{$room->id}", ['name' => str_repeat('a', 101)])
            ->assertStatus(422)->assertJsonValidationErrors('name');
        $this->actingAs($owner)->patchJson("/api/rooms/{$room->id}", ['icon_url' => 'not a url'])
            ->assertStatus(422)->assertJsonValidationErrors('icon_url');
    }

    public function test_a_guest_is_rejected(): void
    {
        [$room] = $this->roomWithOwner();

        $this->patchJson("/api/rooms/{$room->id}", ['name' => 'x'])->assertUnauthorized();
    }
}
