<?php

namespace Tests\Feature\Invites;

use App\Mail\ServerInviteMail;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
