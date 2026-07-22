<?php

namespace App\Support\ChannelTypes;

use App\Support\Capabilities\FeatureRegistry;

/**
 * Single source of truth for "what channel types exist and what capabilities
 * do they request" — replaces the old Channel::TEXT_CAPABLE_TYPES array
 * constant and the literal `$channel->type !== 'voice'` check in
 * routes/channels.php. Built-in types are registered in
 * ChannelTypeServiceProvider::boot(); a future runtime-installed plugin
 * would call register() from its own provider the same way.
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

    /**
     * The flat, resolved set of atomic capability keys a type grants — e.g.
     * ['text.read', 'text.send_text', ...] for a type that requested
     * ['text.all']. Empty for an unregistered type or one with no requested
     * capabilities — never throws, unlike FeatureRegistry::resolveGrants()
     * itself (a type's own capabilities() list is expected to be valid by
     * the time it's registered; see the boot-time validation test).
     *
     * @return string[]
     */
    public static function capabilitiesFor(string $typeKey): array
    {
        $type = static::for($typeKey);
        if (! $type) {
            return [];
        }

        return FeatureRegistry::resolveGrants($type->capabilities());
    }

    public static function hasCapability(string $typeKey, string $capability): bool
    {
        return in_array($capability, static::capabilitiesFor($typeKey), true);
    }

    /** Every registered type key that's been granted $capability — e.g. every type with 'text.read'. */
    public static function typeKeysWithCapability(string $capability): array
    {
        return array_keys(array_filter(
            static::$types,
            fn (ChannelType $t) => static::hasCapability($t->key(), $capability)
        ));
    }

    /** Test-only: clears the registry so a test can register a throwaway type without leaking into others. */
    public static function flush(): void
    {
        static::$types = [];
    }
}
