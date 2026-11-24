<?php

namespace Tests\Feature\Settings;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class SettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_update_their_profile(): void
    {
        $user = User::factory()->create(['display_name' => 'Old Name']);

        $response = $this->actingAs($user)->patch('/settings', [
            'display_name' => 'New Name',
            'bio'           => 'Hello there',
        ]);

        $response->assertRedirect();
        $response->assertSessionHas('success');

        $user->refresh();
        $this->assertSame('New Name', $user->display_name);
        $this->assertSame('Hello there', $user->bio);
    }

    public function test_a_guest_cannot_update_settings(): void
    {
        $response = $this->patch('/settings', ['display_name' => 'Nope']);

        $response->assertRedirect('/login');
    }

    public function test_the_settings_page_reports_whether_the_user_has_a_password(): void
    {
        $withPassword = User::factory()->create();
        $oauthOnly    = User::factory()->create();
        $oauthOnly->forceFill(['password' => null])->save();

        $this->actingAs($withPassword)->get('/settings')
            ->assertInertia(fn (Assert $page) => $page->where('has_password', true)->missing('user.password'));

        $this->actingAs($oauthOnly)->get('/settings')
            ->assertInertia(fn (Assert $page) => $page->where('has_password', false));
    }

    public function test_a_user_can_change_their_password_with_the_correct_current_one(): void
    {
        Cache::flush();
        $user = User::factory()->create(['password' => Hash::make('old-password')]);
        $rememberToken = $user->remember_token;

        $response = $this->actingAs($user)->put('/settings/password', [
            'current_password'      => 'old-password',
            'password'              => 'new-password-1',
            'password_confirmation' => 'new-password-1',
        ]);

        $response->assertRedirect();
        $response->assertSessionHas('success');
        $this->assertTrue(Hash::check('new-password-1', $user->fresh()->password));
        $this->assertNotSame($rememberToken, $user->fresh()->remember_token);
    }

    public function test_changing_the_password_requires_the_correct_current_password(): void
    {
        Cache::flush();
        $user = User::factory()->create(['password' => Hash::make('old-password')]);

        $this->actingAs($user)->put('/settings/password', [
            'current_password'      => 'wrong-password',
            'password'              => 'new-password-1',
            'password_confirmation' => 'new-password-1',
        ])->assertSessionHasErrors('current_password');

        $this->assertTrue(Hash::check('old-password', $user->fresh()->password));
    }

    public function test_the_new_password_must_be_confirmed_and_long_enough(): void
    {
        Cache::flush();
        $user = User::factory()->create(['password' => Hash::make('old-password')]);

        $this->actingAs($user)->put('/settings/password', [
            'current_password' => 'old-password', 'password' => 'new-password-1', 'password_confirmation' => 'nope',
        ])->assertSessionHasErrors('password');

        $this->actingAs($user)->put('/settings/password', [
            'current_password' => 'old-password', 'password' => 'short', 'password_confirmation' => 'short',
        ])->assertSessionHasErrors('password');

        $this->assertTrue(Hash::check('old-password', $user->fresh()->password));
    }

    public function test_a_user_with_no_password_cannot_set_one_from_a_logged_in_session(): void
    {
        Cache::flush();
        $user = User::factory()->create();
        $user->forceFill(['password' => null])->save();

        $this->actingAs($user)->put('/settings/password', [
            'current_password'      => '',
            'password'              => 'new-password-1',
            'password_confirmation' => 'new-password-1',
        ])->assertSessionHasErrors('current_password');

        $this->assertNull($user->fresh()->password);
    }

    public function test_a_guest_cannot_change_a_password(): void
    {
        $this->put('/settings/password', [
            'current_password' => 'x', 'password' => 'new-password-1', 'password_confirmation' => 'new-password-1',
        ])->assertRedirect('/login');
    }
}
