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
        $response->assertJson([
            'client_id' => 'laptop-1', 'input_device_id' => null, 'output_device_id' => null, 'send_threshold' => 0,
            'close_threshold_gap' => 20, 'close_threshold_timeout_ms' => 2000,
            'echo_cancellation' => true, 'noise_suppression' => true, 'auto_gain_control' => true,
        ]);
    }

    public function test_a_user_can_set_their_close_threshold_gap(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id'           => 'laptop-1',
            'close_threshold_gap' => 20,
        ]);

        $response->assertOk();
        $response->assertJson(['close_threshold_gap' => 20]);
        $this->assertDatabaseHas('voice_device_preferences', [
            'user_id' => $user->id, 'client_id' => 'laptop-1', 'close_threshold_gap' => 20,
        ]);
    }

    public function test_close_threshold_gap_must_be_one_of_the_fixed_steps(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'laptop-1', 'close_threshold_gap' => 15,
        ])->assertUnprocessable();
    }

    public function test_omitting_close_threshold_gap_defaults_it_to_medium(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'laptop-1',
        ]);

        $response->assertJson(['close_threshold_gap' => 20]);
    }

    public function test_a_user_can_set_their_close_threshold_timeout(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id'                  => 'laptop-1',
            'close_threshold_timeout_ms' => 1500,
        ]);

        $response->assertOk();
        $response->assertJson(['close_threshold_timeout_ms' => 1500]);
        $this->assertDatabaseHas('voice_device_preferences', [
            'user_id' => $user->id, 'client_id' => 'laptop-1', 'close_threshold_timeout_ms' => 1500,
        ]);
    }

    public function test_close_threshold_timeout_must_be_one_of_the_fixed_steps(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'laptop-1', 'close_threshold_timeout_ms' => 750,
        ])->assertUnprocessable();
    }

    public function test_an_explicit_null_close_threshold_timeout_means_off_and_is_not_replaced_by_the_default(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'laptop-1', 'close_threshold_timeout_ms' => null,
        ]);

        $response->assertJson(['close_threshold_timeout_ms' => null]);
        $this->assertDatabaseHas('voice_device_preferences', [
            'user_id' => $user->id, 'client_id' => 'laptop-1', 'close_threshold_timeout_ms' => null,
        ]);

        // Fetching it back must also still report null, not the 2000 default.
        $fetched = $this->actingAs($user)->getJson('/api/voice/device-preference?client_id=laptop-1');
        $fetched->assertJson(['close_threshold_timeout_ms' => null]);
    }

    public function test_omitting_close_threshold_timeout_entirely_defaults_it_to_2000ms(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'laptop-1',
        ]);

        $response->assertJson(['close_threshold_timeout_ms' => 2000]);
    }

    public function test_a_user_can_set_their_audio_processing_toggles(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id'         => 'laptop-1',
            'echo_cancellation' => false,
            'noise_suppression' => false,
            'auto_gain_control' => true,
        ]);

        $response->assertOk();
        $response->assertJson(['echo_cancellation' => false, 'noise_suppression' => false, 'auto_gain_control' => true]);
        $this->assertDatabaseHas('voice_device_preferences', [
            'user_id' => $user->id, 'client_id' => 'laptop-1',
            'echo_cancellation' => false, 'noise_suppression' => false, 'auto_gain_control' => true,
        ]);
    }

    public function test_omitting_audio_processing_toggles_defaults_echo_and_noise_on_and_agc_on(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'laptop-1',
        ]);

        $response->assertJson(['echo_cancellation' => true, 'noise_suppression' => true, 'auto_gain_control' => true]);
    }

    public function test_audio_processing_toggles_must_be_boolean(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'laptop-1', 'auto_gain_control' => 'yes',
        ])->assertUnprocessable();
    }

    public function test_a_user_can_set_their_send_threshold(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id'      => 'laptop-1',
            'send_threshold' => 35,
        ]);

        $response->assertOk();
        $response->assertJson(['send_threshold' => 35]);
        $this->assertDatabaseHas('voice_device_preferences', [
            'user_id' => $user->id, 'client_id' => 'laptop-1', 'send_threshold' => 35,
        ]);
    }

    public function test_send_threshold_must_be_between_zero_and_a_hundred(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'laptop-1', 'send_threshold' => 101,
        ])->assertUnprocessable();

        $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'laptop-1', 'send_threshold' => -1,
        ])->assertUnprocessable();
    }

    public function test_omitting_send_threshold_defaults_it_to_zero(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/voice/device-preference', [
            'client_id' => 'laptop-1', 'input_device_id' => 'mic-a',
        ]);

        $response->assertJson(['send_threshold' => 0]);
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
