<?php

namespace App\Models;

use App\Support\ChannelTypes\ChannelTypeRegistry;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Channel extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'room_id', 'name', 'type', 'topic', 'settings',
        'position', 'is_nsfw', 'slow_mode_seconds', 'last_message_id', 'voice_mode',
    ];

    protected function casts(): array
    {
        return [
            'is_nsfw'           => 'boolean',
            'position'          => 'integer',
            'slow_mode_seconds' => 'integer',
            'settings'          => 'array',
        ];
    }

    public function room(): BelongsTo      { return $this->belongsTo(Room::class); }
    public function messages(): HasMany   { return $this->hasMany(Message::class); }

    /**
     * `type` has no DB-level enum constraint (see CLAUDE.md trap #3/#30's
     * shape) — capability now comes from ChannelTypeRegistry (see
     * app/Support/ChannelTypes), not a hardcoded array here. A type with no
     * registered descriptor (an unrecognized/future-plugin type before its
     * provider has registered it) is text-incapable by default, so it never
     * silently gets a message endpoint just because nobody thought to add a
     * guard for it — see MessageController/ChannelController.
     */
    public function isTextCapable(): bool
    {
        return ChannelTypeRegistry::for($this->type)?->isTextCapable() ?? false;
    }
}
