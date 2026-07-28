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
        if ($request->query('sort') === 'top') {
            return response()->json($this->listTop($request, TextMessageService::for($channel)));
        }

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

    // ── Comments ──────────────────────────────────────────────────────────

    public function indexComments(Request $request, Message $message): JsonResponse
    {
        if ($request->query('sort') === 'top') {
            return response()->json($this->listTop($request, TextMessageService::for($message)));
        }

        return response()->json(
            TextMessageService::for($message)->list(
                $request->user(),
                $request->query('before'),
                $request->query('after'),
                $request->query('around'),
            )
        );
    }

    public function storeComment(Request $request, Message $message): JsonResponse
    {
        $validated = $this->validateMessage($request);
        $comment   = TextMessageService::for($message)->send($request->user(), $validated);

        return response()->json($comment, 201);
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

    /**
     * Shared by indexChannel/indexComments for `?sort=top` — see
     * TextMessageService::listTop's docblock for why this is a distinct,
     * offset-paginated contract rather than a fourth cursor mode.
     */
    private function listTop(Request $request, TextMessageService $service): array
    {
        $validated = $request->validate([
            'period' => ['required', 'string', 'in:hour,day,week,month,all,custom'],
            'start'  => ['nullable', 'date', 'required_if:period,custom'],
            'end'    => ['nullable', 'date'],
            'offset' => ['nullable', 'integer', 'min:0'],
        ]);

        return $service->listTop(
            $request->user(),
            $validated['period'],
            isset($validated['start']) ? \Illuminate\Support\Carbon::parse($validated['start'])->toDateTimeString() : null,
            isset($validated['end']) ? \Illuminate\Support\Carbon::parse($validated['end'])->toDateTimeString() : null,
            (int) ($validated['offset'] ?? 0),
        );
    }

    private function validateMessage(Request $request): array
    {
        $validated = $request->validate([
            'content'          => ['nullable', 'string', 'max:4000'],
            'title'            => ['nullable', 'string', 'max:300'],
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
