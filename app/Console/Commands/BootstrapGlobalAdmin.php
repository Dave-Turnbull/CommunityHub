<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Console\Command;

/**
 * The one bootstrap path for the very first instance-wide Administrator —
 * avoids an env-var/first-user race. Idempotent: re-running against a user
 * who already holds the global Administrator role just assigns them again
 * (firstOrCreate), and re-running at all never creates a second global
 * Administrator role. See docs/roles-and-permissions.md.
 */
class BootstrapGlobalAdmin extends Command
{
    protected $signature = 'app:bootstrap-admin {email}';

    protected $description = 'Grant the instance-wide global Administrator role to the user with the given email';

    public function handle(): int
    {
        $user = User::where('email', $this->argument('email'))->first();

        if (! $user) {
            $this->error("No user found with email {$this->argument('email')}.");

            return self::FAILURE;
        }

        $role = Role::firstOrCreate(
            ['room_id' => null, 'is_system' => true, 'is_default' => false],
            ['name' => 'Administrator', 'position' => 100],
        );
        $role->grant(Permission::Administrator);

        RoleAssignment::firstOrCreate(['role_id' => $role->id, 'user_id' => $user->id]);

        $this->info("{$user->display_name} ({$user->email}) now holds the global Administrator role.");

        return self::SUCCESS;
    }
}
