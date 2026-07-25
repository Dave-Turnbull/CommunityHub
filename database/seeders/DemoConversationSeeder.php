<?php

namespace Database\Seeders;

use App\Models\Channel;
use App\Models\Message;
use App\Models\Reaction;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * A multi-week backlog for one text channel — several pages past
 * TextMessageService::PAGE_SIZE, so the windowed pagination described in
 * docs/messages-and-pagination.md has real history to page through, with day
 * dividers, replies and reactions spread through it rather than only at the tail.
 *
 * Separate from DatabaseSeeder (which calls it) so it can also be pointed at an
 * already-seeded database without recreating users or rooms:
 *
 *   php artisan db:seed --class=DemoConversationSeeder --force
 */
class DemoConversationSeeder extends Seeder
{
    /** @var array<string, User> */
    private array $authors = [];

    private Carbon $clock;

    private ?Message $previous = null;

    private ?Message $last = null;

    /** Standalone entry point — resolves the demo room's #general and its three users. */
    public function run(): void
    {
        $channel = Channel::whereHas('room', fn ($q) => $q->where('name', 'Demo Room'))
            ->where('name', 'general')
            ->firstOrFail();

        $this->seed($channel, [
            'd' => User::where('username', 'dave')->firstOrFail(),
            'b' => User::where('username', 'bove')->firstOrFail(),
            'p' => User::where('username', 'peve')->firstOrFail(),
        ]);
    }

    /** @param array<string, User> $authors keyed 'd'/'b'/'p', matching TOPICS */
    public function seed(Channel $channel, array $authors): void
    {
        $this->authors = $authors;
        $this->clock = now()->subDays(count(self::TOPICS))->setTime(9, 12);

        $this->say($channel, 'd', 'Hey everyone, welcome to the room! 👋');
        $this->say($channel, 'b', 'Thanks Dave! Looks great so far 🎉');
        $this->say($channel, 'p', 'Happy to be here. Where do we keep the deploy notes?');
        $this->say($channel, 'd', 'Pinned in #announcements — I will move them somewhere saner eventually.');

        foreach (self::TOPICS as $day => $topic) {
            $this->clock = now()->subDays(count(self::TOPICS) - $day)->setTime(9, 3);

            $this->standup($channel, $day + 1);
            $this->conversation($channel, $topic);
            $this->signOff($channel, $day);
        }

        $channel->update(['last_message_id' => $this->last?->id]);
    }

    /** @param list<array{0: string, 1: string}> $lines */
    public function conversation(Channel $channel, array $lines): void
    {
        // Reply targets never span blocks (and so never span channels).
        $this->previous = null;

        foreach ($lines as $i => [$who, $what]) {
            // Every few lines, answer someone directly, so replyTo hydration is
            // exercised deep in history and not only at the tail.
            $this->say($channel, $who, $what, $i % 7 === 3 ? $this->previous : null);
        }
    }

    private function standup(Channel $channel, int $day): void
    {
        $this->say($channel, 'd', "Standup thread for day {$day}. Keep it short, I have not had coffee.");
        $this->say($channel, 'b', 'Yesterday: finished the cursor pagination spike. Today: wiring it to the store. Blockers: none.');
        $this->say($channel, 'p', 'Yesterday: chased a flaky test. Today: same test, more anger. Blockers: the test.');
    }

    private function signOff(Channel $channel, int $day): void
    {
        $lines = [
            ['d', 'Alright, calling it. Ship it tomorrow.'],
            ['b', 'Logging off — back on in the morning.'],
            ['p', 'Same. Leaving the branch pushed but not merged.'],
            ['d', 'Merging it myself then. Bold of you to push and run.'],
        ];

        [$who, $what] = $lines[$day % count($lines)];
        $this->say($channel, $who, $what);
    }

    private function say(Channel $channel, string $who, string $content, ?Message $replyTo = null): void
    {
        $this->clock = $this->clock->copy()->addSeconds(random_int(40, 900));

        $message = new Message([
            'channel_id'  => $channel->id,
            'author_id'   => $this->authors[$who]->id,
            'content'     => $content,
            'reply_to_id' => $replyTo?->id,
        ]);

        // forceFill, not create(...) — created_at is not fillable, and these
        // timestamps are the whole point: they spread the backlog over weeks.
        $message->forceFill(['created_at' => $this->clock, 'updated_at' => $this->clock])->save();

        $this->previous = $this->last;
        $this->last = $message;

        if (str_contains(strtolower($content), 'ship')) {
            $this->react($message, ['🎉', '🚀']);
        }
    }

    /** @param list<string> $emojis */
    private function react(Message $message, array $emojis): void
    {
        $keys = array_keys($this->authors);

        foreach ($emojis as $i => $emoji) {
            Reaction::create([
                'message_id' => $message->id,
                'user_id'    => $this->authors[$keys[$i % count($keys)]]->id,
                'emoji'      => $emoji,
            ]);
        }
    }

    /**
     * One block per day, oldest first — each a self-contained thread so
     * scrolling back through history reads like a real backlog rather than a
     * repeated filler line.
     *
     * @var list<list<array{0: string, 1: string}>>
     */
    private const TOPICS = [
        [
            ['b', 'Question about the room model — is a channel ever allowed to move between rooms?'],
            ['d', 'No. A channel belongs to exactly one room for its whole life.'],
            ['b', 'Good, that kills a whole class of migration I was dreading.'],
            ['p', 'Do we enforce that anywhere or is it convention?'],
            ['d', 'Foreign key plus nothing in the API that lets you change room_id.'],
            ['p', 'Convention with a seatbelt then.'],
            ['b', 'I will take it. Writing the test anyway.'],
            ['d', 'Please do, that is exactly the kind of thing that silently regresses.'],
            ['p', 'Adding it to the channels feature folder.'],
            ['b', 'While I am in there — the position column is per room or per room and type?'],
            ['d', 'Per room. Types are a display concern, ordering is not.'],
            ['b', 'Then the reorder endpoint needs to accept a full ordered list, not deltas.'],
            ['d', 'It already does. Send every id in the new order.'],
            ['p', 'That is much easier to reason about than index swaps.'],
            ['b', 'Agreed, and it makes drag and drop trivial on the frontend.'],
        ],
        [
            ['p', 'The flaky test is not flaky. It is a cache key leaking between tests.'],
            ['d', 'Which cache?'],
            ['p', 'Channel focus. It is not backed by the database so nothing resets it.'],
            ['b', 'Ah, so RefreshDatabase gives you nothing there.'],
            ['p', 'Right. Flushing the cache in setUp fixes it every single run.'],
            ['d', 'Put that in the docs before anyone else loses a day to it.'],
            ['p', 'Already writing it up.'],
            ['b', 'How did it pass at all before?'],
            ['p', 'Test order. Run alone it passed, run after the notifications suite it did not.'],
            ['d', 'The worst kind of green.'],
            ['b', 'Is there anything else in the app that keeps state outside the database?'],
            ['p', 'Presence, but that lives on the socket, not in a cache we own.'],
            ['d', 'And the theme, but that is per user in a real table.'],
            ['p', 'Then focus was the only one. Good.'],
        ],
        [
            ['d', 'Reactions feel slow. Clicking an emoji takes a visible beat before it appears.'],
            ['b', 'Because we wait for the round trip and then the broadcast.'],
            ['p', 'So the fastest possible reaction is one full request plus one socket hop.'],
            ['d', 'Which on a bad connection is very obviously bad.'],
            ['b', 'We should apply it locally first and reconcile with whatever the server returns.'],
            ['p', 'And roll back if the request fails.'],
            ['d', 'Yes. The server response is already the authoritative summary, we just throw it away today.'],
            ['b', 'That is an easy win then. Same for editing.'],
            ['p', 'Editing is worse actually, the textarea stays open until the response lands.'],
            ['d', 'Close it immediately, show the new content, put it back if the save fails.'],
            ['b', 'What about delete?'],
            ['d', 'Same shape. Remove it, restore it in place if the server says no.'],
            ['p', 'Restore in place meaning we cannot just append it back at the end.'],
            ['b', 'Right, it has to go back where it was.'],
            ['d', 'Then the store needs an ordered insert, not just an append.'],
        ],
        [
            ['b', 'How far back should the client keep messages in memory?'],
            ['p', 'Every message we have ever loaded, currently.'],
            ['d', 'Which is fine for a new channel and terrible for this one.'],
            ['b', 'This channel is going to be the test case, is it.'],
            ['d', 'It already is. Scroll to the top and watch the tab get heavy.'],
            ['p', 'A window would fix it. Keep a few pages, drop the rest.'],
            ['b', 'Drop from which end?'],
            ['p', 'Whichever end you are scrolling away from.'],
            ['d', 'And remember that you dropped it, so you can fetch it again.'],
            ['b', 'That is the part people get wrong. A dropped page is not the same as no page.'],
            ['p', 'Needs a real flag, not an inference from the array length.'],
            ['d', 'Agreed. Explicit state, both directions.'],
            ['b', 'How many pages in the window?'],
            ['d', 'Three feels right. Enough that normal scrolling never trims.'],
            ['p', 'And trimming only bites when someone is genuinely reading history.'],
        ],
        [
            ['p', 'If the window can drop newer messages, what happens to a live message that arrives?'],
            ['d', 'It cannot be appended. There is a hole between the window and the tail.'],
            ['b', 'So we ignore it while detached?'],
            ['d', 'Ignore it in the window, yes. The next forward fetch picks it up.'],
            ['p', 'That is the only version that cannot produce a gap.'],
            ['b', 'And the user needs to know they are not looking at the present.'],
            ['d', 'A jump to present button. Only while detached.'],
            ['p', 'Where does it go?'],
            ['d', 'In line with the compose box, on the left. Out of the way but hard to miss.'],
            ['b', 'What does it actually do — scroll, or refetch?'],
            ['d', 'Refetch the tail and replace the window. Scrolling alone would not fill the hole.'],
            ['p', 'And then it scrolls to the bottom because the tail is what you asked for.'],
            ['b', 'What if you send a message while detached?'],
            ['d', 'Then you obviously want to be at the present. Jump automatically.'],
            ['p', 'Otherwise your own message disappears into the hole. Nice catch.'],
        ],
        [
            ['d', 'The messages endpoint only walks backwards. We need forwards too.'],
            ['b', 'Same cursor style, opposite direction?'],
            ['d', 'Yes. One parameter for older, one for newer, and never both at once.'],
            ['p', 'Reject the combination outright rather than picking a winner.'],
            ['b', 'And the response needs to say whether there is more on both sides.'],
            ['d', 'Which means the current has_more name stops meaning anything.'],
            ['p', 'Rename it. A field called has_more next to a field called has_newer is a trap.'],
            ['b', 'has_older and has_newer, with a cursor each.'],
            ['d', 'Do the rename in one pass so nothing is left reading the old name.'],
            ['p', 'The Inertia page props use the same shape, do not forget those.'],
            ['b', 'They build it by hand today, which is its own problem.'],
            ['d', 'Have them call the service like everything else does.'],
            ['p', 'Then the first page a browser renders and the pages it fetches are literally the same code.'],
            ['b', 'That is worth doing on its own, forget the rename.'],
        ],
        [
            ['b', 'Scroll anchoring question. When we prepend a page, where should the viewport stay?'],
            ['p', 'On whatever the user was reading. Obviously.'],
            ['b', 'Right, but how do you express that in code.'],
            ['d', 'Not with scrollTop arithmetic, that breaks the moment you also trim.'],
            ['p', 'Anchor to an element instead?'],
            ['d', 'Pick a message near the top of the viewport, remember its offset, restore it after the DOM settles.'],
            ['b', 'That works for prepend, append, and trim without special cases.'],
            ['p', 'Which is the whole reason to do it that way.'],
            ['d', 'Needs the message id on the DOM node so you can find it again.'],
            ['b', 'A data attribute is fine.'],
            ['p', 'What about the pin to bottom behaviour, does that fight this?'],
            ['d', 'Only if both run on the same render. Order them and let the anchor win.'],
            ['b', 'And do not pin at all while detached from the tail.'],
            ['p', 'Because pinning to the bottom of a window that is not the present is meaningless.'],
            ['d', 'Exactly.'],
        ],
        [
            ['p', 'Do we cache pages we have already fetched?'],
            ['b', 'No. Scroll up, scroll down, scroll up again, three requests for the same fifty messages.'],
            ['d', 'That is worth fixing while the pagination is already open.'],
            ['p', 'In memory, or something persistent?'],
            ['d', 'In memory now. Structure it so persistent is a driver swap later.'],
            ['b', 'Because of the native shell?'],
            ['d', 'Yes, that lands on real SQLite eventually and I do not want to rewrite the callers.'],
            ['p', 'Then the interface has to be async from day one.'],
            ['b', 'Even for the memory driver, which does not need to be.'],
            ['d', 'Especially for the memory driver. It is the one that would tempt you into a sync signature.'],
            ['p', 'What is the unit of storage, a page?'],
            ['d', 'A contiguous run per scope. Pages are a fetch detail, contiguity is what correctness depends on.'],
            ['b', 'And if the run is not contiguous you cannot serve from it at all.'],
            ['p', 'Then the rule is simple. Extend the run or go to the network.'],
        ],
        [
            ['d', 'Careful with the cache and edits. A message edited while it sits outside the window goes stale.'],
            ['b', 'So every mutation has to touch the cache as well as the store.'],
            ['p', 'That is a lot of call sites.'],
            ['d', 'It is four. The live socket handlers and the optimistic actions.'],
            ['b', 'Both of which are already centralised, thankfully.'],
            ['p', 'Deletes too, presumably.'],
            ['d', 'Deletes drop from the run. Reactions patch in place.'],
            ['b', 'What about a brand new message while the window is detached?'],
            ['d', 'The run can still take it if the run reaches the present.'],
            ['p', 'Which it usually does, since the run is bigger than the window.'],
            ['b', 'And if the run does not reach the present we leave it alone.'],
            ['d', 'Right, otherwise you cache a gap and serve it later. Worst possible bug.'],
            ['p', 'Silent, too. Nothing would fail, you would just lose messages.'],
        ],
        [
            ['b', 'Unrelated: the sensitivity slider complaint came back.'],
            ['p', 'I thought that was the peak hold fix.'],
            ['b', 'Partly. The rest is that the threshold was read once at join time.'],
            ['d', 'So changing it mid call did nothing at all.'],
            ['b', 'Correct, and the settings panel happily showed the new value.'],
            ['p', 'That explains why two rounds of audio maths did not help.'],
            ['d', 'Anything captured at connection time needs a getter, not a value.'],
            ['b', 'It reads a live store now, every tick.'],
            ['p', 'And the test panel gates its own playback on the same threshold?'],
            ['b', 'It does now. Before, the marker line was decoration.'],
            ['d', 'Which made testing the feature look broken independently of the feature being broken.'],
            ['p', 'Two bugs wearing one coat.'],
        ],
        [
            ['p', 'Do we want message search before or after threads?'],
            ['d', 'After. Search across a windowed list is a different problem again.'],
            ['b', 'Because the result is not in memory and probably not in the window.'],
            ['d', 'Exactly, you need to jump to an arbitrary message and page both ways from it.'],
            ['p', 'Which the endpoint can almost do already.'],
            ['b', 'Almost. It needs an around cursor, not just before and after.'],
            ['d', 'That is a small addition once the two directions exist.'],
            ['p', 'Then let us not build it speculatively.'],
            ['b', 'Agreed, but let us not design it out either.'],
            ['d', 'The window state does not care how it was filled, so we are fine.'],
            ['p', 'Good. Threads first then.'],
        ],
        [
            ['d', 'Who owns the empty state copy? Some of it is quite bleak.'],
            ['b', 'Bleak how?'],
            ['d', 'This is the beginning of your conversation. Very final.'],
            ['p', 'It is accurate.'],
            ['d', 'Accurate and bleak are compatible, that is my point.'],
            ['b', 'I will take a pass over all of them at some point.'],
            ['p', 'Add the voice channel one, it currently says nothing at all.'],
            ['b', 'An empty pane is a choice.'],
            ['d', 'It is the absence of a choice, which is different.'],
            ['p', 'Put a join button in it and the copy problem goes away.'],
            ['b', 'Now that is a good idea.'],
        ],
        [
            ['b', 'Reminder that the worker holds env at process start.'],
            ['p', 'Which bit me last week, yes.'],
            ['b', 'Anyone touching mail or broadcast config has to restart it.'],
            ['d', 'The failure mode is the annoying part. The request succeeds and the job dies quietly.'],
            ['p', 'Into failed_jobs, where nobody looks.'],
            ['b', 'I look there first now, out of pure trauma.'],
            ['d', 'That is the correct instinct for anything real time that stopped working.'],
            ['p', 'Check the queue before you read a single line of application code.'],
            ['b', 'Saved me twice already.'],
        ],
        [
            ['d', 'Last thing before the weekend — demo data.'],
            ['b', 'The two message seed is not going to prove anything about pagination.'],
            ['p', 'We need several pages worth, ideally reading like an actual conversation.'],
            ['d', 'Spread it over a couple of weeks so the day dividers show up too.'],
            ['b', 'And some replies and reactions in the middle of history, not only at the end.'],
            ['p', 'Otherwise the hydration path for older pages never gets exercised by hand.'],
            ['d', 'Right. Seed it properly once and we can stop faking it in the browser.'],
            ['b', 'On it.'],
            ['p', 'I will take the pagination tests.'],
            ['d', 'Then we should actually be able to ship this.'],
        ],
    ];
}
