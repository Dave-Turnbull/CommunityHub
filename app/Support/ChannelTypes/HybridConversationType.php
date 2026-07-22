<?php

namespace App\Support\ChannelTypes;

/**
 * Registered under the key Conversation::typeKey() always returns
 * ('conversation') — shares this registry rather than a separate one so
 * Conversation goes through the exact same FeatureRegistry-backed
 * hasCapability() resolution Channel does. `dm` and `group` conversations
 * behave identically today (always text + always voice), so one
 * registration covers both; if they ever need to differ, that's a second
 * registered type and a typeKey() that consults `$this->type`.
 *
 * This codifies what Conversations already did unconditionally before this
 * system existed — not a behavior change for end users.
 */
class HybridConversationType implements ChannelType
{
    public function key(): string { return 'conversation'; }
    public function label(): string { return 'Conversations'; }
    public function icon(): string { return '💬'; }
    public function order(): int { return 3; }
    public function capabilities(): array { return ['text.all', 'voice.all']; }
    public function defaultSettings(): array { return []; }
}
