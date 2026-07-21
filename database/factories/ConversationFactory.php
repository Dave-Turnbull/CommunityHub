<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class ConversationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'type' => 'dm',
            'name' => null,
        ];
    }
}
