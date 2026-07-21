<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationPreference extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['user_id', 'category', 'email', 'in_app'];

    protected function casts(): array
    {
        return [
            'email'  => 'boolean',
            'in_app' => 'boolean',
        ];
    }

    /**
     * The only categories that exist today, at the user (global) level.
     * Room-by-room and channel-by-channel categories/defaults are planned
     * but not implemented — see CLAUDE.md "## Planned work".
     */
    public const DEFAULTS = [
        'room_invite'    => ['email' => true,  'in_app' => true],
        'room_message'   => ['email' => false, 'in_app' => false],
        'direct_message' => ['email' => false, 'in_app' => true],
    ];

    /**
     * Categories whose `in_app` can never be turned off — direct messages
     * are the app's inbox now that notifications live on the Messages page
     * (see NotificationFeed), so hiding them entirely isn't an option.
     * Enforced both here (a floor under whatever's stored) and in
     * NotificationPreferenceController::update (rejects the write outright).
     */
    public const IN_APP_LOCKED = ['direct_message'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Effective preference for a user/category: their override, or the default. */
    public static function for(string $userId, string $category): array
    {
        $override = static::where('user_id', $userId)->where('category', $category)->first();

        $preference = $override
            ? ['email' => $override->email, 'in_app' => $override->in_app]
            : static::DEFAULTS[$category];

        if (in_array($category, static::IN_APP_LOCKED, true)) {
            $preference['in_app'] = true;
        }

        return $preference;
    }
}
