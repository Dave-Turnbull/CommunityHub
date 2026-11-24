<?php

namespace App\Services;

use App\Models\Message;
use App\Models\Notification;
use App\Models\Room;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * Edit/delete a room, per the service-layer convention (docs/service-layer.md):
 * authorization first (RoomPolicy, via Gate), then the operation.
 */
class RoomService
{
    public function update(Room $room, User $actor, array $attributes): Room
    {
        Gate::forUser($actor)->authorize('update', $room);

        $room->update($attributes);

        return $room;
    }

    /**
     * Channels, messages, memberships, roles, bans, invites, ceilings and
     * custom emoji go with the room via database-level cascades, and
     * instance_settings.default_room_id nulls itself. Attachment files and
     * room-keyed notifications are the two things the database can't reach, so
     * they're cleared here first — files before rows, same order as
     * TextMessageService::deleteAttachments.
     */
    public function delete(Room $room, User $actor): void
    {
        Gate::forUser($actor)->authorize('delete', $room);

        $channelIds = $room->channels()->pluck('id');

        Message::withTrashed()
            ->whereIn('channel_id', $channelIds)
            ->whereHas('attachments')
            ->each(fn (Message $message) => TextMessageService::deleteAttachments($message));

        DB::transaction(function () use ($room) {
            Notification::whereIn('type', ['room_message', 'room_invite'])
                ->where('data->room_id', $room->id)
                ->delete();

            $room->delete();
        });
    }
}
