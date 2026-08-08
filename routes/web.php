<?php

use App\Http\Controllers\Web\AttachmentController;
use App\Http\Controllers\Web\AuthController;
use App\Http\Controllers\Web\ChannelController;
use App\Http\Controllers\Web\ConversationController;
use App\Http\Controllers\Web\EmailVerificationController;
use App\Http\Controllers\Web\InviteController;
use App\Http\Controllers\Web\MessageController;
use App\Http\Controllers\Web\RoomController;
use App\Http\Controllers\Web\SettingsController;
use App\Http\Middleware\EnsureEmailIsVerifiedIfRequired;
use Illuminate\Support\Facades\Route;

// ─── Guest ────────────────────────────────────────────────────────────────
Route::middleware('guest')->group(function () {
    Route::get('/login',     [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login',    [AuthController::class, 'login'])->middleware('throttle:5,1');
    Route::get('/register',  [AuthController::class, 'showRegister'])->name('register');
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:3,1');
});

// ─── Invite acceptance (guest or authenticated) ────────────────────────────
Route::get('/invite/{token}', [InviteController::class, 'show']);

// ─── Email verification (authenticated, always registered — see
// EnsureEmailIsVerifiedIfRequired for why these must not 404 regardless of
// config('verification.enabled')) ───────────────────────────────────────
Route::middleware('auth')->group(function () {
    Route::get('/email/verify', [EmailVerificationController::class, 'notice'])->name('verification.notice');
    Route::get('/email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
        ->middleware(['signed', 'throttle:6,1'])->name('verification.verify');
    Route::post('/email/resend', [EmailVerificationController::class, 'resend'])
        ->middleware('throttle:6,1')->name('verification.send');

    // An unverified user stuck on the verify-email notice must still be
    // able to log out — kept out of the 'verified'-gated group below.
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
});

// ─── Authenticated ────────────────────────────────────────────────────────
Route::middleware(['auth', EnsureEmailIsVerifiedIfRequired::class])->group(function () {
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
