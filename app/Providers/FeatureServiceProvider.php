<?php

namespace App\Providers;

use App\Support\Capabilities\FeatureRegistry;
use App\Support\Capabilities\StatusFeature;
use App\Support\Capabilities\TextFeature;
use App\Support\Capabilities\VoiceFeature;
use Illuminate\Support\ServiceProvider;

/**
 * Registers every built-in capability-providing Feature against
 * FeatureRegistry. Sibling to ChannelTypeServiceProvider, which registers
 * ChannelTypes (capability *consumers*) — a Feature defines what's
 * available; a ChannelType requests some of it. A future canvas/game
 * Feature is registered here the same way. StatusFeature currently has no
 * ChannelType consumer — see its own docblock.
 */
class FeatureServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        FeatureRegistry::register(new TextFeature());
        FeatureRegistry::register(new VoiceFeature());
        FeatureRegistry::register(new StatusFeature());
    }
}
