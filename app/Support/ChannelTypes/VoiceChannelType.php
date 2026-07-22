<?php

namespace App\Support\ChannelTypes;

class VoiceChannelType implements ChannelType
{
    public function key(): string { return 'voice'; }
    public function label(): string { return 'Voice Channels'; }
    public function icon(): string { return '🔊'; }
    public function order(): int { return 2; }
    public function capabilities(): array { return ['voice.all']; }
    public function defaultSettings(): array { return []; }
}
