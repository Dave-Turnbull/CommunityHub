<?php

namespace App\Support\ChannelTypes;

class AnnouncementChannelType implements ChannelType
{
    public function key(): string { return 'announcement'; }
    public function label(): string { return 'Announcements'; }
    public function icon(): string { return '📢'; }
    public function order(): int { return 0; }
    public function isTextCapable(): bool { return true; }
    public function isVoiceCapable(): bool { return false; }
    public function defaultSettings(): array { return []; }
}
