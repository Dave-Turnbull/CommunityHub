<?php

namespace App\Services;

/**
 * Thrown by RoomMembershipService::kick()/ban() when the target holds the
 * room's Owner role and the caller hasn't confirmed the ownership transfer
 * yet — Api\RoomMemberController catches this and responds 409 so the
 * frontend can show a confirmation dialog before resubmitting with
 * confirm_owner_transfer: true.
 */
class OwnerTransferRequiredException extends \RuntimeException
{
    protected $message = 'Removing this room\'s Owner will make you the new Owner. Confirm to proceed.';
}
