<?php

namespace App\Support\Capabilities;

use InvalidArgumentException;

/**
 * Resolves a ChannelType/ConversationType's requested capability/group keys
 * (e.g. ['text.all', 'voice.join']) into the flat, fully-qualified atomic
 * capability set it's actually granted. Enforcement code (Channel::
 * hasCapability(), routes/channels.php, etc.) only ever checks membership in
 * that resolved flat set — groups/wildcards are expanded once here, never on
 * the hot path. See CLAUDE.md's "Capabilities" convention.
 */
class FeatureRegistry
{
    /** @var array<string, Feature> */
    private static array $features = [];

    public static function register(Feature $feature): void
    {
        static::$features[$feature->key()] = $feature;
    }

    public static function for(string $featureKey): ?Feature
    {
        return static::$features[$featureKey] ?? null;
    }

    /** @return array<string, Feature> */
    public static function all(): array
    {
        return static::$features;
    }

    /** Test-only: clears the registry so a test can register a throwaway Feature without leaking into others. */
    public static function flush(): void
    {
        static::$features = [];
    }

    /**
     * Every group available for $featureKey, fully-qualified — including
     * "all", always auto-derived from capabilities() rather than
     * hand-maintained, so it can't drift stale as capabilities are added.
     *
     * @return array<string, string[]>
     */
    public static function groupsFor(string $featureKey): array
    {
        $feature = static::for($featureKey);
        if (! $feature) {
            return [];
        }

        $qualify = fn (array $suffixes) => array_map(fn ($s) => "{$featureKey}.{$s}", $suffixes);

        $groups = array_map($qualify, $feature->groups());
        $groups['all'] = $qualify(array_keys($feature->capabilities()));

        return $groups;
    }

    /**
     * Expands a mix of atomic capability keys ("text.read") and group keys
     * ("text.all") into the flat, deduped, fully-qualified atomic set they
     * resolve to. Throws on any key that doesn't resolve — a typo in a
     * ChannelType's capabilities() list fails at boot, not silently later.
     *
     * @param string[] $requested
     * @return string[] atomic capability keys
     */
    public static function resolveGrants(array $requested): array
    {
        $resolved = [];

        foreach ($requested as $key) {
            $resolved = array_merge($resolved, static::expand($key));
        }

        return array_values(array_unique($resolved));
    }

    /** @return string[] */
    private static function expand(string $key): array
    {
        if (! str_contains($key, '.')) {
            throw new InvalidArgumentException("Capability key \"{$key}\" must be namespaced as \"feature.capability\".");
        }

        [$featureKey, $suffix] = explode('.', $key, 2);
        $feature = static::for($featureKey);

        if (! $feature) {
            throw new InvalidArgumentException("Unknown feature \"{$featureKey}\" in capability key \"{$key}\".");
        }

        if (array_key_exists($suffix, $feature->capabilities())) {
            return [$key];
        }

        $groups = static::groupsFor($featureKey);
        if (isset($groups[$suffix])) {
            return $groups[$suffix];
        }

        throw new InvalidArgumentException("Unknown capability or group \"{$key}\" for feature \"{$featureKey}\".");
    }
}
