<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f4f4f5; padding: 32px;">
    <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px;">
        <tr>
            <td>
                <h1 style="font-size: 18px; margin: 0 0 16px;">You're invited to join {{ config('app.name') }}</h1>
                <p style="font-size: 14px; color: #444; margin: 0 0 24px;">
                    {{ $inviter->display_name }} invited you to create an account on {{ config('app.name') }}.
                </p>
                <p style="margin: 0 0 24px;">
                    <a href="{{ $acceptUrl }}" style="display: inline-block; background: #5865f2; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-size: 14px;">
                        Create your account
                    </a>
                </p>
                <p style="font-size: 12px; color: #999; margin: 0;">
                    This invite expires on {{ $expiresAt->toFormattedDateString() }}.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
