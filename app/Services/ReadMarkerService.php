<?php

namespace App\Services;

use App\Models\Channel;
use App\Models\Conversation;
use App\Models\ReadMarker;
use App\Models\Role;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Per-user read markers and the unread counts derived from them, per the
 * service-layer convention (docs/service-layer.md). See docs/unread-counts.md.
 */
class ReadMarkerService
{
    public function markChannelRead(Channel $channel, User $user): void
    {
        abort_unless($channel->room->hasMember($user->id), 403);
        abort_unless($channel->isVisibleTo($user), 403);

        $this->upsert($user, 'channel_id', $channel->id);
    }

    public function markConversationRead(Conversation $conversation, User $user): void
    {
        abort_unless($conversation->hasParticipant($user->id), 403);

        $this->upsert($user, 'conversation_id', $conversation->id);
    }

    /**
     * @param  iterable<string>|null  $conversationIds  restrict to these; null = every conversation the user is in
     * @return array<string, int>  conversation id => unread count, omitting conversations with none
     */
    public function conversationUnreadCounts(User $user, ?iterable $conversationIds = null): array
    {
        $query = DB::table('conversation_participants as cp')
            ->join('messages as m', 'm.conversation_id', '=', 'cp.conversation_id')
            ->leftJoin('read_markers as rm', fn ($join) => $join
                ->on('rm.conversation_id', '=', 'cp.conversation_id')
                ->where('rm.user_id', $user->id))
            ->where('cp.user_id', $user->id)
            ->whereNull('m.parent_message_id')
            ->whereNull('m.deleted_at')
            ->where('m.author_id', '<>', $user->id)
            ->whereRaw('m.created_at > coalesce(rm.last_read_at, cp.created_at)')
            ->groupBy('cp.conversation_id')
            ->selectRaw('cp.conversation_id as scope_id, count(*) as unread');

        if ($conversationIds !== null) {
            $query->whereIn('cp.conversation_id', collect($conversationIds)->all());
        }

        return $this->counts($query);
    }

    /**
     * @return array<string, int>  channel id => unread count, omitting channels with none or hidden from $user
     */
    public function channelUnreadCounts(string $roomId, User $user): array
    {
        $query = $this->unreadChannelMessages($user)
            ->where('c.room_id', $roomId)
            ->groupBy('c.id')
            ->selectRaw('c.id as scope_id, count(*) as unread');

        return $this->counts($query);
    }

    /**
     * @return array<int, string>  ids of the user's rooms with at least one visible channel holding unread messages
     */
    public function roomIdsWithUnread(User $user): array
    {
        $rows = $this->unreadChannelMessages($user)
            ->groupBy('c.room_id')
            ->selectRaw('c.room_id as scope_id, count(*) as unread')
            ->get();

        return $rows->pluck('scope_id')->all();
    }

    private function upsert(User $user, string $scopeColumn, string $scopeId): void
    {
        $now = now();

        ReadMarker::upsert(
            [[
                'id'            => (string) Str::uuid(),
                'user_id'       => $user->id,
                $scopeColumn    => $scopeId,
                'last_read_at'  => $now,
                'created_at'    => $now,
                'updated_at'    => $now,
            ]],
            ['user_id', $scopeColumn],
            ['last_read_at', 'updated_at'],
        );
    }

    /**
     * Top-level, live messages by other people, newer than the user's marker
     * for the channel — or, with no marker, newer than when they joined the
     * room — restricted to channels the user may see.
     */
    private function unreadChannelMessages(User $user): Builder
    {
        $query = DB::table('messages as m')
            ->join('channels as c', 'c.id', '=', 'm.channel_id')
            ->join('room_members as rmem', fn ($join) => $join
                ->on('rmem.room_id', '=', 'c.room_id')
                ->where('rmem.user_id', $user->id))
            ->leftJoin('read_markers as rm', fn ($join) => $join
                ->on('rm.channel_id', '=', 'c.id')
                ->where('rm.user_id', $user->id))
            ->whereNull('m.parent_message_id')
            ->whereNull('m.deleted_at')
            ->where('m.author_id', '<>', $user->id)
            ->whereRaw('m.created_at > coalesce(rm.last_read_at, rmem.joined_at)');

        return $this->applyChannelVisibility($query, $user);
    }

    /**
     * Set-based mirror of Channel::isVisibleTo(): see-all bypass (Administrator
     * or SeeAllChannels, held globally or in the channel's own room), else no
     * visibility roles at all, else a role the user is assigned.
     */
    private function applyChannelVisibility(Builder $query, User $user): Builder
    {
        $globalBypass = false;
        $bypassRoomIds = [];

        $roles = Role::query()
            ->whereHas('assignments', fn ($q) => $q->where('user_id', $user->id))
            ->with('rolePermissions')
            ->get();

        foreach ($roles as $role) {
            if (! $role->hasPermission(Permission::Administrator) && ! $role->hasPermission(Permission::SeeAllChannels)) {
                continue;
            }

            if ($role->isGlobal()) {
                $globalBypass = true;
            } else {
                $bypassRoomIds[] = $role->room_id;
            }
        }

        if ($globalBypass) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($user, $bypassRoomIds) {
            $q->whereIn('c.room_id', $bypassRoomIds)
                ->orWhereNotExists(fn (Builder $s) => $s->selectRaw('1')
                    ->from('channel_role_visibility as v')
                    ->whereColumn('v.channel_id', 'c.id'))
                ->orWhereExists(fn (Builder $s) => $s->selectRaw('1')
                    ->from('channel_role_visibility as v')
                    ->join('role_assignments as ra', 'ra.role_id', '=', 'v.role_id')
                    ->whereColumn('v.channel_id', 'c.id')
                    ->where('ra.user_id', $user->id));
        });
    }

    /** @return array<string, int> */
    private function counts(Builder $query): array
    {
        return $query->get()->mapWithKeys(fn ($row) => [$row->scope_id => (int) $row->unread])->all();
    }
}
