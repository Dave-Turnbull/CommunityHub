<?php

namespace Tests\Unit\Support;

use App\Support\Permission;
use Tests\TestCase;

/**
 * Permission values are stored as plain strings in role_permissions with no
 * DB enum and no boot-time registry validating them against this enum
 * (unlike FeatureRegistry's capability keys) — see Permission's docblock.
 * Renaming or removing a case only silently orphans existing rows; this
 * test is the loud failure that catches it instead, by pinning every case's
 * value. A real rename must update this list *and* backfill role_permissions.
 */
class PermissionEnumStabilityTest extends TestCase
{
    public function test_permission_values_have_not_silently_changed(): void
    {
        $expected = [
            'administrator',
            'manage_room',
            'manage_roles',
            'manage_channels',
            'manage_mod_channels',
            'manage_members',
            'ban_members',
            'manage_messages',
            'manage_emojis',
            'see_all_channels',
            'manage_channel_visibility',
            'send_direct_messages',
            'post_announcements',
        ];

        $actual = array_map(fn (Permission $p) => $p->value, Permission::cases());

        sort($expected);
        sort($actual);

        $this->assertSame($expected, $actual);
    }
}
