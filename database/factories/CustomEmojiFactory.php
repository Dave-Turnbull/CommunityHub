<?php

namespace Database\Factories;

use App\Models\Room;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class CustomEmojiFactory extends Factory
{
    public function definition(): array
    {
        return [
            'room_id'    => Room::factory(),
            'name'       => Str::lower($this->faker->unique()->word()),
            'image_url'  => $this->faker->imageUrl(64, 64),
            'created_by' => User::factory(),
        ];
    }
}
