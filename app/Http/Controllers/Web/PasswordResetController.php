<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class PasswordResetController extends Controller
{
    public function showForgot(): Response
    {
        return Inertia::render('Auth/ForgotPassword');
    }

    /**
     * The response never depends on whether the email matches an account or
     * the broker throttled the request, so this endpoint can't be used to
     * enumerate accounts.
     */
    public function sendLink(Request $request): RedirectResponse
    {
        $validated = $request->validate(['email' => ['required', 'email']]);

        Password::sendResetLink(['email' => $validated['email']]);

        return back()->with('success', 'If an account exists for that email, a password reset link is on its way.');
    }

    public function showReset(Request $request, string $token): Response
    {
        return Inertia::render('Auth/ResetPassword', [
            'token' => $token,
            'email' => (string) $request->query('email', ''),
        ]);
    }

    public function reset(Request $request): RedirectResponse
    {
        $request->validate([
            'token'    => ['required', 'string'],
            'email'    => ['required', 'email'],
            'password' => ['required', 'min:8', 'confirmed'],
        ]);

        $status = Password::reset(
            $request->only('token', 'email', 'password', 'password_confirmation'),
            function (User $user, string $password) {
                $user->forceFill([
                    'password'       => $password,
                    'remember_token' => Str::random(60),
                ])->save();

                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            return back()->withErrors(['email' => 'This password reset link is invalid or has expired.'])
                ->onlyInput('email');
        }

        return redirect('/login')->with('success', 'Your password has been reset. You can log in with it now.');
    }
}
