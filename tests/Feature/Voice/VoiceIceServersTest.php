<?php

namespace Tests\Feature\Voice;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VoiceIceServersTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_authenticated_user_gets_stun_and_turn_servers(): void
    {
        config(['turn.secret' => 'test-secret', 'turn.public_host' => 'turn.test', 'turn.port' => 3478]);

        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/voice/ice-servers');

        $response->assertOk();
        $response->assertJsonPath('iceServers.0.urls', 'stun:turn.test:3478');
        $response->assertJsonStructure(['iceServers' => [['urls'], ['urls', 'username', 'credential']]]);
    }

    public function test_the_turn_credential_is_a_valid_hmac_of_the_username(): void
    {
        config(['turn.secret' => 'test-secret', 'turn.public_host' => 'turn.test', 'turn.port' => 3478]);

        $user = User::factory()->create();

        $payload  = $this->actingAs($user)->getJson('/api/voice/ice-servers')->json();
        $turn     = $payload['iceServers'][1];

        $expected = base64_encode(hash_hmac('sha1', $turn['username'], 'test-secret', true));
        $this->assertSame($expected, $turn['credential']);
        $this->assertStringContainsString(':'.$user->id, $turn['username']);
    }

    public function test_a_guest_cannot_fetch_ice_servers(): void
    {
        $this->getJson('/api/voice/ice-servers')->assertUnauthorized();
    }
}
