<?php

namespace App\Support\Capabilities;

class VoiceFeature implements Feature
{
    public function key(): string { return 'voice'; }

    public function capabilities(): array
    {
        return [
            'join' => "Join this channel/conversation's voice call (roster + WebRTC signaling).",
        ];
    }

    public function groups(): array
    {
        return [];
    }
}
