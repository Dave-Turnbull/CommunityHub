<?php

namespace App\Services;

use App\Models\Channel;
use App\Models\Conversation;
use App\Models\User;

/**
 * The voice Feature's backend operations — deliberately thin. Call
 * join/leave/mute/deafen orchestration stays entirely client-side (see
 * CLAUDE.md's Voice conventions: whisper signaling never reaches PHP, by
 * design, for latency). This service only covers what's genuinely
 * server-side: issuing ICE credentials and the capability/membership check a
 * client needs before attempting to join.
 *
 * canJoin()/assertCanJoin() back routes/channels.php's
 * voice.channel.{id}/voice.conversation.{id} broadcast-auth gates too — a
 * Broadcast::channel() closure can resolve this via app(VoiceSignalingService::class)
 * like anywhere else, so there's no reason for the check to be duplicated
 * inline there.
 */
class VoiceSignalingService
{
    public function iceServers(User $user): array
    {
        $host   = config('turn.public_host');
        $port   = config('turn.port');
        $secret = config('turn.secret');

        $username   = (string) (now()->addSeconds(config('turn.credential_ttl'))->timestamp).':'.$user->id;
        $credential = base64_encode(hash_hmac('sha1', $username, (string) $secret, true));

        return [
            'iceServers' => [
                ['urls' => "stun:{$host}:{$port}"],
                [
                    'urls' => [
                        "turn:{$host}:{$port}?transport=udp",
                        "turn:{$host}:{$port}?transport=tcp",
                    ],
                    'username'   => $username,
                    'credential' => $credential,
                ],
            ],
        ];
    }

    public function canJoin(User $user, Channel|Conversation $entity): bool
    {
        $isMember = $entity instanceof Channel
            ? $entity->room->hasMember($user->id)
            : $entity->hasParticipant($user->id);

        return $isMember && $entity->hasCapability('voice.join');
    }

    public function assertCanJoin(User $user, Channel|Conversation $entity): void
    {
        abort_unless($this->canJoin($user, $entity), 403);
    }
}
