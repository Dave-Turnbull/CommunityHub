<?php

namespace App\Support\ChannelTypes;

class VoiceChannelType implements ChannelType
{
    public function key(): string { return 'voice'; }
    public function label(): string { return 'Voice Channels'; }
    public function icon(): string { return '🔊'; }
    public function order(): int { return 2; }
    public function isTextCapable(): bool { return false; }
    public function isVoiceCapable(): bool { return true; }
    public function defaultSettings(): array { return []; }
}
