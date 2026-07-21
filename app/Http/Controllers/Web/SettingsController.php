<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SettingsController extends Controller
{
    public function show(Request $request): Response
    {
        return Inertia::render('Settings/Index', [
            'user' => $request->user(),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'display_name'  => ['sometimes', 'string', 'max:32'],
            'bio'           => ['nullable', 'string', 'max:190'],
            'avatar_url'    => ['nullable', 'url'],
            'status'        => ['sometimes', 'in:online,idle,dnd,offline'],
            'custom_status' => ['nullable', 'string', 'max:128'],
        ]);

        $request->user()->update($validated);

        return back()->with('success', 'Settings saved.');
    }
}
