<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single-row, instance-wide settings table — the three signup-path
 * toggles (see AuthController::register/showRegister, AuthentikLoginService)
 * and the optional default room accounts are auto-joined to (see
 * DefaultRoomService). Deliberately a fixed-column singleton rather than a
 * key-value store: there's exactly one row, and every setting so far is a
 * plain column an admin changes from Settings.
 */
class InstanceSetting extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'signup_manual_enabled',
        'signup_email_invite_enabled',
        'signup_oauth_enabled',
        'default_room_id',
    ];

    protected function casts(): array
    {
        return [
            'signup_manual_enabled'       => 'boolean',
            'signup_email_invite_enabled' => 'boolean',
            'signup_oauth_enabled'        => 'boolean',
        ];
    }

    public function defaultRoom(): BelongsTo { return $this->belongsTo(Room::class, 'default_room_id'); }

    /**
     * The single settings row, lazily seeded from config/registration.php's
     * env-driven defaults the first time anything reads it. Safe under
     * concurrent first-reads — a duplicate insert just means the loser's
     * transaction re-queries and gets the winner's row instead.
     */
    public static function current(): self
    {
        return static::query()->first() ?? static::create([
            'signup_manual_enabled'       => config('registration.manual_enabled'),
            'signup_email_invite_enabled' => config('registration.email_invite_enabled'),
            'signup_oauth_enabled'        => config('registration.oauth_enabled'),
        ]);
    }
}
