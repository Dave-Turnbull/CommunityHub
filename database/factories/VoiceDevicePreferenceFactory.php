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
            'close_threshold_gap' => 20,
            'close_threshold_timeout_ms' => 2000,
            'echo_cancellation' => true,
            'noise_suppression' => true,
            'auto_gain_control' => true,
        ];
    }
}
