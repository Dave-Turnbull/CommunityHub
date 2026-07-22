<?php

namespace App\Providers;

use App\Support\ChannelTypes\AnnouncementChannelType;
use App\Support\ChannelTypes\ChannelTypeRegistry;
use App\Support\ChannelTypes\HybridConversationType;
use App\Support\ChannelTypes\TextChannelType;
use App\Support\ChannelTypes\VoiceChannelType;
use Illuminate\Support\ServiceProvider;

/**
 * Registers every built-in channel type against ChannelTypeRegistry. A
 * dedicated provider (rather than folding this into AppServiceProvider::boot)
 * deliberately establishes the pattern a future runtime-installed
 * channel-type plugin would imitate to register its own type from its own
 * provider — see app/Support/ChannelTypes/ChannelType.php.
 */
class ChannelTypeServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        ChannelTypeRegistry::register(new TextChannelType());
        ChannelTypeRegistry::register(new VoiceChannelType());
        ChannelTypeRegistry::register(new AnnouncementChannelType());
        ChannelTypeRegistry::register(new HybridConversationType());
    }
}
