<?php

use App\Http\Controllers\Api\ChannelFocusController;
use App\Http\Controllers\Api\ConversationController;
use App\Http\Controllers\Api\MessageController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\NotificationPreferenceController;
use App\Http\Controllers\Api\ReactionController;
use App\Http\Controllers\Api\RoomInviteController;
use App\Http\Controllers\Api\UploadController;
use App\Http\Controllers\Api\VoiceDevicePreferenceController;
use App\Http\Controllers\Api\VoiceIceServersController;
use Illuminate\Support\Facades\Route;

// Session-authenticated API routes called from the React frontend via axios.
Route::middleware('auth')->group(function () {

    // Messages
    Route::get('/channels/{channel}/messages',  [MessageController::class, 'indexChannel']);
    Route::post('/channels/{channel}/messages', [MessageController::class, 'storeChannel']);

    // Channel focus — see App\Support\ChannelFocus
    Route::post('/channels/{channel}/focus', [ChannelFocusController::class, 'focus']);
    Route::post('/channels/{channel}/blur',  [ChannelFocusController::class, 'blur']);

    Route::get('/conversations/{conversation}/messages',  [MessageController::class, 'indexConversation']);
    Route::post('/conversations/{conversation}/messages', [MessageController::class, 'storeConversation']);

    Route::patch('/messages/{message}',  [MessageController::class, 'update']);
    Route::delete('/messages/{message}', [MessageController::class, 'destroy']);

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

    // Voice — ICE servers (STUN/TURN) and per-(user, client) device preference
    Route::get('/voice/ice-servers',        [VoiceIceServersController::class, 'index']);
    Route::get('/voice/device-preference',  [VoiceDevicePreferenceController::class, 'index']);
    Route::put('/voice/device-preference',  [VoiceDevicePreferenceController::class, 'update']);
});
