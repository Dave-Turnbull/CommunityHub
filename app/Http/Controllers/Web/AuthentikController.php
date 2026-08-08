<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Web\Concerns\AcceptsPendingRoomInvite;
use App\Models\User;
use App\Services\AuthentikLoginService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Socialite\Facades\Socialite;
use Throwable;

/**
 * Optional additional login method, alongside password login — never a
 * replacement (see docs/auth-and-sso.md). Gated per-request by
 * config('services.authentik.enabled'), not at route-registration time, so
 * it can be toggled without a boot-time route-cache concern.
 *
 * redirect() deliberately never adds a `prompt=login` (or similar) override
 * — if the browser already has an active Authentik session, the redirect
 * round-trip completes with no re-prompt. That's the entire "auto sign-on"
 * requirement; it's inherent OIDC behavior, not a mechanism built here. Do
 * not "helpfully" add a forced-reauth param later without knowing that's
 * what you're trading away.
 */
class AuthentikController extends Controller
{
    use AcceptsPendingRoomInvite;

    public function redirect(): RedirectResponse
    {
        abort_unless(config('services.authentik.enabled'), 404);

        return Socialite::driver('authentik')->redirect();
    }

    public function callback(Request $request, AuthentikLoginService $service): RedirectResponse
    {
        abort_unless(config('services.authentik.enabled'), 404);

        try {
            $oauthUser = Socialite::driver('authentik')->user();
        } catch (Throwable) {
            return redirect('/login')->with('error', 'Authentik login failed. Please try again.');
        }

        if ($user = $service->findLinkedUser($oauthUser->getId())) {
            return $this->completeLogin($request, $user);
        }

        if ($existing = $service->findLinkableUser($oauthUser->getEmail())) {
            $request->session()->put('pending_oauth_identity', [
                'provider_user_id' => $oauthUser->getId(),
                'email'            => $oauthUser->getEmail(),
                'user_id'          => $existing->id,
            ]);

            return redirect('/auth/link-account');
        }

        if ($user = $service->provision($oauthUser)) {
            return $this->completeLogin($request, $user);
        }

        return redirect('/login')->with(
            'error',
            'No account found for this Authentik identity, and new sign-ups via Authentik are currently closed.'
        );
    }

    /** The manual "prove you own this account" step — see AuthentikLoginService's docblock for why linking never happens on email match alone. */
    public function showLinkAccount(Request $request): Response|RedirectResponse
    {
        $pending = $request->session()->get('pending_oauth_identity');
        if (! $pending) {
            return redirect('/login');
        }

        return Inertia::render('Auth/LinkAccount', [
            'email' => $pending['email'],
        ]);
    }

    public function linkAccount(Request $request, AuthentikLoginService $service): RedirectResponse
    {
        $pending = $request->session()->get('pending_oauth_identity');
        abort_unless($pending, 403);

        $validated = $request->validate(['password' => ['required']]);

        $user = User::find($pending['user_id']);

        if (! $user || $user->password === null || ! Hash::check($validated['password'], $user->password)) {
            return back()->withErrors(['password' => 'Incorrect password.']);
        }

        $service->link($user, $pending['provider_user_id'], $pending['email']);
        $request->session()->forget('pending_oauth_identity');

        return $this->completeLogin($request, $user);
    }

    private function completeLogin(Request $request, User $user): RedirectResponse
    {
        Auth::login($user);
        $request->session()->regenerate();

        return $this->acceptPendingInvite($request) ?? redirect()->intended('/');
    }
}
