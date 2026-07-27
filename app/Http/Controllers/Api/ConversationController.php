<?php

namespace App\Http\Controllers\Api;

use App\Events\MessageSent;
use App\Http\Controllers\Controller;
use App\Models\Attachment;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\Notification;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;

class ConversationController extends Controller
{
    private const PARTICIPANT_COLUMNS = 'participants.user:id,username,display_name,avatar_url,status';

    public function candidates(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:64'],
        ]);

        return response()->json($request->user()->messageableUsers($validated['q'] ?? null));
    }

    public function resolve(Request $request): JsonResponse
    {
        $user = $request->user();
        $participantIds = $this->validateParticipants($request, $user);

        [$type, $existing] = $this->matchExisting($user, $participantIds);

        return response()->json([
            'type'     => $type,
            'existing' => $existing?->load(self::PARTICIPANT_COLUMNS),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless(PermissionChecker::can($user, Permission::SendDirectMessages), 403, 'You are not allowed to send direct messages.');
        $participantIds = $this->validateParticipants($request, $user);

        $validated = $request->validate([
            'name'              => ['nullable', 'string', 'max:64'],
            'content'           => ['nullable', 'string', 'max:4000'],
            'attachment_ids'    => ['nullable', 'array'],
            'attachment_ids.*'  => ['uuid', 'exists:attachments,id'],
            'reply_to_id'       => ['nullable', 'uuid', 'exists:messages,id'],
            'confirm_duplicate' => ['nullable', 'boolean'],
        ]);

        abort_if(
            blank($validated['content'] ?? null) && blank($validated['attachment_ids'] ?? null),
            422,
            'A message needs either content or an attachment.'
        );

        [$type, $existing] = $this->matchExisting($user, $participantIds);

        if ($existing && $type === 'group' && ! ($validated['confirm_duplicate'] ?? false)) {
            return response()->json([
                'message'  => 'A group with these exact members already exists.',
                'existing' => $existing->load(self::PARTICIPANT_COLUMNS),
            ], 409);
        }

        if ($existing && $type === 'dm') {
            $conversation = $existing;
        } else {
            $conversation = Conversation::create([
                'type' => $type,
                'name' => $type === 'group' ? ($validated['name'] ?? null) : null,
            ]);

            foreach ([...$participantIds, $user->id] as $participantId) {
                ConversationParticipant::create([
                    'conversation_id' => $conversation->id,
                    'user_id'         => $participantId,
                ]);
            }
        }

        $message = Message::create([
            'conversation_id' => $conversation->id,
            'author_id'       => $user->id,
            'content'         => $validated['content'] ?? null,
            'reply_to_id'     => $validated['reply_to_id'] ?? null,
        ]);

        if (! empty($validated['attachment_ids'])) {
            Attachment::whereIn('id', $validated['attachment_ids'])->update(['message_id' => $message->id]);
        }

        $conversation->update(['last_message_id' => $message->id]);

        $message->load(['author:id,username,display_name,avatar_url,status', 'attachments', 'replyTo.author:id,display_name,avatar_url']);
        $message->setAttribute('reactions', $message->reactionSummary($user->id));

        broadcast(new MessageSent($message, 'conversation', $conversation->id))->toOthers();

        $this->notifyOtherParticipants($conversation, $message, $user);

        return response()->json([
            'conversation' => $conversation->load(self::PARTICIPANT_COLUMNS),
            'message'      => $message,
        ], 201);
    }

    public function addParticipants(Request $request, Conversation $conversation): JsonResponse
    {
        Gate::authorize('addParticipants', $conversation);

        $user = $request->user();
        $newIds = $this->validateParticipants($request, $user);

        $existingIds = $conversation->participants()->pluck('user_id')->all();
        $groupName = $conversation->name ?? 'Group Chat';

        foreach ($newIds as $id) {
            if (in_array($id, $existingIds, true)) {
                continue;
            }

            ConversationParticipant::create([
                'conversation_id' => $conversation->id,
                'user_id'         => $id,
            ]);

            Notification::notify($id, 'direct_message', [
                'conversation_id' => $conversation->id,
                'message_id'      => null,
                'sender_id'       => $user->id,
                'sender_name'     => $user->display_name,
                'preview'         => "Added you to {$groupName}",
            ]);
        }

        return response()->json($conversation->load(self::PARTICIPANT_COLUMNS));
    }

    /** @return string[] validated, deduped, self-excluded participant ids */
    private function validateParticipants(Request $request, User $user): array
    {
        $validated = $request->validate([
            'user_ids'   => ['required', 'array', 'min:1'],
            'user_ids.*' => ['uuid', 'exists:users,id'],
        ]);

        $ids = collect($validated['user_ids'])
            ->unique()
            ->reject(fn ($id) => $id === $user->id)
            ->values();

        abort_if($ids->isEmpty(), 422, 'Pick at least one person to message.');

        foreach ($ids as $id) {
            abort_unless($user->sharesRoomWith($id), 403, 'You can only message people you share a room with.');
        }

        return $ids->all();
    }

    /** @return array{0: string, 1: ?Conversation} [type, exact-match existing conversation] */
    private function matchExisting(User $user, array $participantIds): array
    {
        $allIds = [...$participantIds, $user->id];
        $type = count($allIds) === 2 ? 'dm' : 'group';

        $query = Conversation::where('type', $type);
        foreach ($allIds as $id) {
            $query->whereHas('participants', fn ($q) => $q->where('user_id', $id));
        }

        $existing = $query->withCount('participants')
            ->get()
            ->firstWhere('participants_count', count($allIds));

        return [$type, $existing];
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
}
