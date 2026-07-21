<?php

namespace Tests\Unit\Models;

use App\Models\NotificationPreference;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationPreferenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_for_returns_the_hardcoded_default_when_no_override_exists(): void
    {
        $user = User::factory()->create();

        $this->assertSame(
            NotificationPreference::DEFAULTS['room_invite'],
            NotificationPreference::for($user->id, 'room_invite')
        );
    }

    public function test_for_returns_the_users_override_when_one_exists(): void
    {
        $user = User::factory()->create();
        NotificationPreference::factory()->for($user)->create([
            'category' => 'room_invite',
            'email'    => false,
            'in_app'   => false,
        ]);

        $this->assertSame(
            ['email' => false, 'in_app' => false],
            NotificationPreference::for($user->id, 'room_invite')
        );
    }

    public function test_an_override_for_one_category_does_not_affect_another(): void
    {
        $user = User::factory()->create();
        NotificationPreference::factory()->for($user)->create([
            'category' => 'room_invite',
            'email'    => false,
            'in_app'   => false,
        ]);

        $this->assertSame(
            NotificationPreference::DEFAULTS['direct_message'],
            NotificationPreference::for($user->id, 'direct_message')
        );
    }
}
