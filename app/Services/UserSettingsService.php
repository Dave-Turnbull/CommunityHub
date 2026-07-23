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
            'client_id'        => $clientId,
            'input_device_id'  => $preference->input_device_id ?? null,
            'output_device_id' => $preference->output_device_id ?? null,
        ];
    }

    public function updateDevicePreference(User $user, string $clientId, ?string $inputDeviceId, ?string $outputDeviceId): VoiceDevicePreference
    {
        return VoiceDevicePreference::updateOrCreate(
            ['user_id' => $user->id, 'client_id' => $clientId],
            ['input_device_id' => $inputDeviceId, 'output_device_id' => $outputDeviceId],
        );
    }
}
