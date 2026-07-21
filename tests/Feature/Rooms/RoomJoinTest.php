<?php

namespace Tests\Feature\Rooms;

use App\Models\Channel;
use App\Models\Room;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RoomJoinTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_join_a_room_via_invite_code(): void
    {
        $room = Room::factory()->create(['invite_code' => 'abc12345']);
        $channel = Channel::factory()->for($room)->create(['type' => 'text']);
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get('/join/abc12345');

        $this->assertTrue($room->hasMember($user->id));
        $response->assertRedirect("/channels/{$channel->id}");
    }

    public function test_joining_twice_does_not_duplicate_membership(): void
    {
        $room = Room::factory()->create(['invite_code' => 'abc12345']);
        $user = User::factory()->create();

        $this->actingAs($user)->get('/join/abc12345');
        $this->actingAs($user)->get('/join/abc12345');

        $this->assertSame(1, $room->members()->where('user_id', $user->id)->count());
    }

    public function test_an_invalid_invite_code_404s(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get('/join/doesnotexist');

        $response->assertNotFound();
    }

    public function test_a_guest_visiting_a_join_link_is_sent_to_login_then_joins_after_logging_in(): void
    {
        $room = Room::factory()->create(['invite_code' => 'abc12345']);
        $channel = Channel::factory()->for($room)->create(['type' => 'text']);
        $user = User::factory()->create(['password' => Hash::make('password123')]);

        $this->get('/join/abc12345')->assertRedirect('/login');

        $this->post('/login', [
            'login'    => $user->email,
            'password' => 'password123',
        ])->assertRedirect('/join/abc12345');

        $this->assertFalse($room->hasMember($user->id));

        $this->get('/join/abc12345')->assertRedirect("/channels/{$channel->id}");
        $this->assertTrue($room->hasMember($user->id));
    }

    public function test_a_guest_visiting_a_join_link_joins_after_registering(): void
    {
        $room = Room::factory()->create(['invite_code' => 'abc12345']);
        $channel = Channel::factory()->for($room)->create(['type' => 'text']);

        $this->get('/join/abc12345')->assertRedirect('/login');

        $this->post('/register', [
            'username'              => 'newperson',
            'display_name'          => 'New Person',
            'email'                 => 'newperson@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ])->assertRedirect('/join/abc12345');

        $user = User::where('email', 'newperson@example.com')->firstOrFail();
        $this->assertFalse($room->hasMember($user->id));

        $this->get('/join/abc12345')->assertRedirect("/channels/{$channel->id}");
        $this->assertTrue($room->hasMember($user->id));
    }
}
