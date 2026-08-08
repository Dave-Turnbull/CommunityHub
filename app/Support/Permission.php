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
 * checks PermissionChecker::can() for that case. ManageMembers/BanMembers/
 * InviteServer now do — see RoomMemberPolicy/RoomMembershipService,
 * ServerInviteService.
 *
 * Each case applies at server (global-role) tier, room tier, or both — see
 * serverTierCases()/roomTierCases(). A curated subset also applies at
 * channel tier via per-channel overrides — see channelOverridableCases()
 * and docs/roles-and-permissions.md.
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

    /**
     * Room-scoped. Gates *creating* a channel whose ChannelType::category()
     * is 'mod' (announcement today; a future 'reports' type would fall
     * under it automatically with no code change here) — ManageChannels
     * alone no longer authorizes creating a mod-category channel. This
     * permission also *implies* ManageChannels (creating standard-category
     * channels, and all non-create channel management: edit/delete/reorder)
     * — see ChannelPolicy::canManageChannels(). Splitting a narrower,
     * independently-delegatable permission out of ManageChannels mirrors
     * ManageChannelVisibility's precedent, but unlike that permission this
     * one is a superset, not a sibling: holding it grants everything
     * ManageChannels grants, plus mod-category creation.
     */
    case ManageModChannels = 'manage_mod_channels';

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

    /**
     * Room-scoped. Gates sending into an 'announcement'-type channel
     * specifically — see TextMessageService::authorizeSend's
     * `$this->entity->type === 'announcement'` branch. Every other channel
     * type has no send-side permission check at all (membership +
     * `hasCapability('text.send_text')` is enough); this is the one
     * exception, mirroring how SendDirectMessages is Conversation-specific
     * rather than a capability. Granted to the seeded Moderator role by
     * default (see Role::seedDefaultsForRoom) — Owner already has it via
     * Administrator. Not implied by ManageModChannels/ManageChannels: those
     * gate creating/managing a mod-category channel, not posting into
     * one that already exists, and Moderator deliberately holds this
     * without holding ManageModChannels.
     */
    case PostAnnouncements = 'post_announcements';

    /**
     * Room-scoped (global-scope-relevant too, same shape as
     * SendDirectMessages). Gates *authorship* of a threaded comment —
     * standalone, deliberately independent of SendMessages, which gates
     * ordinary (non-comment, non-announcement) posting in the same channel.
     * A role can hold Comment without holding SendMessages, or vice versa —
     * this is what lets a channel disable ordinary sending while leaving
     * commenting enabled, or the reverse. Checked in TextMessageService's
     * comment-send branch, alongside (never instead of) the channel's
     * `comments_enabled` setting — a parameter, not a capability, see docs/
     * comments-and-voting.md. Granted to the seeded Member role by default.
     * Channel-overridable — see docs/roles-and-permissions.md.
     */
    case Comment = 'comment';

    /** Room-scoped. Gates casting/removing a vote — see VoteService. Channel-overridable. */
    case Vote = 'vote';

    /**
     * Room-scoped. Gates ordinary (non-comment, non-announcement) posting in
     * a channel — see TextMessageService::authorizeSend's default branch.
     * Previously this had no RBAC gate at all (membership + `hasCapability(
     * 'text.send_text')` was enough); this closes that gap and is what makes
     * "disable ordinary sending but keep Comment enabled" on a single channel
     * expressible. Does NOT apply to an 'announcement'-type channel — that
     * stays gated solely by PostAnnouncements. Granted to the seeded Member
     * role by default. Channel-overridable — see docs/roles-and-permissions.md.
     */
    case SendMessages = 'send_messages';

    /**
     * Room-scoped (global-scope-relevant too, same shape as Comment/
     * SendDirectMessages). Gates adding/removing a reaction on a message —
     * see ReactionController. Previously this had no RBAC gate at all
     * (membership only). Granted to the seeded Member role by default.
     * Channel-overridable — see docs/roles-and-permissions.md.
     */
    case React = 'react';

    /**
     * Server-wide (checked with $room = null). Gates creating a room — see
     * RoomPolicy::create/Web\RoomController. Previously room creation had no
     * gate at all; this closes that gap. Granted to the global Member role
     * by default.
     */
    case CreateRoom = 'create_room';

    /**
     * Server-wide. Gates creating a ServerInvite — see
     * ServerInviteService::create()/Api\ServerInviteController. A server
     * invite grants the right to create an account at all (distinct from
     * RoomInvite, which grants room membership) — see
     * docs/conversations-and-invites.md's "Server invites".
     */
    case InviteServer = 'invite_server';

    /**
     * Room-scoped. Gates inviting a new member to a room — see
     * RoomPolicy::invite. Split out of ManageMembers (which now means "kick"
     * only) so a room-permission ceiling can grant invite rights without
     * granting kick rights — the two are unrelated capabilities that used to
     * share one enum case. Granted to the seeded Moderator role by default,
     * alongside ManageMembers.
     */
    case InviteMembers = 'invite_members';

    /**
     * Every permission that applies at server (global-role) tier — used to
     * validate a server role's ordinary permission grants and, distinctly,
     * what may appear in a room-permission ceiling's *category* of concern
     * (a ceiling itself only ever stores room-tier values — see
     * PermissionCeiling). Administrator/ManageRoles apply at both tiers.
     */
    public static function serverTierCases(): array
    {
        return [
            self::Administrator,
            self::ManageRoles,
            self::CreateRoom,
            self::InviteServer,
            self::SendDirectMessages,
        ];
    }

    /**
     * Every permission that applies at room tier — this is also the full set
     * of values a room-permission ceiling (RoleRoomPermissionCeiling/
     * RoomPermissionCeiling) may ever store, since a ceiling caps what a
     * room's roles may hold, and only room-tier permissions live on room
     * roles. Administrator/ManageRoles apply at both tiers.
     */
    public static function roomTierCases(): array
    {
        return [
            self::Administrator,
            self::ManageRoles,
            self::ManageRoom,
            self::ManageEmojis,
            self::InviteMembers,
            self::ManageMembers,
            self::BanMembers,
            self::ManageChannels,
            self::ManageModChannels,
            self::SeeAllChannels,
            self::ManageChannelVisibility,
            self::ManageMessages,
            self::SendMessages,
            self::PostAnnouncements,
            self::Comment,
            self::React,
            self::Vote,
        ];
    }

    /**
     * The curated subset a channel's role-scoped permission_overrides may
     * target — deliberately small (room-management-style permissions like
     * ManageRoom/ManageRoles/BanMembers never appear here), see
     * docs/roles-and-permissions.md's "Channel-tier permission overrides".
     */
    public static function channelOverridableCases(): array
    {
        return [
            self::SendMessages,
            self::PostAnnouncements,
            self::Comment,
            self::React,
            self::Vote,
            self::ManageChannelVisibility,
        ];
    }
}
