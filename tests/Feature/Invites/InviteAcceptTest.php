<?php

namespace Tests\Feature\Invites;

use App\Models\Channel;
use App\Models\Room;
use App\Models\RoomInvite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class InviteAcceptTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_guest_visiting_a_valid_invite_sees_the_accept_page(): void
    {
        $room = Room::factory()->create(['name' => 'Cool Room']);
        $invite = RoomInvite::factory()->for($room)->create(['email' => 'newperson@example.com']);

        $response = $this->get("/invite/{$invite->token}");

        $response->assertInertia(fn (Assert $page) => $page
            ->component('Invite/Accept')
            ->where('invalid', false)
            ->where('email', 'newperson@example.com')
            ->where('has_account', false)
            ->where('room.name', 'Cool Room')
        );
    }

    public function test_an_expired_invite_is_marked_invalid(): void
    {
        $invite = RoomInvite::factory()->create(['expires_at' => now()->subDay()]);

        $response = $this->get("/invite/{$invite->token}");

        $response->assertInertia(fn (Assert $page) => $page
            ->component('Invite/Accept')
            ->where('invalid', true)
        );
    }

    public function test_an_unknown_token_is_marked_invalid(): void
    {
        $response = $this->get('/invite/does-not-exist');

        $response->assertInertia(fn (Assert $page) => $page
            ->component('Invite/Accept')
            ->where('invalid', true)
        );
    }

    public function test_registering_with_a_pending_invite_joins_the_room(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'text']);
        $invite = RoomInvite::factory()->for($room)->create(['email' => 'newperson@example.com']);

        $this->get("/invite/{$invite->token}");

        $response = $this->post('/register', [
            'username'              => 'newperson',
            'display_name'          => 'New Person',
            'email'                 => 'newperson@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $user = User::where('email', 'newperson@example.com')->firstOrFail();

        $this->assertTrue($room->hasMember($user->id));
        $this->assertNotNull($invite->fresh()->accepted_at);
        $response->assertRedirect("/channels/{$channel->id}");
    }

    public function test_logging_in_with_a_pending_invite_joins_the_room(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'text']);
        $user = User::factory()->create(['email' => 'existing@example.com', 'password' => bcrypt('password123')]);
        $invite = RoomInvite::factory()->for($room)->create(['email' => 'existing@example.com']);

        $this->get("/invite/{$invite->token}");

        $response = $this->post('/login', [
            'login'    => 'existing@example.com',
            'password' => 'password123',
        ]);

        $this->assertTrue($room->hasMember($user->id));
        $this->assertNotNull($invite->fresh()->accepted_at);
        $response->assertRedirect("/channels/{$channel->id}");
    }

    public function test_an_authenticated_user_visiting_the_link_joins_immediately(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'text']);
        $user = User::factory()->create();
        $invite = RoomInvite::factory()->for($room)->create();

        $response = $this->actingAs($user)->get("/invite/{$invite->token}");

        $this->assertTrue($room->hasMember($user->id));
        $this->assertNotNull($invite->fresh()->accepted_at);
        $response->assertRedirect("/channels/{$channel->id}");
    }

    public function test_accepting_lands_on_any_text_capable_channel_not_just_type_text(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'announcement']);
        $user = User::factory()->create();
        $invite = RoomInvite::factory()->for($room)->create();

        $response = $this->actingAs($user)->get("/invite/{$invite->token}");

        $response->assertRedirect("/channels/{$channel->id}");
    }
}
