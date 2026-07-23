<?php

namespace Tests\Feature\UserStatus;

use App\Events\UserStatusChanged;
use App\Models\RecentCustomStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class UserStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_change_their_status(): void
    {
        $user = User::factory()->create(['status' => 'online']);

        $response = $this->actingAs($user)->patchJson('/api/user-status', ['status' => 'dnd']);

        $response->assertOk();
        $this->assertSame('dnd', $user->fresh()->status);
    }

    public function test_status_must_be_a_valid_enum_value(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->patchJson('/api/user-status', ['status' => 'not-a-status']);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors('status');
    }

    public function test_a_guest_cannot_change_status(): void
    {
        $this->patchJson('/api/user-status', ['status' => 'dnd'])->assertUnauthorized();
    }

    public function test_picking_a_plain_status_clears_any_existing_custom_status(): void
    {
        $user = User::factory()->create([
            'status' => 'custom', 'custom_status' => 'Existing', 'custom_status_color' => '#112233',
        ]);

        $this->actingAs($user)->patchJson('/api/user-status', ['status' => 'dnd']);

        $user->refresh();
        $this->assertSame('dnd', $user->status);
        $this->assertNull($user->custom_status);
        $this->assertNull($user->custom_status_color);
    }

    public function test_changing_status_broadcasts_the_full_snapshot(): void
    {
        Event::fake([UserStatusChanged::class]);
        $user = User::factory()->create(['status' => 'online']);

        $this->actingAs($user)->patchJson('/api/user-status', ['status' => 'dnd']);

        Event::assertDispatched(UserStatusChanged::class, fn (UserStatusChanged $e) =>
            $e->userId === $user->id && $e->status === 'dnd' && $e->customStatus === null && $e->customStatusColor === null
        );
    }

    public function test_setting_a_custom_status_sets_the_status_to_custom_with_the_message_and_color(): void
    {
        $user = User::factory()->create(['status' => 'online']);

        $response = $this->actingAs($user)->patchJson('/api/user-status', [
            'status' => 'custom', 'custom_status' => 'Deep in code', 'custom_status_color' => '#ff00aa',
        ]);

        $response->assertOk();
        $response->assertJson(['status' => 'custom', 'custom_status' => 'Deep in code', 'custom_status_color' => '#ff00aa']);
        $user->refresh();
        $this->assertSame('custom', $user->status);
        $this->assertSame('Deep in code', $user->custom_status);
        $this->assertSame('#ff00aa', $user->custom_status_color);
    }

    public function test_custom_status_requires_a_message(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->patchJson('/api/user-status', [
            'status' => 'custom', 'custom_status_color' => '#ff00aa',
        ]);

        $response->assertJsonValidationErrors('custom_status');
    }

    public function test_custom_status_requires_a_color(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->patchJson('/api/user-status', [
            'status' => 'custom', 'custom_status' => 'Deep in code',
        ]);

        $response->assertJsonValidationErrors('custom_status_color');
    }

    public function test_custom_status_color_must_be_a_valid_hex_string(): void
    {
        $user = User::factory()->create();

        foreach (['red', '#fff', '#ggg000'] as $invalid) {
            $response = $this->actingAs($user)->patchJson('/api/user-status', [
                'status' => 'custom', 'custom_status' => 'Testing', 'custom_status_color' => $invalid,
            ]);
            $response->assertJsonValidationErrors('custom_status_color');
        }
    }

    public function test_setting_a_custom_status_records_it_in_the_recent_list(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->patchJson('/api/user-status', [
            'status' => 'custom', 'custom_status' => 'Deep in code', 'custom_status_color' => '#ff00aa',
        ]);

        $response->assertJsonFragment(['recent' => [['text' => 'Deep in code', 'color' => '#ff00aa']]]);
        $this->assertDatabaseHas('recent_custom_statuses', [
            'user_id' => $user->id, 'text' => 'Deep in code', 'color' => '#ff00aa',
        ]);
    }

    public function test_reapplying_the_same_text_with_a_different_color_overwrites_rather_than_duplicating(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->patchJson('/api/user-status', [
            'status' => 'custom', 'custom_status' => 'Same Name', 'custom_status_color' => '#111111',
        ]);
        $this->actingAs($user)->patchJson('/api/user-status', [
            'status' => 'custom', 'custom_status' => 'Same Name', 'custom_status_color' => '#222222',
        ]);

        $this->assertSame(1, RecentCustomStatus::where('user_id', $user->id)->count());
        $this->assertSame('#222222', RecentCustomStatus::where('user_id', $user->id)->first()->color);
    }

    public function test_reapplying_the_same_custom_status_bumps_recency_instead_of_duplicating(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->patchJson('/api/user-status', [
            'status' => 'custom', 'custom_status' => 'Same', 'custom_status_color' => '#111111',
        ]);
        $this->actingAs($user)->patchJson('/api/user-status', [
            'status' => 'custom', 'custom_status' => 'Same', 'custom_status_color' => '#111111',
        ]);

        $this->assertSame(1, RecentCustomStatus::where('user_id', $user->id)->count());
    }

    public function test_the_recent_list_is_capped_at_three_oldest_evicted(): void
    {
        $user = User::factory()->create();

        foreach (['One', 'Two', 'Three', 'Four'] as $text) {
            $this->actingAs($user)->patchJson('/api/user-status', [
                'status' => 'custom', 'custom_status' => $text, 'custom_status_color' => '#123456',
            ]);
        }

        $this->assertSame(3, RecentCustomStatus::where('user_id', $user->id)->count());
        $this->assertFalse(RecentCustomStatus::where('user_id', $user->id)->where('text', 'One')->exists());
        $this->assertTrue(RecentCustomStatus::where('user_id', $user->id)->where('text', 'Four')->exists());
    }
}
