<?php

namespace App\Support\Capabilities;

/**
 * A capability *provider* — text, voice, and eventually canvas/game/etc.
 * Distinct from App\Support\ChannelTypes\ChannelType, which is a capability
 * *consumer*: a ChannelType requests capabilities a Feature defines, it
 * doesn't define any itself. See CLAUDE.md's "Capabilities" convention.
 *
 * Capability keys returned by capabilities() are bare suffixes ("read",
 * "send_text"), not fully-qualified — FeatureRegistry prefixes them with
 * this Feature's key() when resolving/checking ("text.read"). Same shape
 * for groups().
 */
interface Feature
{
    /** The namespace prefix for every capability this Feature defines, e.g. "text". */
    public function key(): string;

    /** @return array<string, string> capability suffix => human description. */
    public function capabilities(): array;

    /**
     * Named aliases that expand to a set of this Feature's own capability
     * suffixes at registration time — e.g. ['send_all' => ['send_text',
     * 'send_images', 'send_video']]. Don't define "all" here — the registry
     * auto-derives it from capabilities() so it can never go stale.
     *
     * @return array<string, string[]>
     */
    public function groups(): array;
}
