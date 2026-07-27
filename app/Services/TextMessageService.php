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

    private function __construct(private readonly Channel|Conversation $entity) {}

    public static function for(Channel|Conversation $entity): self
    {
        return new self($entity);
    }

    /**
     * One page of history, always returned oldest-first, walking away from a
     * cursor in exactly one direction: `$before` for older messages,
     * `$after` for newer ones, neither for the live tail. Both directions
     * report whether more exists on each side (`has_older`/`has_newer`), which
     * is what lets the client hold a trimmed window of history and page back
     * toward the present — see docs/messages-and-pagination.md.
     */
    public function list(User $user, ?string $before = null, ?string $after = null): array
    {
        $this->assertMember($user);
        abort_unless($this->entity->hasCapability('text.read'), 422, 'This channel has no text chat.');
        abort_if(
            filled($before) && filled($after),
            422,
            'Page in one direction at a time — pass before or after, not both.'
        );

        $messages = filled($after)
            ? $this->pageAfter($after)
            : $this->pageBefore($before);

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
        $hasOlder = $messages->isNotEmpty()
            && $this->entity->messages()->where('created_at', '<', $messages->first()->created_at)->exists();

        $hasNewer = $messages->isNotEmpty()
            && $this->entity->messages()->where('created_at', '>', $messages->last()->created_at)->exists();

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
        return $this->entity->messages()->with([
            'author:id,username,display_name,avatar_url,status',
            'attachments',
            'replyTo.author:id,display_name,avatar_url',
        ]);
    }

    public function send(User $user, array $validated): Message
    {
        $this->assertMember($user);
        abort_unless($this->entity->hasCapability('text.read'), 422, 'This channel has no text chat.');
        $this->authorizeSend($user, $validated);

        $attributes = [
            'author_id'   => $user->id,
            'content'     => $validated['content'] ?? null,
            'reply_to_id' => $validated['reply_to_id'] ?? null,
        ];

        $message = Message::create($this->entity instanceof Channel
            ? ['channel_id' => $this->entity->id, ...$attributes]
            : ['conversation_id' => $this->entity->id, ...$attributes]);

        if (! empty($validated['attachment_ids'])) {
            Attachment::whereIn('id', $validated['attachment_ids'])->update(['message_id' => $message->id]);
        }

        $this->entity->update(['last_message_id' => $message->id]);

        $message = self::hydrate($message, $user->id);

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

        $message->delete();

        broadcast(new MessageDeleted($messageId, $type, $id))->toOthers();
    }

    private function assertMember(User $user): void
    {
        $isMember = $this->entity instanceof Channel
            ? $this->entity->room->hasMember($user->id)
            : $this->entity->hasParticipant($user->id);

        abort_unless($isMember, 403);
    }

    /**
     * Checks the specific capability each piece of a message actually needs
     * — plain content needs 'text.send_text', each attachment needs
     * 'text.send_images' or 'text.send_video' depending on its mime type.
     */
    private function authorizeSend(User $user, array $validated): void
    {
        if ($this->entity instanceof Conversation) {
            abort_unless(PermissionChecker::can($user, Permission::SendDirectMessages), 403, 'You are not allowed to send direct messages.');
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
        $message->load(['author:id,username,display_name,avatar_url,status', 'attachments', 'replyTo.author:id,display_name,avatar_url']);
        $message->setAttribute('reactions', $message->reactionSummary($userId));

        return $message;
    }

    /** @return array{0: string, 1: string} [scopeType, scopeId] */
    private static function scope(Message $message): array
    {
        return $message->channel_id
            ? ['channel', $message->channel_id]
            : ['conversation', $message->conversation_id];
    }
}
