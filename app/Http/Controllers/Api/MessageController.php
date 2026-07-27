<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\Conversation;
use App\Models\Message;
use App\Services\TextMessageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MessageController extends Controller
{
    // ── Channel ───────────────────────────────────────────────────────────

    public function indexChannel(Request $request, Channel $channel): JsonResponse
    {
        return response()->json(
            TextMessageService::for($channel)->list(
                $request->user(),
                $request->query('before'),
                $request->query('after'),
                $request->query('around'),
            )
        );
    }

    public function storeChannel(Request $request, Channel $channel): JsonResponse
    {
        $validated = $this->validateMessage($request);
        $message   = TextMessageService::for($channel)->send($request->user(), $validated);

        return response()->json($message, 201);
    }

    // ── Conversation ──────────────────────────────────────────────────────

    public function indexConversation(Request $request, Conversation $conversation): JsonResponse
    {
        return response()->json(
            TextMessageService::for($conversation)->list(
                $request->user(),
                $request->query('before'),
                $request->query('after'),
                $request->query('around'),
            )
        );
    }

    public function storeConversation(Request $request, Conversation $conversation): JsonResponse
    {
        $validated = $this->validateMessage($request);
        $message   = TextMessageService::for($conversation)->send($request->user(), $validated);

        return response()->json($message, 201);
    }

    // ── Edit / delete ─────────────────────────────────────────────────────

    public function update(Request $request, Message $message): JsonResponse
    {
        $validated = $request->validate([
            'content' => ['required', 'string', 'max:4000'],
        ]);

        $message = TextMessageService::updateMessage($request->user(), $message, $validated['content']);

        return response()->json($message);
    }

    public function destroy(Request $request, Message $message): JsonResponse
    {
        TextMessageService::destroyMessage($request->user(), $message);

        return response()->json(['deleted' => true]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────

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
}
