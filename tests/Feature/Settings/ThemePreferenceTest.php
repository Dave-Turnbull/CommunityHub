<?php

namespace Tests\Feature\Settings;

use App\Models\ThemePreference;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ThemePreferenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_fetching_with_no_stored_preference_returns_the_classic_defaults(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/theme-preference');

        $response->assertOk();
        $response->assertJson(['preset' => 'classic', 'overrides' => []]);
    }

    public function test_a_user_can_switch_to_a_different_preset(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset' => 'midnight', 'overrides' => [],
        ]);

        $response->assertOk();
        $response->assertJson(['preset' => 'midnight', 'overrides' => []]);
        $this->assertDatabaseHas('theme_preferences', ['user_id' => $user->id, 'preset' => 'midnight']);
    }

    public function test_a_user_can_switch_to_the_pure_black_preset(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset' => 'black', 'overrides' => [],
        ]);

        $response->assertOk();
        $response->assertJson(['preset' => 'black', 'overrides' => []]);
    }

    public function test_an_unknown_preset_is_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset' => 'not-a-real-preset', 'overrides' => [],
        ])->assertUnprocessable();
    }

    public function test_a_user_can_override_individual_variables_on_top_of_a_preset(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset'    => 'classic',
            'overrides' => [
                '--color-accent-primary' => '10 20 30',
                '--radius-md'   => '12px',
                '--text-size-sm' => '1rem',
                '--font-weight-bold' => '800',
                '--font-family-sans' => "'Roboto', system-ui, sans-serif",
            ],
        ]);

        $response->assertOk();
        $response->assertJson([
            'preset'    => 'classic',
            'overrides' => [
                '--color-accent-primary' => '10 20 30',
                '--radius-md'   => '12px',
                '--text-size-sm' => '1rem',
                '--font-weight-bold' => '800',
                '--font-family-sans' => "'Roboto', system-ui, sans-serif",
            ],
        ]);
    }

    public function test_a_user_can_override_the_panel_border_width_and_color(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset'    => 'classic',
            'overrides' => [
                '--panel-border-width' => '1px',
                '--panel-border-color' => '82 82 82',
            ],
        ]);

        $response->assertOk();
        $response->assertJson([
            'overrides' => [
                '--panel-border-width' => '1px',
                '--panel-border-color' => '82 82 82',
            ],
        ]);
    }

    public function test_the_panel_border_width_accepts_a_quarter_pixel_value(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset'    => 'black',
            'overrides' => ['--panel-border-width' => '0.25px'],
        ]);

        $response->assertOk();
        $response->assertJson(['overrides' => ['--panel-border-width' => '0.25px']]);
    }

    public function test_the_panel_border_width_rejects_more_than_two_decimal_places(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset'    => 'classic',
            'overrides' => ['--panel-border-width' => '0.125px'],
        ])->assertUnprocessable();
    }

    public function test_an_override_for_an_unknown_variable_is_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset'    => 'classic',
            'overrides' => ['--not-a-real-variable' => '1 2 3'],
        ])->assertUnprocessable();
    }

    public function test_a_malformed_color_override_is_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset'    => 'classic',
            'overrides' => ['--color-accent-primary' => 'rgb(1, 2, 3)'],
        ])->assertUnprocessable();

        $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset'    => 'classic',
            'overrides' => ['--color-accent-primary' => '999 0 0'],
        ])->assertUnprocessable();
    }

    public function test_a_malformed_radius_override_is_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset'    => 'classic',
            'overrides' => ['--radius-md' => '12'],
        ])->assertUnprocessable();
    }

    public function test_a_font_family_override_must_be_one_of_the_known_options(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset'    => 'classic',
            'overrides' => ['--font-family-sans' => "'Comic Sans MS', cursive"],
        ])->assertUnprocessable();
    }

    public function test_updating_overwrites_rather_than_merges_previous_overrides(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset' => 'classic', 'overrides' => ['--color-accent-primary' => '10 20 30'],
        ]);
        $response = $this->actingAs($user)->putJson('/api/theme-preference', [
            'preset' => 'classic', 'overrides' => ['--radius-md' => '12px'],
        ]);

        $response->assertJson(['overrides' => ['--radius-md' => '12px']]);
        $this->assertSame(1, ThemePreference::where('user_id', $user->id)->count());
        $this->assertSame(['--radius-md' => '12px'], ThemePreference::where('user_id', $user->id)->first()->overrides);
    }

    public function test_a_guest_cannot_view_or_update_theme_preference(): void
    {
        $this->getJson('/api/theme-preference')->assertUnauthorized();
        $this->putJson('/api/theme-preference', ['preset' => 'classic', 'overrides' => []])->assertUnauthorized();
    }
}
