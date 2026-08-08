<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\ServerInviteMail;
use App\Models\ServerInvite;
use App\Services\ServerInviteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;

class ServerInviteController extends Controller
{
    /**
     * Create a server invite and, when an email was given, send it.
     * `email` is optional — an open, shareable link vs. one scoped to a
     * single address (see ServerInvite::$fillable, ServerInviteService::
     * validateToken). No index/destroy yet — a list/revoke UI is a
     * fast-follow, not blocking this signup-path being real (see
     * CLAUDE.md's "Planned work").
     */
    public function store(Request $request, ServerInviteService $service): JsonResponse
    {
        Gate::authorize('create', ServerInvite::class);

        $validated = $request->validate([
            'email' => ['nullable', 'email'],
        ]);

        $invite = $service->create($request->user(), $validated['email'] ?? null);

        if ($invite->email) {
            Mail::to($invite->email)->send(new ServerInviteMail($invite));
        }

        return response()->json([
            'invite'  => $invite,
            'url'     => url("/register?invite={$invite->token}"),
        ], 201);
    }
}
