<?php

namespace App\Models;

use Illuminate\Auth\MustVerifyEmail;
use Illuminate\Contracts\Auth\MustVerifyEmail as MustVerifyEmailContract;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Collection;
use Laravel\Sanctum\HasApiTokens;

// Always implements MustVerifyEmail — the interface/trait are inert on their
// own (Laravel only ever calls them from the 'verified' middleware, applied
// conditionally in routes/web.php based on config('verification.enabled')),
// so there's no reason to make this conditional on the model itself.
class User extends Authenticatable implements MustVerifyEmailContract
{
    use HasApiTokens, HasFactory, HasUuids, MustVerifyEmail, Notifiable;

    protected $fillable = [
        'username', 'display_name', 'email', 'password',
        'avatar_url', 'banner_url', 'bio', 'status', 'custom_status', 'custom_status_color',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password'          => 'hashed',
        ];
    }

    public function rooms(): BelongsToMany
    {
        return $this->belongsToMany(Room::class, 'room_members')
                    ->withPivot(['nickname', 'joined_at'])
                    ->withTimestamps();
    }

    public function roomMembers(): HasMany { return $this->hasMany(RoomMember::class); }
    public function messages(): HasMany    { return $this->hasMany(Message::class, 'author_id'); }
    public function reactions(): HasMany     { return $this->hasMany(Reaction::class); }
    public function recentCustomStatuses(): HasMany { return $this->hasMany(RecentCustomStatus::class); }

    public function sharesRoomWith(string $otherUserId): bool
    {
        return $this->rooms()->whereHas('members', fn ($q) => $q->where('user_id', $otherUserId))->exists();
    }

    /** Users messageable by this user — anyone sharing at least one room, excluding self. */
    public function messageableUsers(?string $search = null): Collection
    {
        return static::whereHas('rooms', fn ($q) => $q->whereIn('rooms.id', $this->rooms()->select('rooms.id')))
            ->where('id', '!=', $this->id)
            ->when($search, fn ($q) => $q->where(
                fn ($q2) => $q2->where('username', 'like', "%{$search}%")
                    ->orWhere('display_name', 'like', "%{$search}%")
            ))
            ->limit(20)
            ->get(['id', 'username', 'display_name', 'avatar_url', 'status']);
    }

    /**
     * Named appNotifications, not notifications — Notifiable::notifications()
     * already defines a MorphMany against Laravel's own database-notification
     * table/schema; this app's Notification model is a separate, simpler
     * user_id-keyed table (see its migration comment).
     */
    public function appNotifications(): HasMany { return $this->hasMany(Notification::class); }
    public function notificationPreferences(): HasMany { return $this->hasMany(NotificationPreference::class); }
}
