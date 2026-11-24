<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\SoftDeletingScope;

class Message extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'channel_id', 'conversation_id', 'author_id',
        'content', 'title', 'type', 'is_edited', 'is_pinned', 'reply_to_id',
        'parent_message_id', 'root_message_id', 'depth', 'is_tombstoned',
    ];

    protected function casts(): array
    {
        return [
            'is_edited'     => 'boolean',
            'is_pinned'     => 'boolean',
            'is_tombstoned' => 'boolean',
            'depth'         => 'integer',
        ];
    }

    public function author(): BelongsTo       { return $this->belongsTo(User::class, 'author_id'); }
    public function channel(): BelongsTo      { return $this->belongsTo(Channel::class); }
    public function conversation(): BelongsTo { return $this->belongsTo(Conversation::class); }
    public function replyTo(): BelongsTo      { return $this->belongsTo(Message::class, 'reply_to_id'); }
    public function attachments(): HasMany    { return $this->hasMany(Attachment::class); }
    public function reactions(): HasMany      { return $this->hasMany(Reaction::class); }
    public function votes(): HasMany          { return $this->hasMany(Vote::class); }

    /** A comment's immediate parent — another message, never a channel/conversation directly. */
    public function parentMessage(): BelongsTo { return $this->belongsTo(Message::class, 'parent_message_id'); }

    /**
     * Denormalized top-level ancestor — the channel/conversation-scoped message a comment tree hangs off.
     * withTrashed(): a tombstoned root stays the scope its live comments resolve through.
     */
    public function root(): BelongsTo { return $this->belongsTo(Message::class, 'root_message_id')->withTrashed(); }

    /**
     * Every row a list may show: live ones plus tombstones (soft-deleted with
     * `is_tombstoned`). A plain delete or a cascade delete stays excluded, so
     * this is not interchangeable with withTrashed().
     */
    public function scopeListed(Builder $query): void
    {
        $query->withoutGlobalScope(SoftDeletingScope::class)
            ->where(fn (Builder $q) => $q->whereNull('deleted_at')->orWhere('is_tombstoned', true));
    }

    /** A deleted message kept in place as a `[deleted]` placeholder because live comments hang beneath it. */
    public function isTombstone(): bool
    {
        return $this->is_tombstoned && $this->trashed();
    }

    /**
     * The one place a tombstone's content is withheld: every JSON response and
     * broadcast payload serializes a message through here, so nothing the
     * author deleted can reach a client however the row was loaded.
     */
    public function toArray(): array
    {
        $array = parent::toArray();

        if (! $this->isTombstone()) {
            return $array;
        }

        $array = array_merge($array, [
            'content'     => null,
            'title'       => null,
            'reply_to_id' => null,
            'reply_to'    => null,
            'attachments' => [],
            'reactions'   => [],
            'votes'       => ['score' => 0, 'mine' => null],
        ]);

        if (array_key_exists('vote_score', $array)) {
            $array['vote_score'] = 0;
        }

        return $array;
    }

    /** A message/comment's direct children — what makes comments-on-comments possible. */
    public function children(): HasMany { return $this->hasMany(Message::class, 'parent_message_id'); }

    /**
     * A comment has no channel_id/conversation_id/type of its own (see the
     * "single scope" convention this model enforces below) — its capability
     * grant is inherited from whichever Channel/Conversation the comment
     * tree's root message belongs to.
     */
    public function hasCapability(string $capability): bool
    {
        return $this->scopeEntity()?->hasCapability($capability) ?? false;
    }

    /**
     * Whether the root channel/conversation currently allows comments at
     * all — a parameter (channels.settings.comments_enabled), not a
     * capability, per docs/comments-and-voting.md: a capability answers
     * whether a ChannelType may support comments in principle, this answers
     * whether this specific channel instance has it switched on right now.
     */
    public function commentsEnabled(): bool
    {
        $entity = $this->scopeEntity();

        // Conversation has no `settings` column at all today — only Channel
        // does (see database/migrations/..._add_settings_to_channels_table)
        // — so a DM/group thread has no way to enable comments yet.
        if (! ($entity instanceof Channel)) {
            return false;
        }

        return (bool) (($entity->settings ?? [])['comments_enabled'] ?? false);
    }

    /**
     * The deepest a comment nesting level may reach here — null means
     * unlimited (a forum's default). 1 means only top-level comments on the
     * root message itself; a reply to a comment (which would land at depth
     * 2) is rejected. See TextMessageService::send()'s comment branch and
     * docs/comments-and-voting.md.
     */
    public function maxCommentDepth(): ?int
    {
        $entity = $this->scopeEntity();

        if (! ($entity instanceof Channel)) {
            return null;
        }

        return ($entity->settings ?? [])['max_comment_depth'] ?? null;
    }

    public function isVisibleTo(User $user): bool
    {
        $entity = $this->scopeEntity();

        if ($entity instanceof Channel) {
            return $entity->room->hasMember($user->id) && $entity->isVisibleTo($user);
        }

        if ($entity instanceof Conversation) {
            return $entity->hasParticipant($user->id);
        }

        return false;
    }

    /**
     * The Channel/Conversation this message (or, for a comment, its root
     * ancestor) is ultimately scoped by. A plain channel/conversation
     * message is its own scope entity; a comment walks to `root` first.
     */
    public function scopeEntity(): Channel|Conversation|null
    {
        $message = $this->parent_message_id ? $this->root : $this;

        return $message?->channel ?? $message?->conversation;
    }

    /** @return array{0: string, 1: string} [scopeType, scopeId] — the logical scope a realtime event routes by. */
    public function logicalScope(): array
    {
        return match (true) {
            (bool) $this->channel_id      => ['channel', $this->channel_id],
            (bool) $this->conversation_id => ['conversation', $this->conversation_id],
            default                        => ['message', $this->parent_message_id],
        };
    }

    protected static function booted(): void
    {
        static::creating(function (Message $message) {
            $scopes = array_filter([$message->channel_id, $message->conversation_id, $message->parent_message_id]);
            abort_unless(count($scopes) === 1, 500, 'A message must have exactly one scope: channel, conversation, or parent message.');
        });
    }

    /** Score + this viewer's own vote — {score, mine}. mine is 1/-1/null. */
    public function voteSummary(string $userId): array
    {
        return [
            'score' => (int) $this->votes()->sum('value'),
            'mine'  => $this->votes()->where('user_id', $userId)->value('value'),
        ];
    }

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
