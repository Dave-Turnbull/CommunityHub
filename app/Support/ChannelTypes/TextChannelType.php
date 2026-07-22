<?php

namespace App\Support\ChannelTypes;

class TextChannelType implements ChannelType
{
    public function key(): string { return 'text'; }
    public function label(): string { return 'Text Channels'; }
    public function icon(): string { return '#'; }
    public function order(): int { return 1; }
    public function isTextCapable(): bool { return true; }
    public function isVoiceCapable(): bool { return false; }
    public function defaultSettings(): array { return []; }
}
