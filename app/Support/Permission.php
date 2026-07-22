<?php

namespace App\Support;

/**
 * The full vocabulary of grantable permissions. A permission only belongs
 * here once something in the codebase actually checks it — see
 * NotificationPreference::DEFAULTS's "configurable but not functional" trap
 * (CLAUDE.md trap #24) for why a permission with no enforcement site is a
 * real footgun, not a harmless placeholder. ManageMembers/BanMembers/
 * ManageMessages/ManageEmojis are declared now (so a Role's stored
 * permission set can reference them and a future milestone doesn't need a
 * schema change) but have no enforcement site yet — do not assume enabling
 * them does anything until a controller checks PermissionChecker::can() for
 * that case.
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
}
