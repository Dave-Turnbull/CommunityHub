<?php

namespace App\Services;

use App\Models\ServerInvite;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Database\Eloquent\Collection;

class ServerInviteService
{
    public function create(User $inviter, ?string $email): ServerInvite
    {
        abort_unless(PermissionChecker::can($inviter, Permission::InviteServer), 403);

        return ServerInvite::create([
            'email'         => $email,
            'invited_by_id' => $inviter->id,
        ]);
    }

    /**
     * Invites that could still be used, newest first. The token is hidden:
     * it is only ever shown once, in the create response.
     *
     * @return Collection<int, ServerInvite>
     */
    public function outstanding(User $viewer): Collection
    {
        abort_unless(PermissionChecker::can($viewer, Permission::InviteServer), 403);

        return ServerInvite::whereNull('accepted_at')
            ->where('expires_at', '>', now())
            ->with('invitedBy:id,username,display_name,avatar_url')
            ->latest()
            ->get()
            ->makeHidden('token');
    }

    public function revoke(User $actor, ServerInvite $invite): void
    {
        abort_unless(PermissionChecker::can($actor, Permission::InviteServer), 403);

        $invite->delete();
    }

    /**
     * A valid, unexpired, unaccepted invite for $token — and, when the
     * invite is email-scoped, only if $email matches it. Returns null
     * rather than throwing so callers (AuthController) can render a plain
     * "this invite link is invalid or has expired" state, the same shape
     * InviteController's room-invite guest flow already uses.
     */
    public function validateToken(string $token, ?string $email = null): ?ServerInvite
    {
        $invite = ServerInvite::where('token', $token)->first();

        if (! $invite || $invite->isExpired() || $invite->isAccepted()) {
            return null;
        }

        if ($invite->email !== null && ($email === null || strcasecmp($invite->email, $email) !== 0)) {
            return null;
        }

        return $invite;
    }
}
