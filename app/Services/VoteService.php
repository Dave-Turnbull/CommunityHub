<?php

namespace App\Services;

use App\Events\MessageVoted;
use App\Models\Channel;
use App\Models\Message;
use App\Models\User;
use App\Models\Vote;
use App\Support\Permission;
use App\Support\PermissionChecker;

/**
 * The vote Feature's backend operations, bound to a specific Message via
 * for(). See CLAUDE.md's "Service layer" convention — authorization lives
 * inside cast()/remove() themselves, not the caller.
 */
class VoteService
{
    private function __construct(private readonly Message $message) {}

    public static function for(Message $message): self
    {
        return new self($message);
    }

    public function cast(User $user, int $value): array
    {
        $this->authorize($user);

        abort_unless(in_array($value, [1, -1], true), 422, 'A vote must be 1 (up) or -1 (down).');

        Vote::updateOrCreate(
            ['message_id' => $this->message->id, 'user_id' => $user->id],
            ['value' => $value],
        );

        return $this->broadcastSummary($user);
    }

    public function remove(User $user): array
    {
        $this->authorize($user);

        Vote::where(['message_id' => $this->message->id, 'user_id' => $user->id])->delete();

        return $this->broadcastSummary($user);
    }

    private function authorize(User $user): void
    {
        abort_unless($this->message->isVisibleTo($user), 403);
        abort_unless($this->message->hasCapability('vote.cast'), 422, 'Voting is not enabled here.');

        $scopeEntity = $this->message->scopeEntity();
        $room = $scopeEntity instanceof Channel ? $scopeEntity->room : null;
        abort_unless(PermissionChecker::can($user, Permission::Vote, $room), 403, 'You are not allowed to vote.');
    }

    private function broadcastSummary(User $user): array
    {
        $summary = $this->message->fresh()->voteSummary($user->id);

        broadcast(new MessageVoted($this->message, $summary))->toOthers();

        return $summary;
    }
}
