<?php

namespace App\Services;

use App\Models\NotificationPreference;
use App\Models\User;
use App\Models\VoiceDevicePreference;

/**
 * Notification and voice-device preferences — both always self-service, no
 * capability/permission check beyond auth (every call site already only
 * ever operates on $request->user()). Consolidates
 * NotificationPreferenceController's and VoiceDevicePreferenceController's
 * previously-inline logic.
 */
class UserSettingsService
{
    /** The effective (override-or-default) preference for every known category. */
    public function notificationPreferences(User $user): array
    {
        return collect(array_keys(NotificationPreference::DEFAULTS))
            ->map(fn ($category) => [
                'category' => $category,
                ...NotificationPreference::for($user->id, $category),
            ])
            ->values()
            ->all();
    }

    /** @throws \Symfony\Component\HttpKernel\Exception\HttpException 422 if the category's in_app is locked on */
    public function updateNotificationPreference(User $user, string $category, bool $email, bool $inApp): NotificationPreference
    {
        abort_if(
            ! $inApp && in_array($category, NotificationPreference::IN_APP_LOCKED, true),
            422,
            'This category cannot be turned off.'
        );

        return NotificationPreference::updateOrCreate(
            ['user_id' => $user->id, 'category' => $category],
            ['email' => $email, 'in_app' => $inApp],
        );
    }

    public function devicePreference(User $user, string $clientId): array
    {
        $preference = VoiceDevicePreference::forClient($user->id, $clientId);

        return [
            'client_id'                   => $clientId,
            'input_device_id'             => $preference->input_device_id ?? null,
            'output_device_id'            => $preference->output_device_id ?? null,
            'send_threshold'              => $preference->send_threshold ?? 0,
            'close_threshold_gap'         => $preference->close_threshold_gap ?? 20,
            // null is a real, meaningful stored value ("Off") here, distinct
            // from "no row exists yet" — ?? would silently overwrite an
            // explicit off with the default, so this only falls back to the
            // default when there is truly no row at all.
            'close_threshold_timeout_ms'  => $preference ? $preference->close_threshold_timeout_ms : 2000,
            'echo_cancellation'           => $preference->echo_cancellation ?? true,
            'noise_suppression'           => $preference->noise_suppression ?? true,
            'auto_gain_control'           => $preference->auto_gain_control ?? true,
        ];
    }

    public function updateDevicePreference(
        User $user,
        string $clientId,
        ?string $inputDeviceId,
        ?string $outputDeviceId,
        int $sendThreshold = 0,
        int $closeThresholdGap = 20,
        ?int $closeThresholdTimeoutMs = 2000,
        bool $echoCancellation = true,
        bool $noiseSuppression = true,
        bool $autoGainControl = true,
    ): VoiceDevicePreference {
        return VoiceDevicePreference::updateOrCreate(
            ['user_id' => $user->id, 'client_id' => $clientId],
            [
                'input_device_id'            => $inputDeviceId,
                'output_device_id'           => $outputDeviceId,
                'send_threshold'             => $sendThreshold,
                'close_threshold_gap'        => $closeThresholdGap,
                'close_threshold_timeout_ms' => $closeThresholdTimeoutMs,
                'echo_cancellation'          => $echoCancellation,
                'noise_suppression'          => $noiseSuppression,
                'auto_gain_control'          => $autoGainControl,
            ],
        );
    }
}
