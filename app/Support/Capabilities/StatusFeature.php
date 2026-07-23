<?php

namespace App\Support\Capabilities;

/**
 * Not scoped to any Channel/Conversation — there is no ChannelType consumer
 * for this Feature today (status is instance-wide/self-service, enforced
 * directly by UserStatusService, not via ChannelTypeRegistry::hasCapability).
 * Registered anyway so a future ChannelType — or a future theme/UI-surface
 * concept, once one exists — can request 'status.all' the same mechanical
 * way HybridConversationType requests 'text.all'/'voice.all'.
 */
class StatusFeature implements Feature
{
    public function key(): string { return 'status'; }

    public function capabilities(): array
    {
        return [
            'set_status' => 'Change status — online/idle/dnd/offline/custom.',
        ];
    }

    public function groups(): array { return []; }
}
