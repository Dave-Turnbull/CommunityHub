<?php

namespace App\Support\ChannelTypes;

/**
 * The capability contract every channel type (built-in or, eventually, a
 * plugin-registered custom type) implements. This is the extension seam —
 * a future channel-type plugin registers an implementation of this via
 * ChannelTypeRegistry::register() from its own service provider, the same
 * way TextChannelType/VoiceChannelType/AnnouncementChannelType do from
 * ChannelTypeServiceProvider — nothing else in the app needs to change to
 * support it.
 */
interface ChannelType
{
    /** The value stored in channels.type. */
    public function key(): string;

    /** Sidebar group label, e.g. "Voice Channels". */
    public function label(): string;

    public function icon(): string;

    /** Sort weight among known types in ChannelSidebar's grouping. */
    public function order(): int;

    /** Whether this type has a message thread — see Channel::isTextCapable(). */
    public function isTextCapable(): bool;

    /** Whether this type gets a voice.channel.{id} presence/signaling channel. */
    public function isVoiceCapable(): bool;

    /** Seed value for Channel.settings when a channel of this type is created with none supplied. */
    public function defaultSettings(): array;
}
