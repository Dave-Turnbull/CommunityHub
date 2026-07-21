<?php

namespace Database\Factories;

use App\Models\NotificationPreference;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class NotificationPreferenceFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id'  => User::factory(),
            'category' => 'direct_message',
            'email'    => false,
            'in_app'   => true,
        ];
    }

    public function forCategory(string $category): static
    {
        return $this->state(fn () => [
            'category' => $category,
            ...NotificationPreference::DEFAULTS[$category],
        ]);
    }
}
