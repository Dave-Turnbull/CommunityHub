<?php

namespace App\Services;

use App\Models\InstanceSetting;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\User;
use App\Models\UserOAuthIdentity;
use Illuminate\Support\Str;
use Laravel\Socialite\Contracts\User as SocialiteUser;

/**
 * Authentik/OAuth account resolution — see docs/auth-and-sso.md.
 *
 * Deliberately does NOT auto-link an incoming OAuth identity to an existing
 * password account just because the emails match (AuthentikController's
 * "link required" path requires the existing account's actual password
 * instead) — trusting an IdP-asserted email alone would let anyone able to
 * get an arbitrary "email" claim through a misconfigured or compromised IdP
 * hijack an existing local account with no further proof.
 */
class AuthentikLoginService
{
    public function findLinkedUser(string $providerUserId): ?User
    {
        return UserOAuthIdentity::where('provider', 'authentik')
            ->where('provider_user_id', $providerUserId)
            ->first()?->user;
    }

    /** An existing password account with this email — a candidate for the manual link-by-password flow. */
    public function findLinkableUser(?string $email): ?User
    {
        return $email ? User::where('email', $email)->first() : null;
    }

    public function link(User $user, string $providerUserId, ?string $email): void
    {
        UserOAuthIdentity::create([
            'user_id'          => $user->id,
            'provider'         => 'authentik',
            'provider_user_id' => $providerUserId,
            'email'            => $email,
        ]);
    }

    /**
     * Provisions a brand-new account for an OAuth identity with no existing
     * match, or returns null if the 'oauth' signup path (see
     * App\Models\InstanceSetting) is currently closed.
     */
    public function provision(SocialiteUser $oauthUser): ?User
    {
        if (! InstanceSetting::current()->signup_oauth_enabled) {
            return null;
        }

        $email = $oauthUser->getEmail();
        abort_if(! $email, 422, 'Authentik did not provide an email address for this account.');

        $user = User::create([
            'username'     => $this->generateUsername($oauthUser->getNickname() ?: Str::before($email, '@')),
            'display_name' => $oauthUser->getName() ?: $email,
            'email'        => $email,
            'password'     => null,
        ]);

        // Every user needs at least one (global) role — see
        // Role::seedGlobalDefaults()/docs/roles-and-permissions.md.
        RoleAssignment::firstOrCreate(['role_id' => Role::seedGlobalDefaults()->id, 'user_id' => $user->id]);

        $this->link($user, $oauthUser->getId(), $email);

        return $user;
    }

    private function generateUsername(string $preferred): string
    {
        $base = (string) Str::of($preferred)->lower()->replaceMatches('/[^a-z0-9_.]/', '')->substr(0, 24);
        $base = $base === '' ? 'user' : $base;

        $username = $base;
        for ($suffix = 1; User::where('username', $username)->exists(); $suffix++) {
            $username = "{$base}{$suffix}";
        }

        return $username;
    }
}
