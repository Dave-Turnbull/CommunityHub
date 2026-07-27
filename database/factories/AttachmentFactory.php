<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class AttachmentFactory extends Factory
{
    public function definition(): array
    {
        return [
            'message_id'  => null,
            'path'        => 'uploads/' . $this->faker->uuid() . '.png',
            'uploader_id' => User::factory(),
            'filename'    => $this->faker->word() . '.png',
            'mime_type'   => 'image/png',
            'size_bytes'  => $this->faker->numberBetween(1024, 1024 * 1024),
            'width'       => 800,
            'height'      => 600,
        ];
    }
}
