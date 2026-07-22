<?php

namespace Tests\Unit\Support;

use App\Support\Capabilities\Feature;
use App\Support\Capabilities\FeatureRegistry;
use Tests\TestCase;

class FeatureRegistryTest extends TestCase
{
    private function fakeFeature(): Feature
    {
        return new class implements Feature {
            public function key(): string { return 'fake'; }

            public function capabilities(): array
            {
                return [
                    'read'  => 'Read.',
                    'write' => 'Write.',
                    'admin' => 'Admin.',
                ];
            }

            public function groups(): array
            {
                return ['write_admin' => ['write', 'admin']];
            }
        };
    }

    protected function setUp(): void
    {
        parent::setUp();
        FeatureRegistry::flush();
        FeatureRegistry::register($this->fakeFeature());
    }

    protected function tearDown(): void
    {
        FeatureRegistry::flush();
        parent::tearDown();
    }

    public function test_an_atomic_capability_key_resolves_to_itself(): void
    {
        $this->assertSame(['fake.read'], FeatureRegistry::resolveGrants(['fake.read']));
    }

    public function test_a_hand_written_group_expands_to_its_members(): void
    {
        $resolved = FeatureRegistry::resolveGrants(['fake.write_admin']);

        $this->assertEqualsCanonicalizing(['fake.write', 'fake.admin'], $resolved);
    }

    public function test_the_all_group_is_auto_derived_from_every_capability(): void
    {
        $resolved = FeatureRegistry::resolveGrants(['fake.all']);

        $this->assertEqualsCanonicalizing(['fake.read', 'fake.write', 'fake.admin'], $resolved);
    }

    public function test_mixed_atomic_and_group_keys_are_deduped(): void
    {
        $resolved = FeatureRegistry::resolveGrants(['fake.read', 'fake.write_admin', 'fake.write']);

        $this->assertEqualsCanonicalizing(['fake.read', 'fake.write', 'fake.admin'], $resolved);
    }

    public function test_an_unknown_feature_throws(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        FeatureRegistry::resolveGrants(['nonexistent.read']);
    }

    public function test_an_unknown_capability_or_group_throws(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        FeatureRegistry::resolveGrants(['fake.nonexistent']);
    }

    public function test_a_key_with_no_namespace_throws(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        FeatureRegistry::resolveGrants(['read']);
    }

    public function test_an_empty_request_resolves_to_nothing(): void
    {
        $this->assertSame([], FeatureRegistry::resolveGrants([]));
    }
}
