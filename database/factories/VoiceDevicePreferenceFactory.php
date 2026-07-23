<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class VoiceDevicePreferenceFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id'          => User::factory(),
            'client_id'        => (string) Str::uuid(),
            'input_device_id'  => null,
            'output_device_id' => null,
            'send_threshold'   => 0,
        ];
    }
}
