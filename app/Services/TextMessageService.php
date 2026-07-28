<?php

namespace App\Services;

use App\Events\MessageDeleted;
use App\Events\MessageSent;
use App\Events\MessageUpdated;
use App\Models\Attachment;
use App\Models\Channel;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Notification;
use App\Models\User;
use App\Support\ChannelFocus;
use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * The text Feature's backend operations, bound to a specific Channel or
 * Conversation via for(). Authorization (membership + capability checks)
 * lives inside list()/send() themselves, not in the caller — the service is
 * the enforcement boundary, matching every other {Thing}Service in
 * app/Services. See CLAUDE.md's "Service layer" convention.
 */
class TextMessageService
{
    private const PAGE_SIZE = 50;

    private function __construct(private readonly Channel|Conversation|Message $entity) {}

    /**
     * A Message entity is a comment thread's parent — either a top-level
     * post or another comment. See docs/comments-and-voting.md.
     */
    public static function for(Channel|Conversation|Message $entity): self
    {
        return new self($entity);
    }

    /**
     * One page of history, always returned oldest-first. `$before`/`$after`
     * walk away from a cursor in exactly one direction; `$around` instead
     * centers the page on a specific message — the "jump to message" entry
     * point (reply previews, direct links; search/pinned results are planned
     * to reuse it too, see CLAUDE.md). Neither cursor given serves the live
     * tail. Every mode reports whether more exists on each side (`has_older`/
     * `has_newer`), which is what lets the client hold a trimmed window of
     * history and page back toward the present — see
     * docs/messages-and-pagination.md.
     */
    public function list(User $user, ?string $before = null, ?string $after = null, ?string $around = null): array
    {
        $this->assertMember($user);

        if ($this->entity instanceof Message) {
            abort_unless($this->entity->commentsEnabled(), 422, 'Comments are not enabled here.');
        } else {
            abort_unless($this->entity->hasCapability('text.read'), 422, 'This channel has no text chat.');
        }

        abort_if(
            count(array_filter([$before, $after, $around], fn ($c) => filled($c))) > 1,
            422,
            'Page in one direction at a time — pass only one of before, after, or around.'
        );

        $messages = match (true) {
            filled($around) => $this->pageAround($around),
            filled($after)  => $this->pageAfter($after),
            default         => $this->pageBefore($before),
        };

        $messages->each(fn ($m) => $m->setAttribute('reactions', $m->reactionSummary($user->id)));

        return $this->describeWindow($messages);
    }

    /** @return \Illuminate\Support\Collection<int, Message> */
    private function pageBefore(?string $before): Collection
    {
        $query = $this->hydratedQuery();

        if (filled($before)) {
            $query->where('created_at', '<', $this->cursorTimestamp($before));
        }

        return $query->latest()->limit(self::PAGE_SIZE)->get()->reverse()->values();
    }

    /** @return \Illuminate\Support\Collection<int, Message> */
    private function pageAfter(string $after): Collection
    {
        return $this->hydratedQuery()
            ->where('created_at', '>', $this->cursorTimestamp($after))
            ->oldest()
            ->limit(self::PAGE_SIZE)
            ->get()
            ->values();
    }

    /**
     * A window centered on a specific message, target included, both edges
     * filled independently — unlike before/after there's no single edge to
     * walk away from. NOT withTrashed(): the target has to be an actual,
     * displayable message, not just a positional pivot (see cursorTimestamp
     * below for the contrast). describeWindow()'s has_older/has_newer EXISTS
     * checks work unchanged since they only look at the resulting window's
     * first/last row.
     */
    private function pageAround(string $around): Collection
    {
        $target = $this->hydratedQuery()->find($around);

        abort_unless($target, 422, 'Unknown message cursor.');

        $radius = intdiv(self::PAGE_SIZE, 2);

        $older = $this->hydratedQuery()
            ->where('created_at', '<', $target->created_at)
            ->latest()->limit($radius)->get()->reverse()->values();

        $newer = $this->hydratedQuery()
            ->where('created_at', '>', $target->created_at)
            ->oldest()->limit($radius)->get()->values();

        return $older->push($target)->concat($newer)->values();
    }

    /**
     * withTrashed() deliberately — a cursor is whichever message sits at the
     * edge of the client's window, and that message may since have been
     * deleted. Resolving it anyway keeps paging past a deleted edge working;
     * an id that resolves to nothing at all is a client bug worth surfacing,
     * since silently falling back to the tail would serve a wrong page.
     */
    private function cursorTimestamp(string $cursor): string
    {
        $pivot = Message::withTrashed()->find($cursor);

        abort_unless($pivot, 422, 'Unknown message cursor.');

        return $pivot->created_at;
    }

    /** @param \Illuminate\Support\Collection<int, Message> $messages */
    private function describeWindow(Collection $messages): array
    {
        $scope = fn () => $this->entity instanceof Message ? $this->entity->children() : $this->entity->messages();

        $hasOlder = $messages->isNotEmpty()
            && $scope()->where('created_at', '<', $messages->first()->created_at)->exists();

        $hasNewer = $messages->isNotEmpty()
            && $scope()->where('created_at', '>', $messages->last()->created_at)->exists();

        return [
            'data'         => $messages,
            'has_older'    => $hasOlder,
            'older_cursor' => $hasOlder ? $messages->first()->id : null,
            'has_newer'    => $hasNewer,
            'newer_cursor' => $hasNewer ? $messages->last()->id : null,
        ];
    }

    private function hydratedQuery(): HasMany
    {
        $query = $this->entity instanceof Message ? $this->entity->children() : $this->entity->messages();

        return $query->with([
            'author:id,username,display_name,avatar_url,status',
            'attachments',
            'replyTo.author:id,display_name,avatar_url',
            'replyTo.attachments',
        ])->withCount('children as comment_count');
    }

    public function send(User $user, array $validated): Message
    {
        $this->assertMember($user);

        if ($this->entity instanceof Message) {
            abort_unless($this->entity->commentsEnabled(), 422, 'Comments are not enabled here.');

            $maxDepth = $this->entity->maxCommentDepth();
            abort_if($maxDepth !== null && $this->entity->depth + 1 > $maxDepth, 422, 'Comments cannot be nested any deeper here.');
        } else {
            abort_unless($this->entity->hasCapability('text.read'), 422, 'This channel has no text chat.');
        }

        $this->authorizeSend($user, $validated);

        $attributes = [
            'author_id'   => $user->id,
            'content'     => $validated['content'] ?? null,
            'title'       => $validated['title'] ?? null,
            'reply_to_id' => $validated['reply_to_id'] ?? null,
        ];

        $message = Message::create(match (true) {
            $this->entity instanceof Channel      => ['channel_id' => $this->entity->id, ...$attributes],
            $this->entity instanceof Conversation  => ['conversation_id' => $this->entity->id, ...$attributes],
            default                                => [
                'parent_message_id' => $this->entity->id,
                'root_message_id'   => $this->entity->parent_message_id ? $this->entity->root_message_id : $this->entity->id,
                'depth'             => $this->entity->depth + 1,
                ...$attributes,
            ],
        });

        if (! empty($validated['attachment_ids'])) {
            Attachment::whereIn('id', $validated['attachment_ids'])->update(['message_id' => $message->id]);
        }

        $message = self::hydrate($message, $user->id);

        if ($this->entity instanceof Message) {
            broadcast(new MessageSent($message, 'message', $this->entity->id))->toOthers();
            $this->notifyParentAuthor($this->entity, $message, $user);

            return $message;
        }

        $this->entity->update(['last_message_id' => $message->id]);

        $scopeType = $this->entity instanceof Channel ? 'channel' : 'conversation';
        broadcast(new MessageSent($message, $scopeType, $this->entity->id))->toOthers();

        $this->entity instanceof Channel
            ? $this->notifyOtherRoomMembers($this->entity, $message, $user)
            : $this->notifyOtherParticipants($this->entity, $message, $user);

        return $message;
    }

    /**
     * Static, not bound via for() — unlike list()/send(), editing/deleting a
     * message needs no entity/capability check, only "is this the author"
     * (see CLAUDE.md: every message-adjacent endpoint checks membership OR,
     * here, authorship — there's no natural entity at this call site, the
     * route only resolves a Message).
     */
    public static function updateMessage(User $user, Message $message, string $content): Message
    {
        abort_unless($message->author_id === $user->id, 403);

        $message->update(['content' => $content, 'is_edited' => true]);
        $message = self::hydrate($message, $user->id);

        [$type, $id] = self::scope($message);
        broadcast(new MessageUpdated($message, $type, $id))->toOthers();

        return $message;
    }

    public static function destroyMessage(User $user, Message $message): void
    {
        abort_unless($message->author_id === $user->id, 403);

        [$type, $id] = self::scope($message);
        $messageId = $message->id;
        $hasChildren = $message->children()->exists();

        static::deleteAttachments($message);

        // A message with a live comment thread either tombstones (soft-
        // delete + a `[deleted]` marker the UI keeps children attached
        // under) or, if the root channel's `cascade_delete_comments`
        // setting is true, cascades the delete through every descendant —
        // see docs/comments-and-voting.md. A childless message keeps the
        // plain soft-delete behavior unchanged.
        if ($hasChildren && static::cascadeDeleteComments($message)) {
            static::cascadeDelete($message);
        } elseif ($hasChildren) {
            $message->update(['is_tombstoned' => true]);
            $message->delete();
        } else {
            $message->delete();
        }

        broadcast(new MessageDeleted($messageId, $type, $id))->toOthers();
    }

    private static function cascadeDeleteComments(Message $message): bool
    {
        $entity = $message->scopeEntity();

        return $entity instanceof Channel && (bool) (($entity->settings ?? [])['cascade_delete_comments'] ?? false);
    }

    private static function cascadeDelete(Message $message): void
    {
        foreach ($message->children()->get() as $child) {
            static::deleteAttachments($child);
            static::cascadeDelete($child);
            $child->delete();
        }

        $message->delete();
    }

    private static function deleteAttachments(Message $message): void
    {
        // The message itself only soft-deletes (kept for reply-context/audit
        // purposes — see Message's SoftDeletes), but there's no reason to hang
        // onto the actual file once its message is gone, so attachments are a
        // real delete: storage first (in case the DB delete fails partway,
        // an orphaned row is harmless — an orphaned file on disk isn't
        // cleaned up by anything), then the row.
        foreach ($message->attachments as $attachment) {
            Storage::disk('local')->delete($attachment->path);
            $attachment->delete();
        }
    }

    /**
     * For a Channel, room membership alone isn't enough — a channel
     * restricted via channel_role_visibility must be just as inaccessible
     * through this API as it is through the page load and the realtime
     * presence channel (Web\ChannelController::show, routes/channels.php's
     * channel.{channelId} auth). Both list() and send() go through here, so
     * a visibility-restricted channel can neither be read nor posted into
     * over the API — see docs/roles-and-permissions.md's "Channel visibility".
     */
    private function assertMember(User $user): void
    {
        if ($this->entity instanceof Message) {
            abort_unless($this->entity->isVisibleTo($user), 403);

            return;
        }

        if ($this->entity instanceof Channel) {
            abort_unless($this->entity->room->hasMember($user->id), 403);
            abort_unless($this->entity->isVisibleTo($user), 403);

            return;
        }

        abort_unless($this->entity->hasParticipant($user->id), 403);
    }

    /**
     * Checks the specific capability each piece of a message actually needs
     * — plain content needs 'text.send_text', each attachment needs
     * 'text.send_images' or 'text.send_video' depending on its mime type.
     */
    private function authorizeSend(User $user, array $validated): void
    {
        if ($this->entity instanceof Message) {
            $scopeEntity = $this->entity->scopeEntity();
            $room = $scopeEntity instanceof Channel ? $scopeEntity->room : null;

            // Standalone permission, independent of whatever gates sending
            // an ordinary message in that same channel — a role can be
            // granted Comment without SendDirectMessages/plain posting
            // rights, or vice versa. See docs/comments-and-voting.md.
            abort_unless(PermissionChecker::can($user, Permission::Comment, $room), 403, 'You are not allowed to comment.');

            return;
        }

        if ($this->entity instanceof Conversation) {
            abort_unless(PermissionChecker::can($user, Permission::SendDirectMessages), 403, 'You are not allowed to send direct messages.');
        }

        if ($this->entity instanceof Channel && $this->entity->type === 'announcement') {
            abort_unless(PermissionChecker::can($user, Permission::PostAnnouncements, $this->entity->room), 403, 'Only owners and moderators can post announcements.');
        }

        if (! blank($validated['content'] ?? null)) {
            abort_unless($this->entity->hasCapability('text.send_text'), 403, 'This channel cannot receive text messages.');
        }

        if (! empty($validated['attachment_ids'])) {
            $mimeTypes = Attachment::whereIn('id', $validated['attachment_ids'])->pluck('mime_type');

            foreach ($mimeTypes as $mimeType) {
                $capability = str_starts_with($mimeType, 'video/') ? 'text.send_video' : 'text.send_images';
                abort_unless($this->entity->hasCapability($capability), 403, 'This channel cannot receive that attachment type.');
            }
        }
    }

    /**
     * Notifies only the immediate parent's author — not every ancestor, not
     * every thread participant — the same "reply to your content" scope a
     * social-style comment-reply notification is expected to have. See
     * docs/comments-and-voting.md.
     */
    private function notifyParentAuthor(Message $parent, Message $comment, User $replier): void
    {
        if ($parent->author_id === $replier->id) {
            return;
        }

        Notification::notify($parent->author_id, 'comment_reply', [
            'message_id'        => $comment->id,
            'parent_message_id' => $parent->id,
            'root_message_id'   => $parent->parent_message_id ? $parent->root_message_id : $parent->id,
            'replier_id'        => $replier->id,
            'replier_name'      => $replier->display_name,
            'preview'           => Str::limit((string) $comment->content, 80),
        ]);
    }

    private function notifyOtherParticipants(Conversation $conversation, Message $message, User $sender): void
    {
        $recipientIds = $conversation->participants()
            ->where('user_id', '!=', $sender->id)
            ->pluck('user_id');

        foreach ($recipientIds as $recipientId) {
            Notification::notify($recipientId, 'direct_message', [
                'conversation_id' => $conversation->id,
                'message_id'      => $message->id,
                'sender_id'       => $sender->id,
                'sender_name'     => $sender->display_name,
                'preview'         => Str::limit((string) $message->content, 80),
            ]);
        }
    }

    /**
     * Unlike DMs, channel notifications are suppressed for a recipient
     * actively looking at the channel — see ChannelFocus.
     */
    private function notifyOtherRoomMembers(Channel $channel, Message $message, User $sender): void
    {
        $recipientIds = $channel->room->members()
            ->where('user_id', '!=', $sender->id)
            ->pluck('user_id');

        foreach ($recipientIds as $recipientId) {
            if (ChannelFocus::isFocused($recipientId, $channel->id)) {
                continue;
            }

            Notification::notify($recipientId, 'room_message', [
                'room_id'      => $channel->room_id,
                'room_name'    => $channel->room->name,
                'channel_id'   => $channel->id,
                'channel_name' => $channel->name,
                'message_id'   => $message->id,
                'sender_id'    => $sender->id,
                'sender_name'  => $sender->display_name,
                'preview'      => Str::limit((string) $message->content, 80),
            ]);
        }
    }

    private static function hydrate(Message $message, string $userId): Message
    {
        $message->load([
            'author:id,username,display_name,avatar_url,status',
            'attachments',
            'replyTo.author:id,display_name,avatar_url',
            'replyTo.attachments',
        ]);
        $message->loadCount('children as comment_count');
        $message->setAttribute('reactions', $message->reactionSummary($userId));

        return $message;
    }

    /** @return array{0: string, 1: string} [scopeType, scopeId] */
    private static function scope(Message $message): array
    {
        return $message->logicalScope();
    }

    /**
     * Score-ranked, timeframe-filtered, offset-paginated — deliberately NOT
     * the before/after/around cursor contract list() uses: score is mutable
     * (a row's rank shifts as votes arrive), so it can't be a stable cursor
     * without producing duplicate/missing rows across pages. Used for both
     * a forum's top-level post list (entity = Channel) and top-sorted
     * comments within a thread (entity = Message) — same "score-ranked,
     * timeframe-filtered" shape over whichever scope column applies. See
     * docs/comments-and-voting.md.
     *
     * @return array{data: \Illuminate\Support\Collection<int, Message>, next_offset: int, has_more: bool}
     */
    public function listTop(User $user, string $period, ?string $start, ?string $end, int $offset = 0, int $limit = 25): array
    {
        $this->assertMember($user);

        if ($this->entity instanceof Message) {
            abort_unless($this->entity->commentsEnabled(), 422, 'Comments are not enabled here.');
        } else {
            abort_unless($this->entity->hasCapability('text.read'), 422, 'This channel has no text chat.');
        }

        $periodStart = $this->periodStart($period, $start);

        $query = $this->hydratedQuery()
            ->withSum('votes as vote_score', 'value')
            ->when($periodStart !== null, fn ($q) => $q->where('created_at', '>=', $periodStart))
            ->when($period === 'custom' && filled($end), fn ($q) => $q->where('created_at', '<=', $end));

        $total = (clone $query)->count();

        $messages = $query
            ->orderByDesc('vote_score')
            ->orderByDesc('created_at')
            ->skip($offset)
            ->take($limit)
            ->get()
            ->each(fn ($m) => $m->setAttribute('reactions', $m->reactionSummary($user->id)));

        return [
            'data'         => $messages,
            'next_offset'  => $offset + $limit,
            'has_more'     => $offset + $limit < $total,
        ];
    }

    private function periodStart(string $period, ?string $customStart): ?string
    {
        return match ($period) {
            'hour'   => now()->subHour(),
            'day'    => now()->subDay(),
            'week'   => now()->subWeek(),
            'month'  => now()->subMonth(),
            'custom' => $customStart,
            default  => null, // 'all'
        };
    }
}
