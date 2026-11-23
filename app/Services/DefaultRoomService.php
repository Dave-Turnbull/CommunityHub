<?php

namespace App\Services;

use App\Jobs\EnrollExistingUsersInDefaultRoom;
use App\Models\InstanceSetting;
use App\Models\Room;
use App\Models\User;

/**
 * The instance's optional default room (InstanceSetting.default_room_id) —
 * see docs/conversations-and-invites.md's "Default room". Every enrolment
 * path (account creation, email verification, the bulk "add everyone" job)
 * goes through enrollIn(), and from there through Room::addMember().
 */
class DefaultRoomService
{
    public function room(): ?Room
    {
        return InstanceSetting::current()->defaultRoom;
    }

    public function set(?Room $room, bool $enrollExisting = false): InstanceSetting
    {
        $settings = InstanceSetting::current();
        $settings->update(['default_room_id' => $room?->id]);

        if ($room && $enrollExisting) {
            EnrollExistingUsersInDefaultRoom::dispatch($room->id);
        }

        return $settings;
    }

    public function enrollIfEligible(User $user): ?Room
    {
        $room = $this->room();

        return $room && $this->enrollIn($room, $user) ? $room : null;
    }

    /**
     * While email verification is enforced, an unverified account is left
     * out — the Verified listener in AppServiceProvider enrols it once it
     * verifies. A banned user is skipped rather than letting
     * Room::addMember() abort the whole signup or bulk run.
     */
    public function enrollIn(Room $room, User $user): bool
    {
        if (config('verification.enabled') && ! $user->hasVerifiedEmail()) {
            return false;
        }

        if ($room->isBanned($user->id)) {
            return false;
        }

        $room->addMember($user);

        return true;
    }

    /** Where a just-enrolled account should land, or null if it isn't in a default room it can see into. */
    public function landingPath(User $user): ?string
    {
        $room = $this->room();

        if (! $room || ! $room->hasMember($user->id)) {
            return null;
        }

        $channel = $room->firstVisibleTextChannelFor($user);

        return $channel ? "/channels/{$channel->id}" : null;
    }
}
