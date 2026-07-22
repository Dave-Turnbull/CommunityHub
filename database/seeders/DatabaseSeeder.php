<?php

namespace Database\Seeders;

use App\Models\Channel;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\Role;
use App\Models\Room;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // ── Users ────────────────────────────────────────────────────────
        $alice = User::create([
            'username'     => 'dave',
            'display_name' => 'Dave',
            'email'        => 'dave@example.com',
            'password'     => Hash::make('password'),
            'status'       => 'online',
            'bio'          => 'Building cool things',
        ]);

        $bob = User::create([
            'username'     => 'bove',
            'display_name' => 'Bove',
            'email'        => 'bove@example.com',
            'password'     => Hash::make('password'),
            'status'       => 'idle',
        ]);

        $peve = User::create([
            'username'     => 'peve',
            'display_name' => 'Peve',
            'email'        => 'peve@example.com',
            'password'     => Hash::make('password'),
            'status'       => 'offline',
        ]);

        // ── Room ─────────────────────────────────────────────────────────
        $room = Room::create([
            'name'        => 'Demo Room',
            'owner_id'    => $alice->id,
            'invite_code' => 'demo1234',
        ]);

        Role::seedDefaultsForRoom($room);
        $room->addMember($alice, asOwner: true);
        $room->addMember($bob);
        $room->addMember($peve);

        // ── Channels ─────────────────────────────────────────────────────
        $general = Channel::create([
            'room_id'   => $room->id,
            'name'      => 'general',
            'type'      => 'text',
            'position'  => 0,
            'topic'     => 'General discussion',
        ]);

        Channel::create([
            'room_id'   => $room->id,
            'name'      => 'announcements',
            'type'      => 'announcement',
            'position'  => 1,
        ]);

        Channel::create([
            'room_id'   => $room->id,
            'name'      => 'off-topic',
            'type'      => 'text',
            'position'  => 2,
        ]);

        // ── Messages ─────────────────────────────────────────────────────
        Message::create([
            'channel_id' => $general->id,
            'author_id'  => $alice->id,
            'content'    => 'Hey everyone, welcome to the room! 👋',
        ]);

        $last = Message::create([
            'channel_id' => $general->id,
            'author_id'  => $bob->id,
            'content'    => 'Thanks Alice! Looks great so far 🎉',
        ]);

        $general->update(['last_message_id' => $last->id]);

        // ── DM between alice and bob ─────────────────────────────────────
        $dm = Conversation::create(['type' => 'dm']);

        ConversationParticipant::create(['conversation_id' => $dm->id, 'user_id' => $alice->id]);
        ConversationParticipant::create(['conversation_id' => $dm->id, 'user_id' => $bob->id]);

        $dmMsg = Message::create([
            'conversation_id' => $dm->id,
            'author_id'       => $alice->id,
            'content'         => 'Hey Bob, DMs work too!',
        ]);

        $dm->update(['last_message_id' => $dmMsg->id]);
    }
}
