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
        Storage::fake('public');

        $user = User::factory()->create();
        $file = UploadedFile::fake()->image('photo.jpg', 400, 300);

        $response = $this->actingAs($user)
            ->postJson('/api/upload', ['file' => $file]);

        $response->assertCreated();
        $response->assertJsonPath('filename', 'photo.jpg');
        $response->assertJsonPath('width', 400);
        $response->assertJsonPath('height', 300);

        $this->assertDatabaseHas('attachments', ['filename' => 'photo.jpg']);
        Storage::disk('public')->assertExists('uploads/' . $file->hashName());
    }

    public function test_a_non_image_file_has_no_dimensions(): void
    {
        Storage::fake('public');

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
}
