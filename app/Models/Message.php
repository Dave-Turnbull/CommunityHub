<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Message extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'channel_id', 'conversation_id', 'author_id',
        'content', 'type', 'is_edited', 'is_pinned', 'reply_to_id',
    ];

    protected function casts(): array
    {
        return [
            'is_edited' => 'boolean',
            'is_pinned' => 'boolean',
        ];
    }

    public function author(): BelongsTo       { return $this->belongsTo(User::class, 'author_id'); }
    public function channel(): BelongsTo      { return $this->belongsTo(Channel::class); }
    public function conversation(): BelongsTo { return $this->belongsTo(Conversation::class); }
    public function replyTo(): BelongsTo      { return $this->belongsTo(Message::class, 'reply_to_id'); }
    public function attachments(): HasMany    { return $this->hasMany(Attachment::class); }
    public function reactions(): HasMany      { return $this->hasMany(Reaction::class); }

    /** Aggregate reactions into [{emoji, count, reacted}] for a given viewer. */
    public function reactionSummary(string $userId): array
    {
        return $this->reactions()
            ->get()
            ->groupBy('emoji')
            ->map(fn ($group, $emoji) => [
                'emoji'   => $emoji,
                'count'   => $group->count(),
                'reacted' => $group->contains('user_id', $userId),
            ])
            ->values()
            ->toArray();
    }
}
