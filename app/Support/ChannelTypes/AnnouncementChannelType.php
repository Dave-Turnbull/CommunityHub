<?php

namespace App\Support\ChannelTypes;

class AnnouncementChannelType implements ChannelType
{
    public function key(): string { return 'announcement'; }
    public function label(): string { return 'Announcements'; }
    public function icon(): string { return '📢'; }
    public function order(): int { return 0; }
    public function capabilities(): array { return ['text.all']; }
    public function defaultSettings(): array { return []; }
    public function category(): string { return 'mod'; }
    public function description(): string { return 'Post updates that only moderators can send.'; }
}
