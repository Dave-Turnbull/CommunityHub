<?php

use App\Http\Controllers\Web\AttachmentController;
use App\Http\Controllers\Web\AuthController;
use App\Http\Controllers\Web\ChannelController;
use App\Http\Controllers\Web\ConversationController;
use App\Http\Controllers\Web\InviteController;
use App\Http\Controllers\Web\MessageController;
use App\Http\Controllers\Web\RoomController;
use App\Http\Controllers\Web\SettingsController;
use Illuminate\Support\Facades\Route;

// ─── Guest ────────────────────────────────────────────────────────────────
Route::middleware('guest')->group(function () {
    Route::get('/login',     [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login',    [AuthController::class, 'login']);
    Route::get('/register',  [AuthController::class, 'showRegister'])->name('register');
    Route::post('/register', [AuthController::class, 'register']);
});

// ─── Invite acceptance (guest or authenticated) ────────────────────────────
Route::get('/invite/{token}', [InviteController::class, 'show']);

// ─── Authenticated ────────────────────────────────────────────────────────
Route::middleware('auth')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

    Route::get('/', [ConversationController::class, 'index'])->name('home');

    Route::get('/rooms/create', [RoomController::class, 'create']);
    Route::post('/rooms',       [RoomController::class, 'store']);
    Route::get('/rooms/{room}', [RoomController::class, 'show']);
    Route::get('/join/{code}', [RoomController::class, 'join']);

    Route::get('/channels/{channel}',           [ChannelController::class, 'show']);
    Route::get('/conversations/{conversation}', [ConversationController::class, 'show']);
    Route::get('/messages/{message}',           [MessageController::class, 'show']);
    Route::get('/attachments/{attachment}',     [AttachmentController::class, 'show'])->name('attachments.show');

    Route::get('/settings',   [SettingsController::class, 'show']);
    Route::patch('/settings', [SettingsController::class, 'update']);
});
