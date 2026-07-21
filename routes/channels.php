<?php

use App\Models\Channel;
use App\Models\Conversation;
use Illuminate\Support\Facades\Broadcast;

// Room text channel — presence channel so we get a member list for free.
Broadcast::channel('channel.{channelId}', function ($user, string $channelId) {
    $channel = Channel::find($channelId);
    if (! $channel || ! $channel->room->hasMember($user->id)) {
        return false;
    }

    return [
        'id'           => $user->id,
        'display_name' => $user->display_name,
        'avatar_url'   => $user->avatar_url,
    ];
});

// DM / group conversation — private channel.
Broadcast::channel('conversation.{conversationId}', function ($user, string $conversationId) {
    $conversation = Conversation::find($conversationId);

    return $conversation && $conversation->hasParticipant($user->id);
});

// Voice call roster + signaling for a room's voice channel. A dedicated
// presence channel rather than reusing channel.{id} — that one is the text
// channel's message-presence subscription, and coupling voice signaling onto
// it would tie two unrelated concerns to one socket subscription. SDP offer/
// answer/ICE candidates travel as Reverb client events ("whisper") over this
// same channel once joined — see resources/js/services/webrtc.ts — they never
// reach PHP, so there's no separate signal-sending route to authorize here.
Broadcast::channel('voice.channel.{channelId}', function ($user, string $channelId) {
    $channel = Channel::find($channelId);
    if (! $channel || $channel->type !== 'voice' || ! $channel->room->hasMember($user->id)) {
        return false;
    }

    return [
        'id'           => $user->id,
        'display_name' => $user->display_name,
        'avatar_url'   => $user->avatar_url,
    ];
});

// Voice call roster + signaling for a conversation's (always-available)
// voice capability — every dm/group Conversation can start a call, there's
// no separate opt-in flag.
Broadcast::channel('voice.conversation.{conversationId}', function ($user, string $conversationId) {
    $conversation = Conversation::find($conversationId);
    if (! $conversation || ! $conversation->hasParticipant($user->id)) {
        return false;
    }

    return [
        'id'           => $user->id,
        'display_name' => $user->display_name,
        'avatar_url'   => $user->avatar_url,
    ];
});

// Global presence — tracks who is online across the whole app.
Broadcast::channel('presence.global', function ($user) {
    return [
        'user_id'       => $user->id,
        'status'        => $user->status,
        'custom_status' => $user->custom_status,
    ];
});

// Per-user private channel — the foundation for anything targeted at a
// specific user rather than a room/DM scope (notifications today, more
// later). Matches the "App.Models.{Model}.{id}" naming Laravel's own
// Notifiable::receivesBroadcastNotificationsOn() defaults to.
Broadcast::channel('App.Models.User.{id}', function ($user, string $id) {
    return $user->id === $id;
});
