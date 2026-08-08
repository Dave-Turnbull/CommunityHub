<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\InstanceSetting;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\RoomInvite;
use App\Models\User;
use App\Services\ServerInviteService;
use App\Services\UserStatusService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;

class AuthController extends Controller
{
    public function __construct(
        private readonly UserStatusService $status,
        private readonly ServerInviteService $invites,
    ) {}

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
        $this->status->setStatus(Auth::user(), 'online');

        return $this->acceptPendingInvite($request) ?? redirect()->intended('/');
    }

    /**
     * Which signup path applies, if any — mirrors register()'s own gating so
     * a stale/disabled bookmark shows a friendly state instead of a raw
     * 404/403. See App\Models\InstanceSetting/docs/conversations-and-invites.md's
     * "Server invites".
     */
    public function showRegister(Request $request): Response|RedirectResponse
    {
        $settings = InstanceSetting::current();
        $token    = $request->query('invite');

        if ($token && $settings->signup_email_invite_enabled) {
            $invite = $this->invites->validateToken($token);

            return Inertia::render('Auth/Register', [
                'invite_token' => $token,
                'invite_email' => $invite?->email,
                'invite_invalid' => $invite === null,
            ]);
        }

        if ($settings->signup_manual_enabled) {
            return Inertia::render('Auth/Register');
        }

        return redirect('/login')->with('error', 'Registration is closed on this server.');
    }

    public function register(Request $request): RedirectResponse
    {
        $settings = InstanceSetting::current();
        $token    = $request->input('invite_token');

        $invite = ($token && $settings->signup_email_invite_enabled)
            ? $this->invites->validateToken($token, $request->input('email'))
            : null;

        // Re-check server-side even though showRegister already gated the
        // GET — a POST built from a stale form or crafted directly must not
        // bypass a since-closed signup path.
        abort_unless($invite || $settings->signup_manual_enabled, 403, 'Registration is closed on this server.');

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
        ]);
        $this->status->setStatus($user, 'online');

        // Every user needs at least one (global) role — see
        // Role::seedGlobalDefaults()/docs/roles-and-permissions.md.
        RoleAssignment::firstOrCreate(['role_id' => Role::seedGlobalDefaults()->id, 'user_id' => $user->id]);

        $invite?->accept();

        if (config('verification.enabled')) {
            $user->sendEmailVerificationNotification();
        }

        Auth::login($user);
        $request->session()->regenerate();

        return $this->acceptPendingInvite($request) ?? redirect()->intended('/');
    }

    public function logout(Request $request): RedirectResponse
    {
        if ($user = $request->user()) {
            $this->status->setStatus($user, 'offline');
        }

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
