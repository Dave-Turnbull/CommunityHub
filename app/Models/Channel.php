<?php

namespace App\Models;

use App\Support\ChannelTypes\ChannelTypeRegistry;
use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
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

    public function visibilityRoles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'channel_role_visibility');
    }

    /** Curated per-role permission overrides — see PermissionChecker::canInChannel(). */
    public function permissionOverrides(): HasMany
    {
        return $this->hasMany(ChannelPermissionOverride::class);
    }

    /**
     * Whether $user can see this channel at all — separate from whether they
     * can send in it. An empty visibilityRoles set means "never explicitly
     * restricted," which is visible to every room member (opt-in
     * restriction, so existing channels are unaffected until someone
     * deliberately restricts one — see Permission::SeeAllChannels for the
     * bypass and docs/roles-and-permissions.md for the hierarchy guard on
     * who may set this list).
     */
    public function isVisibleTo(User $user): bool
    {
        if (PermissionChecker::can($user, Permission::SeeAllChannels, $this->room)) {
            return true;
        }

        $roleIds = $this->visibilityRoles()->pluck('roles.id');
        if ($roleIds->isEmpty()) {
            return true;
        }

        return Role::query()
            ->whereIn('id', $roleIds)
            ->whereHas('assignments', fn ($q) => $q->where('user_id', $user->id))
            ->exists();
    }

    /**
     * `type` has no DB-level enum constraint (see CLAUDE.md trap #3/#30's
     * shape) — capabilities come from ChannelTypeRegistry/FeatureRegistry
     * (see app/Support/Capabilities), not a hardcoded array here. A type with
     * no registered descriptor (an unrecognized/future-plugin type before
     * its provider has registered it) grants nothing by default, so it never
     * silently gets a message endpoint just because nobody thought to add a
     * guard for it — see MessageController/ChannelController.
     */
    public function hasCapability(string $capability): bool
    {
        return ChannelTypeRegistry::hasCapability($this->type, $capability);
    }

    /** Convenience for the common "does this channel have a message thread at all" check. */
    public function isTextCapable(): bool
    {
        return $this->hasCapability('text.read');
    }
}
