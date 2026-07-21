<?php

namespace Tests\Feature\Voice;

use App\Models\User;
use App\Models\VoiceDevicePreference;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VoiceDevicePreferenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_fetching_with_no_stored_preference_returns_nulls(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/voice/device-preference?client_id=laptop-1');

        $response->assertOk();
        $response->assertJson(['client_id' => 'laptop-1', 'input_device_id' => null, 'output_device_id' => null]);
    }

    public function test_a_user_can_set_their_device_preference_for_a_client(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id'        => 'laptop-1',
            'input_device_id'  => 'mic-abc',
            'output_device_id' => 'speaker-xyz',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('voice_device_preferences', [
            'user_id'          => $user->id,
            'client_id'        => 'laptop-1',
            'input_device_id'  => 'mic-abc',
            'output_device_id' => 'speaker-xyz',
        ]);
    }

    public function test_different_clients_for_the_same_user_are_independent(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'laptop-1', 'input_device_id' => 'mic-laptop',
        ]);
        $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'desktop-1', 'input_device_id' => 'mic-desktop',
        ]);

        $this->assertSame(2, VoiceDevicePreference::where('user_id', $user->id)->count());

        $laptop = $this->actingAs($user)->getJson('/api/voice/device-preference?client_id=laptop-1')->json();
        $this->assertSame('mic-laptop', $laptop['input_device_id']);
    }

    public function test_updating_the_same_client_overwrites_rather_than_duplicates(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'laptop-1', 'input_device_id' => 'mic-a',
        ]);
        $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'laptop-1', 'input_device_id' => 'mic-b',
        ]);

        $this->assertSame(1, VoiceDevicePreference::where('user_id', $user->id)->where('client_id', 'laptop-1')->count());
        $this->assertSame('mic-b', VoiceDevicePreference::where('user_id', $user->id)->first()->input_device_id);
    }

    public function test_a_guest_cannot_view_or_update_device_preferences(): void
    {
        $this->getJson('/api/voice/device-preference?client_id=x')->assertUnauthorized();
        $this->putJson('/api/voice/device-preference', ['client_id' => 'x'])->assertUnauthorized();
    }
}
