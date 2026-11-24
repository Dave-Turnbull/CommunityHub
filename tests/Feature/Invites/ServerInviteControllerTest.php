<?php

namespace Tests\Feature\Invites;

use App\Mail\ServerInviteMail;
use App\Models\InstanceSetting;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\ServerInvite;
use App\Models\User;
use App\Services\ServerInviteService;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class ServerInviteControllerTest extends TestCase
{
    use RefreshDatabase;

    private function inviter(): User
    {
        $user = User::factory()->create();
        $role = Role::factory()->global()->create();
        $role->grant(Permission::InviteServer);
        RoleAssignment::factory()->for($role)->for($user)->create();

        return $user;
    }

    public function test_a_user_holding_invite_server_can_create_an_email_scoped_invite(): void
    {
        Mail::fake();

        $response = $this->actingAs($this->inviter())
            ->postJson('/api/server-invites', ['email' => 'newperson@example.com']);

        $response->assertCreated();
        $this->assertDatabaseHas('server_invites', ['email' => 'newperson@example.com']);
        Mail::assertQueued(ServerInviteMail::class, fn ($mail) => $mail->hasTo('newperson@example.com'));
    }

    public function test_a_user_holding_invite_server_can_create_an_open_invite(): void
    {
        Mail::fake();

        $response = $this->actingAs($this->inviter())->postJson('/api/server-invites', []);

        $response->assertCreated();
        $this->assertDatabaseHas('server_invites', ['email' => null]);
        Mail::assertNothingOutgoing();
    }

    public function test_a_user_without_invite_server_cannot_create_an_invite(): void
    {
        $response = $this->actingAs(User::factory()->create())
            ->postJson('/api/server-invites', ['email' => 'newperson@example.com']);

        $response->assertForbidden();
        $this->assertDatabaseCount('server_invites', 0);
    }

    public function test_a_permitted_user_lists_outstanding_invites_newest_first_without_tokens(): void
    {
        $inviter = $this->inviter();
        $older = ServerInvite::factory()->for($inviter, 'invitedBy')->create([
            'email' => 'older@example.com', 'created_at' => now()->subDay(),
        ]);
        $newer = ServerInvite::factory()->for($inviter, 'invitedBy')->create(['email' => null]);

        $response = $this->actingAs($inviter)->getJson('/api/server-invites');

        $response->assertOk();
        $this->assertSame([$newer->id, $older->id], $response->json('*.id'));
        $this->assertSame('older@example.com', $response->json('1.email'));
        $this->assertNull($response->json('0.email'));
        $this->assertSame($inviter->id, $response->json('0.invited_by.id'));
        $this->assertArrayNotHasKey('token', $response->json('0'));
        $this->assertStringNotContainsString($older->token, $response->getContent());
    }

    public function test_the_list_excludes_accepted_and_expired_invites(): void
    {
        $inviter = $this->inviter();
        $live = ServerInvite::factory()->create();
        ServerInvite::factory()->create(['accepted_at' => now()]);
        ServerInvite::factory()->create(['expires_at' => now()->subMinute()]);

        $response = $this->actingAs($inviter)->getJson('/api/server-invites');

        $response->assertOk()->assertJsonCount(1);
        $this->assertSame($live->id, $response->json('0.id'));
    }

    public function test_a_user_without_invite_server_cannot_list_invites(): void
    {
        ServerInvite::factory()->create();

        $this->actingAs(User::factory()->create())
            ->getJson('/api/server-invites')
            ->assertForbidden();
    }

    public function test_revoking_an_invite_removes_it_from_the_list_and_invalidates_its_token(): void
    {
        $inviter = $this->inviter();
        $invite = ServerInvite::factory()->create(['email' => null]);
        $service = app(ServerInviteService::class);
        $this->assertNotNull($service->validateToken($invite->token));

        $this->actingAs($inviter)
            ->deleteJson("/api/server-invites/{$invite->id}")
            ->assertOk();

        $this->assertDatabaseMissing('server_invites', ['id' => $invite->id]);
        $this->actingAs($inviter)->getJson('/api/server-invites')->assertOk()->assertJsonCount(0);
        $this->assertNull($service->validateToken($invite->token));
    }

    public function test_a_revoked_invite_can_no_longer_be_used_to_register(): void
    {
        Cache::flush();
        InstanceSetting::factory()->create([
            'signup_manual_enabled'       => false,
            'signup_email_invite_enabled' => true,
            'signup_oauth_enabled'        => false,
        ]);
        $invite = ServerInvite::factory()->create(['email' => 'invited@example.com']);

        $this->actingAs($this->inviter())->deleteJson("/api/server-invites/{$invite->id}")->assertOk();
        auth()->logout();

        $this->post('/register', [
            'username'              => 'newuser',
            'display_name'          => 'New User',
            'email'                 => 'invited@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
            'invite_token'          => $invite->token,
        ])->assertForbidden();

        $this->assertGuest();
        $this->assertDatabaseMissing('users', ['email' => 'invited@example.com']);
    }

    public function test_a_user_without_invite_server_cannot_revoke_an_invite(): void
    {
        $invite = ServerInvite::factory()->create();

        $this->actingAs(User::factory()->create())
            ->deleteJson("/api/server-invites/{$invite->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('server_invites', ['id' => $invite->id]);
    }
}
