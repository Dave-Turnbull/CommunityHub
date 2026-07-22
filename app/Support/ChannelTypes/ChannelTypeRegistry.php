<?php

namespace App\Support\ChannelTypes;

/**
 * Single source of truth for "what channel types exist and what can they
 * do" — replaces the old Channel::TEXT_CAPABLE_TYPES array constant and the
 * literal `$channel->type !== 'voice'` check in routes/channels.php. Built-in
 * types are registered in ChannelTypeServiceProvider::boot(); a future
 * runtime-installed plugin would call register() from its own provider the
 * same way.
 */
class ChannelTypeRegistry
{
    /** @var array<string, ChannelType> */
    private static array $types = [];

    public static function register(ChannelType $type): void
    {
        static::$types[$type->key()] = $type;
    }

    public static function for(string $key): ?ChannelType
    {
        return static::$types[$key] ?? null;
    }

    /** @return array<string, ChannelType> */
    public static function all(): array
    {
        return static::$types;
    }

    /** @return string[] */
    public static function registeredTypeKeys(): array
    {
        return array_keys(static::$types);
    }

    /** @return string[] */
    public static function textCapableTypeKeys(): array
    {
        return array_keys(array_filter(static::$types, fn (ChannelType $t) => $t->isTextCapable()));
    }

    /** @return string[] */
    public static function voiceCapableTypeKeys(): array
    {
        return array_keys(array_filter(static::$types, fn (ChannelType $t) => $t->isVoiceCapable()));
    }

    /** Test-only: clears the registry so a test can register a throwaway type without leaking into others. */
    public static function flush(): void
    {
        static::$types = [];
    }
}
