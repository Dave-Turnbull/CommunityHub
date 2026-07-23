<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Services\UserStatusService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SettingsController extends Controller
{
    public function __construct(private readonly UserStatusService $status) {}

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

        $user = $request->user();

        if (array_key_exists('status', $validated)) {
            $this->status->setStatus($user, $validated['status']);
        }

        if (array_key_exists('custom_status', $validated)) {
            $this->status->setCustomStatus($user, $validated['custom_status']);
        }

        $user->update(collect($validated)->except(['status', 'custom_status'])->all());

        return back()->with('success', 'Settings saved.');
    }
}
