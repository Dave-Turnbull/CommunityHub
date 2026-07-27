<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Role;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class SettingsController extends Controller
{
    public function show(Request $request): Response
    {
        return Inertia::render('Settings/Index', [
            'user' => $request->user(),
            // Drives whether the Roles tab renders at all — see
            // docs/roles-and-permissions.md's "Global (instance-wide) roles".
            'can_manage_global_roles' => Gate::allows('create', [Role::class, null]),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'display_name' => ['sometimes', 'string', 'max:32'],
            'bio'           => ['nullable', 'string', 'max:190'],
            'avatar_url'    => ['nullable', 'url'],
        ]);

        $request->user()->update($validated);

        return back()->with('success', 'Settings saved.');
    }
}
