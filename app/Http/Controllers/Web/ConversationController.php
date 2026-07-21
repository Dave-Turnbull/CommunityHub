<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ConversationController extends Controller
{
    /** Home page — the DM hub. */
    public function index(): Response
    {
        return Inertia::render('DM/Index');
    }

    public function show(Request $request, Conversation $conversation): Response
    {
        $user = $request->user();

        abort_unless($conversation->hasParticipant($user->id), 403);

        $conversation->load('participants.user:id,username,display_name,avatar_url,status');

        $messages = $conversation->messages()
            ->with(['author:id,username,display_name,avatar_url,status', 'attachments', 'replyTo.author:id,display_name,avatar_url'])
            ->latest()
            ->limit(51)
            ->get();

        $hasMore  = $messages->count() > 50;
        $messages = $messages->take(50)->reverse()->values();
        $messages->each(fn ($m) => $m->setAttribute('reactions', $m->reactionSummary($user->id)));

        return Inertia::render('DM/Show', [
            'conversation' => $conversation,
            'messages'     => [
                'data'        => $messages,
                'has_more'    => $hasMore,
                'next_cursor' => $hasMore ? $messages->first()?->id : null,
            ],
        ]);
    }
}
