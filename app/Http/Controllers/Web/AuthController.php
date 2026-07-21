<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\RoomInvite;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;

class AuthController extends Controller
{
    public function showLogin(): Response
    {
        return Inertia::render('Auth/Login');
    }

    public function login(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'login'    => ['required', 'string'],
            'password' => ['required'],
        ]);

        // Usernames never contain '@' (see the registration regex below), so
        // the presence of one unambiguously means the input is an email.
        $field = str_contains($validated['login'], '@') ? 'email' : 'username';

        if (! Auth::attempt([$field => $validated['login'], 'password' => $validated['password']], $request->boolean('remember'))) {
            return back()->withErrors([
                'login' => 'These credentials do not match our records.',
            ])->onlyInput('login');
        }

        $request->session()->regenerate();
        Auth::user()->update(['status' => 'online']);

        return $this->acceptPendingInvite($request) ?? redirect()->intended('/');
    }

    public function showRegister(): Response
    {
        return Inertia::render('Auth/Register');
    }

    public function register(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'username'     => ['required', 'string', 'max:32', 'unique:users', 'regex:/^[a-z0-9_.]+$/'],
            'display_name' => ['required', 'string', 'max:32'],
            'email'        => ['required', 'email', 'unique:users'],
            'password'     => ['required', 'min:8', 'confirmed'],
        ]);

        $user = User::create([
            'username'     => $validated['username'],
            'display_name' => $validated['display_name'],
            'email'        => $validated['email'],
            'password'     => Hash::make($validated['password']),
            'status'       => 'online',
        ]);

        Auth::login($user);
        $request->session()->regenerate();

        return $this->acceptPendingInvite($request) ?? redirect()->intended('/');
    }

    public function logout(Request $request): RedirectResponse
    {
        $request->user()?->update(['status' => 'offline']);

        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/login');
    }

    /** Joins the room behind a pending invite (see InviteController) right after auth completes. */
    private function acceptPendingInvite(Request $request): ?RedirectResponse
    {
        $token = $request->session()->pull('pending_invite_token');
        if (! $token) {
            return null;
        }

        $invite = RoomInvite::where('token', $token)->first();
        if (! $invite || $invite->isExpired() || $invite->isAccepted()) {
            return null;
        }

        $room  = $invite->accept($request->user());
        $first = $room->channels()->where('type', 'text')->first();

        return redirect($first ? "/channels/{$first->id}" : '/');
    }
}
