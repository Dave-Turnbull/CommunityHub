# Build a channel type

[← All docs](README.md) · See also:
[capabilities-and-channel-types.md](capabilities-and-channel-types.md) ·
[architecture-vision.md](architecture-vision.md) · [service-layer.md](service-layer.md)

A step-by-step walkthrough of adding a new channel type by composing capabilities
that already exist — the cheapest, most common kind of extension (case 2 in
[capabilities-and-channel-types.md](capabilities-and-channel-types.md)'s
"Extending this system"). It assumes the stack is running
([quickstart.md](quickstart.md)) and takes roughly an hour including tests.

The worked example is a **Gallery channel**: members can post images, and only
images — no text messages, no video. The point being taught is that this needs
**zero new enforcement code**: `TextMessageService` already checks
`text.send_text` for message content and `text.send_images` per image attachment
(see [service-layer.md](service-layer.md)), so a type granted only
`['text.read', 'text.send_images']` gets exactly this behavior for free.

> The gallery type is **illustrative — the repo does not ship it**. Built-in
> types are deliberately curated (see
> [architecture-vision.md](architecture-vision.md)); this doc exists to teach the
> mechanism, not to argue every composition should become a built-in.

## 1. Backend: the ChannelType class

`app/Support/ChannelTypes/GalleryChannelType.php` — eight methods, pure data,
mirroring `TextChannelType`:

```php
<?php

namespace App\Support\ChannelTypes;

class GalleryChannelType implements ChannelType
{
    public function key(): string { return 'gallery'; }
    public function label(): string { return 'Gallery Channels'; }
    public function icon(): string { return '🖼'; }
    public function order(): int { return 4; }
    public function capabilities(): array { return ['text.read', 'text.send_images']; }
    public function defaultSettings(): array { return []; }
    public function category(): string { return 'standard'; }
    public function description(): string { return 'Share and browse images.'; }
}
```

- `key()` is the value stored in `channels.type` — a free string, no DB enum to
  update, effectively permanent once channels of this type exist.
- `capabilities()` lists atomic capability keys and/or group keys; here two
  atomic keys from the text Feature. There is no default — an empty array grants
  nothing, not even reading.
- `defaultSettings()` seeds `channels.settings` at creation — the seam for
  type-specific **parameters** (see
  [architecture-vision.md](architecture-vision.md)'s grants-vs-parameters
  principle). `[]` when the type has none.
- `category()` — `'standard'` here (Gallery is illustrative, not moderator-only).
  `'mod'` requires `Permission::ManageModChannels` to create — see
  [roles-and-permissions.md](roles-and-permissions.md)'s "Channel creation is
  category-gated".
- `description()` — short help text shown next to this type in
  `CreateChannelModal`.

Register it in `app/Providers/ChannelTypeServiceProvider::boot()`:

```php
ChannelTypeRegistry::register(new GalleryChannelType());
```

That's the entire backend. `Channel::hasCapability()` now resolves for
`'gallery'` channels through `FeatureRegistry` automatically; `POST
/api/rooms/{room}/channels` accepts `type: gallery` because
`Api\ChannelController` validates against `registeredTypeKeys()`; the room
show/join/invite redirects treat it as text-capable because they ask
`typeKeysWithCapability('text.read')` rather than matching literal type strings.

## 2. Backend: the Feature test

`tests/Feature/Channels/` — prove the composition does what you claimed, through
the real HTTP kernel. The assertions mirror
`tests/Feature/Channels/CapabilityEnforcementTest.php`, which is also where to
look for the throwaway-anonymous-class pattern used to test capability
combinations *without* shipping a registered type.

```php
public function test_a_gallery_channel_accepts_images_but_rejects_text(): void
{
    $room    = Room::factory()->create();
    $channel = Channel::factory()->for($room)->create(['type' => 'gallery']);
    $user    = $this->member($room);

    // Plain text content → 403 (no text.send_text grant).
    $this->actingAs($user)
        ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'hello'])
        ->assertStatus(403);

    // An image attachment → accepted (text.send_images granted).
    $attachment = Attachment::factory()->create(['mime_type' => 'image/png', 'message_id' => null]);

    $this->actingAs($user)
        ->postJson("/api/channels/{$channel->id}/messages", ['attachment_ids' => [$attachment->id]])
        ->assertCreated();
}
```

Why 403 and not 422: the channel *is* text-capable (`text.read`), so the request
gets past the "no text chat here" gate; it's the specific `text.send_text` grant
that's missing. `TextMessageService::authorizeSend()` checks each piece of the
payload against the specific capability it needs.

## 3. Frontend: the registry entry

Add a descriptor to `REGISTRY` in `resources/js/services/channelTypes.tsx`:

```tsx
gallery: {
    key: 'gallery',
    label: 'Gallery Channels',
    icon: '🖼',
    order: 4,
    category: 'standard',
    description: 'Share and browse images.',
    capabilities: ['text.read', 'text.send_images'],
    isTextCapable: true,
    Content: GalleryChannelTypeContent,
},
```

- `capabilities` hand-mirrors the backend registration (informational today —
  the backend is the enforcement boundary).
- `isTextCapable: true` because the type grants `text.read` — this is what lets
  `useChannelFocus`/`useChat` run on its pages.
- `Content` replaces the channel's entire main pane. The cheapest correct
  version is an adapter around `TextChannelContent`, exactly like the existing
  `TextChannelTypeContent` in the same file — pass a gallery-appropriate
  `placeholder`/`emptyState` and you have a working image feed, since
  `TextChannelContent` owns its own `useChat()` and doesn't care what type
  mounted it. A later iteration could render a real masonry grid instead;
  that's a presentation decision, invisible to the backend.
- Omitting `Content` entirely is valid: the channel renders an explicit
  "no features enabled" empty state (there is deliberately no default UI).
  Omitting `SidebarItem` gives a plain sidebar link, which is right for
  anything text-like.

`KNOWN_CHANNEL_TYPES` (the create-channel modal's type picker) picks the new
entry up automatically, ordered by `order`. Nothing else to wire.

## 4. Frontend: the Vitest test

Co-locate assertions in `resources/js/services/channelTypes.test.tsx`, matching
the existing per-type cases:

```tsx
it('registers the gallery type as text-capable with image-only capabilities', () => {
    const descriptor = channelTypeDescriptor('gallery')

    expect(descriptor.capabilities).toEqual(['text.read', 'text.send_images'])
    expect(descriptor.isTextCapable).toBe(true)
    expect(descriptor.Content).toBeDefined()
})
```

## 5. Run everything

```bash
docker compose exec app php artisan test
docker compose exec vite npm run test
docker compose exec vite npx tsc --noEmit
```

Then create one for real: log in, open a room you admin, "+ Add Channel", pick
Gallery, and confirm text sends are rejected while image uploads land.

## When this recipe isn't enough

| You need... | That's a different, bigger change |
|---|---|
| A new atomic action on an existing primitive (polls on text, say) | A new **capability on an existing Feature** — case 1 in [capabilities-and-channel-types.md](capabilities-and-channel-types.md)'s "Extending this system"; needs a real enforcement site in that Feature's Service |
| A genuinely new primitive (documents, structured data) | A new **Feature** — case 3 there, plus [service-layer.md](service-layer.md) for where its operations live; read [architecture-vision.md](architecture-vision.md)'s "Features are added reluctantly" first |
| Per-channel tunable rules (max length, upload caps) | A **parameter** in `defaultSettings()`/`channels.settings`, enforced by the Service — see [architecture-vision.md](architecture-vision.md); note no built-in type reads settings yet, so yours establishes the pattern |
| Installing a type without a deploy | The **plugin system** — not built; see `CLAUDE.md ## Planned work` before going anywhere near it |
