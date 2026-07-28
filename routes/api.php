<?php

use App\Http\Controllers\Api\ChannelController;
use App\Http\Controllers\Api\ChannelFocusController;
use App\Http\Controllers\Api\ConversationController;
use App\Http\Controllers\Api\MessageController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\NotificationPreferenceController;
use App\Http\Controllers\Api\ReactionController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\RoomInviteController;
use App\Http\Controllers\Api\RoomMemberController;
use App\Http\Controllers\Api\ThemePreferenceController;
use App\Http\Controllers\Api\UploadController;
use App\Http\Controllers\Api\UserStatusController;
use App\Http\Controllers\Api\VoiceDevicePreferenceController;
use App\Http\Controllers\Api\VoiceIceServersController;
use App\Http\Controllers\Api\VoteController;
use Illuminate\Support\Facades\Route;

// Session-authenticated API routes called from the React frontend via axios.
Route::middleware('auth')->group(function () {

    // Messages
    Route::get('/channels/{channel}/messages',  [MessageController::class, 'indexChannel']);
    Route::post('/channels/{channel}/messages', [MessageController::class, 'storeChannel']);

    // Channel focus — see App\Support\ChannelFocus
    Route::post('/channels/{channel}/focus', [ChannelFocusController::class, 'focus']);
    Route::post('/channels/{channel}/blur',  [ChannelFocusController::class, 'blur']);

    // Channel CRUD — gated by ChannelPolicy (manage_channels permission), see PermissionChecker
    Route::post('/rooms/{room}/channels',           [ChannelController::class, 'store']);
    Route::patch('/channels/{channel}',              [ChannelController::class, 'update']);
    Route::delete('/channels/{channel}',             [ChannelController::class, 'destroy']);
    Route::patch('/rooms/{room}/channels/reorder',  [ChannelController::class, 'reorder']);

    // Roles — gated by RolePolicy (manage_roles permission + hierarchy, see PermissionChecker/Role::outranks)
    Route::get('/rooms/{room}/roles',                        [RoleController::class, 'index']);
    Route::post('/rooms/{room}/roles',                       [RoleController::class, 'store']);
    Route::patch('/rooms/{room}/roles/reorder',              [RoleController::class, 'reorder']);
    Route::patch('/roles/{role}',                             [RoleController::class, 'update']);
    Route::delete('/roles/{role}',                            [RoleController::class, 'destroy']);
    Route::post('/roles/{role}/members',                      [RoleController::class, 'addMember']);
    Route::delete('/roles/{role}/members/{user}',             [RoleController::class, 'removeMember']);

    // Global/instance-wide roles — same RoleController, room-less endpoints.
    Route::get('/settings/roles',               [RoleController::class, 'indexGlobal']);
    Route::post('/settings/roles',              [RoleController::class, 'storeGlobal']);
    Route::patch('/settings/roles/reorder',     [RoleController::class, 'reorderGlobal']);

    // Room membership — kick/ban, gated by RoomMemberPolicy (see docs/roles-and-permissions.md).
    Route::delete('/rooms/{room}/members/{user}',    [RoomMemberController::class, 'destroy']);
    Route::post('/rooms/{room}/bans/{user}',         [RoomMemberController::class, 'ban']);
    Route::delete('/rooms/{room}/bans/{user}',       [RoomMemberController::class, 'unban']);

    Route::get('/conversations/{conversation}/messages',  [MessageController::class, 'indexConversation']);
    Route::post('/conversations/{conversation}/messages', [MessageController::class, 'storeConversation']);

    Route::patch('/messages/{message}',  [MessageController::class, 'update']);
    Route::delete('/messages/{message}', [MessageController::class, 'destroy']);

    // Comments — a message's own children, see docs/comments-and-voting.md.
    Route::get('/messages/{message}/comments',  [MessageController::class, 'indexComments']);
    Route::post('/messages/{message}/comments', [MessageController::class, 'storeComment']);

    // Conversations — creation is deferred to the first message send, see
    // ConversationController::store. These literal-segment routes must stay
    // registered before any future GET /conversations/{conversation} route.
    Route::get('/conversations/candidates', [ConversationController::class, 'candidates']);
    Route::get('/conversations/resolve',    [ConversationController::class, 'resolve']);
    Route::post('/conversations',           [ConversationController::class, 'store']);
    Route::post('/conversations/{conversation}/participants', [ConversationController::class, 'addParticipants']);

    // Reactions
    Route::post('/messages/{message}/reactions',           [ReactionController::class, 'store']);
    Route::delete('/messages/{message}/reactions/{emoji}', [ReactionController::class, 'destroy']);

    // Votes — see docs/comments-and-voting.md
    Route::post('/messages/{message}/votes',   [VoteController::class, 'store']);
    Route::delete('/messages/{message}/votes', [VoteController::class, 'destroy']);

    // Uploads
    Route::post('/upload', [UploadController::class, 'store']);

    // Room invites
    Route::get('/rooms/{room}/invites',  [RoomInviteController::class, 'index']);
    Route::post('/rooms/{room}/invites', [RoomInviteController::class, 'store']);
    Route::delete('/invites/{invite}',   [RoomInviteController::class, 'destroy']);

    // Notifications
    Route::get('/notifications',                [NotificationController::class, 'index']);
    Route::post('/notifications/read-all',       [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);

    // Notification preferences
    Route::get('/notification-preferences', [NotificationPreferenceController::class, 'index']);
    Route::put('/notification-preferences', [NotificationPreferenceController::class, 'update']);

    // Theme preference — Settings' Appearance panel, see App\Support\Theme\ThemeTokens
    Route::get('/theme-preference', [ThemePreferenceController::class, 'show']);
    Route::put('/theme-preference', [ThemePreferenceController::class, 'update']);

    // Voice — ICE servers (STUN/TURN) and per-(user, client) device preference
    Route::get('/voice/ice-servers',        [VoiceIceServersController::class, 'index']);
    Route::get('/voice/device-preference',  [VoiceDevicePreferenceController::class, 'index']);
    Route::put('/voice/device-preference',  [VoiceDevicePreferenceController::class, 'update']);

    // User status — quick self-service action from the UserPanel popover, see
    // App\Support\Capabilities\StatusFeature.
    Route::patch('/user-status', [UserStatusController::class, 'update']);
});
