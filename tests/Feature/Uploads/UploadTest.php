<?php

namespace Tests\Feature\Uploads;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class UploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_upload_an_image_and_its_dimensions_are_recorded(): void
    {
        Storage::fake('local');

        $user = User::factory()->create();
        $file = UploadedFile::fake()->image('photo.jpg', 400, 300);

        $response = $this->actingAs($user)
            ->postJson('/api/upload', ['file' => $file]);

        $response->assertCreated();
        $response->assertJsonPath('filename', 'photo.jpg');
        $response->assertJsonPath('width', 400);
        $response->assertJsonPath('height', 300);

        $this->assertDatabaseHas('attachments', ['filename' => 'photo.jpg']);
        Storage::disk('local')->assertExists('uploads/' . $file->hashName());
    }

    public function test_a_non_image_file_has_no_dimensions(): void
    {
        Storage::fake('local');

        $user = User::factory()->create();
        $file = UploadedFile::fake()->create('document.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson('/api/upload', ['file' => $file]);

        $response->assertCreated();
        $response->assertJsonPath('width', null);
        $response->assertJsonPath('height', null);
    }

    public function test_upload_requires_a_file(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/upload', []);

        $response->assertStatus(422);
    }

    public function test_a_guest_cannot_upload(): void
    {
        $file = UploadedFile::fake()->image('photo.jpg');

        $response = $this->postJson('/api/upload', ['file' => $file]);

        $response->assertUnauthorized();
    }

    public function test_an_upload_larger_than_the_configured_max_is_rejected(): void
    {
        Storage::fake('local');
        config(['uploads.max_size_kb' => 10]);

        $user = User::factory()->create();
        $file = UploadedFile::fake()->create('big.bin', 50, 'application/octet-stream');

        $response = $this->actingAs($user)->postJson('/api/upload', ['file' => $file]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('attachments', 0);
    }

    public function test_an_upload_within_the_configured_max_succeeds(): void
    {
        Storage::fake('local');
        config(['uploads.max_size_kb' => 10]);

        $user = User::factory()->create();
        $file = UploadedFile::fake()->create('small.bin', 5, 'application/octet-stream');

        $response = $this->actingAs($user)->postJson('/api/upload', ['file' => $file]);

        $response->assertCreated();
    }
}
