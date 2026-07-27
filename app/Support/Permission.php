<?php

namespace App\Support;

/**
 * The full vocabulary of grantable permissions. A permission only belongs
 * here once something in the codebase actually checks it — see
 * NotificationPreference::DEFAULTS's "configurable but not functional" trap
 * (CLAUDE.md trap #24) for why a permission with no enforcement site is a
 * real footgun, not a harmless placeholder. ManageMessages/ManageEmojis are
 * declared now (so a Role's stored permission set can reference them and a
 * future milestone doesn't need a schema change) but have no enforcement
 * site yet — do not assume enabling them does anything until a controller
 * checks PermissionChecker::can() for that case. ManageMembers/BanMembers now
 * do — see RoomMemberPolicy/RoomMembershipService.
 *
 * Renaming or removing a case only silently orphans existing
 * `role_permissions` rows (there is no boot-time registry validating the
 * stored string against this enum, unlike FeatureRegistry's capability
 * keys) — see PermissionEnumStabilityTest, which fails immediately if a
 * case's value changes, and CLAUDE.md's "Roles & permissions" convention for
 * the backfill a real rename needs.
 */
enum Permission: string
{
    /** Wildcard — a role with this implies every other permission, in whatever scope the role applies. */
    case Administrator = 'administrator';

    case ManageRoom     = 'manage_room';
    case ManageRoles    = 'manage_roles';
    case ManageChannels = 'manage_channels';
    case ManageMembers  = 'manage_members';
    case BanMembers     = 'ban_members';
    case ManageMessages = 'manage_messages';
    case ManageEmojis   = 'manage_emojis';

    /** Room-scoped. Bypasses a channel's visibility restriction when viewing/listing. */
    case SeeAllChannels = 'see_all_channels';

    /**
     * Room-scoped. Required to *set* a channel's visibility list — kept
     * separate from ManageChannels so "who can restrict a channel" can be
     * delegated independently of full channel CRUD. See
     * Api\ChannelController::update's visibility_role_ids handling and
     * ChannelPolicy::manageVisibility.
     */
    case ManageChannelVisibility = 'manage_channel_visibility';

    /**
     * Global-scope-relevant (checked with $room = null). Gates both starting
     * a new conversation and sending in an existing one — see
     * Api\ConversationController::store and TextMessageService::authorizeSend.
     * Granted to the global Member role by default; the supported way to
     * restrict a specific user is to move them off Member onto a role that
     * lacks it, since PermissionChecker's union has no explicit "deny" — see
     * docs/roles-and-permissions.md.
     */
    case SendDirectMessages = 'send_direct_messages';
}
