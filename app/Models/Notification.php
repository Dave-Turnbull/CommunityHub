<?php

namespace App\Models;

use App\Events\NotificationCreated;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'user_notifications';

    protected $fillable = ['user_id', 'type', 'data', 'read_at'];

    protected function casts(): array
    {
        return [
            'data'    => 'array',
            'read_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Creates and broadcasts an in-app notification — unless the recipient's
     * NotificationPreference for this category has in_app turned off, in
     * which case this is a no-op. $category doubles as the `type` column;
     * see NotificationPreference::DEFAULTS for the valid values.
     */
    public static function notify(string $userId, string $category, array $data): ?self
    {
        if (! NotificationPreference::for($userId, $category)['in_app']) {
            return null;
        }

        $notification = static::create([
            'user_id' => $userId,
            'type'    => $category,
            'data'    => $data,
        ]);

        broadcast(new NotificationCreated($notification));

        return $notification;
    }
}
