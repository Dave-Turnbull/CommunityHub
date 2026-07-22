<?php

namespace App\Models;

use App\Support\ChannelTypes\ChannelTypeRegistry;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Conversation extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['type', 'name', 'icon_url', 'last_message_id', 'voice_mode'];

    public function participants(): HasMany  { return $this->hasMany(ConversationParticipant::class); }
    public function messages(): HasMany      { return $this->hasMany(Message::class); }
    public function lastMessage(): BelongsTo { return $this->belongsTo(Message::class, 'last_message_id'); }

    public function hasParticipant(string $userId): bool
    {
        return $this->participants()->where('user_id', $userId)->exists();
    }

    /**
     * The ChannelTypeRegistry key this conversation's capabilities resolve
     * through — `dm` and `group` share one registration (HybridConversationType)
     * since they behave identically today; not `$this->type` directly, so a
     * future divergence is a registry change, not a column-value change.
     */
    public function typeKey(): string
    {
        return 'conversation';
    }

    public function hasCapability(string $capability): bool
    {
        return ChannelTypeRegistry::hasCapability($this->typeKey(), $capability);
    }
}
