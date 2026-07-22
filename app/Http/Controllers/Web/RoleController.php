<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\Room;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class RoleController extends Controller
{
    public function index(Request $request, Room $room): Response
    {
        abort_unless($room->hasMember($request->user()->id), 403);
        Gate::authorize('create', [Role::class, $room]);

        $room->load([
            'roles.rolePermissions',
            'roles.users:id,username,display_name,avatar_url',
            'members.user:id,username,display_name,avatar_url',
        ]);

        // Per-role, not just "can manage roles in general" — hierarchy means
        // a role-management-capable user still can't touch every role, see
        // RolePolicy::manage. Drives Rooms/Roles.tsx's per-role edit/delete/
        // reorder affordances without duplicating the hierarchy check in JS.
        $room->roles->each(
            fn (Role $role) => $role->setAttribute('can_manage', Gate::allows('manage', $role))
        );

        return Inertia::render('Rooms/Roles', [
            'room' => $room,
        ]);
    }
}
