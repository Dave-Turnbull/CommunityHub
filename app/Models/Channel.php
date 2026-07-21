<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Channel extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'room_id', 'name', 'type', 'topic',
        'position', 'is_nsfw', 'slow_mode_seconds', 'last_message_id', 'voice_mode',
    ];

    /**
     * `type` has no DB-level enum constraint (see CLAUDE.md trap #3/#30's
     * shape) — this is the allow-list of types that carry a text chat.
     * Everything else (voice today; future custom types like a drawing or
     * music channel) is text-incapable by default, so a new type never
     * silently gets a message endpoint just because nobody thought to add a
     * guard for it — see MessageController/ChannelController.
     */
    public const TEXT_CAPABLE_TYPES = ['text', 'announcement'];

    protected function casts(): array
    {
        return [
            'is_nsfw'           => 'boolean',
            'position'          => 'integer',
            'slow_mode_seconds' => 'integer',
        ];
    }

    public function room(): BelongsTo      { return $this->belongsTo(Room::class); }
    public function messages(): HasMany   { return $this->hasMany(Message::class); }

    public function isTextCapable(): bool
    {
        return in_array($this->type, self::TEXT_CAPABLE_TYPES, true);
    }
}
