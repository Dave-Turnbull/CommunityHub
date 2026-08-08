<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class InstanceSettingFactory extends Factory
{
    public function definition(): array
    {
        return [
            'signup_manual_enabled'       => true,
            'signup_email_invite_enabled' => true,
            'signup_oauth_enabled'        => true,
        ];
    }
}
