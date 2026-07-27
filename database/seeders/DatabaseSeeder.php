<?php

namespace Database\Seeders;

use App\Models\Channel;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // ── Users ────────────────────────────────────────────────────────
        $dave = User::create([
            'username'     => 'dave',
            'display_name' => 'Dave',
            'email'        => 'dave@example.com',
            'password'     => Hash::make('password'),
            'status'       => 'online',
            'bio'          => 'Building cool things',
        ]);

        $bove = User::create([
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

        $authors = ['d' => $dave, 'b' => $bove, 'p' => $peve];

        $globalMember = Role::seedGlobalDefaults();
        foreach ($authors as $author) {
            RoleAssignment::firstOrCreate(['role_id' => $globalMember->id, 'user_id' => $author->id]);
        }

        // ── Room ─────────────────────────────────────────────────────────
        $room = Room::create([
            'name'        => 'Demo Room',
            'owner_id'    => $dave->id,
            'invite_code' => 'demo1234',
        ]);

        Role::seedDefaultsForRoom($room);
        $room->addMember($dave, asOwner: true);
        $room->addMember($bove);
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

        $offTopic = Channel::create([
            'room_id'   => $room->id,
            'name'      => 'off-topic',
            'type'      => 'text',
            'position'  => 2,
        ]);

        // ── Messages ─────────────────────────────────────────────────────
        // Weeks of backlog in #general, several pages deep — see
        // DemoConversationSeeder, which can also be run on its own.
        $conversation = new DemoConversationSeeder();
        $conversation->seed($general, $authors);

        $conversation->conversation($offTopic, [
            ['b', 'Anyone tried the coffee place that opened next to the office?'],
            ['p', 'Twice. The filter is great, the pastries are a scam.'],
            ['d', 'Strong endorsement of a scam, love it.'],
            ['b', 'I will take pastry-scam over the machine in the kitchen.'],
            ['p', 'That machine has produced exactly one good cup and nobody witnessed it.'],
            ['d', 'It was me. I have no proof.'],
        ]);

        $offTopic->update(['last_message_id' => $offTopic->messages()->latest()->first()?->id]);

        // ── DM between dave and bove ─────────────────────────────────────
        $dm = Conversation::create(['type' => 'dm']);

        ConversationParticipant::create(['conversation_id' => $dm->id, 'user_id' => $dave->id]);
        ConversationParticipant::create(['conversation_id' => $dm->id, 'user_id' => $bove->id]);

        $dmMsg = Message::create([
            'conversation_id' => $dm->id,
            'author_id'       => $dave->id,
            'content'         => 'Hey Bove, DMs work too!',
        ]);

        $dm->update(['last_message_id' => $dmMsg->id]);
    }
}
