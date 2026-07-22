<?php

namespace App\Support\Capabilities;

class TextFeature implements Feature
{
    public function key(): string { return 'text'; }

    public function capabilities(): array
    {
        return [
            'read'        => "List and receive this channel/conversation's message history.",
            'send_text'   => 'Send plain-text messages.',
            'send_images' => 'Attach images to a sent message.',
            'send_video'  => 'Attach video to a sent message.',
        ];
    }

    public function groups(): array
    {
        return [
            // Everything send-related, without read — useful for a
            // write-only or moderation-composed channel type later.
            'send_all' => ['send_text', 'send_images', 'send_video'],
        ];
    }
}
