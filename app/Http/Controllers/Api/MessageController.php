<?php

namespace App\Http\Controllers\Api;

use App\Events\MessageDeleted;
use App\Events\MessageSent;
use App\Events\MessageUpdated;
use App\Http\Controllers\Controller;
use App\Models\Attachment;
use App\Models\Channel;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Notification;
use App\Support\ChannelFocus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class MessageController extends Controller
{
    private const PAGE_SIZE = 50;

    // ── Channel ───────────────────────────────────────────────────────────

    public function indexChannel(Request $request, Channel $channel): JsonResponse
    {
        $user = $request->user();
        abort_unless($channel->room->hasMember($user->id), 403);
        abort_unless($channel->isTextCapable(), 422, 'This channel has no text chat.');

        return response()->json(
            $this->paginate($channel->messages(), $request->query('before'), $user->id)
        );
    }

    public function storeChannel(Request $request, Channel $channel): JsonResponse
    {
        $user = $request->user();
        abort_unless($channel->room->hasMember($user->id), 403);
        abort_unless($channel->isTextCapable(), 422, 'This channel has no text chat.');

        $validated = $this->validateMessage($request);

        $message = Message::create([
            'channel_id'  => $channel->id,
            'author_id'   => $user->id,
            'content'     => $validated['content'] ?? null,
            'reply_to_id' => $validated['reply_to_id'] ?? null,
        ]);

        $this->attachFiles($message, $validated['attachment_ids'] ?? []);

        $channel->update(['last_message_id' => $message->id]);

        $message = $this->hydrate($message, $user->id);

        broadcast(new MessageSent($message, 'channel', $channel->id))->toOthers();

        $this->notifyOtherRoomMembers($channel, $message, $user);

        return response()->json($message, 201);
    }

    // ── Conversation ──────────────────────────────────────────────────────

    public function indexConversation(Request $request, Conversation $conversation): JsonResponse
    {
        $user = $request->user();
        abort_unless($conversation->hasParticipant($user->id), 403);

        return response()->json(
            $this->paginate($conversation->messages(), $request->query('before'), $user->id)
        );
    }

    public function storeConversation(Request $request, Conversation $conversation): JsonResponse
    {
        $user = $request->user();
        abort_unless($conversation->hasParticipant($user->id), 403);

        $validated = $this->validateMessage($request);

        $message = Message::create([
            'conversation_id' => $conversation->id,
            'author_id'       => $user->id,
            'content'         => $validated['content'] ?? null,
            'reply_to_id'     => $validated['reply_to_id'] ?? null,
        ]);

        $this->attachFiles($message, $validated['attachment_ids'] ?? []);

        $conversation->update(['last_message_id' => $message->id]);

        $message = $this->hydrate($message, $user->id);

        broadcast(new MessageSent($message, 'conversation', $conversation->id))->toOthers();

        $this->notifyOtherParticipants($conversation, $message, $user);

        return response()->json($message, 201);
    }

    // ── Edit / delete ─────────────────────────────────────────────────────

    public function update(Request $request, Message $message): JsonResponse
    {
        $user = $request->user();
        abort_unless($message->author_id === $user->id, 403);

        $validated = $request->validate([
            'content' => ['required', 'string', 'max:4000'],
        ]);

        $message->update([
            'content'   => $validated['content'],
            'is_edited' => true,
        ]);

        $message = $this->hydrate($message, $user->id);
        [$type, $id] = $this->scope($message);

        broadcast(new MessageUpdated($message, $type, $id))->toOthers();

        return response()->json($message);
    }

    public function destroy(Request $request, Message $message): JsonResponse
    {
        abort_unless($message->author_id === $request->user()->id, 403);

        [$type, $id] = $this->scope($message);
        $messageId = $message->id;

        $message->delete();

        broadcast(new MessageDeleted($messageId, $type, $id))->toOthers();

        return response()->json(['deleted' => true]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private function notifyOtherParticipants(Conversation $conversation, Message $message, $sender): void
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
    private function notifyOtherRoomMembers(Channel $channel, Message $message, $sender): void
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

    private function validateMessage(Request $request): array
    {
        $validated = $request->validate([
            'content'          => ['nullable', 'string', 'max:4000'],
            'attachment_ids'   => ['nullable', 'array'],
            'attachment_ids.*' => ['uuid', 'exists:attachments,id'],
            'reply_to_id'      => ['nullable', 'uuid', 'exists:messages,id'],
        ]);

        abort_if(
            blank($validated['content'] ?? null) && blank($validated['attachment_ids'] ?? null),
            422,
            'A message needs either content or an attachment.'
        );

        return $validated;
    }

    /** Cursor pagination — walks backwards from the given message id. */
    private function paginate($query, ?string $before, string $userId): array
    {
        if ($before && $pivot = Message::find($before)) {
            $query->where('created_at', '<', $pivot->created_at);
        }

        $messages = $query
            ->with(['author:id,username,display_name,avatar_url,status', 'attachments', 'replyTo.author:id,display_name,avatar_url'])
            ->latest()
            ->limit(self::PAGE_SIZE + 1)
            ->get();

        $hasMore  = $messages->count() > self::PAGE_SIZE;
        $messages = $messages->take(self::PAGE_SIZE)->reverse()->values();
        $messages->each(fn ($m) => $m->setAttribute('reactions', $m->reactionSummary($userId)));

        return [
            'data'        => $messages,
            'has_more'    => $hasMore,
            'next_cursor' => $hasMore ? $messages->first()?->id : null,
        ];
    }

    private function attachFiles(Message $message, array $ids): void
    {
        if ($ids) {
            Attachment::whereIn('id', $ids)->update(['message_id' => $message->id]);
        }
    }

    private function hydrate(Message $message, string $userId): Message
    {
        $message->load(['author:id,username,display_name,avatar_url,status', 'attachments', 'replyTo.author:id,display_name,avatar_url']);
        $message->setAttribute('reactions', $message->reactionSummary($userId));

        return $message;
    }

    /** @return array{0: string, 1: string} [scopeType, scopeId] */
    private function scope(Message $message): array
    {
        return $message->channel_id
            ? ['channel', $message->channel_id]
            : ['conversation', $message->conversation_id];
    }
}
