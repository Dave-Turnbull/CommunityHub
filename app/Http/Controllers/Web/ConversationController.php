<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Services\TextMessageService;
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

        return Inertia::render('DM/Show', [
            'conversation' => $conversation,
            // Same service the client pages with — see ChannelController::show.
            'messages'     => TextMessageService::for($conversation)->list($user),
        ]);
    }
}
