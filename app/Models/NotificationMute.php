<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A user's per-message notification suppression — schema only today, not
 * yet enforced anywhere (see the migration's docblock and
 * docs/comments-and-voting.md). Once wired in, `comment_reply`'s producer
 * (TextMessageService::notifyParentAuthor) would check
 * NotificationMute::isMuted() before calling Notification::notify().
 */
class NotificationMute extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['user_id', 'message_id'];

    public function user(): BelongsTo    { return $this->belongsTo(User::class); }
    public function message(): BelongsTo { return $this->belongsTo(Message::class); }

    public static function isMuted(string $userId, string $messageId): bool
    {
        return static::where(['user_id' => $userId, 'message_id' => $messageId])->exists();
    }
}
